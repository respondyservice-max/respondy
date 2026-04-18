// app/dashboard/setup/page.tsx - SETUP INICIAL
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle, Loader } from 'lucide-react';

export default function SetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: '',
    business_type: '',
    location: '',
    services: '',
    prompt_custom: '',
    plan: 'ia_messaging' as 'ia_messaging' | 'ia_calendar',
  });

  useEffect(() => {
    // Check if already has business
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }
      const { data } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', user.id)
        .single();
      
      if (data) {
        router.push('/dashboard');
      }
    };
    check();
  }, [router]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('businesses')
        .insert({
          user_id: user.id,
          name: form.name,
          business_type: form.business_type,
          location: form.location,
          services: form.services.split(',').map(s => s.trim()).filter(Boolean),
          prompt_custom: form.prompt_custom || `Soy asistente virtual de ${form.name}. Atiendo consultas de clientes de forma amable y profesional. Mis servicios incluyen: ${form.services}. Estoy ubicado en ${form.location}.`,
          plan: form.plan,
        });

      if (!error) {
        router.push('/dashboard');
      } else {
        alert('Error al crear negocio: ' + error.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al crear negocio');
    } finally {
      setLoading(false);
    }
  };

  const businessTypes = [
    { value: 'dentista', label: '🦷 Dentista' },
    { value: 'barberia', label: '💈 Barbería' },
    { value: 'peluqueria', label: '✂️ Peluquería' },
    { value: 'medico', label: '🏥 Médico' },
    { value: 'veterinaria', label: '🐾 Veterinaria' },
    { value: 'abogado', label: '⚖️ Abogado' },
    { value: 'fotografo', label: '📸 Fotógrafo' },
    { value: 'entrenador', label: '💪 Entrenador personal' },
    { value: 'salon_belleza', label: '💅 Salón de belleza' },
    { value: 'mecanica', label: '🔧 Mecánica' },
    { value: 'otro', label: '🏢 Otro' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
            Respondy
          </h1>
          <p className="text-gray-600">Configura tu negocio en 2 minutos</p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 justify-center mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                step >= s
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-400'
              }`}>
                {step > s ? <CheckCircle className="w-5 h-5" /> : s}
              </div>
              {s < 3 && (
                <div className={`w-12 h-1 rounded-full transition-all ${
                  step > s ? 'bg-blue-600' : 'bg-gray-200'
                }`}></div>
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 p-8 border border-gray-100">
          {/* Step 1: Datos básicos */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-gray-900">Datos de tu negocio</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nombre del negocio *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej: Clínica Smile"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de negocio *</label>
                <div className="grid grid-cols-2 gap-2">
                  {businessTypes.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setForm({ ...form, business_type: type.value })}
                      className={`p-3 rounded-xl text-sm font-medium text-left transition-all ${
                        form.business_type === type.value
                          ? 'bg-blue-50 border-2 border-blue-500 text-blue-700'
                          : 'bg-gray-50 border-2 border-transparent hover:border-gray-200 text-gray-700'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Ubicación *</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Ej: Concepción, Chile"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!form.name || !form.business_type || !form.location}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                Siguiente
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Step 2: Servicios y Prompt */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-gray-900">Servicios y IA</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Servicios (separados por coma) *</label>
                <textarea
                  value={form.services}
                  onChange={(e) => setForm({ ...form, services: e.target.value })}
                  placeholder="Ej: Limpiezas, Empastes, Extracciones, Blanqueamiento"
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prompt personalizado (opcional)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Instrucciones para tu IA. Si lo dejas vacío, se generará uno automáticamente.
                </p>
                <textarea
                  value={form.prompt_custom}
                  onChange={(e) => setForm({ ...form, prompt_custom: e.target.value })}
                  placeholder={`Soy asistente virtual de ${form.name || 'tu negocio'}. Atiendo consultas de forma amable y profesional...`}
                  rows={5}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-3.5 border-2 border-gray-200 rounded-xl font-semibold text-gray-600 hover:bg-gray-50 transition"
                >
                  Atrás
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!form.services}
                  className="flex-1 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  Siguiente
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Plan */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-gray-900">Elige tu plan</h2>

              <div className="space-y-4">
                <button
                  onClick={() => setForm({ ...form, plan: 'ia_messaging' })}
                  className={`w-full p-5 rounded-xl text-left transition-all ${
                    form.plan === 'ia_messaging'
                      ? 'border-2 border-blue-500 bg-blue-50'
                      : 'border-2 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-gray-900">📱 IA Mensajería</h3>
                      <p className="text-sm text-gray-600 mt-1">WhatsApp + IA para responder automáticamente</p>
                    </div>
                    <span className="text-xl font-bold text-gray-900">$19,000<span className="text-sm font-normal text-gray-500">/mes</span></span>
                  </div>
                </button>

                <button
                  onClick={() => setForm({ ...form, plan: 'ia_calendar' })}
                  className={`w-full p-5 rounded-xl text-left transition-all relative ${
                    form.plan === 'ia_calendar'
                      ? 'border-2 border-blue-500 bg-blue-50'
                      : 'border-2 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="absolute -top-3 right-4 px-3 py-0.5 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full">
                    ⭐ POPULAR
                  </div>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-gray-900">📅 IA + Calendario</h3>
                      <p className="text-sm text-gray-600 mt-1">Todo + Agenda automática en Google Calendar</p>
                    </div>
                    <span className="text-xl font-bold text-gray-900">$39,000<span className="text-sm font-normal text-gray-500">/mes</span></span>
                  </div>
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-3.5 border-2 border-gray-200 rounded-xl font-semibold text-gray-600 hover:bg-gray-50 transition"
                >
                  Atrás
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    <>
                      Crear negocio
                      <CheckCircle className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
