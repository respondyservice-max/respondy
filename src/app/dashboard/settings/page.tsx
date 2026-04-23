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
  const [appointmentDuration, setAppointmentDuration] = useState(45);
  const [minLeadTime, setMinLeadTime] = useState(2);
  const [serviceName, setServiceName] = useState('Consulta');
  const [serviceDescription, setServiceDescription] = useState('');
  const [activeTab, setActiveTab] = useState<'agente' | 'integraciones'>('agente');
  const [agentName, setAgentName] = useState('Sofía');
  const [agentPersonality, setAgentPersonality] = useState('amable');
  const [promptMode, setPromptMode] = useState<'conversacional' | 'agendador'>('agendador');

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
        
        const config = data.weekly_schedule?._config || {};
        setAppointmentDuration(config.appointment_duration || data.appointment_duration || 45);
        setMinLeadTime(config.min_lead_time_hours || data.min_lead_time_hours || 2);
        setServiceName(config.service_name || data.service_name || 'Consulta');
        setServiceDescription(config.service_description || data.service_description || '');
        
        setAgentName(config.agent_name || 'Sofía');
        setAgentPersonality(config.agent_personality || 'amable');
        setPromptMode(config.prompt_mode || 'agendador');

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

  // Generador de Prompt Dinámico
  const handleGeneratePrompt = () => {
    let personalityPrompt = "";
    switch(agentPersonality) {
      case 'formal': personalityPrompt = "Usa un lenguaje formal, educado y profesional. Evita modismos."; break;
      case 'divertido': personalityPrompt = "Sé divertido, cercano y usa muchos emojis relevantes. Mantén la energía alta. 😃✨🚀"; break;
      default: personalityPrompt = "Sé amable, cordial y servicial. Usa un tono equilibrado.";
    }

    const servicesList = form.services ? `Los servicios que ofrecemos son: ${form.services}.` : "";
    
    let basePrompt = "";
    if (promptMode === 'conversacional') {
      basePrompt = `Eres ${agentName}, el asistente virtual de ${form.name}. ${personalityPrompt} ${servicesList} 
Tu objetivo es primero saludar, responder dudas sobre nuestros servicios y ubicación, y solo después de un par de interacciones amigables, invitar al usuario a agendar una cita.`;
    } else {
      basePrompt = `Eres ${agentName}, el asistente virtual de ${form.name}. ${personalityPrompt} ${servicesList} 
Tu objetivo principal es agendar citas de forma eficiente. Siempre mantén el foco en obtener el nombre, fecha y hora del paciente.`;
    }

    setForm({ ...form, prompt_custom: basePrompt.trim() });
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const updatedSchedule = {
        ...weeklySchedule,
        _config: {
          ...weeklySchedule?._config,
          appointment_duration: appointmentDuration,
          min_lead_time_hours: minLeadTime,
          service_name: serviceName,
          service_description: serviceDescription,
          agent_name: agentName,
          agent_personality: agentPersonality,
          prompt_mode: promptMode
        }
      };

      const { error } = await supabase
        .from('businesses')
        .update({ 
          name: form.name,
          business_type: form.business_type,
          location: form.location,
          services: form.services.split(',').map(s => s.trim()).filter(Boolean),
          prompt_custom: form.prompt_custom,
          scheduling_mode: schedulingMode, 
          booking_link: bookingLink,
          weekly_schedule: updatedSchedule
        })
        .eq('user_id', user.id);

      if (!error) {
        setSaveMessage('✅ Configuración guardada');
        setTimeout(() => setSaveMessage(''), 3000);
      } else {
        setSaveMessage('❌ Error al guardar');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleZavuSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setZavuLoading(true);
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
      if (response.ok) {
        setZavuConnected(true);
        setSaveMessage('✅ WhatsApp conectado');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setZavuLoading(false);
    }
  };

  const handleDisconnectZavu = async () => {
    if (!confirm('¿Desconectar WhatsApp?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/business/disconnect-zavu', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
      });
      setZavuConnected(false);
    } catch (error) { console.error(error); }
  };

  const handleConnectCalendar = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/calendar/authorize', {
        headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
      });
      const data = await response.json();
      if (data.authUrl) window.location.href = data.authUrl;
    } catch (error) { console.error(error); }
  };

  const handleDisconnectCalendar = async () => {
    if (!confirm('¿Desconectar Calendar?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/calendar/disconnect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
      });
      setCalendarConnected(false);
    } catch (error) { console.error(error); }
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader className="w-8 h-8 animate-spin text-blue-600" /></div>;
  if (!business) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav business={business} />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8 text-gray-900">Configuración</h1>
        
        <div className="flex gap-1 mb-8 bg-gray-100 p-1 rounded-xl max-w-sm">
          <button onClick={() => setActiveTab('agente')} className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'agente' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Agente IA y Agendamiento</button>
          <button onClick={() => setActiveTab('integraciones')} className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'integraciones' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Integraciones</button>
        </div>

        {activeTab === 'agente' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-6">🤖 Perfil del Agente IA</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nombre de la IA</label>
                  <input type="text" value={agentName} onChange={(e) => setAgentName(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Personalidad</label>
                  <select value={agentPersonality} onChange={(e) => setAgentPersonality(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50">
                    <option value="amable">Amable</option>
                    <option value="formal">Formal</option>
                    <option value="divertido">Divertido 😃</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Servicios ofrecidos (separados por coma)</label>
                  <textarea value={form.services} onChange={(e) => setForm({ ...form, services: e.target.value })} rows={2} className="w-full px-4 py-3 border border-gray-200 rounded-xl" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-bold text-gray-900">📅 Modo de Agendamiento</h2>
                {bookingLink && <a href={bookingLink.replace('/appointments/', '/r/')} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-semibold text-blue-600"><ExternalLink className="w-4 h-4" /> Editar en Google</a>}
              </div>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button type="button" onClick={() => setSchedulingMode('link')} className={`p-4 rounded-xl border-2 text-left transition-all ${schedulingMode === 'link' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
                  <div className="text-2xl mb-2">🔗</div>
                  <div className="font-semibold text-gray-900 text-sm">Por Enlace</div>
                </button>
                <button type="button" onClick={() => setSchedulingMode('auto')} className={`p-4 rounded-xl border-2 text-left transition-all ${schedulingMode === 'auto' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
                  <div className="text-2xl mb-2">⚡</div>
                  <div className="font-semibold text-gray-900 text-sm">Automático</div>
                </button>
              </div>
              {schedulingMode === 'auto' && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-4 text-xs text-amber-800">
                  <strong>Disclaimer:</strong> La IA tiene un 95% de precisión. Recomendamos revisar periódicamente tu calendario.
                </div>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Link de Reserva (Google)</label>
                <input type="url" value={bookingLink} onChange={(e) => setBookingLink(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm" />
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-bold text-gray-900">📝 Instrucciones del Agente</h2>
                <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
                  <button onClick={() => setPromptMode('conversacional')} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${promptMode === 'conversacional' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Conversacional</button>
                  <button onClick={() => setPromptMode('agendador')} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${promptMode === 'agendador' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Agendador</button>
                </div>
              </div>
              <button onClick={handleGeneratePrompt} className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold mb-4 hover:bg-black transition">✨ Generar Instrucciones Automáticamente</button>
              <textarea value={form.prompt_custom} onChange={(e) => setForm({ ...form, prompt_custom: e.target.value })} rows={6} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono bg-gray-50" />
            </div>

            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-6">📅 Horarios de Atención</h2>
              <div className="space-y-2">
                {Object.keys(weeklySchedule).map((day) => day !== '_config' && (
                  <div key={day} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 text-sm">
                    <div className="flex items-center gap-3 w-1/3">
                      <input type="checkbox" checked={weeklySchedule[day].active} onChange={(e) => setWeeklySchedule({...weeklySchedule, [day]: {...weeklySchedule[day], active: e.target.checked}})} className="w-4 h-4 text-blue-600 rounded" />
                      <span className="font-semibold capitalize">{day}</span>
                    </div>
                    <div className="flex gap-2 items-center">
                      <input type="time" value={weeklySchedule[day].open} disabled={!weeklySchedule[day].active} onChange={(e) => setWeeklySchedule({...weeklySchedule, [day]: {...weeklySchedule[day], open: e.target.value}})} className="px-2 py-1 border border-gray-200 rounded text-xs" />
                      <span className="text-gray-400">-</span>
                      <input type="time" value={weeklySchedule[day].close} disabled={!weeklySchedule[day].active} onChange={(e) => setWeeklySchedule({...weeklySchedule, [day]: {...weeklySchedule[day], close: e.target.value}})} className="px-2 py-1 border border-gray-200 rounded text-xs" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4">
              {saveMessage && <div className={`p-4 rounded-xl text-sm font-medium mb-4 ${saveMessage.includes('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{saveMessage}</div>}
              <button onClick={handleSaveAll} disabled={saving} className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-lg disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar Configuración'}</button>
            </div>
          </div>
        )}

        {activeTab === 'integraciones' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-4">📱 WhatsApp (Zavu)</h2>
              {zavuConnected ? <button onClick={handleDisconnectZavu} className="text-red-600 font-medium">Desconectar WhatsApp</button> : (
                <form onSubmit={handleZavuSubmit} className="space-y-4">
                  <input type="password" value={zavuForm.zavu_api_key} onChange={(e) => setZavuForm({...zavuForm, zavu_api_key: e.target.value})} placeholder="API Key" className="w-full px-4 py-3 border border-gray-200 rounded-xl" />
                  <input type="text" value={zavuForm.zavu_sender_id} onChange={(e) => setZavuForm({...zavuForm, zavu_sender_id: e.target.value})} placeholder="Sender ID" className="w-full px-4 py-3 border border-gray-200 rounded-xl" />
                  <button type="submit" disabled={zavuLoading} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold">Conectar WhatsApp</button>
                </form>
              )}
            </div>
            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-4">📅 Google Calendar</h2>
              {calendarConnected ? <button onClick={handleDisconnectCalendar} className="text-red-600 font-medium">Desconectar Calendar</button> : (
                <button onClick={handleConnectCalendar} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold">Conectar Google Calendar</button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
