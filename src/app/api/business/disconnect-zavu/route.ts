export const dynamic = "force-dynamic";
// app/api/business/disconnect-zavu/route.ts - DESCONECTAR ZAVU
import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
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
        zavu_api_key_encrypted: null,
        zavu_sender_id_encrypted: null,
      })
      .eq('user_id', user.id);

    return NextResponse.json({ success: true, message: 'Desconectado' });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
