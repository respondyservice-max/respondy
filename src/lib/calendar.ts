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

  // Extraer horarios ocupados
  const occupied_times: string[] = [];
  for (const event of events) {
    const start = event.start?.dateTime;
    if (start) {
      const d = new Date(start);
      occupied_times.push(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`);
    }
  }

  // Generar slots disponibles (cada 30 min)
  const available_slots: string[] = [];
  let current = new Date(`${date}T${dayStart}:00`);
  const end = new Date(`${date}T${dayEnd}:00`);

  while (current <= new Date(end.getTime() - durationMinutes * 60 * 1000)) {
    const slot = `${String(current.getHours()).padStart(2,'0')}:${String(current.getMinutes()).padStart(2,'0')}`;
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

  // Detectar día de la semana / fecha
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let date: string | null = null;

  const dayMap: Record<string, number> = {
    'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3,
    'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6,
    'domingo': 0, 'domingo ': 0
  };

  const monthMap: Record<string, number> = {
    'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
    'julio': 6, 'agosto': 7, 'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
  };

  // 1. Intentar detectar fecha específica "24 de abril"
  const dateSpecificMatch = lower.match(/(\d{1,2})\s+de\s+([a-z]+)/i);
  if (dateSpecificMatch) {
    const dayNumeric = parseInt(dateSpecificMatch[1]);
    const monthName = dateSpecificMatch[2];
    if (monthMap[monthName] !== undefined) {
      const targetDate = new Date(today.getFullYear(), monthMap[monthName], dayNumeric);
      // Si la fecha ya pasó este año, asumir el próximo año
      if (targetDate < today) targetDate.setFullYear(today.getFullYear() + 1);
      date = formatDate(targetDate);
    }
  }

  // 2. Si no hubo match específico, intentar días relativos
  if (!date) {
    if (lower.includes('hoy') || lower.includes('para hoy')) {
      date = formatDate(today);
    } else if (lower.includes('mañana') || lower.includes('manana')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      date = formatDate(tomorrow);
    } else {
      for (const [day, dayNum] of Object.entries(dayMap)) {
        if (lower.includes(day)) {
          const current = today.getDay();
          let diff = dayNum - current;
          if (diff <= 0) diff += 7; // Próximo
          const target = new Date(today);
          target.setDate(today.getDate() + diff);
          date = formatDate(target);
          break;
        }
      }
    }
  }

  // Detectar hora (ej: "5PM", "17:00", "a las 5", "5 de la tarde", "9 am")
  let time: string | null = null;

  // Intentar extraer hora con múltiples patrones, del más específico al más general
  const timePatterns: Array<{ re: RegExp; hourGrp: number; minGrp: number | null; merGrp: number | null }> = [
    { re: /(\d{1,2}):(\d{2})\s*(am|pm)?/i, hourGrp: 1, minGrp: 2, merGrp: 3 },   // 10:30, 10:30am
    { re: /(\d{1,2})\s*(?:hrs|horas)/i,     hourGrp: 1, minGrp: null, merGrp: null }, // 15 hrs
    { re: /(\d{1,2})\s*(am|pm)/i,           hourGrp: 1, minGrp: null, merGrp: 2 }, // 9am
    { re: /a las (\d{1,2})/i,               hourGrp: 1, minGrp: null, merGrp: null }, // a las 9
    { re: /\b(\d{1,2})\b/,                  hourGrp: 1, minGrp: null, merGrp: null }, // 17 (solo número)
  ];

  for (const { re, hourGrp, minGrp, merGrp } of timePatterns) {
    const match = lower.match(re);
    if (match) {
      let hour = parseInt(match[hourGrp]);
      // minGrp: solo es válido si el grupo es numérico
      const minRaw = minGrp ? match[minGrp] : null;
      const minutes = (minRaw && /^\d+$/.test(minRaw)) ? parseInt(minRaw) : 0;
      const meridiem = (merGrp && match[merGrp] ? match[merGrp] : '').toLowerCase();
      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      // Heurística: si no hay AM/PM y hora <= 8, asumir PM
      if (!meridiem && hour >= 1 && hour <= 8) hour += 12;
      if (!isNaN(hour)) {
        time = `${String(hour).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
      }
      break;
    }
  }

  // Detectar nombre del paciente
  let patientName: string | null = null;
  // 1. Formato estructurado "Paciente: [Nombre]"
  const nameMatchFormatted = text.match(/paciente:\s*([A-Z\u00C0-\u024FñÑ][a-z\u00C0-\u024FñÑ]+(?:\s+[A-Z\u00C0-\u024FñÑ][a-z\u00C0-\u024FñÑ]+)+)/i);
  // 2. Con prefijos "me llamo", "soy", etc.
  const nameMatchPrefix = text.match(/(?:me llamo|soy|nombre es|nombre[:\s]+)\s+([A-Z\u00C0-\u024FñÑ][a-z\u00C0-\u024FñÑ]+(?:\s+[A-Z\u00C0-\u024FñÑ][a-z\u00C0-\u024FñÑ]+)?)/i);
  // 3. Nombre bare: dos palabras capitalizadas que no sean días/meses
  const ignorePhrases = new Set(['Fecha','Hora','Servicio','Limpieza','Jueves','Lunes','Martes','Miércoles','Miercoles','Viernes','Sábado','Sabado','Domingo','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Hola','Quiero','Necesito','Buenos','Entonces','Cita','Agendar']);
  const bareNameMatch = text.match(/\b([A-Z\u00C0-\u024FñÑ][a-z\u00C0-\u024FñÑ]{1,}(?:\s+[A-Z\u00C0-\u024FñÑ][a-z\u00C0-\u024FñÑ]{1,})?)\b/);
  
  if (nameMatchFormatted) {
    patientName = nameMatchFormatted[1].trim();
  } else if (nameMatchPrefix) {
    patientName = nameMatchPrefix[1].trim();
  } else if (bareNameMatch) {
    const candidate = bareNameMatch[1].trim();
    const words = candidate.split(' ');
    if (words.length >= 2 && !ignorePhrases.has(words[0])) {
      patientName = candidate;
    }
  }

  // Detectar servicio en el formato IA si está presente ("Servicio: Limpieza")
  const serviceMatchFormatted = text.match(/servicio:\s*([A-Za-z\u00C0-\u024FñÑ ]+?)(?:,|$|\n)/i);
  if (serviceMatchFormatted) {
    service = serviceMatchFormatted[1].trim();
  }

  return { service, date, time, patientName };
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

  const availableText = availability?.occupied_times.includes('CERRADO') ? 'CERRADO' : (availability?.available_slots.join(', ') || 'Ninguno');

  // 1. INSTRUCCIÓN PRIORITARIA
  let statusInfo = '';
  if (allDataReady) {
    statusInfo = `
[SISTEMA]: TODOS LOS DATOS ESTÁN LISTOS. 
Paciente: ${collectedData!.name}
Fecha: ${collectedData!.date}
Hora: ${collectedData!.time}
ACCION: Confirma la cita ahora con el formato obligatorio: "✓ Cita agendada. Paciente: ${collectedData!.name}, Día: ${collectedData!.date}, Hora: ${collectedData!.time}, Servicio: ${collectedData!.service || 'Consulta'}."
`;
  } else {
    statusInfo = `
[SISTEMA]: Faltan datos para agendar.
- Datos conocidos: Nombre: ${collectedData?.name || 'FALTA'}, Fecha: ${collectedData?.date || 'FALTA'}, Hora: ${collectedData?.time || 'FALTA'}.
- Disponibilidad para hoy: ${availableText}.
`;
  }

  return `
${statusInfo}

Eres el asistente de ${business.name}.
REGLA DE ORO: Si ya conoces el nombre del paciente (${collectedData?.name || 'desconocido'}), NO lo vuelvas a preguntar nunca.
REGLA DE ORO 2: Nunca pidas fecha de nacimiento ni RUT. No son necesarios.

Instrucciones: ${business.prompt_custom || 'Ayuda a agendar la cita.'}

FORMATOS:
- Agendar: "✓ Cita agendada. Paciente: [Nombre Apellido], Día: [día], Hora: [hora], Servicio: [servicio]."
- No disponible: "Esa hora está ocupada. Tengo libre: ${availableText}"
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
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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
    start: `${String(startH).padStart(2,'0')}:00`,
    end: `${String(endH).padStart(2,'0')}:00`,
  };
}

function capitalizeFirstLetter(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
