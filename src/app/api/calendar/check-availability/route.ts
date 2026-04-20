export const dynamic = 'force-dynamic';
// app/api/calendar/check-availability/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { checkAvailability } from '@/lib/calendar';

export async function POST(request: NextRequest) {
  try {
    const { business_id, date, service, duration } = await request.json();

    if (!business_id || !date) {
      return NextResponse.json({ error: 'Faltan parámetros: business_id y date son requeridos' }, { status: 400 });
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

    const availability = await checkAvailability(business, date, duration || 45);

    return NextResponse.json({
      success: true,
      date,
      service: service || 'general',
      ...availability,
    });
  } catch (error: any) {
    console.error('Error en check-availability:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
