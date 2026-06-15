export const dynamic = 'force-dynamic';
// app/api/business/buy-extra-messages/route.ts
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

    // Obtener negocio actual para saber cuántos extra_messages ya tiene
    const { data: business, error: fetchErr } = await supabaseAdmin
      .from('businesses')
      .select('id, extra_messages')
      .eq('user_id', user.id)
      .single();

    if (fetchErr || !business) {
      return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 });
    }

    const currentExtra = business.extra_messages ?? 0;
    const newExtra = currentExtra + 1000;

    const { error: updateErr } = await supabaseAdmin
      .from('businesses')
      .update({ extra_messages: newExtra })
      .eq('user_id', user.id);

    if (updateErr) {
      return NextResponse.json({ error: 'Error al agregar mensajes' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      extra_messages: newExtra,
      message: `✅ Se agregaron 1.000 mensajes. Total extra: ${newExtra.toLocaleString('es-CL')}`,
    });
  } catch (err) {
    console.error('Error en buy-extra-messages:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
