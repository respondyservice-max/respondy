export const dynamic = "force-dynamic";
// app/api/zavu-webhook/route.ts - WEBHOOK DE ZAVU CON CALENDAR INTEGRADO
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { decrypt } from '@/lib/crypto';
import {
  parseClientMessage,
  checkAvailability,
  createCalendarEvent,
  createDynamicPrompt,
  extractConfirmation,
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

    // ── 2. Parsear el mensaje del cliente ────────────────────────────────────
    const parsed = parseClientMessage(messageText);
    console.log('Intención detectada:', parsed);

    // ── 3. Verificar disponibilidad si hay fecha/hora ─────────────────────────
    let availability = null;
    let requestedSlot = parsed.time;

    const hasCalendar = !!targetBusiness.google_calendar_access_token_encrypted;
    const isAppointmentRequest = !!(parsed.date && (parsed.service || parsed.time));

    if (hasCalendar && isAppointmentRequest && parsed.date) {
      try {
        console.log('Consultando disponibilidad en Google Calendar para:', parsed.date);
        availability = await checkAvailability(targetBusiness, parsed.date, 45);

        // Si tiene slot solicitado, marcar si está disponible
        if (parsed.time) {
          availability.requested_slot = parsed.time;
          availability.is_available = availability.available_slots.includes(parsed.time);
        }

        console.log('Disponibilidad obtenida:', {
          date_label: availability.date_label,
          available: availability.available_slots.length,
          occupied: availability.occupied_times.length,
          is_available: availability.is_available,
        });
      } catch (calErr) {
        console.error('Error consultando Calendar (continuando sin disponibilidad):', calErr);
      }
    }

    // ── 4. Crear prompt dinámico para Groq ────────────────────────────────────
    const dynamicPrompt = createDynamicPrompt(targetBusiness, availability, requestedSlot);
    console.log('Prompt dinámico creado para Groq.');

    // ── 5. Llamar a Groq con el prompt dinámico ───────────────────────────────
    if (!process.env.GROQ_API_KEY) {
      console.error('ERROR CRÍTICO: GROQ_API_KEY no está configurada.');
    }

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

    // ── 6. Si el bot confirmó la cita → crear evento en Google Calendar ────────
    if (hasCalendar && extractConfirmation(botResponse)) {
      console.log('✅ Cita confirmada por el bot. Creando evento en Google Calendar...');

      if (parsed.date && parsed.time) {
        const patientName = parsed.patientName || `Paciente (${phoneFrom})`;
        const service = parsed.service || 'Consulta';

        const eventResult = await createCalendarEvent(targetBusiness, {
          patientName,
          patientPhone: phoneFrom || 'No especificado',
          service,
          date: parsed.date,
          time: parsed.time,
          durationMinutes: 45,
        });

        if (eventResult.success) {
          console.log('📅 Evento creado en Calendar:', eventResult.eventId);
        } else {
          console.error('Error creando evento:', eventResult.error);
        }
      } else {
        console.warn('Bot confirmó cita pero no se detectó fecha/hora completa para crear el evento.');
      }
    }

    // ── 7. Enviar respuesta al cliente via Zavu ───────────────────────────────
    console.log('Enviando respuesta a Zavu para:', phoneFrom);
    const zavuRes = await fetch('https://api.zavu.dev/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${zavuApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        senderId: senderIdFromZavu,
        to: phoneFrom,
        text: botResponse,
      }),
    });

    const zavuResult = await zavuRes.json();
    console.log('Resultado Zavu:', zavuRes.status, JSON.stringify(zavuResult, null, 2));

    // ── 8. Guardar conversación en BD ─────────────────────────────────────────
    await supabaseAdmin.from('conversations').insert([
      {
        business_id: targetBusiness.id,
        phone_from: phoneFrom,
        message_type: 'incoming',
        message_text: messageText,
      },
      {
        business_id: targetBusiness.id,
        phone_from: phoneFrom,
        message_type: 'outgoing',
        message_text: botResponse,
      },
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error en webhook:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
