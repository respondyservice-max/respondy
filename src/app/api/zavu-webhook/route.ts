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
    console.log('Data recibida:', JSON.stringify(data, null, 2));

    const senderIdFromZavu = data.senderId;
    const messageText = data.data?.text;
    const phoneFrom = data.data?.from;

    // Solo procesamos mensajes entrantes
    if (data.type !== 'message.inbound') {
      console.log('Ignorando evento tipo:', data.type);
      return NextResponse.json({ success: true, ignored: true });
    }

    if (!senderIdFromZavu || !messageText) {
      console.log('Falta sender_id o texto en el mensaje');
      return NextResponse.json({ error: 'Data incompleta' }, { status: 400 });
    }

    // ── 1. Encontrar negocio por sender_id ───────────────────────────────────
    const { data: businesses, error: dbError } = await supabaseAdmin
      .from('businesses')
      .select('*');

    if (dbError) {
      console.error('Error al consultar negocios en DB:', dbError);
    }

    let targetBusiness = null;
    for (const business of businesses || []) {
      try {
        if (!business.zavu_sender_id_encrypted) continue;
        const decryptedSenderId = decrypt(business.zavu_sender_id_encrypted);
        if (decryptedSenderId === senderIdFromZavu) {
          targetBusiness = business;
          console.log('Negocio encontrado:', business.name);
          break;
        }
      } catch (err) {
        console.error('Error al decriptar sender_id para negocio:', business.name);
      }
    }

    if (!targetBusiness) {
      console.log('No se encontró ningún negocio con ese Sender ID');
      return NextResponse.json({ error: 'Business no encontrado' }, { status: 404 });
    }

    // Verificar si el agente está activo
    if (!targetBusiness.ai_bot_enabled) {
      console.log('🔴 Agente IA desactivado para este negocio, ignorando mensaje');
      return NextResponse.json({ success: true, message: 'Agente desactivado' });
    }

    const zavuApiKey = decrypt(targetBusiness.zavu_api_key_encrypted);

    // Normalizar teléfono (quitar el + para búsquedas consistentes)
    const normalizedPhone = phoneFrom.replace('+', '');

    // ── 2. Obtener historial previo (solo mensajes antiguos) ──────────────────
    // ── 2. Obtener historial previo estructurado ──────────────────
    const { data: previousMessages } = await supabaseAdmin
      .from('conversations')
      .select('message_type, message_text')
      .eq('business_id', targetBusiness.id)
      .eq('phone_from', normalizedPhone)
      .order('created_at', { ascending: false })
      .limit(15);

    const historyText = (previousMessages || [])
      .reverse()
      .map(m => `${m.message_type === 'incoming' ? 'Usuario' : 'Asistente'}: ${m.message_text}`)
      .join('\n');
    
    const combinedContext = `${historyText}\nUsuario: ${messageText}`;
    console.log('Contexto para parseo (estructurado):\n', combinedContext);

    // ── 3. Parsear datos (ahora con IA asíncrona) ──
    const parsed = await parseClientMessage(combinedContext);
    
    // ── 3.1 MEMORIA DE BASE DE DATOS (ESTADO REAL) ──
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    let { data: sessionData } = await supabaseAdmin
      .from('appointments')
      .select('*')
      .eq('business_id', targetBusiness.id)
      .eq('patient_phone', normalizedPhone)
      .eq('status', 'draft') // Buscamos una sesión activa (borrador)
      .gte('created_at', thirtyMinsAgo)
      .order('created_at', { ascending: false })
      .limit(1);

    let sessionAppt = sessionData?.[0];

    // Si la IA detectó algo NUEVO, actualizamos la ficha en DB
    if (parsed.patientName || parsed.date || parsed.time) {
      const updateData: any = {};
      if (parsed.patientName) updateData.patient_name = parsed.patientName;
      
      // Manejar fecha/hora persistente
      let finalDateStr = parsed.date || (sessionAppt?.date_time ? sessionAppt.date_time.split('T')[0] : null);
      let finalTimeStr = parsed.time || (sessionAppt?.date_time ? sessionAppt.date_time.split('T')[1].substring(0, 5) : null);
      
      if (finalDateStr && finalTimeStr) {
        updateData.date_time = new Date(`${finalDateStr}T${finalTimeStr}:00`).toISOString();
      }

      if (sessionAppt) {
        const { data: updated } = await supabaseAdmin
          .from('appointments')
          .update(updateData)
          .eq('id', sessionAppt.id)
          .select();
        sessionAppt = updated?.[0];
      } else if (parsed.patientName) {
        const { data: inserted } = await supabaseAdmin
          .from('appointments')
          .insert({
            business_id: targetBusiness.id,
            patient_phone: normalizedPhone,
            patient_name: parsed.patientName,
            status: 'draft',
            date_time: (parsed.date && parsed.time) ? new Date(`${parsed.date}T${parsed.time}:00`).toISOString() : null
          })
          .select();
        sessionAppt = inserted?.[0];
      }
    }

    // Datos finales consolidados (Prioridad: lo que ya está grabado en piedra)
    const finalName: string | null = sessionAppt?.patient_name || parsed.patientName || null;
    const finalDateStr: string | null = (sessionAppt?.date_time ? (sessionAppt.date_time as string).split('T')[0] : parsed.date) || null;
    const finalTimeStr: string | null = (sessionAppt?.date_time ? (sessionAppt.date_time as string).split('T')[1].substring(0, 5) : parsed.time) || null;

    const hasCalendar = !!targetBusiness.google_calendar_access_token_encrypted;

    // ── 3.2 Verificar disponibilidad con datos consolidados ──
    let availability = null;
    const requestedSlot = (finalDateStr && finalTimeStr) ? { date: finalDateStr, time: finalTimeStr } : null;

    if (hasCalendar && finalDateStr) {
      try {
        availability = await checkAvailability(targetBusiness, finalDateStr, 45);
      } catch (calErr) {
        console.error('Error Calendar:', calErr);
      }
    }

    // ── 3.5 Buscar citas futuras del paciente ─────────────────────────────────
    let upcomingAppointments = [];
    try {
      const { data: currentAppts } = await supabaseAdmin
        .from('appointments')
        .select('*')
        .eq('business_id', targetBusiness.id)
        .gte('date_time', new Date().toISOString())
        .ilike('patient_phone', `%${normalizedPhone}%`);

      if (currentAppts) upcomingAppointments = currentAppts;
    } catch (e) {
      console.error('Error buscando citas del paciente', e);
    }

    // ── 4. Crear prompt dinámico para Groq ────────────────────────────────────
    const dynamicPrompt = createDynamicPrompt(
      targetBusiness,
      availability,
      requestedSlot,
      upcomingAppointments,
      { name: finalName, date: finalDateStr, time: finalTimeStr, service: parsed.service }
    );
    console.log('Prompt dinámico creado para Groq.');

    // ── 5. Llamar a Groq con el prompt dinámico ───────────────────────────────
    if (!process.env.GROQ_API_KEY) {
      console.error('ERROR CRÍTICO: GROQ_API_KEY no está configurada.');
    }

    const chatHistory = (previousMessages || [])
      .reverse()
      .map((msg) => ({
        role: msg.message_type === 'incoming' ? 'user' : 'assistant',
        content: msg.message_text,
      }));

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY || ''}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: dynamicPrompt },
          ...chatHistory,
          { role: 'user', content: messageText },
        ],
        temperature: 0.5,
      }),
    });

    const groqData = await groqRes.json();

    if (groqData.error) {
      console.error('ERROR DE GROQ API:', JSON.stringify(groqData.error, null, 2));
    }

    const botResponse = groqData.choices?.[0]?.message?.content
      || 'Lo siento, tuve un problema al procesar tu mensaje. ¿Puedes intentarlo de nuevo?';

    console.log('Respuesta de Groq:', botResponse);

    // ── 6. Si el bot confirmó, canceló o reagendó ────────────────────────────

    // CASO A: REAGENDAR
    const rescheduleData = extractReschedule(botResponse);
    if (hasCalendar && rescheduleData) {
      console.log('🔄 Cita reagendada por el bot...', rescheduleData);
      const apptToMove = upcomingAppointments.find((a: any) => a.id === rescheduleData.id);
      if (apptToMove && rescheduleData.date && rescheduleData.time) {
        // En google
        if (apptToMove.google_event_id) {
          await updateCalendarEvent(targetBusiness, apptToMove.google_event_id, rescheduleData.date, rescheduleData.time);
        }
        // En DB
        const startDateTime = new Date(`${rescheduleData.date}T${rescheduleData.time}:00`);
        await supabaseAdmin.from('appointments').update({ date_time: startDateTime.toISOString() }).eq('id', apptToMove.id);
      }
    }
    // CASO B: CANCELAR
    else if (hasCalendar && extractCancellation(botResponse)) {
      const cancelId = extractCancellation(botResponse);
      console.log('❌ Cita cancelada por el bot...', cancelId);
      const apptToCancel = upcomingAppointments.find((a: any) => a.id === cancelId);
      if (apptToCancel) {
        // En google
        if (apptToCancel.google_event_id) {
          await deleteCalendarEvent(targetBusiness, apptToCancel.google_event_id);
        }
        // En DB
        await supabaseAdmin.from('appointments').delete().eq('id', apptToCancel.id);
      }
    }
      // CASO C: AGENDAR NUEVA
    else if (extractConfirmation(botResponse) && hasCalendar) {
      console.log('✅ Cita confirmada por el bot. Creando evento en Google Calendar...');
      let finalDate = finalDateStr;
      let finalTime = finalTimeStr;
      let finalService = parsed.service || 'Consulta';
      let patientName = finalName;

      // Si el mensaje del usuario no tenía fecha o hora (ej: "sí, confirmo"),
      // intentamos extraerlos de la respuesta de confirmación del bot
      if (!finalDate || !finalTime || !patientName) {
        const botParsed = parseClientMessage(botResponse);
        finalDate = finalDate || botParsed.date;
        finalTime = finalTime || botParsed.time;
        finalService = parsed.service || botParsed.service || 'Consulta';
        patientName = patientName || botParsed.patientName;
      }

      patientName = patientName || `Paciente (${phoneFrom})`;

      if (finalDate && finalTime && patientName) {
        const eventResult = await createCalendarEvent(targetBusiness, {
          patientName: patientName,
          patientPhone: normalizedPhone,
          service: finalService,
          date: finalDate,
          time: finalTime,
          durationMinutes: 45,
        });

        if (eventResult.success) {
          console.log('📅 Evento creado en Calendar:', eventResult.eventId);
        } else {
          console.error('Error creando evento:', eventResult.error);
        }
      } else {
        console.warn('Bot confirmó cita pero no se detectó fecha/hora completa ni en el mensaje del usuario ni del bot.');
      }
    }

    // ── 7. Enviar respuesta al cliente via Zavu ───────────────────────────────
    console.log('Enviando respuesta a Zavu para:', normalizedPhone);
    const zavuRes = await fetch('https://api.zavu.dev/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${zavuApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        senderId: senderIdFromZavu,
        to: phoneFrom, // Zavu might need the + if provided, but we keep the DB clean
        text: botResponse,
      }),
    });

    const zavuResult = await zavuRes.json();
    console.log('Resultado Zavu:', zavuRes.status, JSON.stringify(zavuResult, null, 2));

    // ── 8. Guardar AMBOS mensajes en la BD al final para evitar duplicados y race conditions
    await supabaseAdmin.from('conversations').insert([
      {
        business_id: targetBusiness.id,
        phone_from: normalizedPhone,
        message_type: 'incoming',
        message_text: messageText,
      },
      {
        business_id: targetBusiness.id,
        phone_from: normalizedPhone,
        message_type: 'outgoing',
        message_text: botResponse,
      }
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error en webhook:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
