export const dynamic = "force-dynamic";
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
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split('Bearer ')[1];
    const { data: { user } } = await supabase.auth.getUser(token);
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
  } catch (error: any) {
    console.error('Error in calendar authorize:', error);
    return NextResponse.json({ 
      error: 'Error al generar URL de Google',
      details: error.message 
    }, { status: 500 });
  }
}
