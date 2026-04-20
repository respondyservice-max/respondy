export const dynamic = 'force-dynamic';
// app/api/calendar/delete-event/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { google } from 'googleapis';
import { decrypt } from '@/lib/crypto';
import { getGoogleCalendarClient } from '@/lib/calendar';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split('Bearer ')[1];
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { appointment_id } = await request.json();
    if (!appointment_id) {
      return NextResponse.json({ error: 'appointment_id requerido' }, { status: 400 });
    }

    // 1. Obtener la cita y el negocio
    const { data: appointment, error: errAppt } = await supabaseAdmin
      .from('appointments')
      .select('*, businesses(*)')
      .eq('id', appointment_id)
      .single();

    if (errAppt || !appointment || appointment.businesses.user_id !== user.id) {
      return NextResponse.json({ error: 'Cita no encontrada o no autorizada' }, { status: 404 });
    }

    // 2. Eliminar del calendario de Google (si fue creada ahí)
    const business = appointment.businesses;
    if (business.google_calendar_access_token_encrypted && appointment.google_event_id) {
      try {
        const auth = await getGoogleCalendarClient(business);
        const calendar = google.calendar({ version: 'v3', auth });
        await calendar.events.delete({
          calendarId: business.google_calendar_id || 'primary',
          eventId: appointment.google_event_id,
        });
        console.log(`✅ Evento ${appointment.google_event_id} borrado de Google Calendar.`);
      } catch (calErr) {
        console.error('Error borrando en Google Calendar:', calErr);
        // Continuamos borrando localmente aunque falle en Google (pudo haber sido borrada a mano)
      }
    }

    // 3. Eliminar de base de datos
    await supabaseAdmin.from('appointments').delete().eq('id', appointment_id);

    return NextResponse.json({ success: true, message: 'Cita cancelada con éxito' });
  } catch (error: any) {
    console.error('Error en delete-event:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
