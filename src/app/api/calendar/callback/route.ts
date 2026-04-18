// app/api/calendar/callback/route.ts - CALLBACK DE GOOGLE OAUTH
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto';

import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/callback`
);

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state'); // user_id

    if (!code || !state) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard?error=cancelled`);
    }

    // Intercambiar code por tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Obtener info del calendar
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const { data: calendarList } = await calendar.calendarList.list();
    
    const primaryCalendar = calendarList.items?.[0];
    if (!primaryCalendar) {
      throw new Error('No se encontró calendar');
    }

    if (!tokens.access_token) {
      throw new Error('No access token received');
    }

    // Encriptar tokens
    const encrypted_access_token = encrypt(tokens.access_token);
    const encrypted_refresh_token = tokens.refresh_token 
      ? encrypt(tokens.refresh_token as string) 
      : null;

    // Guardar en BD
    await supabaseAdmin
      .from('businesses')
      .update({
        google_calendar_id: primaryCalendar.id,
        google_calendar_email: primaryCalendar.summary,
        google_calendar_access_token_encrypted: encrypted_access_token,
        google_calendar_refresh_token_encrypted: encrypted_refresh_token,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', state);

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?calendar=connected`
    );
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?error=calendar_failed`
    );
  }
}
