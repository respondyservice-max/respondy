export const dynamic = "force-dynamic";
// app/api/zavu-webhook/route.ts - WEBHOOK DE ZAVU (SEGURO)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { decrypt } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    console.log('--- NUEVO MENSAJE DE ZAVU ---');
    console.log('Data recibida:', JSON.stringify(data, null, 2));
    
    // Ajustamos la extracción para que coincida exactamente con lo que envía Zavu
    const senderIdFromZavu = data.senderId; // Viene en la raíz
    const messageText = data.data?.text;    // Viene dentro del objeto data
    const phoneFrom = data.data?.from;      // Viene dentro del objeto data

    if (!senderIdFromZavu || !messageText) {
      console.log('Falta sender_id o texto en el mensaje');
      return NextResponse.json({ error: 'Data incompleta' }, { status: 400 });
    }

    // 1. Encontrar business por sender_id encriptado
    console.log('Buscando negocio para sender_id:', senderIdFromZavu);
    const { data: businesses, error: dbError } = await supabaseAdmin
      .from('businesses')
      .select('*');

    if (dbError) {
      console.error('Error al consultar negocios en DB:', dbError);
    }

    let targetBusiness = null;
    for (const business of businesses || []) {
      try {
        if (!business.zavu_sender_id_encrypted) continue;
        const decryptedSenderId = decrypt(business.zavu_sender_id_encrypted);
        
        if (decryptedSenderId === senderIdFromZavu) {
          targetBusiness = business;
          console.log('Negocio encontrado:', business.name);
          break;
        }
      } catch (err) {
        console.error('Error al decriptar sender_id para negocio:', business.name);
      }
    }

    if (!targetBusiness) {
      console.log('No se encontró ningún negocio con ese Sender ID');
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
    console.log('Enviando respuesta a Zavu (v1) para:', phoneFrom);
    const responseToZavu = await fetch('https://api.zavu.dev/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${zavuApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        senderId: senderIdFromZavu, // Vital para que Zavu sepa cuál número usar
        to: phoneFrom,
        text: botResponse,
      }),
    });

    const zavuResult = await responseToZavu.json();
    console.log('Resultado de Zavu API:', responseToZavu.status, JSON.stringify(zavuResult, null, 2));

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
