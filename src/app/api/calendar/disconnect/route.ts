export const dynamic = "force-dynamic";
// app/api/calendar/disconnect/route.ts - DESCONECTAR GOOGLE CALENDAR
import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function POST(_request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split('Bearer ')[1];
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    await supabaseAdmin
      .from('businesses')
      .update({
        google_calendar_id: null,
        google_calendar_email: null,
        google_calendar_access_token_encrypted: null,
        google_calendar_refresh_token_encrypted: null,
      })
      .eq('user_id', user.id);

    return NextResponse.json({ success: true, message: 'Google Calendar desconectado' });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
