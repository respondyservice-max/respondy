export const dynamic = "force-dynamic";
// app/api/calendar/upcoming-events/route.ts
// Lee eventos DIRECTAMENTE de Google Calendar (incluye los de la Página de Reservas)
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase';
import { getGoogleCalendarClient } from '@/lib/calendar';
import { google } from 'googleapis';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split('Bearer ')[1];
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!business || !business.google_calendar_access_token_encrypted) {
      return NextResponse.json({ events: [] });
    }

    const auth = await getGoogleCalendarClient(business);
    const calendar = google.calendar({ version: 'v3', auth });

    const now = new Date();
    const sixMonthsLater = new Date();
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

    const { data } = await calendar.events.list({
      calendarId: business.google_calendar_id || 'primary',
      timeMin: now.toISOString(),
      timeMax: sixMonthsLater.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    });

    const events = (data.items || [])
      .filter(e => e.status !== 'cancelled' && e.start?.dateTime) // Solo eventos con hora (no all-day)
      .map(e => {
        const startDT = e.start?.dateTime as string;
        const summary = e.summary || 'Cita';

        // Intentar extraer nombre y servicio del título (ej: "Consulta - Juan Pérez")
        let patientName = summary;
        let service = '';
        if (summary.includes(' - ')) {
          const parts = summary.split(' - ');
          service = parts[0].trim();
          patientName = parts.slice(1).join(' - ').trim();
        }

        // Extraer teléfono de la descripción si viene de la IA
        const desc = e.description || '';
        const phoneMatch = desc.match(/[Tt]el[ée]fono[:\s]+(\+?[\d\s]+)/);
        const phone = phoneMatch ? phoneMatch[1].trim() : '';

        return {
          id: e.id,
          google_event_id: e.id,
          patient_name: patientName,
          patient_phone: phone,
          service,
          date_time: startDT,
          source: 'google_calendar', // Para distinguir en el front
        };
      });

    return NextResponse.json({ events });
  } catch (error: any) {
    console.error('Error obteniendo eventos de Google Calendar:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
