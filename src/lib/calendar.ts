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
  durationMinutes: number = 45
): Promise<AvailabilityResult> {

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

  // Rango del día completo
  const timeMin = new Date(`${date}T${dayStart}:00`);
  const timeMax = new Date(`${date}T${dayEnd}:00`);

  // Obtener eventos del día
  const { data } = await calendar.events.list({
    calendarId: business.google_calendar_id || 'primary',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = data.items || [];

  // Extraer horarios ocupados (Forzando zona horaria de Chile)
  const occupied_times: string[] = [];
  for (const event of events) {
    const start = event.start?.dateTime || event.start?.date;
    if (start) {
      const d = new Date(start);
      const timeStr = d.toLocaleTimeString('es-CL', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Santiago'
      });
      occupied_times.push(timeStr);
    }
  }

  // Generar slots disponibles (cada 30 min)
  const available_slots: string[] = [];
  // Usamos una base UTC para el cálculo y extraemos la hora local de Chile para la etiqueta
  let current = new Date(`${date}T${dayStart}:00`);
  const end = new Date(`${date}T${dayEnd}:00`);

  while (current <= new Date(end.getTime() - durationMinutes * 60 * 1000)) {
    const slot = current.toLocaleTimeString('es-CL', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Santiago'
    });
    
    if (!occupied_times.includes(slot)) {
      available_slots.push(slot);
    }
    current = new Date(current.getTime() + 30 * 60 * 1000);
  }

  // Etiqueta humana de la fecha
  const dateObj = new Date(`${date}T12:00:00`);
  const date_label = dateObj.toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Santiago',
  });

  return {
    requested_slot: null,
    is_available: false,
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
    service: string;
    date: string;   // YYYY-MM-DD
    time: string;   // HH:MM
    durationMinutes?: number;
  }
): Promise<{ success: boolean; eventId?: string; eventLink?: string; error?: string }> {
  try {
    const auth = await getGoogleCalendarClient(business);
    const calendar = google.calendar({ version: 'v3', auth });

    const duration = params.durationMinutes || 45;
    const startDateTime = new Date(`${params.date}T${params.time}:00`);
    const endDateTime = new Date(startDateTime.getTime() + duration * 60 * 1000);

    const { data: event } = await calendar.events.insert({
      calendarId: business.google_calendar_id || 'primary',
      requestBody: {
        summary: `${capitalizeFirstLetter(params.service)} - ${params.patientName}`,
        description: `Paciente: ${params.patientName}\nTeléfono: ${params.patientPhone}\nServicio: ${params.service}`,
        start: {
          dateTime: `${params.date}T${params.time}:00`, // NO .000Z so it uses timeZone specified
          timeZone: 'America/Santiago',
        },
        end: {
          // calculate end time correctly
          dateTime: (() => {
            const dateObj = new Date(`${params.date}T${params.time}:00`);
            dateObj.setMinutes(dateObj.getMinutes() + duration);
            const getHHMM = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            return `${params.date}T${getHHMM(dateObj)}:00`;
          })(),
          timeZone: 'America/Santiago',
        },
      },
    });

    // Guardar en tabla appointments
    await supabaseAdmin.from('appointments').insert({
      business_id: business.id,
      patient_name: params.patientName,
      patient_phone: params.patientPhone,
      service: params.service,
      date_time: startDateTime.toISOString(),
      google_event_id: event.id,
      status: 'confirmed',
    });

    return {
      success: true,
      eventId: event.id || undefined,
      eventLink: event.htmlLink || undefined,
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

// ─── 4. Parsear mensaje del cliente para extraer intención ───────────────────

export function parseClientMessage(text: string): ParsedAppointment {
  const lower = text.toLowerCase();

  // Detectar servicio mencionado
  const serviceKeywords: Record<string, string> = {
    'blanqueamiento': 'blanqueamiento',
    'limpieza': 'limpieza dental',
    'profilaxis': 'limpieza dental',
    'empaste': 'empaste',
    'extracción': 'extracción',
    'extraccion': 'extracción',
    'ortodoncia': 'ortodoncia',
    'consulta': 'consulta',
    'radiografía': 'radiografía',
    'radiografia': 'radiografía',
    'tratamiento': 'tratamiento',
  };

  let service: string | null = null;
  for (const [keyword, name] of Object.entries(serviceKeywords)) {
    if (lower.includes(keyword)) {
      service = name;
      break;
    }
  }

// ─── 5. Parsear mensaje del cliente con IA (GROQ) ─────────────────────────

export async function parseClientMessage(history: string): Promise<{
  date: string | null;
  time: string | null;
  patientName: string | null;
  service: string | null;
}> {
  if (!process.env.GROQ_API_KEY) return { date: null, time: null, patientName: null, service: null };

  try {
    const today = new Date();
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `Eres un extractor técnico. Hoy es ${today.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.
            Extrae Nombre, Fecha (YYYY-MM-DD) y Hora (HH:mm) del historial.
            IMPORTANTE: Si el usuario dijo "Viernes 24", extrae "2026-04-24". Si dijo "17:00" o "las 5", extrae "17:00".
            Devuelve SOLO JSON: {"patientName": string, "date": string, "time": string, "service": string}`,
          },
          { role: 'user', content: `Chat: ${history}` },
        ],
        temperature: 0,
        response_format: { type: "json_object" }
      }),
    });

    const data = await res.json();
    const result = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    
    return {
      patientName: result.patientName || null,
      date: result.date || null,
      time: result.time || null,
      service: result.service || null
    };
  } catch (e) {
    return { date: null, time: null, patientName: null, service: null };
  }
}

// ─── 5. Crear prompt dinámico para Groq con disponibilidad real ──────────────

export function createDynamicPrompt(
  business: any,
  availability: AvailabilityResult | null,
  requestedSlot: { date: string; time: string | null } | null,
  upcomingAppointments: any[] = [],
  collectedData?: { name?: string | null; date?: string | null; time?: string | null; service?: string | null }
): string {
  const currentDate = new Date().toLocaleDateString('es-CL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const hasName = collectedData?.name && collectedData.name.trim().split(/\s+/).length >= 2;
  const hasDate = !!collectedData?.date;
  const hasTime = !!collectedData?.time;
  const isSlotFree = requestedSlot?.time && availability?.available_slots.includes(requestedSlot.time);
  const allDataReady = hasName && hasDate && hasTime && isSlotFree;

  // 1. FICHA TÉCNICA (ESTADO ABSOLUTO)
  // Normalizamos para evitar fallos de comparación
  const availableSlots = availability?.available_slots || [];
  const cleanRequestedTime = requestedSlot?.time?.trim();
  const isSlotFree = cleanRequestedTime && availableSlots.includes(cleanRequestedTime);
  const allDataReady = hasName && hasDate && hasTime && isSlotFree;
  const availableText = availableSlots.length > 0 ? availableSlots.join(', ') : 'Sin cupos';
  
  const statusMemo = `
### FICHA DE AGENDAMIENTO ###
- PACIENTE: ${collectedData?.name || 'DESCONOCIDO'}
- FECHA: ${collectedData?.date || 'PENDIENTE'}
- HORA: ${collectedData?.time || 'PENDIENTE'}
- CALENDAR: ${isSlotFree ? '✅ LIBRE' : '❌ OCUPADA/PENDIENTE'}
#############################
`;

  let flowInstruction = '';
  if (allDataReady) {
    flowInstruction = `ORDEN: CONFIRMA AHORA. Responde: "✓ Cita agendada. Paciente: ${collectedData!.name}, Día: ${collectedData!.date}, Hora: ${collectedData!.time}, Servicio: Consulta."`;
  } else if (hasDate && hasTime && !isSlotFree) {
    flowInstruction = `ORDEN: La hora ${collectedData?.time} está ocupada para el ${collectedData?.date}. Ofrece solo estas: ${availableText}.`;
  } else {
    flowInstruction = `ORDEN: Pide SOLO lo faltante. Sé muy breve.
- Si falta nombre: "¿Nombre del paciente?"
- Si falta fecha: "¿Qué día?" (Opciones: ${availableText})
- Si falta hora: "¿Qué hora?" (Opciones: ${availableText})`;
  }

  return `
${statusMemo}
${flowInstruction}

Eres el asistente automático de Clínica Smile. Sé muy seco y directo. No uses frases largas.
NUNCA repitas el texto que empieza por ###.
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

export function extractReschedule(botResponse: string): { id: string, date: string, time: string } | null {
  const match = botResponse.match(/✓ cita reagendada\. id:\s*([a-f0-9\-]+), día:\s*([a-z0-9\-\s]+), hora:\s*([0-9:]+)/i);
  if (match) {
    // Para simplificar, obtenemos date y time intentando re-parsearlo
    // Pero asume que se usan las variables de contexto o se hace un match similar
    const p = parseClientMessage(botResponse);
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
