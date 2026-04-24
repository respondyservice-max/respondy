export const dynamic = "force-dynamic";
// app/api/zavu-webhook/route.ts - WEBHOOK DE ZAVU ESTABILIZADO (MEMORIA DE ELEFANTE)
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

    // 1. Encontrar negocio
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

    await new Promise(resolve => setTimeout(resolve, 1200));

    // ── 2. OBTENER HISTORIAL (Elefante: últimos 20 mensajes) ──
    const { data: previousMessages } = await supabaseAdmin
      .from('conversations')
      .select('message_type, message_text')
      .eq('business_id', targetBusiness.id)
      .eq('phone_from', normalizedPhone)
      .order('created_at', { ascending: false })
      .limit(20);

    const historyArray = (previousMessages || []).reverse();
    const historyText = historyArray
      .filter(m => m.message_text !== messageText) // Evitar duplicar el actual si ya se guardó
      .map(m => `${m.message_type === 'incoming' ? 'Usuario' : 'Asistente'}: ${m.message_text}`).join('\n');
    
    // ── 3. PARSEAR DATOS (Priorizando el mensaje actual + historial) ──
    const combinedForParsing = `${historyText}\nUsuario: ${messageText}`;
    const parsed = await parseClientMessage(combinedForParsing);
    
    // ── 4. SINCRONIZAR CON BASE DE DATOS (Borradores) ──
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    let { data: sessionData } = await supabaseAdmin
      .from('appointments').select('*').eq('business_id', targetBusiness.id).eq('patient_phone', normalizedPhone)
      .eq('status', 'draft').gte('created_at', thirtyMinsAgo).order('created_at', { ascending: false }).limit(1);

    let sessionAppt = sessionData?.[0];

    // Lógica de "Juan" fixer: Si el chat dice un nombre y el borrador dice otro, manda el chat.
    if (parsed.patientName || parsed.date || parsed.time) {
      const updateData: any = {};
      if (parsed.patientName) updateData.patient_name = parsed.patientName;
      
      let fDate = parsed.date || (sessionAppt?.date_time ? sessionAppt.date_time.split('T')[0] : null);
      let fTime = parsed.time || (sessionAppt?.date_time ? sessionAppt.date_time.split('T')[1].substring(0, 5) : null);
      if (fDate && fTime) updateData.date_time = new Date(`${fDate}T${fTime}:00`).toISOString();

      if (sessionAppt) {
        const { data: u } = await supabaseAdmin.from('appointments').update(updateData).eq('id', sessionAppt.id).select();
        sessionAppt = u?.[0];
      } else {
        const { data: i } = await supabaseAdmin.from('appointments').insert({
          business_id: targetBusiness.id, patient_phone: normalizedPhone,
          patient_name: parsed.patientName || 'Paciente', status: 'draft',
          date_time: (fDate && fTime) ? new Date(`${fDate}T${fTime}:00`).toISOString() : null
        }).select();
        sessionAppt = i?.[0];
      }
    }

    const finalName = parsed.patientName || sessionAppt?.patient_name || null; // Prioridad al PARSEO RECIENTE
    const finalDateStr = parsed.date || (sessionAppt?.date_time ? sessionAppt.date_time.split('T')[0] : null);
    const finalTimeStr = parsed.time || (sessionAppt?.date_time ? sessionAppt.date_time.split('T')[1].substring(0, 5) : null);

    // ── 5. DISPONIBILIDAD Y PROMPT ──
    let availability = null;
    if (targetBusiness.google_calendar_access_token_encrypted && finalDateStr) {
      availability = await checkAvailability(targetBusiness, finalDateStr);
    }

    const { data: upcoming } = await supabaseAdmin.from('appointments').select('*').eq('business_id', targetBusiness.id).gte('date_time', new Date().toISOString()).ilike('patient_phone', `%${normalizedPhone}%`);

    const dynamicPrompt = createDynamicPrompt(targetBusiness, availability, (finalDateStr && finalTimeStr) ? { date: finalDateStr, time: finalTimeStr } : null, upcoming || [], { name: finalName, date: finalDateStr, time: finalTimeStr, service: parsed.service });
    
    const groqHistory = historyArray.map(m => ({ role: m.message_type === 'incoming' ? 'user' : 'assistant', content: m.message_text }));

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ 
        model: 'llama-3.1-8b-instant', 
        messages: [
          { role: 'system', content: dynamicPrompt }, 
          ...groqHistory.slice(-15) // Mandamos los últimos 15 a Groq
        ], 
        temperature: 0.4 
      }),
    });
    const groqData = await groqRes.json();
    const botResponse = groqData.choices?.[0]?.message?.content || 'Lo siento, tuve un problema técnico.';

    // ── 6. ACCIONES CALENDAR ──
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
      let fD = finalDateStr, fT = finalTimeStr, fN = finalName;
      if (!fD || !fT || !fN) { 
        const bP = await parseClientMessage(botResponse); 
        fD = fD || bP.date; fT = fT || bP.time; fN = fN || bP.patientName; 
      }
      if (fD && fT && fN) {
        const config = targetBusiness.weekly_schedule?._config || {};
        const sList = config.services_list || [];
        const isVideo = sList.find((s: any) => s.name.toLowerCase().includes((parsed.service || '').toLowerCase()))?.isVideo || false;

        const eventRes = await createCalendarEvent(targetBusiness, { 
          patientName: fN, patientPhone: normalizedPhone, service: parsed.service || 'Consulta', date: fD, time: fT, includeVideoCall: isVideo
        });

        if (eventRes.success) {
          const ticketMsg = `🎫 *TICKET DE RESERVA*\n\n✅ *Confirmado:* ${fN}\n📅 *Día:* ${fD}\n⏰ *Hora:* ${fT}${eventRes.meetLink ? `\n🎥 *Videollamada:* ${eventRes.meetLink}` : '\n📍 *Lugar:* Presencial'}\n\n¡Te esperamos!`;
          await fetch('https://api.zavu.dev/v1/messages', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${zavuApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ senderId: senderIdFromZavu, to: phoneFrom, text: ticketMsg }),
          });
          await supabaseAdmin.from('conversations').insert({ business_id: targetBusiness.id, phone_from: normalizedPhone, message_type: 'outgoing', message_text: ticketMsg });
        }
      }
    }

    // ── 7. RESPONDER Y LIMPIAR ──
    await fetch('https://api.zavu.dev/v1/messages', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${zavuApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: senderIdFromZavu, to: phoneFrom, text: botResponse }),
    });
    await supabaseAdmin.from('conversations').insert({ business_id: targetBusiness.id, phone_from: normalizedPhone, message_type: 'outgoing', message_text: botResponse });

    // Limpieza suave: mantenemos 20 mensajes siempre
    const { data: mKeep } = await supabaseAdmin.from('conversations').select('id').eq('business_id', targetBusiness.id).eq('phone_from', normalizedPhone).order('created_at', { ascending: false }).limit(20);
    if (mKeep?.length === 20) {
      await supabaseAdmin.from('conversations').delete().eq('business_id', targetBusiness.id).eq('phone_from', normalizedPhone).not('id', 'in', `(${mKeep.map(m => m.id).join(',')})`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
