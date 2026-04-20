export const dynamic = 'force-dynamic';
// app/api/calendar/update-event/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { google } from 'googleapis';
import { getGoogleCalendarClient } from '@/lib/calendar';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split('Bearer ')[1];
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { appointment_id, date, time, duration } = await request.json();
    if (!appointment_id || !date || !time) {
      return NextResponse.json({ error: 'Faltan parámetros: appointment_id, date, y time son requeridos' }, { status: 400 });
    }

    // 1. Obtener cita y negocio
    const { data: appointment, error: errAppt } = await supabaseAdmin
      .from('appointments')
      .select('*, businesses(*)')
      .eq('id', appointment_id)
      .single();

    if (errAppt || !appointment || appointment.businesses.user_id !== user.id) {
      return NextResponse.json({ error: 'Cita no encontrada o no autorizada' }, { status: 404 });
    }

    const business = appointment.businesses;
    const dur = duration || 45;
    const startDateTime = new Date(`${date}T${time}:00`);
    const dateObj = new Date(startDateTime.getTime());
    dateObj.setMinutes(dateObj.getMinutes() + dur);
    const getHHMM = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const endTimeString = getHHMM(dateObj);

    // 2. Modificar en Google Calendar (si fue creada ahí)
    if (business.google_calendar_access_token_encrypted && appointment.google_event_id) {
      try {
        const auth = await getGoogleCalendarClient(business);
        const calendar = google.calendar({ version: 'v3', auth });
        
        await calendar.events.patch({
          calendarId: business.google_calendar_id || 'primary',
          eventId: appointment.google_event_id,
          requestBody: {
            start: {
              dateTime: `${date}T${time}:00`,
              timeZone: 'America/Santiago',
            },
            end: {
              dateTime: `${date}T${endTimeString}:00`,
              timeZone: 'America/Santiago',
            },
          },
        });
        console.log(`✅ Evento ${appointment.google_event_id} reprogramado en Google Calendar.`);
      } catch (calErr) {
        console.error('Error reprogramando en Google Calendar:', calErr);
        // Si no se encuentra en Google, continuar con la actualización local
      }
    }

    // 3. Modificar base de datos
    await supabaseAdmin
      .from('appointments')
      .update({ date_time: startDateTime.toISOString() })
      .eq('id', appointment_id);

    return NextResponse.json({ success: true, message: 'Cita reprogramada con éxito' });
  } catch (error: any) {
    console.error('Error en update-event:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
