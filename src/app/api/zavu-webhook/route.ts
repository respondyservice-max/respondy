export const dynamic = "force-dynamic";
// app/api/zavu-webhook/route.ts - WEBHOOK DE ZAVU CON CALENDAR INTEGRADO
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
    console.log('--- NUEVO MENSAJE DE ZAVU ---');

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
    if (!targetBusiness.ai_bot_enabled) return NextResponse.json({ success: true, message: 'Agente desactivado' });

    const normalizedPhone = phoneFrom.replace('+', '');

    // ── 0. FILTRO DE BLOQUEO (LISTA NEGRA) ──
    const blockedNumbers = targetBusiness.weekly_schedule?._config?.blocked_numbers || [];
    if (blockedNumbers.includes(normalizedPhone)) {
      console.log(`🚫 Número bloqueado: ${normalizedPhone}. Ignorando mensaje.`);
      return NextResponse.json({ success: true, message: 'Número bloqueado' });
    }

    // ── 0. GUARDAR MENSAJE DE USUARIO AL INICIO ──
    await supabaseAdmin.from('conversations').insert({
      business_id: targetBusiness.id,
      phone_from: normalizedPhone,
      message_type: 'incoming',
      message_text: messageText,
    });

    // Pequeño delay de 1.5s para humanizar
    await new Promise(resolve => setTimeout(resolve, 1500));

    const zavuApiKey = decrypt(targetBusiness.zavu_api_key_encrypted);

    // ── MODO ENLACE ──
    if (targetBusiness.scheduling_mode === 'link' && targetBusiness.booking_link) {
      const linkGroqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'system', content: `Eres el asistente de ${targetBusiness.name}. Responde amable que para agendar usen: ${targetBusiness.booking_link}` }, { role: 'user', content: messageText }],
          temperature: 0.5,
        }),
      });
      const linkData = await linkGroqRes.json();
      const linkBotResponse = linkData.choices?.[0]?.message?.content || `Agendar aquí: ${targetBusiness.booking_link}`;
      
      await fetch('https://api.zavu.dev/v1/messages', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${zavuApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: senderIdFromZavu, to: phoneFrom, text: linkBotResponse }),
      });
      await supabaseAdmin.from('conversations').insert({ business_id: targetBusiness.id, phone_from: normalizedPhone, message_type: 'outgoing', message_text: linkBotResponse });
      return NextResponse.json({ success: true });
    }

    // ── 2. Obtener historial estructurado (últimos 10) ──
    const { data: previousMessages } = await supabaseAdmin
      .from('conversations')
      .select('message_type, message_text')
      .eq('business_id', targetBusiness.id)
      .eq('phone_from', normalizedPhone)
      .order('created_at', { ascending: false })
      .limit(10);

    const historyText = (previousMessages || []).reverse()
      .map(m => `${m.message_type === 'incoming' ? 'Usuario' : 'Asistente'}: ${m.message_text}`).join('\n');
    
    // ── 3. Parsear datos con IA ──
    const parsed = await parseClientMessage(`${historyText}\nUsuario: ${messageText}`);
    
    // ── 3.1 Memoria de Borradores (15 mins) ──
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    let { data: sessionData } = await supabaseAdmin
      .from('appointments').select('*').eq('business_id', targetBusiness.id).eq('patient_phone', normalizedPhone)
      .eq('status', 'draft').gte('created_at', fifteenMinsAgo).order('created_at', { ascending: false }).limit(1);

    let sessionAppt = sessionData?.[0];

    // Actualizar borrador
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

    const finalName = sessionAppt?.patient_name || parsed.patientName || null;
    const finalDateStr = (sessionAppt?.date_time ? sessionAppt.date_time.split('T')[0] : parsed.date) || null;
    const finalTimeStr = (sessionAppt?.date_time ? sessionAppt.date_time.split('T')[1].substring(0, 5) : parsed.time) || null;

    // ── 4. Disponibilidad ──
    let availability = null;
    if (targetBusiness.google_calendar_access_token_encrypted && finalDateStr) {
      availability = await checkAvailability(targetBusiness, finalDateStr);
    }

    // Citas futuras para reagendar/cancelar
    const { data: upcoming } = await supabaseAdmin.from('appointments').select('*').eq('business_id', targetBusiness.id).gte('date_time', new Date().toISOString()).ilike('patient_phone', `%${normalizedPhone}%`);

    // ── 5. Respuesta final con Groq ──
    const dynamicPrompt = createDynamicPrompt(targetBusiness, availability, (finalDateStr && finalTimeStr) ? { date: finalDateStr, time: finalTimeStr } : null, upcoming || [], { name: finalName, date: finalDateStr, time: finalTimeStr, service: parsed.service });
    const chatHistory = (previousMessages || []).reverse().map(m => ({ role: m.message_type === 'incoming' ? 'user' : 'assistant', content: m.message_text }));

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'system', content: dynamicPrompt }, ...chatHistory, { role: 'user', content: messageText }], temperature: 0.4 }),
    });
    const groqData = await groqRes.json();
    const botResponse = groqData.choices?.[0]?.message?.content || 'Lo siento, tuve un problema.';

    // ── 6. Acciones Calendar (Agendar/Cancelar/Reagendar) ──
    const conf = extractConfirmation(botResponse);
    const canc = extractCancellation(botResponse);
    const reag = await extractReschedule(botResponse);

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
        const servicesList = config.services_list || [];
        const serviceData = servicesList.find((s: any) => 
          s.name.toLowerCase().includes((parsed.service || '').toLowerCase()) ||
          (parsed.service || '').toLowerCase().includes(s.name.toLowerCase())
        );
        const isVideo = serviceData?.isVideo || false;

        const eventRes = await createCalendarEvent(targetBusiness, { 
          patientName: fN, 
          patientPhone: normalizedPhone, 
          service: parsed.service || 'Consulta', 
          date: fD, 
          time: fT,
          includeVideoCall: isVideo
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

    // ── 7. Enviar a Zavu y guardar ──
    await fetch('https://api.zavu.dev/v1/messages', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${zavuApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: senderIdFromZavu, to: phoneFrom, text: botResponse }),
    });
    await supabaseAdmin.from('conversations').insert({ business_id: targetBusiness.id, phone_from: normalizedPhone, message_type: 'outgoing', message_text: botResponse });

    // Limpieza
    const { data: mKeep } = await supabaseAdmin.from('conversations').select('id').eq('business_id', targetBusiness.id).eq('phone_from', normalizedPhone).order('created_at', { ascending: false }).limit(6);
    if (mKeep?.length) await supabaseAdmin.from('conversations').delete().eq('business_id', targetBusiness.id).eq('phone_from', normalizedPhone).not('id', 'in', `(${mKeep.map(m => m.id).join(',')})`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
