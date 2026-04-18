export const dynamic = "force-dynamic";
// app/api/business/credentials/route.ts - GUARDAR CREDENCIALES
import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto';

// POST: Guardar credenciales de Zavu
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split('Bearer ')[1];
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { zavu_api_key, zavu_sender_id } = await request.json();

    // Validar que no estén vacíos
    if (!zavu_api_key || !zavu_sender_id) {
      return NextResponse.json(
        { error: 'API Key y Sender ID son requeridos' },
        { status: 400 }
      );
    }

    // Validar con Zavu que sea válido
    try {
      const validateResponse = await fetch('https://api.zavu.dev/senders', {
        headers: {
          'Authorization': `Bearer ${zavu_api_key}`,
        },
      });

      if (!validateResponse.ok) {
        return NextResponse.json(
          { error: 'Credenciales de Zavu inválidas. Verifica tu API Key.' },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'No se pudo validar con Zavu. Intenta más tarde.' },
        { status: 400 }
      );
    }

    // Encriptar antes de guardar
    const encrypted_api_key = encrypt(zavu_api_key);
    const encrypted_sender_id = encrypt(zavu_sender_id);

    // Guardar en BD
    const { error: updateError } = await supabaseAdmin
      .from('businesses')
      .update({
        zavu_api_key_encrypted: encrypted_api_key,
        zavu_sender_id_encrypted: encrypted_sender_id,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (updateError) {
      return NextResponse.json(
        { error: 'Error al guardar credenciales' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Credenciales guardadas de forma segura',
      sender_id: zavu_sender_id,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
