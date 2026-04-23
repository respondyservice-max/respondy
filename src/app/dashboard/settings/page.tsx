// app/dashboard/settings/page.tsx - SETTINGS MEJORADO (SEGURO)
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import DashboardNav from '@/components/DashboardNav';
import { useRouter } from 'next/navigation';
import { CheckCircle, Loader, ExternalLink } from 'lucide-react';
import LocationPicker from '@/components/LocationPicker';
import type { Business } from '@/types';

export default function Settings() {
  const router = useRouter();
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zavuConnected, setZavuConnected] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [aiBotEnabled, setAiBotEnabled] = useState(true);
  const [schedulingMode, setSchedulingMode] = useState<'auto' | 'link'>('auto');
  const [bookingLink, setBookingLink] = useState('');
  const [schedulingSaving, setSchedulingSaving] = useState(false);
  const [schedulingMessage, setSchedulingMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'negocio' | 'horarios' | 'integraciones'>('negocio');

  const [form, setForm] = useState({
    name: '',
    business_type: '',
    location: '',
    services: '',
    prompt_custom: '',
  });

  const [weeklySchedule, setWeeklySchedule] = useState<any>({
    lunes: { active: true, open: "09:00", close: "18:00" },
    martes: { active: true, open: "09:00", close: "18:00" },
    miercoles: { active: true, open: "09:00", close: "18:00" },
    jueves: { active: true, open: "09:00", close: "18:00" },
    viernes: { active: true, open: "09:00", close: "18:00" },
    sabado: { active: true, open: "09:00", close: "14:00" },
    domingo: { active: false, open: "09:00", close: "18:00" }
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
        });
        
        if (data.weekly_schedule) {
          setWeeklySchedule(data.weekly_schedule);
        }

        if (data.zavu_api_key_encrypted) {
          setZavuConnected(true);
        }
        setAiBotEnabled(data.ai_bot_enabled !== false);
        setSchedulingMode(data.scheduling_mode || 'auto');
        setBookingLink(data.booking_link || '');
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
          weekly_schedule: weeklySchedule,
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

  // Alternar Agente IA
  const handleToggleAiBot = async () => {
    const newValue = !aiBotEnabled;
    setAiBotEnabled(newValue);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('businesses')
        .update({ ai_bot_enabled: newValue })
        .eq('user_id', user.id);

      if (error) {
        console.error('Error al actualizar Agente IA:', error);
        setAiBotEnabled(!newValue); // Revertir si falló
        alert('Error al actualizar el estado del agente');
      }
    } catch (error) {
      console.error('Error:', error);
      setAiBotEnabled(!newValue);
    }
  };

  // Guardar modo de agendamiento
  const handleSaveSchedulingMode = async () => {
    setSchedulingSaving(true);
    setSchedulingMessage('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from('businesses')
        .update({ scheduling_mode: schedulingMode, booking_link: bookingLink })
        .eq('user_id', user.id);
      if (!error) {
        setSchedulingMessage('✅ Modo guardado correctamente');
        setTimeout(() => setSchedulingMessage(''), 3000);
      } else {
        setSchedulingMessage('❌ Error al guardar');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSchedulingSaving(false);
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
        <div className="flex gap-1 mb-8 bg-gray-100 p-1 rounded-xl max-w-md">
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
            onClick={() => setActiveTab('horarios')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'horarios'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Horarios
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
                  <LocationPicker 
                    defaultValue={form.location} 
                    onLocationSelect={(address) => setForm({ ...form, location: address })} 
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

            {/* Prompt */}
            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold mb-2 text-gray-900">Prompt del agente IA</h2>
              <p className="text-sm text-gray-500 mb-5">
                Personaliza cómo responde tu IA. Ejemplo: &quot;Soy asistente de Clínica Smile...&quot;
              </p>
              <textarea
                value={form.prompt_custom}
                onChange={(e) => setForm({ ...form, prompt_custom: e.target.value })}
                placeholder="Escribe aquí las instrucciones exactas para tu agente..."
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

        {/* TAB: HORARIOS */}
        {activeTab === 'horarios' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold mb-2 text-gray-900">Horario de Apertura Base</h2>
              <p className="text-sm text-gray-500 mb-6">
                Este horario actuará como base semanal de la IA. Si necesitas cerrar un día específico de manera excepcional (ej. vacaciones, feriados), simplemente crea un evento de "Todo el día" en tu Google Calendar y la IA asumirá que estás cerrado.
              </p>
              
              <div className="space-y-4">
                {Object.keys(weeklySchedule).map((day) => (
                  <div key={day} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-4 w-1/3">
                      <input
                        type="checkbox"
                        checked={weeklySchedule[day].active}
                        onChange={(e) => {
                          setWeeklySchedule({
                            ...weeklySchedule,
                            [day]: { ...weeklySchedule[day], active: e.target.checked }
                          });
                        }}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="font-medium capitalize text-gray-700">{day}</span>
                    </div>
                    
                    <div className="flex gap-4 items-center">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">Apertura</label>
                        <input
                          type="time"
                          value={weeklySchedule[day].open}
                          disabled={!weeklySchedule[day].active}
                          onChange={(e) => {
                            setWeeklySchedule({
                              ...weeklySchedule,
                              [day]: { ...weeklySchedule[day], open: e.target.value }
                            });
                          }}
                          className={`px-3 py-2 border border-gray-300 rounded-md text-sm ${!weeklySchedule[day].active ? 'opacity-50 bg-gray-100' : ''}`}
                        />
                      </div>
                      <span className="text-gray-400">-</span>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">Cierre</label>
                        <input
                          type="time"
                          value={weeklySchedule[day].close}
                          disabled={!weeklySchedule[day].active}
                          onChange={(e) => {
                            setWeeklySchedule({
                              ...weeklySchedule,
                              [day]: { ...weeklySchedule[day], close: e.target.value }
                            });
                          }}
                          className={`px-3 py-2 border border-gray-300 rounded-md text-sm ${!weeklySchedule[day].active ? 'opacity-50 bg-gray-100' : ''}`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
              {saving ? 'Guardando...' : 'Guardar Horarios'}
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
                  <p className="text-sm text-gray-500 mt-1">Conecta tu cuenta de Zavu para activar el agente</p>
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
                <div className="space-y-6 pt-4">
                  <button
                    onClick={handleDisconnectZavu}
                    className="px-6 py-2.5 border border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition font-medium text-sm"
                  >
                    Desconectar WhatsApp
                  </button>
                </div>
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

            {/* MODO DE AGENDAMIENTO */}
            {calendarConnected && (
              <div className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-gray-100">
                <h2 className="text-lg font-bold text-gray-900 mb-1">🤖 Modo de agendamiento</h2>
                <p className="text-sm text-gray-500 mb-6">
                  Elige cómo quieres que tu IA gestione las citas.
                </p>

                {/* Switch visual */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <button
                    type="button"
                    onClick={() => setSchedulingMode('auto')}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      schedulingMode === 'auto'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-2xl mb-2">⚡</div>
                    <div className="font-semibold text-gray-900 text-sm">Automático</div>
                    <div className="text-xs text-gray-500 mt-1">
                      La IA pregunta la fecha y hora y agenda directamente
                    </div>
                    {schedulingMode === 'auto' && (
                      <div className="mt-2 text-xs font-semibold text-blue-600">● Activo</div>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSchedulingMode('link')}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      schedulingMode === 'link'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-2xl mb-2">🔗</div>
                    <div className="font-semibold text-gray-900 text-sm">Enlace</div>
                    <div className="text-xs text-gray-500 mt-1">
                      La IA comparte el link de tu página de reservas
                    </div>
                    {schedulingMode === 'link' && (
                      <div className="mt-2 text-xs font-semibold text-blue-600">● Activo</div>
                    )}
                  </button>
                </div>

                {schedulingMode === 'link' && (
                  <div className="mb-5">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Link de tu página de reservas de Google Calendar
                    </label>
                    <input
                      type="url"
                      value={bookingLink}
                      onChange={(e) => setBookingLink(e.target.value)}
                      placeholder="https://calendar.google.com/calendar/appointments/..."
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-2">
                      Encuéntralo en Google Calendar → Páginas de reservas → copiar enlace 🔗
                    </p>
                  </div>
                )}

                {schedulingMessage && (
                  <div className={`p-3 rounded-xl text-sm font-medium mb-4 ${
                    schedulingMessage.includes('✅')
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}>
                    {schedulingMessage}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSaveSchedulingMode}
                  disabled={schedulingSaving || (schedulingMode === 'link' && !bookingLink)}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-40 text-sm"
                >
                  {schedulingSaving ? 'Guardando...' : 'Guardar modo'}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
