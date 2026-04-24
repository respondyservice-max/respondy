// app/dashboard/settings/page.tsx - SETTINGS RESTAURADO Y FUNCIONAL
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import DashboardNav from '@/components/DashboardNav';
import { useRouter } from 'next/navigation';
import { CheckCircle, Loader, ExternalLink, HelpCircle, Info, Plus, Trash2, Video, VideoOff, Save, ShieldAlert, Key } from 'lucide-react';
import type { Business } from '@/types';

interface ServiceItem {
  id: string;
  name: string;
  isVideo: boolean;
}

export default function Settings() {
  const router = useRouter();
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zavuConnected, setZavuConnected] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [schedulingMode, setSchedulingMode] = useState<'auto' | 'link'>('link');
  const [bookingLink, setBookingLink] = useState('');
  const [activeTab, setActiveTab] = useState<'agente' | 'integraciones'>('agente');
  const [agentName, setAgentName] = useState('Sofía');
  const [agentPersonality, setAgentPersonality] = useState('amable');
  const [promptMode, setPromptMode] = useState<'agendador' | 'conversacional'>('agendador');
  const [servicesList, setServicesList] = useState<ServiceItem[]>([]);
  const [blockedNumbers, setBlockedNumbers] = useState<string[]>([]);
  const [newBlockedNumber, setNewBlockedNumber] = useState('');

  // Zavu Credentials
  const [zavuApiKey, setZavuApiKey] = useState('');
  const [zavuSenderId, setZavuSenderId] = useState('');

  const [form, setForm] = useState({
    name: '',
    business_type: '',
    location: '',
    prompt_custom: '',
  });

  useEffect(() => {
    const fetchBusiness = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/auth/login'); return; }

        const { data, error } = await supabase.from('businesses').select('*').eq('user_id', user.id).single();
        if (error || !data) { router.push('/dashboard'); return; }

        setBusiness(data);
        setForm({
          name: data.name || '',
          business_type: data.business_type || '',
          location: data.location || '',
          prompt_custom: data.prompt_custom || '',
        });
        
        setZavuConnected(!!data.zavu_api_key_encrypted);
        setSchedulingMode(data.scheduling_mode || 'link');
        setBookingLink(data.booking_link || '');
        setCalendarConnected(!!data.google_calendar_id || !!data.google_calendar_access_token_encrypted);

        const config = data.weekly_schedule?._config || {};
        setAgentName(config.agent_name || 'Sofía');
        setAgentPersonality(config.agent_personality || 'amable');
        setPromptMode(config.prompt_mode || 'agendador');
        setBlockedNumbers(config.blocked_numbers || []);
        setServicesList(config.services_list || []);

      } catch (error) { console.error(error); }
      finally { setLoading(false); }
    };
    fetchBusiness();
  }, [router]);

  const handleSaveZavu = async () => {
    if (!zavuApiKey || !zavuSenderId) { alert('Ambos campos son requeridos'); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/business/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ zavu_api_key: zavuApiKey, zavu_sender_id: zavuSenderId })
      });
      if (res.ok) {
        setZavuConnected(true);
        setZavuApiKey('');
        setZavuSenderId('');
        alert('✅ Conectado a WhatsApp correctamente');
      } else {
        const err = await res.json();
        alert('❌ Error: ' + err.error);
      }
    } catch (e) { alert('Error técnico al conectar'); }
    finally { setSaving(false); }
  };

  const handleDisconnectZavu = async () => {
    if (!confirm('¿Seguro que quieres desconectar WhatsApp? El bot dejará de funcionar.')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/business/disconnect-zavu', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      setZavuConnected(false);
      alert('WhatsApp desconectado');
    } catch (e) { console.error(e); }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const updatedSchedule = { 
        ...(business?.weekly_schedule || {}), 
        _config: { 
          ...(business?.weekly_schedule?._config || {}),
          agent_name: agentName,
          agent_personality: agentPersonality,
          prompt_mode: promptMode,
          services_list: servicesList,
          blocked_numbers: blockedNumbers
        } 
      };

      await supabase.from('businesses').update({ 
        name: form.name,
        services: servicesList.map(s => s.name).filter(Boolean),
        prompt_custom: form.prompt_custom,
        scheduling_mode: schedulingMode,
        booking_link: bookingLink,
        weekly_schedule: updatedSchedule
      }).eq('user_id', user?.id);
      
      alert('✅ Configuración guardada correctamente');
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  if (!business) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav business={business} />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">⚙️ Configuración</h1>
          <p className="text-gray-500 mt-1">Personaliza tu agente IA e integra tus servicios</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-gray-200 rounded-2xl mb-8 w-fit">
          <button onClick={() => setActiveTab('agente')} className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'agente' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>🤖 Agente IA</button>
          <button onClick={() => setActiveTab('integraciones')} className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'integraciones' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>🔌 Integraciones</button>
        </div>

        {activeTab === 'agente' && (
          <div className="space-y-6">
            {/* Personalidad del Agente */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><CheckCircle className="w-6 h-6 text-blue-600" /> Identidad de {agentName}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Nombre del Agente</label>
                  <input type="text" value={agentName} onChange={e => setAgentName(e.target.value)} className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Personalidad</label>
                  <select value={agentPersonality} onChange={e => setAgentPersonality(e.target.value)} className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="amable">😊 Amable y servicial</option>
                    <option value="profesional">💼 Profesional y directo</option>
                    <option value="divertido">✨ Divertido y con emojis</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Servicios Estructurados */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2"><Plus className="w-6 h-6 text-blue-600" /> Servicios y Precios</h2>
                <button onClick={() => setServicesList([...servicesList, { id: Math.random().toString(36).substring(7), name: '', isVideo: false }])} className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-sm font-bold hover:bg-blue-100 transition flex items-center gap-2"><Plus className="w-4 h-4" /> Agregar</button>
              </div>
              <div className="space-y-3">
                {servicesList.map((service, idx) => (
                  <div key={service.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 group">
                    <input type="text" value={service.name} onChange={e => {
                      const newList = [...servicesList];
                      newList[idx].name = e.target.value;
                      setServicesList(newList);
                    }} placeholder="Nombre del servicio (ej: Limpieza Dental)" className="flex-1 bg-transparent border-none outline-none text-sm font-medium" />
                    <button onClick={() => {
                      const newList = [...servicesList];
                      newList[idx].isVideo = !newList[idx].isVideo;
                      setServicesList(newList);
                    }} className={`p-2 rounded-lg transition ${service.isVideo ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-400'}`} title={service.isVideo ? 'Es videollamada' : 'Es presencial'}>
                      {service.isVideo ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setServicesList(servicesList.filter(s => s.id !== service.id))} className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleSaveAll} disabled={saving} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2">{saving ? <Loader className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Guardar Configuración</button>
          </div>
        )}

        {activeTab === 'integraciones' && (
          <div className="space-y-6">
            {/* WhatsApp Zavu Section */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2"><ExternalLink className="w-6 h-6 text-blue-600" /> WhatsApp (Zavu)</h2>
                  <p className="text-sm text-gray-500 mt-1">Conecta tu número de WhatsApp para que el bot responda automáticamente.</p>
                </div>
                {zavuConnected ? (
                  <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">Conectado</span>
                ) : (
                  <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-bold">Sin conexión</span>
                )}
              </div>

              {!zavuConnected ? (
                <div className="space-y-4 bg-gray-50 p-6 rounded-2xl border border-dashed border-gray-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2 ml-1">Zavu API Key</label>
                      <div className="relative">
                        <Key className="w-4 h-4 absolute left-3 top-3.5 text-gray-400" />
                        <input type="password" value={zavuApiKey} onChange={e => setZavuApiKey(e.target.value)} placeholder="Tu clave secreta..." className="w-full pl-10 pr-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2 ml-1">Sender ID</label>
                      <input type="text" value={zavuSenderId} onChange={e => setZavuSenderId(e.target.value)} placeholder="ID de tu número..." className="w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <button onClick={handleSaveZavu} disabled={saving} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2">{saving ? <Loader className="w-4 h-4 animate-spin" /> : 'Conectar WhatsApp'}</button>
                </div>
              ) : (
                <div className="flex justify-between items-center bg-green-50 p-4 rounded-xl border border-green-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600"><CheckCircle className="w-6 h-6" /></div>
                    <div>
                      <p className="font-bold text-green-900 text-sm">Agente vinculado correctamente</p>
                      <p className="text-green-700 text-xs">Tus mensajes están siendo procesados por la IA.</p>
                    </div>
                  </div>
                  <button onClick={handleDisconnectZavu} className="text-xs font-bold text-red-400 hover:text-red-600 underline">Desconectar</button>
                </div>
              )}
            </div>

            {/* Google Calendar Section */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">📅 Google Calendar</h2>
                  <p className="text-sm text-gray-500 mt-1">Sincroniza la disponibilidad y guarda citas automáticamente.</p>
                </div>
                {calendarConnected ? (
                  <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">Conectado</span>
                ) : (
                  <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-bold">Sin conexión</span>
                )}
              </div>
              <button onClick={() => window.location.href = '/api/calendar/authorize'} className={`w-full py-4 rounded-2xl font-bold transition flex items-center justify-center gap-2 ${calendarConnected ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-blue-500 hover:text-blue-600'}`}>
                {calendarConnected ? '⚙️ Re-sincronizar Calendario' : '🔗 Conectar Google Calendar'}
              </button>
            </div>

            {/* Blacklist Section */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-red-50">
              <h2 className="text-xl font-bold text-red-900 mb-6 flex items-center gap-2"><ShieldAlert className="w-6 h-6 text-red-600" /> Números Bloqueados (Blacklist)</h2>
              <p className="text-sm text-red-700 mb-4 bg-red-50 p-4 rounded-xl">Los números en esta lista serán ignorados por el bot. Útil para familiares, conocidos o spam.</p>
              <div className="flex gap-2 mb-4">
                <input type="text" value={newBlockedNumber} onChange={e => setNewBlockedNumber(e.target.value)} placeholder="Ej: 56912345678" className="flex-1 px-4 py-3 border border-red-100 rounded-xl outline-none focus:ring-2 focus:ring-red-500" />
                <button onClick={() => { if(!newBlockedNumber) return; setBlockedNumbers([...blockedNumbers, newBlockedNumber.replace('+', '')]); setNewBlockedNumber(''); }} className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition">Bloquear</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {blockedNumbers.map(num => (
                  <div key={num} className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-700 rounded-full text-sm font-bold border border-red-100">
                    {num} <button onClick={() => setBlockedNumbers(blockedNumbers.filter(n => n !== num))} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleSaveAll} disabled={saving} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2">{saving ? <Loader className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Guardar Todo</button>
          </div>
        )}
      </main>
    </div>
  );
}
