// lib/calendar.ts - HELPERS PARA GOOGLE CALENDAR
import { google } from 'googleapis';
import { decrypt } from '@/lib/crypto';
import { supabaseAdmin } from '@/lib/supabase';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ParsedAppointment {
  service: string | null;
  date: string | null;   // formato YYYY-MM-DD
  time: string | null;   // formato HH:MM (24h)
  patientName: string | null;
  patientEmail: string | null;
  bookingIntent?: boolean;
}

export interface AvailabilityResult {
  requested_slot: string | null;
  is_available: boolean;
  occupied_times: string[];
  available_slots: string[];
  suggested_alternatives: string[];
  date_label: string; // "lunes 21 de abril"
}

// ─── 1. Obtener cliente OAuth2 autenticado para un negocio ───────────────────

export async function getGoogleCalendarClient(business: any) {
  if (!business.google_calendar_access_token_encrypted) {
    throw new Error('No hay tokens de Google Calendar para este negocio');
  }

  const accessToken = decrypt(business.google_calendar_access_token_encrypted);
  const refreshToken = business.google_calendar_refresh_token_encrypted
    ? decrypt(business.google_calendar_refresh_token_encrypted)
    : null;

  const oauth2Client = new google.auth.OAuth2(
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/callback`
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken || undefined,
  });

  // Auto-refresh: guardar nuevo token si se renueva
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      const { encrypt } = await import('@/lib/crypto');
      await supabaseAdmin
        .from('businesses')
        .update({
          google_calendar_access_token_encrypted: encrypt(tokens.access_token),
        })
        .eq('id', business.id);
    }
  });

  return oauth2Client;
}

// ─── 2. Verificar disponibilidad en Google Calendar ──────────────────────────

export async function checkAvailability(
  business: any,
  date: string, // YYYY-MM-DD
): Promise<AvailabilityResult> {
  const config = business.weekly_schedule?._config || {};
  const duration = config.appointment_duration || business.appointment_duration || 45;
  const leadTimeHours = config.min_lead_time_hours || 0;

  const date_label = new Date(`${date}T12:00:00`).toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago'
  });

  // Validar fecha
  if (isNaN(new Date(`${date}T12:00:00`).getTime())) {
    return { requested_slot: null, is_available: false, occupied_times: [], available_slots: [], suggested_alternatives: [], date_label: 'Fecha no válida' };
  }

  let auth;
  try {
    auth = await getGoogleCalendarClient(business);
  } catch {
    return { requested_slot: null, is_available: false, occupied_times: [], available_slots: [], suggested_alternatives: [], date_label };
  }

  const calendar = google.calendar({ version: 'v3', auth });

  // ── 1. Leer horario del día desde Google Calendar (Working Hours) ──
  // Consultamos los eventos del día incluyendo eventos de todo el día
  // para detectar si el calendario marca el día como no disponible
  const tzOffset = '-04:00'; // America/Santiago (ajusta si el negocio puede estar en otra zona)
  const timeMin = `${date}T00:00:00${tzOffset}`;
  const timeMax = `${date}T23:59:59${tzOffset}`;

  // ── 2. Usar FreeBusy API para obtener rangos ocupados ──
  const freeBusyRes = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: 'America/Santiago',
      items: [{ id: business.google_calendar_id || 'primary' }],
    },
  });

  const calendarId = business.google_calendar_id || 'primary';
  const busyRanges = freeBusyRes.data.calendars?.[calendarId]?.busy || [];

  // Convertir rangos ocupados a minutos
  const pad = (n: number) => String(n).padStart(2, '0');

  const toMins = (isoStr: string) => {
    const d = new Date(isoStr);
    const timeStr = d.toLocaleTimeString('es-CL', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago'
    });
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  const occupiedRanges = busyRanges
    .filter(r => r.start && r.end)
    .map(r => ({ start: toMins(r.start!), end: toMins(r.end!) }));

  // ── 3. Calcular horarios de apertura (Dashboard Config) ──
  const workingDays = config.working_days || [1, 2, 3, 4, 5];
  const dayOfWeek = new Date(`${date}T12:00:00`).getDay();

  // ¿Es día laborable?
  if (!workingDays.includes(dayOfWeek)) {
    return {
      requested_slot: null,
      is_available: false,
      occupied_times: ['DIA_NO_LABORABLE'],
      available_slots: [],
      suggested_alternatives: [],
      date_label,
    };
  }

  // ¿Tiene horario especial ese día de semana?
  const daySchedule = config.day_schedules?.[String(dayOfWeek)];
  let dayStartMins = daySchedule?.start 
    ? (() => { const [h,m] = daySchedule.start.split(':').map(Number); return h*60+m; })()
    : (config.day_start ? (() => { const [h,m] = config.day_start.split(':').map(Number); return h*60+m; })() : 9*60);

  let dayEndMins = daySchedule?.end
    ? (() => { const [h,m] = daySchedule.end.split(':').map(Number); return h*60+m; })()
    : (config.day_end ? (() => { const [h,m] = config.day_end.split(':').map(Number); return h*60+m; })() : 18*60);

  // ── 4. Detectar si el día está completamente bloqueado ──
  // Si hay un evento de todo el día o que cubre todo el horario laboral
  const isDayBlocked = occupiedRanges.some(r =>
    r.start <= dayStartMins && r.end >= dayEndMins
  );

  if (isDayBlocked) {
    return {
      requested_slot: null,
      is_available: false,
      occupied_times: ['DIA_BLOQUEADO'],
      available_slots: [],
      suggested_alternatives: [],
      date_label,
    };
  }

  // ── 5. Generar slots disponibles ──
  const now = new Date();
  const todayChile = now.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
  const nowChileStr = now.toLocaleTimeString('es-CL', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago'
  });
  const [nowH, nowM] = nowChileStr.split(':').map(Number);
  const nowMinsChile = nowH * 60 + nowM;

  const available_slots: string[] = [];

  for (let mins = dayStartMins; mins <= dayEndMins - duration; mins += 30) {
    const slotEnd = mins + duration;

    // ¿Solapa con algún rango ocupado?
    const isOccupied = occupiedRanges.some(r =>
      mins < r.end && slotEnd > r.start
    );
    if (isOccupied) continue;

    // ¿Es hoy y ya pasó la hora mínima de anticipación?
    if (date === todayChile && mins < nowMinsChile + (leadTimeHours * 60)) continue;

    available_slots.push(`${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`);
  }

  const occupied_times = occupiedRanges.map(r =>
    `${pad(Math.floor(r.start / 60))}:${pad(r.start % 60)}`
  );

  return {
    requested_slot: null,
    is_available: available_slots.length > 0,
    occupied_times,
    available_slots,
    suggested_alternatives: available_slots.slice(0, 3),
    date_label,
  };
}

// ─── 3. Crear evento en Google Calendar ──────────────────────────────────────

export async function createCalendarEvent(
  business: any,
  params: {
    patientName: string;
    patientPhone: string;
    patientEmail?: string;
    service: string;
    date: string;   // YYYY-MM-DD
    time: string;   // HH:MM
    includeVideoCall?: boolean;
  }
): Promise<{ success: boolean; eventId?: string; eventLink?: string; meetLink?: string; error?: string }> {
  try {
    const auth = await getGoogleCalendarClient(business);
    const calendar = google.calendar({ version: 'v3', auth });

    const config = business.weekly_schedule?._config || {};
    const duration = params.durationMinutes || config.appointment_duration || business.appointment_duration || 45;
    const srvName = params.service || config.service_name || business.service_name || 'Consulta';
    const srvDesc = config.service_description || business.service_description || '';
    const startDateTime = new Date(`${params.date}T${params.time}:00`);
    const { data: event } = await calendar.events.insert({
      calendarId: business.google_calendar_id || 'primary',
      conferenceDataVersion: 1,
      requestBody: {
        summary: `${srvName} - ${params.patientName}`,
        description: `Paciente: ${params.patientName}\nTeléfono: ${params.patientPhone}\nServicio: ${srvName}\n${srvDesc}`,
        start: {
          dateTime: `${params.date}T${params.time}:00`,
          timeZone: 'America/Santiago',
        },
        end: {
          dateTime: (() => {
            const dateObj = new Date(`${params.date}T${params.time}:00`);
            dateObj.setMinutes(dateObj.getMinutes() + duration);
            const getHHMM = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            return `${params.date}T${getHHMM(dateObj)}:00`;
          })(),
          timeZone: 'America/Santiago',
        },
        ...(params.patientEmail ? {
          attendees: [{ email: params.patientEmail }],
        } : {}),
        ...(params.includeVideoCall ? {
          conferenceData: {
            createRequest: {
              requestId: Math.random().toString(36).substring(7),
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        } : {}),
      },
    });

    const meetLink = event.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri || null;

    // Guardar en tabla appointments
    if (!isNaN(startDateTime.getTime())) {
      await supabaseAdmin.from('appointments').insert({
        business_id: business.id,
        patient_name: params.patientName,
        patient_phone: params.patientPhone,
        patient_email: params.patientEmail || null,
        service: params.service,
        date_time: startDateTime.toISOString(),
        google_event_id: event.id,
        meet_link: meetLink,
        status: 'confirmed',
      });
    }

    return {
      success: true,
      eventId: event.id || undefined,
      eventLink: event.htmlLink || undefined,
      meetLink: meetLink || undefined,
    };
  } catch (error) {
    console.error('Error insertando evento en Google Calendar:', error);
    return { success: false, error: 'Failed to create event in Google Calendar' };
  }
}

export async function deleteCalendarEvent(business: any, googleEventId: string): Promise<boolean> {
  try {
    const auth = await getGoogleCalendarClient(business);
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.events.delete({
      calendarId: business.google_calendar_id || 'primary',
      eventId: googleEventId,
    });
    return true;
  } catch (error) {
    console.error('Error eliminando evento de Google Calendar:', error);
    return false;
  }
}

export async function updateCalendarEvent(
  business: any,
  googleEventId: string,
  newDate: string,
  newTime: string,
  durationMinutes: number = 45
): Promise<boolean> {
  try {
    const auth = await getGoogleCalendarClient(business);
    const calendar = google.calendar({ version: 'v3', auth });
    const startDateTime = new Date(`${newDate}T${newTime}:00`);
    const dateObj = new Date(startDateTime.getTime());
    dateObj.setMinutes(dateObj.getMinutes() + durationMinutes);
    const getHHMM = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const endTimeString = getHHMM(dateObj);

    await calendar.events.patch({
      calendarId: business.google_calendar_id || 'primary',
      eventId: googleEventId,
      requestBody: {
        start: { dateTime: `${newDate}T${newTime}:00`, timeZone: 'America/Santiago' },
        end: { dateTime: `${newDate}T${endTimeString}:00`, timeZone: 'America/Santiago' },
      },
    });
    return true;
  } catch (error) {
    console.error('Error modificando evento de Google Calendar:', error);
    return false;
  }
}


// ─── 5. Parsear mensaje del cliente con IA (GROQ) ─────────────────────────

export async function parseClientMessage(history: string): Promise<ParsedAppointment> {
  if (!process.env.GROQ_API_KEY) return { date: null, time: null, patientName: null, patientEmail: null, service: null };

  try {
    const today = new Date();
    const todayStr = today.toLocaleDateString('es-CL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'America/Santiago'
    });
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `Extrae datos de reserva en JSON: {patientName, patientEmail, date, time, service, bookingIntent}. 
            'bookingIntent' es true SOLO si el usuario pide explícitamente una cita, reserva o agendar. 
            IMPORTANTE: El campo "time" SIEMPRE en formato HH:MM en 24 horas. 
            Ejemplos: "a las 11" → "11:00", "1030" → "10:30", "3pm" → "15:00".
            Si solo pregunta disponibilidad o información, es false. Hoy es ${todayStr}.`,
          },
          { role: 'user', content: `Chat:\n${history}` },
        ],
        temperature: 0,
        response_format: { type: "json_object" }
      }),
    });

    const data = await res.json();
    const result = JSON.parse(data.choices?.[0]?.message?.content || '{}');

    let time = result.time || null;
    if (time) {
      // Normalizar: "15" → "15:00", "1030" → "10:30", "11am" → "11:00"
      time = time.replace(/[^0-9:]/g, ''); // quitar am/pm/espacios
      if (time.length <= 2) time = `${time.padStart(2,'0')}:00`;
      if (time.length === 3) time = `0${time[0]}:${time.slice(1)}`;
      if (time.length === 4 && !time.includes(':')) time = `${time.slice(0,2)}:${time.slice(2)}`;
    }

    return {
      patientName: result.patientName || null,
      patientEmail: result.patientEmail || null,
      date: result.date || null,
      time: time,
      service: result.service || null,
      bookingIntent: !!result.bookingIntent
    };
  } catch (e) {
    return { date: null, time: null, patientName: null, patientEmail: null, service: null, bookingIntent: false };
  }
}

export function createDynamicPrompt(
  business: any,
  availability: AvailabilityResult | null,
  requestedSlot: { date: string; time: string | null } | null,
  upcomingAppointments: any[] = [],
  collectedData?: { name?: string | null; email?: string | null; date?: string | null; time?: string | null; service?: string | null; bookingIntent?: boolean },
  historyLength?: number
): string {

  const hasHistory = historyLength && historyLength > 0;
  const availableSlots = availability?.available_slots || [];
  const cleanRequestedTime = requestedSlot?.time?.trim();
  const isSlotFree = cleanRequestedTime && availableSlots.includes(cleanRequestedTime);

  const hasName = !!collectedData?.name;
  const hasEmail = !!collectedData?.email;
  const hasDate = !!collectedData?.date;
  const hasTime = !!collectedData?.time;
  const hasService = !!collectedData?.service;
  const wantsToBook = !!collectedData?.bookingIntent || (hasDate && hasTime);
  const isReady = hasName && hasEmail && hasDate && hasTime && !!isSlotFree;

  let nextStep = '';

  if (isReady) {
    nextStep = `CONFIRMAR CITA: ${collectedData?.name}, ${collectedData?.date} a las ${collectedData?.time}.
    DEBES empezar tu respuesta EXACTAMENTE con ✓ (ej: "✓ ¡Cita confirmada!...").`;

  } else if (hasDate && hasTime && !isSlotFree) {
    nextStep = `La hora ${collectedData?.time} no está disponible.
    Ofrece SOLO estas alternativas reales: ${availableSlots.length > 0 ? availableSlots.join(', ') : 'No hay horarios disponibles ese día'}.
    NO inventes otras horas.`;

  } else if (hasDate && hasTime && isSlotFree && !hasName) {
    nextStep = `Fecha y hora confirmadas (${collectedData?.date} a las ${collectedData?.time}).
    Pide el NOMBRE COMPLETO del paciente.`;

  } else if (hasDate && hasTime && isSlotFree && hasName && !hasEmail) {
    nextStep = `Ya tienes nombre y fecha. Pide el EMAIL para enviar la confirmación.`;

  } else if (hasDate && !hasTime) {
    nextStep = `El usuario quiere el ${collectedData?.date}.
    Muestra SOLO estos horarios disponibles: ${availableSlots.length > 0 ? availableSlots.join(', ') : 'No hay horarios disponibles ese día'}.
    NO inventes horas. NO menciones horas que no estén en esa lista.`;

  } else if (wantsToBook && !hasDate) {
    nextStep = `El usuario quiere agendar${hasService ? ` (${collectedData?.service})` : ''}.
    Pregunta qué DÍA le queda bien. No pidas más datos todavía.`;

  } else {
    nextStep = `INFORMATIVO: Responde la pregunta del usuario sobre servicios o dudas generales.
    Si confirma que quiere agendar, guíalo naturalmente.
    NO pidas nombre ni email todavía.`;
  }

  return `
### MISIÓN ACTUAL ###
${nextStep}

### RESTRICCIONES TÉCNICAS ###
1. Los horarios disponibles ya están indicados en la MISIÓN. No uses otros.
2. Usa ✓ al inicio SOLO cuando confirmes la cita definitivamente.
3. Prohibido usar placeholders como [Nombre] o [Clínica].

### PERSONALIDAD ###
${business.prompt_custom || 'Eres la asistente amable de la clínica.'}
`.trim();
}

// ─── 6. Detectar si el bot confirmó, canceló o reagendó ───────────────────

export function extractConfirmation(botResponse: string): boolean {
  return botResponse.trimStart().startsWith('✓');
}

export function extractCancellation(botResponse: string): string | null {
  const match = botResponse.toLowerCase().match(/✓ cita cancelada\. id:\s*([a-f0-9\-]+)/i);
  return match ? match[1] : null;
}

export async function extractReschedule(botResponse: string): Promise<{ id: string, date: string, time: string } | null> {
  const match = botResponse.match(/✓ cita reagendada\. id:\s*([a-f0-9\-]+), día:\s*([a-z0-9\-\s]+), hora:\s*([0-9:]+)/i);
  if (match) {
    const p = await parseClientMessage(botResponse);
    return { id: match[1], date: p.date as string, time: match[3] };
  }
  return null;
}

// ─── Utilidades internas ─────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseSchedule(schedule: string): { start: string; end: string } {
  // Ej: "9AM-6PM" → {start: "09:00", end: "18:00"}
  const match = schedule.match(/(\d{1,2})(AM|PM)?-(\d{1,2})(AM|PM)?/i);
  if (!match) return { start: '09:00', end: '18:00' };

  let startH = parseInt(match[1]);
  const startM = (match[2] || '').toUpperCase();
  let endH = parseInt(match[3]);
  const endM = (match[4] || '').toUpperCase();

  if (startM === 'PM' && startH < 12) startH += 12;
  if (endM === 'PM' && endH < 12) endH += 12;

  return {
    start: `${String(startH).padStart(2, '0')}:00`,
    end: `${String(endH).padStart(2, '0')}:00`,
  };
}

function capitalizeFirstLetter(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
