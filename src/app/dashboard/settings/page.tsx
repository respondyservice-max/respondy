// app/dashboard/settings/page.tsx - SETTINGS MEJORADO (SEGURO)
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import DashboardNav from '@/components/DashboardNav';
import { useRouter } from 'next/navigation';
import { CheckCircle, Loader, ExternalLink } from 'lucide-react';
import type { Business } from '@/types';

export default function Settings() {
  const router = useRouter();
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zavuConnected, setZavuConnected] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<'negocio' | 'integraciones'>('negocio');

  const [form, setForm] = useState({
    name: '',
    business_type: '',
    location: '',
    services: '',
    prompt_custom: '',
    schedule_monday: '9AM-6PM',
    schedule_saturday: '9AM-1PM',
  });

  const [zavuForm, setZavuForm] = useState({
    zavu_api_key: '',
    zavu_sender_id: '',
  });

  const [zavuLoading, setZavuLoading] = useState(false);
  const [zavuMessage, setZavuMessage] = useState('');
  const [zavuError, setZavuError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  // Cargar datos del negocio
  useEffect(() => {
    const fetchBusiness = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/auth/login');
          return;
        }

        const { data, error } = await supabase
          .from('businesses')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (error || !data) {
          router.push('/dashboard');
          return;
        }

        setBusiness(data);
        setForm({
          name: data.name || '',
          business_type: data.business_type || '',
          location: data.location || '',
          services: data.services?.join(', ') || '',
          prompt_custom: data.prompt_custom || '',
          schedule_monday: data.schedule_monday || '9AM-6PM',
          schedule_saturday: data.schedule_saturday || '9AM-1PM',
        });

        if (data.zavu_api_key_encrypted) {
          setZavuConnected(true);
        }
        if (data.google_calendar_id) {
          setCalendarConnected(true);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBusiness();
  }, [router]);

  // Guardar configuración general
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('businesses')
        .update({
          name: form.name,
          business_type: form.business_type,
          location: form.location,
          services: form.services.split(',').map(s => s.trim()).filter(Boolean),
          prompt_custom: form.prompt_custom,
          schedule_monday: form.schedule_monday,
          schedule_saturday: form.schedule_saturday,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (!error) {
        setSaveMessage('✅ Configuración guardada correctamente');
        setTimeout(() => setSaveMessage(''), 3000);
      } else {
        setSaveMessage('❌ Error al guardar');
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  // Guardar credenciales Zavu (SEGURO)
  const handleZavuSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setZavuLoading(true);
    setZavuError('');
    setZavuMessage('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/business/credentials', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          zavu_api_key: zavuForm.zavu_api_key,
          zavu_sender_id: zavuForm.zavu_sender_id,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setZavuMessage('✅ ' + data.message);
        setZavuConnected(true);
        setZavuForm({ zavu_api_key: '', zavu_sender_id: '' });
      } else {
        setZavuError('❌ ' + data.error);
      }
    } catch (error) {
      setZavuError('Error al conectar con Zavu');
      console.error(error);
    } finally {
      setZavuLoading(false);
    }
  };

  // Desconectar Zavu
  const handleDisconnectZavu = async () => {
    if (!confirm('¿Desconectar Zavu? Tu bot dejará de funcionar.')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/business/disconnect-zavu', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });

      if (response.ok) {
        setZavuConnected(false);
        setZavuMessage('');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  // Google Calendar OAuth
  const handleConnectCalendar = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/calendar/authorize', {
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        alert(`Error: ${data.error || 'No se pudo obtener la URL'} \nDetalles: ${data.details || 'Revisa las variables de entorno'}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al conectar con Google Calendar');
    }
  };

  // Desconectar Google Calendar
  const handleDisconnectCalendar = async () => {
    if (!confirm('¿Desconectar Google Calendar?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/calendar/disconnect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });

      if (response.ok) {
        setCalendarConnected(false);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!business) return null;

  const businessTypes = [
    { value: 'dentista', label: 'Dentista' },
    { value: 'barberia', label: 'Barbería' },
    { value: 'peluqueria', label: 'Peluquería' },
    { value: 'medico', label: 'Médico' },
    { value: 'veterinaria', label: 'Veterinaria' },
    { value: 'abogado', label: 'Abogado' },
    { value: 'fotografo', label: 'Fotógrafo' },
    { value: 'entrenador', label: 'Entrenador personal' },
    { value: 'salon_belleza', label: 'Salón de belleza' },
    { value: 'mecanica', label: 'Mecánica' },
    { value: 'otro', label: 'Otro' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav business={business} />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8 text-gray-900">Configuración</h1>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-gray-100 p-1 rounded-xl max-w-sm">
          <button
            onClick={() => setActiveTab('negocio')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'negocio'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Negocio
          </button>
          <button
            onClick={() => setActiveTab('integraciones')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'integraciones'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Integraciones
          </button>
        </div>

        {/* TAB: NEGOCIO */}
        {activeTab === 'negocio' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Datos básicos */}
            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold mb-5 text-gray-900">Datos del negocio</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nombre del negocio</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ej: Clínica Smile"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de negocio</label>
                  <select
                    value={form.business_type}
                    onChange={(e) => setForm({ ...form, business_type: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  >
                    <option value="">Selecciona...</option>
                    {businessTypes.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ubicación</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="Ej: Concepción"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Servicios (separados por coma)</label>
                  <textarea
                    value={form.services}
                    onChange={(e) => setForm({ ...form, services: e.target.value })}
                    placeholder="Ej: Limpiezas, Empastes, Extracciones"
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>
            </div>

            {/* Horarios */}
            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold mb-2 text-gray-900">Horarios</h2>
              <p className="text-sm text-gray-500 mb-5">Los horarios se sincronizan con tu Google Calendar</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Lunes a Viernes</label>
                  <input
                    type="text"
                    value={form.schedule_monday}
                    onChange={(e) => setForm({ ...form, schedule_monday: e.target.value })}
                    placeholder="9AM-6PM"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Sábado</label>
                  <input
                    type="text"
                    value={form.schedule_saturday}
                    onChange={(e) => setForm({ ...form, schedule_saturday: e.target.value })}
                    placeholder="9AM-1PM"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>
            </div>

            {/* Prompt */}
            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold mb-2 text-gray-900">Prompt del bot IA</h2>
              <p className="text-sm text-gray-500 mb-5">
                Personaliza cómo responde tu IA. Ejemplo: &quot;Soy asistente de Clínica Smile...&quot;
              </p>
              <textarea
                value={form.prompt_custom}
                onChange={(e) => setForm({ ...form, prompt_custom: e.target.value })}
                placeholder="Escribe aquí las instrucciones exactas para tu bot..."
                rows={6}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            {/* Save message */}
            {saveMessage && (
              <div className={`p-4 rounded-xl text-sm font-medium ${
                saveMessage.includes('✅')
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {saveMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </form>
        )}

        {/* TAB: INTEGRACIONES */}
        {activeTab === 'integraciones' && (
          <div className="space-y-6">
            {/* ZAVU */}
            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">📱 WhatsApp (Zavu)</h2>
                  <p className="text-sm text-gray-500 mt-1">Conecta tu cuenta de Zavu para activar el bot</p>
                </div>
                {zavuConnected ? (
                  <span className="bg-green-50 text-green-700 px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2 border border-green-200">
                    <CheckCircle className="w-4 h-4" /> Conectado
                  </span>
                ) : (
                  <span className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full text-sm font-semibold">
                    Desconectado
                  </span>
                )}
              </div>

              {zavuMessage && (
                <div className="bg-green-50 border border-green-200 p-4 rounded-xl mb-4">
                  <p className="text-green-800 text-sm">{zavuMessage}</p>
                </div>
              )}

              {zavuError && (
                <div className="bg-red-50 border border-red-200 p-4 rounded-xl mb-4">
                  <p className="text-red-800 text-sm">{zavuError}</p>
                </div>
              )}

              {!zavuConnected ? (
                <form onSubmit={handleZavuSubmit} className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Obtén tus credenciales en{' '}
                    <a href="https://zavu.dev" target="_blank" rel="noopener" className="text-blue-600 underline inline-flex items-center gap-1">
                      zavu.dev <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">API Key de Zavu</label>
                    <input
                      type="password"
                      value={zavuForm.zavu_api_key}
                      onChange={(e) => setZavuForm({ ...zavuForm, zavu_api_key: e.target.value })}
                      placeholder="zv_live_xxxxxxxxxxxxx"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Sender ID</label>
                    <input
                      type="text"
                      value={zavuForm.zavu_sender_id}
                      onChange={(e) => setZavuForm({ ...zavuForm, zavu_sender_id: e.target.value })}
                      placeholder="kd70679ybhn16t2h8cf720eg5n852jg6"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={zavuLoading || !zavuForm.zavu_api_key || !zavuForm.zavu_sender_id}
                    className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-40"
                  >
                    {zavuLoading ? 'Verificando...' : 'Conectar Zavu'}
                  </button>
                </form>
              ) : (
                <button
                  onClick={handleDisconnectZavu}
                  className="px-6 py-2.5 border border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition font-medium text-sm"
                >
                  Desconectar
                </button>
              )}
            </div>

            {/* GOOGLE CALENDAR */}
            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">📅 Google Calendar</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Conecta tu calendar para agendar citas automáticamente
                  </p>
                </div>
                {calendarConnected ? (
                  <span className="bg-green-50 text-green-700 px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2 border border-green-200">
                    <CheckCircle className="w-4 h-4" /> Conectado
                  </span>
                ) : (
                  <span className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full text-sm font-semibold">
                    Desconectado
                  </span>
                )}
              </div>

              {business.plan === 'ia_calendar' ? (
                !calendarConnected ? (
                  <button
                    onClick={handleConnectCalendar}
                    className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
                  >
                    Autorizar Google Calendar
                  </button>
                ) : (
                  <button
                    onClick={handleDisconnectCalendar}
                    className="px-6 py-2.5 border border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition font-medium text-sm"
                  >
                    Desconectar
                  </button>
                )
              ) : (
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
                  <p className="text-blue-800 text-sm">
                    💡 Google Calendar está disponible en el plan <strong>IA + Calendario</strong>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
