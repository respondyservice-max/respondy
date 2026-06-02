export const dynamic = "force-dynamic";
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
    const messageText = (data.data?.text || '').trim();
    const phoneFrom = data.data?.from;

    if (data.type !== 'message.inbound') return NextResponse.json({ success: true, ignored: true });
    if (!senderIdFromZavu || !messageText) return NextResponse.json({ error: 'Incompleto' }, { status: 400 });

    const { data: businesses } = await supabaseAdmin.from('businesses').select('*');
    let targetBusiness = businesses?.find(b => b.zavu_sender_id_encrypted && decrypt(b.zavu_sender_id_encrypted) === senderIdFromZavu);
    if (!targetBusiness) return NextResponse.json({ error: 'Business no encontrado' }, { status: 404 });
    
    const normalizedPhone = phoneFrom.replace('+', '');

    // 1. GUARDAR MENSAJE
    await supabaseAdmin.from('conversations').insert({
      business_id: targetBusiness.id,
      phone_from: normalizedPhone,
      message_type: 'incoming',
      message_text: messageText,
    });

    await new Promise(r => setTimeout(r, 1000));

    // 2. OBTENER HISTORIAL (Últimos 10 mensajes de las últimas 2 horas)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: history, error: hErr } = await supabaseAdmin
      .from('conversations')
      .select('message_type, message_text, timestamp')
      .eq('phone_from', normalizedPhone)
      .gte('timestamp', twoHoursAgo) // Solo mensajes recientes
      .order('timestamp', { ascending: false })
      .limit(10);

    if (hErr) console.error('❌ Error Supabase History:', hErr);

    // Los invertimos para que queden: [viejo, ..., nuevo] para la IA
    const historyArray = (history || []).reverse();
    
    console.log('📋 HISTORIAL RECUPERADO:', {
      count: historyArray.length,
      lastMsg: historyArray[historyArray.length - 1]?.message_text,
      phone: normalizedPhone
    });

    const historyText = historyArray.map(m => `${m.message_type === 'incoming' ? 'User' : 'Assistant'}: ${m.message_text}`).join('\n');

    // 3. PARSER
    const parsed = await parseClientMessage(`${historyText}\nUser: ${messageText}`);

    // 4. SESIÓN / APPOINTMENTS
    let { data: sessions } = await supabaseAdmin
      .from('appointments').select('*').eq('business_id', targetBusiness.id).eq('patient_phone', normalizedPhone)
      .eq('status', 'draft').limit(1);

    let sessionAppt = sessions?.[0];

    // Fallback de reconocimiento de servicio si el mensaje es corto y coincide con la lista
    const config = targetBusiness.weekly_schedule?._config || {};
    const services = config.services_list || [];
    if (!parsed.service) {
      const matchSrv = services.find((s: any) => messageText.toLowerCase().includes(s.name.toLowerCase()));
      if (matchSrv) parsed.service = matchSrv.name;
    }

    if (parsed.patientName || parsed.date || parsed.time || parsed.service || parsed.patientEmail) {
      const updateData: any = {};
      if (parsed.patientName) updateData.patient_name = parsed.patientName;
      if (parsed.patientEmail) updateData.patient_email = parsed.patientEmail;
      if (parsed.service) updateData.service = parsed.service;
      
      if (parsed.date && parsed.time) {
        const d = new Date(`${parsed.date}T${parsed.time}:00-04:00`);
        if (!isNaN(d.getTime())) updateData.date_time = d.toISOString();
      }

      if (sessionAppt) {
        const { data: u } = await supabaseAdmin.from('appointments').update(updateData).eq('id', sessionAppt.id).select();
        sessionAppt = u?.[0];
      } else {
        const { data: i } = await supabaseAdmin.from('appointments').insert({
          business_id: targetBusiness.id, patient_phone: normalizedPhone,
          patient_name: parsed.patientName || null, status: 'draft',
          patient_email: parsed.patientEmail || null, service: parsed.service || null,
          date_time: updateData.date_time || null
        }).select();
        sessionAppt = i?.[0];
      }
    }

    const finalName = parsed.patientName || sessionAppt?.patient_name || null;
    const finalEmail = parsed.patientEmail || sessionAppt?.patient_email || null;
    const finalDate = parsed.date || (sessionAppt?.date_time ? new Date(sessionAppt.date_time).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }) : null);
    const finalTime = parsed.time || (sessionAppt?.date_time ? new Date(sessionAppt.date_time).toLocaleTimeString('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' }) : null);
    const finalService = parsed.service || sessionAppt?.service || null;

    // 5. DISPONIBILIDAD
    let availability = null;
    if (targetBusiness.google_calendar_access_token_encrypted && finalDate) {
      availability = await checkAvailability(targetBusiness, finalDate, finalService || undefined);
    }

    const { data: upcoming } = await supabaseAdmin.from('appointments').select('*').eq('business_id', targetBusiness.id).gte('date_time', new Date().toISOString()).ilike('patient_phone', `%${normalizedPhone}%`);

    const botMsgCount = historyArray.filter(m => m.message_type === 'outgoing').length;

    // 6. PROMPT Y GROQ
    console.log('📅 AVAILABILITY DEBUG:', {
      hasCalendarToken: !!targetBusiness.google_calendar_access_token_encrypted,
      finalDateStr: finalDate,
      availability: availability ? {
        available_slots: availability.available_slots,
        occupied_times: availability.occupied_times
      } : 'NULL - no se llamó checkAvailability'
    });

    console.log('🔍 STATE DEBUG:', {
      hasName: finalName,
      hasEmail: finalEmail,
      hasDate: finalDate,
      hasTime: finalTime,
      hasService: finalService,
      isSlotFree: availability?.available_slots?.includes(finalTime || '')
    });

    const dynamicPrompt = createDynamicPrompt(
      targetBusiness, availability, 
      (finalDate && finalTime) ? { date: finalDate, time: finalTime } : null, 
      upcoming || [], 
      { name: finalName, email: finalEmail, date: finalDate, time: finalTime, service: finalService, bookingIntent: parsed.bookingIntent },
      botMsgCount
    );

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: dynamicPrompt },
          ...historyArray.map(m => ({ role: m.message_type === 'incoming' ? 'user' : 'assistant', content: m.message_text })),
          { role: 'system', content: `[RECORDATORIO ESTRICTO] Revisa la "MISIÓN ACTUAL" del prompt inicial y CUMPLELA AL PIE DE LA LETRA. Si la misión indica que debes confirmar con el símbolo ✓, úsalo como el PRIMER CARÁCTER de tu respuesta o el sistema fallará.` }
        ],
        temperature: 0.3
      }),
    });

    const groqData = await groqRes.json();
    
    if (!groqRes.ok) {
      console.error('❌ ERROR GROQ:', {
        status: groqRes.status,
        data: groqData,
        promptSnippet: dynamicPrompt.substring(0, 100)
      });
    }

    let botResponse = (groqData.choices?.[0]?.message?.content || 'Error técnico de conexión con IA.').trim();

    // 7. ACCIONES Y ENVÍO
    const conf = extractConfirmation(botResponse);
    const canc = extractCancellation(botResponse);
    const reag = await extractReschedule(botResponse);
    const zavuApiKey = decrypt(targetBusiness.zavu_api_key_encrypted);

    if (reag && upcoming) {
      const a = upcoming.find(x => x.id === reag.id);
      if (a && reag.date && reag.time) {
        const d = new Date(`${reag.date}T${reag.time}:00-04:00`);
        if (!isNaN(d.getTime())) {
          if (a.google_event_id) await updateCalendarEvent(targetBusiness, a.google_event_id, reag.date, reag.time);
          await supabaseAdmin.from('appointments').update({ date_time: d.toISOString() }).eq('id', a.id);
        }
      }
    } else if (canc && upcoming) {
      const a = upcoming.find(x => x.id === canc);
      if (a && a.google_event_id) await deleteCalendarEvent(targetBusiness, a.google_event_id);
      if (a) await supabaseAdmin.from('appointments').delete().eq('id', a.id);
    } else if (conf) {
      if (!finalName || !finalEmail || !finalDate || !finalTime) {
        console.log('⚠️ Bot intentó confirmar sin datos completos:', { finalName, finalEmail, finalDate, finalTime });
        botResponse = "¡Casi listo! Para agendar tu hora en el sistema, necesito que me confirmes tu nombre completo y correo electrónico por favor.";
      } else {
        const eventRes = await createCalendarEvent(targetBusiness, { 
          patientName: finalName, patientPhone: normalizedPhone, patientEmail: finalEmail, 
          service: finalService || 'Consulta', date: finalDate, time: finalTime 
        });
      if (eventRes.success) {
        const ticket = `✅ *Cita Confirmada*\n👤 ${finalName}\n📅 ${finalDate}\n⏰ ${finalTime}\n📝 ${finalService || 'Consulta'}`;
        await fetch('https://api.zavu.dev/v1/messages', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${zavuApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ senderId: senderIdFromZavu, to: phoneFrom, text: ticket }),
        });
        await supabaseAdmin.from('conversations').insert({ business_id: targetBusiness.id, phone_from: normalizedPhone, message_type: 'outgoing', message_text: ticket });
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
  } catch (e) {
    console.error('CRITICAL:', e);
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}
