// app/api/business/credentials/get/route.ts - OBTENER CREDENCIALES
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: Obtener estado de credenciales (parcialmente visible)
export async function GET(_request: NextRequest) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { data: business } = await supabase
      .from('businesses')
      .select('zavu_sender_id_encrypted, zavu_api_key_encrypted')
      .eq('user_id', user.id)
      .single();

    if (!business) {
      return NextResponse.json(
        { error: 'Negocio no encontrado' },
        { status: 404 }
      );
    }

    // Devolvemos solo parcialmente visible (sin exponer la key completa)
    return NextResponse.json({
      has_zavu: !!business.zavu_api_key_encrypted,
      sender_id: business.zavu_sender_id_encrypted ? '••••••••••••' : null,
    });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
