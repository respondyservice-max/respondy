// app/privacy/page.tsx
'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <Link 
          href="/" 
          className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver al inicio
        </Link>
        
        <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-8 sm:p-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-8">Política de Privacidad</h1>
          
          <div className="prose prose-slate prose-blue max-w-none space-y-6 text-slate-600">
            <p className="text-sm">Última actualización: 18 de abril, 2024</p>
            
            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">1. Introducción</h2>
              <p>
                En Respondy.cl, nos tomamos muy en serio tu privacidad. Esta Política de Privacidad describe cómo recopilamos, usamos y protegemos la información personal de nuestros usuarios y los clientes de nuestros usuarios.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">2. Información que recopilamos</h2>
              <p>Recopilamos información necesaria para proveer el servicio de asistencia por IA, incluyendo:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Información de registro (Nombre, correo electrónico a través de Google OAuth).</li>
                <li>Datos del negocio (Nombre del negocio, servicios, horarios).</li>
                <li>Contenido de las conversaciones mediadas por el bot de WhatsApp.</li>
                <li>Tokens de acceso para Google Calendar (encriptados) para agendar citas.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">3. Uso de la Información</h2>
              <p>Utilizamos la información recopilada para:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Proveer y mantener el servicio de Respondy.</li>
                <li>Procesar respuestas automáticas mediante modelos de lenguaje (IA).</li>
                <li>Agendar citas en tu Google Calendar según las solicitudes de tus pacientes/clientes.</li>
                <li>Mejorar la precisión y calidad de las respuestas del bot.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">4. Protección de Datos</h2>
              <p>
                Implementamos medidas de seguridad de grado industrial. Todas las credenciales sensibles y tokens de API se almacenan de forma encriptada (AES-256). No compartimos tus datos con terceros para fines publicitarios.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">5. Uso de Google Data</h2>
              <p>
                El uso que hace Respondy de la información recibida de las API de Google se ajustará a la Política de Datos de Usuario de los Servicios de API de Google, incluidos los requisitos de Uso Limitado. Solo accedemos a los calendarios específicos que el usuario autoriza para el propósito exclusivo de agendar y gestionar citas.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">6. Contacto</h2>
              <p>
                Si tienes preguntas sobre esta política, puedes contactarnos en: <strong>soporte@respondy.cl</strong>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
