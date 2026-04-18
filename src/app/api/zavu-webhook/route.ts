export const dynamic = "force-dynamic";
// app/api/zavu-webhook/route.ts - WEBHOOK DE ZAVU (SEGURO)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { decrypt } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // data.sender_id viene de Zavu
    const senderIdFromZavu = data.sender_id;
    const messageText = data.text;
    const phoneFrom = data.from;

    // 1. Encontrar business por sender_id encriptado
    const { data: businesses } = await supabaseAdmin
      .from('businesses')
      .select('*');

    let targetBusiness = null;
    for (const business of businesses || []) {
      try {
        if (!business.zavu_sender_id_encrypted) continue;
        const decryptedSenderId = decrypt(business.zavu_sender_id_encrypted);
        if (decryptedSenderId === senderIdFromZavu) {
          targetBusiness = business;
          break;
        }
      } catch {
        // Ignorar errors de decriptación
      }
    }

    if (!targetBusiness) {
      return NextResponse.json({ error: 'Business no encontrado' }, { status: 404 });
    }

    // 2. Obtener credenciales del cliente (decriptar)
    const zavuApiKey = decrypt(targetBusiness.zavu_api_key_encrypted);
    
    // 3. Procesar con Gemini (usando prompt del cliente)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${targetBusiness.prompt_custom}\n\nMensaje del cliente: "${messageText}"`,
                },
              ],
            },
          ],
        }),
      }
    );

    const geminiData = await response.json();
    const botResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Lo siento, no pude procesar tu mensaje.';

    // 4. Responder usando credenciales del cliente
    await fetch('https://api.zavu.dev/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${zavuApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: phoneFrom,
        text: botResponse,
      }),
    });

    // 5. Guardar conversación
    await supabaseAdmin
      .from('conversations')
      .insert([
        {
          business_id: targetBusiness.id,
          phone_from: phoneFrom,
          message_type: 'incoming',
          message_text: messageText,
        },
        {
          business_id: targetBusiness.id,
          phone_from: phoneFrom,
          message_type: 'outgoing',
          message_text: botResponse,
        },
      ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error en webhook:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
