export const dynamic = "force-dynamic";
// app/api/zavu-webhook/route.ts - VERSIÓN FINAL CON CORREO OBLIGATORIO Y TICKET MEJORADO
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { decrypt } from '@/lib/crypto';
import {
  checkAvailability,
  parseClientMessage,
  createDynamicPrompt,
  createCalendarEvent,
  extractConfirmation,
  extractCancellation,
  extractReschedule,
  deleteCalendarEvent,
  updateCalendarEvent
} from '@/lib/calendar';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const senderIdFromZavu = data.senderId;
    const messageText = data.data?.text;
    const phoneFrom = data.data?.from;

    if (data.type !== 'message.inbound') return NextResponse.json({ success: true, ignored: true });
    if (!senderIdFromZavu || !messageText) return NextResponse.json({ error: 'Data incompleta' }, { status: 400 });

    const { data: businesses } = await supabaseAdmin.from('businesses').select('*');
    let targetBusiness = null;
    for (const b of businesses || []) {
      if (b.zavu_sender_id_encrypted && decrypt(b.zavu_sender_id_encrypted) === senderIdFromZavu) {
        targetBusiness = b; break;
      }
    }
    if (!targetBusiness) return NextResponse.json({ error: 'Business no encontrado' }, { status: 404 });
    
    const normalizedPhone = phoneFrom.replace('+', '');

    // ── 0. FILTRO DE BLOQUEO ──
    const blockedNumbers = targetBusiness.weekly_schedule?._config?.blocked_numbers || [];
    if (blockedNumbers.includes(normalizedPhone)) return NextResponse.json({ success: true, message: 'Bloqueado' });

    // ── 1. GUARDAR MENSAJE USUARIO ──
    await supabaseAdmin.from('conversations').insert({
      business_id: targetBusiness.id,
      phone_from: normalizedPhone,
      message_type: 'incoming',
      message_text: messageText,
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // ── 2. OBTENER HISTORIAL (20 mensajes) ──
    const { data: previousMessages } = await supabaseAdmin
      .from('conversations').select('message_type, message_text')
      .eq('business_id', targetBusiness.id).eq('phone_from', normalizedPhone)
      .order('created_at', { ascending: false }).limit(20);

    const historyArray = (previousMessages || []).reverse();
    const historyText = historyArray.map(m => `${m.message_type === 'incoming' ? 'Usuario' : 'Asistente'}: ${m.message_text}`).join('\n');
    
    // ── 3. PARSEAR DATOS ──
    const parsed = await parseClientMessage(`${historyText}\nUsuario: ${messageText}`);
    
    // ── 4. SINCRONIZAR CON BORRADOR ──
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    let { data: sessionData } = await supabaseAdmin
      .from('appointments').select('*').eq('business_id', targetBusiness.id).eq('patient_phone', normalizedPhone)
      .eq('status', 'draft').gte('created_at', fifteenMinsAgo).order('created_at', { ascending: false }).limit(1);

    let sessionAppt = sessionData?.[0];

    if (parsed.patientName || parsed.date || parsed.time || parsed.service || parsed.patientEmail) {
      const updateData: any = {};
      if (parsed.patientName) updateData.patient_name = parsed.patientName;
      if (parsed.patientEmail) updateData.patient_email = parsed.patientEmail;
      if (parsed.service) updateData.service = parsed.service;
      
      let fDate = parsed.date || (sessionAppt?.date_time ? sessionAppt.date_time.split('T')[0] : null);
      let fTime = parsed.time || (sessionAppt?.date_time ? sessionAppt.date_time.split('T')[1].substring(0, 5) : null);
      if (fDate && fTime) updateData.date_time = new Date(`${fDate}T${fTime}:00`).toISOString();

      if (sessionAppt) {
        const { data: u } = await supabaseAdmin.from('appointments').update(updateData).eq('id', sessionAppt.id).select();
        sessionAppt = u?.[0];
      } else {
        const { data: i } = await supabaseAdmin.from('appointments').insert({
          business_id: targetBusiness.id, patient_phone: normalizedPhone,
          patient_name: parsed.patientName || null, status: 'draft',
          patient_email: parsed.patientEmail || null,
          service: parsed.service || null,
          date_time: (fDate && fTime) ? new Date(`${fDate}T${fTime}:00`).toISOString() : null
        }).select();
        sessionAppt = i?.[0];
      }
    }

    const finalName = parsed.patientName || (sessionAppt?.patient_name !== 'Paciente' ? sessionAppt?.patient_name : null) || null;
    const finalEmail = parsed.patientEmail || sessionAppt?.patient_email || null;
    const finalDateStr = parsed.date || (sessionAppt?.date_time ? sessionAppt.date_time.split('T')[0] : null);
    const finalTimeStr = parsed.time || (sessionAppt?.date_time ? sessionAppt.date_time.split('T')[1].substring(0, 5) : null);
    const finalService = parsed.service || sessionAppt?.service || null;

    // ── 5. DISPONIBILIDAD Y PROMPT ──
    let availability = null;
    if (targetBusiness.google_calendar_access_token_encrypted && finalDateStr) {
      availability = await checkAvailability(targetBusiness, finalDateStr);
    }

    const { data: upcoming } = await supabaseAdmin.from('appointments').select('*').eq('business_id', targetBusiness.id).gte('date_time', new Date().toISOString()).ilike('patient_phone', `%${normalizedPhone}%`);

    const dynamicPrompt = createDynamicPrompt(
      targetBusiness, 
      availability, 
      (finalDateStr && finalTimeStr) ? { date: finalDateStr, time: finalTimeStr } : null, 
      upcoming || [], 
      { name: finalName, email: finalEmail, date: finalDateStr, time: finalTimeStr, service: finalService },
      historyArray.length
    );
    
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ 
        model: 'llama-3.1-8b-instant', 
        messages: [{ role: 'system', content: dynamicPrompt }, ...historyArray.slice(-15).map(m => ({ role: m.message_type === 'incoming' ? 'user' : 'assistant', content: m.message_text }))], 
        temperature: 0.4 
      }),
    });
    const groqData = await groqRes.json();
    const botResponse = groqData.choices?.[0]?.message?.content || 'Error técnico.';

    const conf = extractConfirmation(botResponse);
    const canc = extractCancellation(botResponse);
    const reag = await extractReschedule(botResponse);
    const zavuApiKey = decrypt(targetBusiness.zavu_api_key_encrypted);

    if (reag && upcoming) {
      const a = upcoming.find(x => x.id === reag.id);
      if (a && reag.date && reag.time) {
        if (a.google_event_id) await updateCalendarEvent(targetBusiness, a.google_event_id, reag.date, reag.time);
        await supabaseAdmin.from('appointments').update({ date_time: new Date(`${reag.date}T${reag.time}:00`).toISOString() }).eq('id', a.id);
      }
    } else if (canc && upcoming) {
      const a = upcoming.find(x => x.id === canc);
      if (a && a.google_event_id) await deleteCalendarEvent(targetBusiness, a.google_event_id);
      if (a) await supabaseAdmin.from('appointments').delete().eq('id', a.id);
    } else if (conf) {
      let fD = finalDateStr, fT = finalTimeStr, fN = finalName, fS = finalService, fE = finalEmail;
      if (!fD || !fT || !fN || !fS || !fE) { 
        const bP = await parseClientMessage(botResponse); 
        fD = fD || bP.date; fT = fT || bP.time; fN = fN || bP.patientName; fS = fS || bP.service; fE = fE || bP.patientEmail;
      }
      
      if (fD && fT && fN && fE) {
        const config = targetBusiness.weekly_schedule?._config || {};
        const sList = config.services_list || [];
        const sData = sList.find((s: any) => 
          s.name.toLowerCase().trim() === (fS || '').toLowerCase().trim() ||
          (fS || '').toLowerCase().includes(s.name.toLowerCase()) ||
          s.name.toLowerCase().includes((fS || '').toLowerCase())
        );
        const isVideo = sData?.isVideo || false;

        const eventRes = await createCalendarEvent(targetBusiness, { 
          patientName: fN, patientPhone: normalizedPhone, patientEmail: fE, service: sData?.name || fS || 'Consulta', date: fD, time: fT, includeVideoCall: isVideo
        });

        if (eventRes.success) {
          const ticketMsg = `🎫 *TICKET DE RESERVA*\n\n✅ *Confirmado:* ${fN}\n📧 *Email:* ${fE}\n📝 *Servicio:* ${sData?.name || fS || 'Consulta'}\n📅 *Día:* ${fD}\n⏰ *Hora:* ${fT}${eventRes.meetLink ? `\n🎥 *Videollamada:* ${eventRes.meetLink}` : '\n📍 *Lugar:* Presencial'}\n\n¡Te esperamos!`;
          await fetch('https://api.zavu.dev/v1/messages', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${zavuApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ senderId: senderIdFromZavu, to: phoneFrom, text: ticketMsg }),
          });
          await supabaseAdmin.from('conversations').insert({ business_id: targetBusiness.id, phone_from: normalizedPhone, message_type: 'outgoing', message_text: ticketMsg });
        }
      }
    }

    await fetch('https://api.zavu.dev/v1/messages', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${zavuApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: senderIdFromZavu, to: phoneFrom, text: botResponse }),
    });
    await supabaseAdmin.from('conversations').insert({ business_id: targetBusiness.id, phone_from: normalizedPhone, message_type: 'outgoing', message_text: botResponse });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
