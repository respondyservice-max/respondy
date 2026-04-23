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

    const { appointment_id, google_event_id: directEventId } = await request.json();

    // ── CASO A: Se pasa google_event_id directamente (evento de Página de Reservas) ──
    if (directEventId && !appointment_id) {
      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (!biz) return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 });

      const auth = await getGoogleCalendarClient(biz);
      const calendar = google.calendar({ version: 'v3', auth });
      await calendar.events.delete({
        calendarId: biz.google_calendar_id || 'primary',
        eventId: directEventId,
      });
      // Limpiar de Supabase si existía
      await supabaseAdmin.from('appointments').delete().eq('google_event_id', directEventId);
      return NextResponse.json({ success: true });
    }

    if (!appointment_id) {
      return NextResponse.json({ error: 'appointment_id o google_event_id requerido' }, { status: 400 });
    }

    // ── CASO B: Se pasa appointment_id (flujo original) ──
    const { data: appointment, error: errAppt } = await supabaseAdmin
      .from('appointments')
      .select('*, businesses(*)')
      .eq('id', appointment_id)
      .single();

    if (errAppt || !appointment || appointment.businesses.user_id !== user.id) {
      return NextResponse.json({ error: 'Cita no encontrada o no autorizada' }, { status: 404 });
    }

    const business = appointment.businesses;
    if (business.google_calendar_access_token_encrypted && appointment.google_event_id) {
      try {
        const auth = await getGoogleCalendarClient(business);
        const calendar = google.calendar({ version: 'v3', auth });
        await calendar.events.delete({
          calendarId: business.google_calendar_id || 'primary',
          eventId: appointment.google_event_id,
        });
      } catch (calErr) {
        console.error('Error borrando en Google Calendar:', calErr);
      }
    }

    await supabaseAdmin.from('appointments').delete().eq('id', appointment_id);

    return NextResponse.json({ success: true, message: 'Cita cancelada con éxito' });
  } catch (error: any) {
    console.error('Error en delete-event:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
