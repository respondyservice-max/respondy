// app/page.tsx - LANDING PAGE
import Link from "next/link";
import { CheckCircle, MessageSquare, Calendar, Zap, ArrowRight, Star, Shield, Clock } from "lucide-react";

export default function Landing() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Navbar */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-gray-100 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="font-bold text-2xl bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Respondy
          </div>
          <div className="flex items-center gap-4">
            <a href="#planes" className="hidden sm:inline text-sm text-gray-600 hover:text-gray-900 transition">
              Planes
            </a>
            <Link
              href="/auth/login"
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 text-sm font-semibold"
            >
              Ingresar
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 rounded-full text-sm text-blue-700 mb-8">
          <Zap className="w-4 h-4" />
          IA que trabaja 24/7 por ti
        </div>
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 text-gray-900 leading-tight">
          Tu WhatsApp trabajando{" "}
          <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            mientras duermes
          </span>
        </h1>
        <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
          IA que responde, agenda y confirma citas automáticamente en Google Calendar.
          Para peluqueros, dentistas, médicos y cualquier negocio de servicios.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Link
            href="/auth/login"
            className="group px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:shadow-xl hover:shadow-blue-500/25 transition-all duration-300 text-lg font-semibold flex items-center justify-center gap-2"
          >
            Empezar ahora
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <a
            href="#planes"
            className="px-8 py-4 border-2 border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all duration-300 text-lg font-semibold text-gray-700"
          >
            Ver planes
          </a>
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap justify-center gap-8 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-green-500" />
            Datos encriptados
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" />
            Setup en 5 minutos
          </div>
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-500" />
            Sin contratos
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">¿Cómo funciona?</h2>
          <p className="text-gray-600 text-center mb-12 max-w-xl mx-auto">
            Tres pasos simples para tener tu asistente IA funcionando
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<MessageSquare className="w-8 h-8 text-blue-600" />}
              title="1. Conecta WhatsApp"
              description="Vincula tu número con Zavu en minutos. Sin instalar nada en tu teléfono."
              gradient="from-blue-500/10 to-indigo-500/10"
            />
            <FeatureCard
              icon={<Zap className="w-8 h-8 text-indigo-600" />}
              title="2. Personaliza tu IA"
              description="Configura el prompt con tus servicios, horarios y estilo de comunicación."
              gradient="from-indigo-500/10 to-purple-500/10"
            />
            <FeatureCard
              icon={<Calendar className="w-8 h-8 text-purple-600" />}
              title="3. Recibe citas"
              description="Tu IA responde 24/7 y agenda directamente en Google Calendar."
              gradient="from-purple-500/10 to-pink-500/10"
            />
          </div>
        </div>
      </section>

      {/* Plans */}
      <section id="planes" className="py-20 px-4 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">Planes simples y transparentes</h2>
          <p className="text-gray-600 text-center mb-12">Sin contratos. Cancela cuando quieras.</p>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <PlanCard
              name="IA Mensajería"
              price="19,000"
              currency="CLP"
              description="IA que responde tus mensajes de WhatsApp"
              features={[
                "WhatsApp + IA (Gemini)",
                "Respuestas automáticas personalizadas",
                "Panel de conversaciones",
                "Soporte por email",
              ]}
              cta="Empezar"
              highlighted={false}
            />
            <PlanCard
              name="IA + Calendario"
              price="39,000"
              currency="CLP"
              description="IA + Agenda automáticamente en Calendar"
              features={[
                "Todo del plan anterior",
                "Agenda automática en Google Calendar",
                "Dashboard con citas",
                "Editar/cancelar citas",
                "Notificaciones SMS",
                "Soporte prioritario",
              ]}
              cta="Empezar"
              highlighted={true}
            />
          </div>
        </div>
      </section>

      {/* Industries */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Para cualquier negocio de servicios</h2>
          <p className="text-gray-600 mb-12">Si agendas citas, Respondy te sirve</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              "🪒 Peluquería",
              "💈 Barbería",
              "🦷 Dentista",
              "🏥 Médico",
              "🐾 Veterinaria",
              "⚖️ Abogado",
              "📸 Fotógrafo",
              "💪 Entrenador",
              "💅 Salón de belleza",
              "🔧 Mecánica",
              "📊 Consultoría",
              "📚 Clases",
            ].map((industry) => (
              <div
                key={industry}
                className="p-4 bg-white border border-gray-100 rounded-xl hover:shadow-md hover:border-blue-200 transition-all duration-300 text-sm font-medium text-gray-700"
              >
                {industry}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-12 sm:p-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            ¿Listo para automatizar tu negocio?
          </h2>
          <p className="text-blue-100 text-lg mb-8 max-w-xl mx-auto">
            Empieza hoy y deja que la IA trabaje por ti mientras tú te enfocas en lo que importa.
          </p>
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-blue-600 rounded-xl hover:shadow-xl transition-all duration-300 text-lg font-semibold"
          >
            Empezar ahora
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <div className="font-bold text-2xl bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent mb-4">
            Respondy
          </div>
          <p className="text-gray-400 mb-4">
            IA para agendar citas automáticamente
          </p>
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} Respondy. Todos los derechos reservados. |{" "}
            <a href="mailto:soporte@respondy.cl" className="text-blue-400 hover:text-blue-300 transition">
              soporte@respondy.cl
            </a>
            {" | "}
            <Link href="/privacy" className="text-gray-500 hover:text-blue-400 transition">Política de Privacidad</Link>
            {" | "}
            <Link href="/terms" className="text-gray-500 hover:text-blue-400 transition">Términos del Servicio</Link>
          </p>
        </div>
      </footer>
    </main>
  );
}

// Componentes reutilizables
function FeatureCard({
  icon,
  title,
  description,
  gradient,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
}) {
  return (
    <div className={`p-8 bg-gradient-to-br ${gradient} rounded-2xl border border-gray-100 hover:shadow-lg transition-all duration-300`}>
      <div className="mb-5 inline-flex p-3 bg-white rounded-xl shadow-sm">{icon}</div>
      <h3 className="text-xl font-bold mb-3 text-gray-900">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}

function PlanCard({
  name,
  price,
  currency,
  description,
  features,
  cta,
  highlighted,
}: {
  name: string;
  price: string;
  currency: string;
  description: string;
  features: string[];
  cta: string;
  highlighted: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-8 relative transition-all duration-300 hover:shadow-xl ${
        highlighted
          ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-500/20 scale-[1.02]"
          : "bg-white border-2 border-gray-100 hover:border-blue-200"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full">
          ⭐ MÁS POPULAR
        </div>
      )}
      <h3 className="text-2xl font-bold mb-2">{name}</h3>
      <p className={highlighted ? "text-blue-100" : "text-gray-600"}>
        {description}
      </p>
      <div className="my-6">
        <span className="text-4xl font-bold">${price}</span>
        <span className="text-sm ml-1">{currency}/mes</span>
      </div>
      <Link
        href="/auth/login"
        className={`block w-full py-3.5 rounded-xl font-semibold transition-all duration-300 text-center ${
          highlighted
            ? "bg-white text-blue-600 hover:bg-gray-100 hover:shadow-lg"
            : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-lg hover:shadow-blue-500/25"
        }`}
      >
        {cta}
      </Link>
      <ul className="mt-8 space-y-3">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center gap-3">
            <CheckCircle className={`w-5 h-5 flex-shrink-0 ${highlighted ? "text-blue-200" : "text-green-500"}`} />
            <span className="text-sm">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
