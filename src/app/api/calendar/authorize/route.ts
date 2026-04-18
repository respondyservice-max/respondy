// app/api/calendar/authorize/route.ts - GOOGLE OAUTH CALENDAR
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/callback`
);

// GET: Generar URL para que cliente autorice su Calendar
export async function GET(_request: NextRequest) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Generar URL de autorización
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
      state: user.id, // Para validar después
    });

    return NextResponse.json({ authUrl });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
