// app/terms/page.tsx
'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsOfService() {
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
          <h1 className="text-3xl font-bold text-slate-900 mb-8">Términos del Servicio</h1>
          
          <div className="prose prose-slate prose-blue max-w-none space-y-6 text-slate-600">
            <p className="text-sm">Última actualización: 18 de abril, 2024</p>
            
            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">1. Aceptación de los Términos</h2>
              <p>
                Al acceder y utilizar Respondy.cl, aceptas cumplir con estos Términos del Servicio. Si no estás de acuerdo con alguna parte de estos términos, no deberías usar nuestra plataforma.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">2. Descripción del Servicio</h2>
              <p>
                Respondy provee una plataforma SaaS que utiliza Inteligencia Artificial para automatizar respuestas de WhatsApp y gestionar agendas a través de Google Calendar. El servicio se ofrece bajo modelos de suscripción mensual.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">3. Cuentas de Usuario</h2>
              <p>
                Para usar Respondy, debes registrarte mediante Google OAuth. Eres responsable de mantener la seguridad de tu cuenta y de todas las actividades que ocurran bajo ella. Debes notificarnos inmediatamente sobre cualquier uso no autorizado.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">4. Responsabilidad del Contenido</h2>
              <p>
                Tú eres el único responsable del "Prompt" o instrucciones que le das a tu IA y de la veracidad de la información que el bot entrega a tus pacientes o clientes. Respondy no se hace responsable por errores en las respuestas generadas por la IA o citas mal agendadas debido a instrucciones confusas.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">5. Pagos y Cancelaciones</h2>
              <p>
                Los planes se facturan por adelantado mensualmente. Puedes cancelar tu suscripción en cualquier momento desde tu panel de configuración. La cancelación detendrá el cobro del siguiente ciclo de facturación. No se realizan reembolsos por periodos ya pagados.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">6. Limitación de Responsabilidad</h2>
              <p>
                Respondy se ofrece "tal cual" y no garantizamos que el servicio sea ininterrumpido o libre de errores. En ningún caso seremos responsables por daños indirectos, ejemplares o consecuentes derivados del uso de nuestra plataforma.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-3">7. Modificaciones</h2>
              <p>
                Nos reservamos el derecho de modificar estos términos en cualquier momento. El uso continuado de la plataforma después de dichos cambios constituye la aceptación de los nuevos términos.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
