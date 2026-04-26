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
  durationMinutes?: number
): Promise<AvailabilityResult> {
  const config = business.weekly_schedule?._config || {};
  const duration = durationMinutes || config.appointment_duration || business.appointment_duration || 45;
  const leadTimeHours = config.min_lead_time_hours || business.min_lead_time_hours || 0;

  const auth = await getGoogleCalendarClient(business);
  const calendar = google.calendar({ version: 'v3', auth });

  // ─── Obtener configuración de horario para el día solicitado ──────────────
  const requestDateObj = new Date(`${date}T12:00:00`);
  const dayIndex = requestDateObj.getDay(); // 0: domingo, 1: lunes...
  const daysMap = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const dayKey = daysMap[dayIndex];

  let dayStart = '09:00';
  let dayEnd = '18:00';
  let isClosed = false;

  if (business.weekly_schedule && business.weekly_schedule[dayKey]) {
    const config = business.weekly_schedule[dayKey];
    if (!config.active) {
      isClosed = true;
    } else {
      dayStart = config.open;
      dayEnd = config.close;
    }
  } else {
    // Fallback temporal si por alguna razón no tienen el JSON
    const legacySchedule = business.schedule_monday || '9AM-6PM';
    const parsed = parseSchedule(legacySchedule);
    dayStart = parsed.start;
    dayEnd = parsed.end;
  }

  // Si el local está cerrado por configuración, devolvemos directo
  if (isClosed) {
    const date_label = requestDateObj.toLocaleDateString('es-CL', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago'
    });
    return {
      requested_slot: null,
      is_available: false,
      occupied_times: ['CERRADO'],
      available_slots: [],
      suggested_alternatives: [],
      date_label,
    };
  }

  // Consultar el día completo en UTC para no perder eventos por offset de zona horaria
  const nextDate = new Date(`${date}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const { data } = await calendar.events.list({
    calendarId: business.google_calendar_id || 'primary',
    timeMin: `${date}T00:00:00Z`,
    timeMax: nextDate.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = data.items || [];

  // Extraer horarios ocupados en hora Chile
  const occupied_times: string[] = [];
  for (const event of events) {
    const start = (event.start?.dateTime || event.start?.date) as string;
    if (start) {
      const d = new Date(start);
      // Validar que el evento sea del día solicitado en hora Chile
      const eventDateChile = d.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); // en-CA gives YYYY-MM-DD
      if (eventDateChile !== date) continue;

      const timeStr = d.toLocaleTimeString('es-CL', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Santiago'
      });
      occupied_times.push(timeStr);
    }
  }

  // Generar slots con aritmética pura (dayStart/dayEnd ya están en hora Chile)
  // Evita el bug UTC donde new Date(`...T09:00:00`) = 06:00 Chile en Vercel
  const available_slots: string[] = [];
  const pad = (n: number) => String(n).padStart(2, '0');
  const [startH, startM] = dayStart.split(':').map(Number);
  const [endH, endM] = dayEnd.split(':').map(Number);
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;

  const now = new Date();
  const todayChile = now.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
  const currentMinsChile = now.getHours() * 60 + now.getMinutes() - (now.getTimezoneOffset() === 0 ? 180 : 0); // Ajuste manual si el servidor está en UTC (Chile es UTC-3)

  // Una forma más robusta de obtener minutos actuales en Chile:
  const nowChileStr = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' });
  const [nowH, nowM] = nowChileStr.split(':').map(Number);
  const nowMinsChile = nowH * 60 + nowM;

  for (let mins = startMins; mins <= endMins - duration; mins += 30) {
    const slot = `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

    // 1. Verificar si está ocupado
    if (occupied_times.includes(slot)) continue;

    // 2. Verificar anticipación mínima (si es hoy)
    if (date === todayChile) {
      if (mins < nowMinsChile + (leadTimeHours * 60)) continue;
    }

    available_slots.push(slot);
  }

  const dateObj = new Date(`${date}T12:00:00`);
  const date_label = dateObj.toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Santiago',
  });

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
    const srvName = config.service_name || business.service_name || params.service || 'Consulta';
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
            content: `Extrae datos de reserva en JSON: {patientName, patientEmail, date, time, service}. Hoy es ${todayStr}. Prioriza lo más reciente.`,
          },
          { role: 'user', content: `Chat:\n${history}` },
        ],
        temperature: 0,
        response_format: { type: "json_object" }
      }),
    });

    const data = await res.json();
    const result = JSON.parse(data.choices?.[0]?.message?.content || '{}');

    return {
      patientName: result.patientName || null,
      patientEmail: result.patientEmail || null,
      date: result.date || null,
      time: result.time || null,
      service: result.service || null
    };
  } catch (e) {
    return { date: null, time: null, patientName: null, patientEmail: null, service: null };
  }
}

export function createDynamicPrompt(
  business: any,
  availability: AvailabilityResult | null,
  requestedSlot: { date: string; time: string | null } | null,
  upcomingAppointments: any[] = [],
  collectedData?: { name?: string | null; email?: string | null; date?: string | null; time?: string | null; service?: string | null },
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
  const isReady = hasName && hasEmail && hasDate && hasTime && isSlotFree;

  // MÁQUINA DE ESTADOS - SOLO LÓGICA DE FLUJO
  let nextStep = '';

  // ✅ FIX: Verificar si availability es null ANTES de usarlo
  if (!availability) {
    nextStep = `ASISTE: resuelve dudas u ofrece agendar.`;
  } else if (isReady) {
    nextStep = `CONFIRMAR cita: ${collectedData?.name}, ${collectedData?.date} ${collectedData?.time}. Muestra ticket.`;
  } else if (hasDate && hasTime && isSlotFree) {
    nextStep = `Tienes fecha/hora. RECOPILA: nombre y email.`;
  } else if (hasDate && hasTime && !isSlotFree) {
    nextStep = `Hora ocupada. OFRECE: ${availableSlots.join(', ')}.`;
  } else if (hasService) {
    nextStep = `Usuario pidió ${collectedData?.service}. GUÍA a elegir fecha/hora. ${availableSlots.length > 0 ? `Disponible: ${availableSlots.join(', ')}.` : ''}`;
  } else {
    nextStep = `ASISTE: resuelve dudas u ofrece agendar. ${availableSlots.length > 0 ? `Hoy disponible: ${availableSlots.join(', ')}.` : ''}`;
  }

  return `
${business.prompt_custom || 'Eres la asistente virtual de la clínica.'}

${hasHistory ? 'IMPORTANTE: Ya saludaste. NO te presentes de nuevo. Responde directo al mensaje.' : ''}

ESTADO ACTUAL: ${nextStep}

Responde en máximo 2 frases. Solo el mensaje de chat, sin metadatos.
`.trim();
}

// ─── 6. Detectar si el bot confirmó, canceló o reagendó ───────────────────

export function extractConfirmation(botResponse: string): boolean {
  const lower = botResponse.toLowerCase();
  return lower.includes('✓ cita agendada') ||
    lower.includes('cita agendada para el') ||
    lower.includes('cita confirmada');
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
