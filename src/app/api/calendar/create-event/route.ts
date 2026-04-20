export const dynamic = 'force-dynamic';
// app/api/calendar/create-event/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createCalendarEvent } from '@/lib/calendar';

export async function POST(request: NextRequest) {
  try {
    const {
      business_id,
      patient_name,
      patient_phone,
      service,
      date,
      time,
      duration,
    } = await request.json();

    if (!business_id || !patient_name || !service || !date || !time) {
      return NextResponse.json({
        error: 'Faltan parámetros: business_id, patient_name, service, date, time son requeridos',
      }, { status: 400 });
    }

    // Obtener negocio con tokens
    const { data: business, error } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', business_id)
      .single();

    if (error || !business) {
      return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 });
    }

    if (!business.google_calendar_access_token_encrypted) {
      return NextResponse.json({
        error: 'Google Calendar no conectado para este negocio',
        google_connected: false,
      }, { status: 200 });
    }

    const result = await createCalendarEvent(business, {
      patientName: patient_name,
      patientPhone: patient_phone || 'No especificado',
      service,
      date,
      time,
      durationMinutes: duration || 45,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      event_id: result.eventId,
      event_link: result.eventLink,
      message: `Evento creado: ${service} para ${patient_name} el ${date} a las ${time}`,
    });
  } catch (error: any) {
    console.error('Error en create-event:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
