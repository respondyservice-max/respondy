// app/dashboard/settings/page.tsx - SETTINGS PROFESIONAL RESTAURADO
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import DashboardNav from '@/components/DashboardNav';
import { useRouter } from 'next/navigation';
import { CheckCircle, Loader, Info, Plus, Trash2, Video, VideoOff, Save, ShieldAlert, Key, MessageSquare, Sparkles } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'agente' | 'integraciones'>('agente');
  
  // Agent State
  const [agentName, setAgentName] = useState('Sofía');
  const [agentPersonality, setAgentPersonality] = useState('amable');
  const [promptMode, setPromptMode] = useState<'agendador' | 'conversacional'>('agendador');
  const [servicesList, setServicesList] = useState<ServiceItem[]>([]);
  const [blockedNumbers, setBlockedNumbers] = useState<string[]>([]);
  const [newBlockedNumber, setNewBlockedNumber] = useState('');

  // Zavu Credentials
  const [zavuApiKey, setZavuApiKey] = useState('');
  const [zavuSenderId, setZavuSenderId] = useState('');

  // Horarios
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [daySchedules, setDaySchedules] = useState<Record<string, {start: string, end: string}>>({});
  const [dayStart, setDayStart] = useState('09:00');
  const [dayEnd, setDayEnd] = useState('18:00');

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
        setCalendarConnected(!!data.google_calendar_id || !!data.google_calendar_access_token_encrypted);

        const config = data.weekly_schedule?._config || {};
        setAgentName(config.agent_name || 'Sofía');
        setAgentPersonality(config.agent_personality || 'amable');
        setPromptMode(config.prompt_mode || 'agendador');
        setBlockedNumbers(config.blocked_numbers || []);
        setServicesList(config.services_list || []);
        setWorkingDays(config.working_days || [1, 2, 3, 4, 5]);
        setDaySchedules(config.day_schedules || {});
        setDayStart(config.day_start || '09:00');
        setDayEnd(config.day_end || '18:00');

      } catch (error) { console.error(error); }
      finally { setLoading(false); }
    };
    fetchBusiness();
  }, [router]);

  const handleGeneratePrompt = () => {
    const servicesStr = servicesList.map(s => s.name).filter(Boolean).join(', ');
    const onlineServices = servicesList.filter(s => s.isVideo).map(s => s.name);
    
    const personalityMap = {
      amable: 'Sé siempre muy amable, servicial y utiliza un lenguaje cálido.',
      profesional: 'Mantén un tono serio, profesional, experto y muy eficiente.',
      divertido: 'Sé muy divertido, usa muchos emojis ✨😃 y un lenguaje cercano y alegre.'
    };

    const richPrompt = `
# PERSONALIDAD Y ROL
Eres ${agentName}, la asistente experta de "${form.name}". ${personalityMap[agentPersonality as keyof typeof personalityMap]}

# OBJETIVO
Tu misión es ayudar a los pacientes a resolver dudas y agendar sus citas de manera fluida y profesional.

# SERVICIOS OFRECIDOS
Ofrecemos: ${servicesStr}.
${onlineServices.length > 0 ? `⚠️ NOTA ESPECIAL: Contamos con servicios de videollamada (test online/evaluación virtual) para: ${onlineServices.join(', ')}. Siempre ofrece esta opción si el paciente busca comodidad.` : ''}

# REGLAS DE ORO (ESTRICTAS)
1. **Validación de Datos**: NUNCA confirmes una cita sin tener estos 4 datos: Nombre completo, Email, Fecha y Hora.
2. **Correo Obligatorio**: Si ya tienes nombre, fecha y hora, pide educadamente el Email para enviar la confirmación y el link de Meet.
3. **Brevedad**: En WhatsApp la gente no lee párrafos largos. Sé breve, usa viñetas si es necesario.
4. **Disponibilidad**: Consulta siempre la lista de horarios que te proporcionaré y ofrece opciones claras si el cupo solicitado está ocupado.
5. **Estilo**: ${promptMode === 'conversacional' ? 'Charla un poco antes de ir directo al agendamiento para generar confianza.' : 'Sé muy directo y guía al paciente al agendamiento lo más rápido posible.'}

# CIERRE
Al finalizar, indica que recibirá un ticket de confirmación por este medio.
`.trim();

    setForm({ ...form, prompt_custom: richPrompt });
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
          blocked_numbers: blockedNumbers,
          working_days: workingDays,
          day_schedules: daySchedules,
          day_start: dayStart,
          day_end: dayEnd
        } 
      };

      await supabase.from('businesses').update({ 
        name: form.name,
        services: servicesList.map(s => s.name).filter(Boolean),
        prompt_custom: form.prompt_custom,
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
          <p className="text-gray-500 mt-1">Define tus servicios y personaliza tu agente IA</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-gray-200 rounded-2xl mb-8 w-fit">
          <button onClick={() => setActiveTab('agente')} className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'agente' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>🤖 Agente IA</button>
          <button onClick={() => setActiveTab('integraciones')} className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'integraciones' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>🔌 Integraciones</button>
        </div>

        {activeTab === 'agente' && (
          <div className="space-y-6">
            
            {/* 1. SERVICIOS (AHORA PRIMERO) */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2"><Plus className="w-6 h-6 text-blue-600" /> 1. Servicios y Precios</h2>
                  <p className="text-xs text-gray-500 mt-1">Define qué ofreces y si es por videollamada 🎥</p>
                </div>
                <button onClick={() => setServicesList([...servicesList, { id: Math.random().toString(36).substring(7), name: '', isVideo: false }])} className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-sm font-bold hover:bg-blue-100 transition flex items-center gap-2"><Plus className="w-4 h-4" /> Agregar</button>
              </div>
              <div className="space-y-3">
                {servicesList.map((service, idx) => (
                  <div key={service.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 group">
                    <input type="text" value={service.name} onChange={e => {
                      const newList = [...servicesList];
                      newList[idx].name = e.target.value;
                      setServicesList(newList);
                    }} placeholder="Ej: Evaluación Dental" className="flex-1 bg-transparent border-none outline-none text-sm font-medium" />
                    <button onClick={() => {
                      const newList = [...servicesList];
                      newList[idx].isVideo = !newList[idx].isVideo;
                      setServicesList(newList);
                    }} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition ${service.isVideo ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-gray-200 text-gray-400'}`}>
                      {service.isVideo ? <><Video className="w-3.5 h-3.5" /> Videollamada</> : <><VideoOff className="w-3.5 h-3.5" /> Presencial</>}
                    </button>
                    <button onClick={() => setServicesList(servicesList.filter(s => s.id !== service.id))} className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. IDENTIDAD */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Sparkles className="w-6 h-6 text-blue-600" /> 2. Personalidad de {agentName}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Nombre de la IA</label>
                  <input type="text" value={agentName} onChange={e => setAgentName(e.target.value)} className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Tono de voz</label>
                  <select value={agentPersonality} onChange={e => setAgentPersonality(e.target.value)} className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="amable">😊 Amable y servicial</option>
                    <option value="profesional">💼 Profesional y directo</option>
                    <option value="divertido">✨ Divertido y con emojis</option>
                  </select>
                </div>
              </div>
              
              <div className="space-y-4">
                <label className="block text-sm font-bold text-gray-700">Modo de Conversación</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button onClick={() => setPromptMode('agendador')} className={`p-4 rounded-xl border-2 text-left transition-all ${promptMode === 'agendador' ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}>
                    <p className="font-bold text-gray-900 text-sm">🎯 Enfocado a Citas</p>
                    <p className="text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-wider">Eficiencia máxima</p>
                  </button>
                  <button onClick={() => setPromptMode('conversacional')} className={`p-4 rounded-xl border-2 text-left transition-all ${promptMode === 'conversacional' ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}>
                    <p className="font-bold text-gray-900 text-sm">💬 Charla Amigable</p>
                    <p className="text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-wider">Generar confianza</p>
                  </button>
                </div>
              </div>
            </div>

            {/* 3. HORARIOS DE ATENCIÓN */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">⏰ 3. Horarios de Atención</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Apertura General</label>
                  <input type="time" value={dayStart} onChange={e => setDayStart(e.target.value)} className="w-full px-4 py-3 border rounded-xl outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Cierre General</label>
                  <input type="time" value={dayEnd} onChange={e => setDayEnd(e.target.value)} className="w-full px-4 py-3 border rounded-xl outline-none" />
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-700 mb-3">Días Laborables</label>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5, 6, 0].map(day => {
                    const daysStr = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                    const isActive = workingDays.includes(day);
                    return (
                      <button key={day} onClick={() => {
                        if (isActive) setWorkingDays(workingDays.filter(d => d !== day));
                        else setWorkingDays([...workingDays, day].sort());
                      }} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${isActive ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                        {daysStr[day]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3">Horarios Especiales (Opcional)</label>
                <div className="space-y-3">
                  {workingDays.map(day => {
                    const daysStr = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                    const hasSpecial = !!daySchedules[day];
                    return (
                      <div key={day} className="flex flex-col md:flex-row md:items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-3 w-40">
                          <input type="checkbox" checked={hasSpecial} onChange={e => {
                            const newScheds = { ...daySchedules };
                            if (e.target.checked) newScheds[day] = { start: dayStart, end: dayEnd };
                            else delete newScheds[day];
                            setDaySchedules(newScheds);
                          }} className="w-4 h-4 text-blue-600 rounded border-gray-300" />
                          <span className="text-sm font-bold text-gray-700">{daysStr[day]}</span>
                        </div>
                        {hasSpecial && (
                          <div className="flex gap-2 items-center flex-1">
                            <input type="time" value={daySchedules[day].start} onChange={e => setDaySchedules({ ...daySchedules, [day]: { ...daySchedules[day], start: e.target.value }})} className="px-3 py-1.5 text-sm border rounded-lg outline-none" />
                            <span className="text-gray-400">a</span>
                            <input type="time" value={daySchedules[day].end} onChange={e => setDaySchedules({ ...daySchedules, [day]: { ...daySchedules[day], end: e.target.value }})} className="px-3 py-1.5 text-sm border rounded-lg outline-none" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 4. PROMPT (AHORA DESPUÉS DE HORARIOS) */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2"><MessageSquare className="w-6 h-6 text-blue-600" /> 4. Instrucciones de la IA (Prompt)</h2>
                <button onClick={handleGeneratePrompt} className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-bold hover:shadow-lg transition-all flex items-center gap-2">✨ Regenerar con servicios actuales</button>
              </div>
              <textarea 
                value={form.prompt_custom} 
                onChange={e => setForm({ ...form, prompt_custom: e.target.value })}
                rows={12}
                className="w-full px-4 py-4 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono bg-slate-50 leading-relaxed"
                placeholder="Aquí aparecerán las instrucciones de tu IA..."
              />
              <p className="text-xs text-gray-400 mt-3 italic flex items-center gap-1"><Info className="w-3 h-3" /> Tip: El botón de arriba reconstruye el prompt usando tus servicios y personalidad actual.</p>
            </div>

            <button onClick={handleSaveAll} disabled={saving} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 text-lg">{saving ? <Loader className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Guardar Toda la Configuración</button>
          </div>
        )}

        {activeTab === 'integraciones' && (
          <div className="space-y-6">
            {/* WhatsApp Zavu Section */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2"><Plus className="w-6 h-6 text-blue-600" /> WhatsApp (Zavu)</h2>
                  <p className="text-sm text-gray-500 mt-1">Credenciales de tu número vinculado.</p>
                </div>
                {zavuConnected ? <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">Conectado</span> : <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-bold">Sin conexión</span>}
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
                  <button onClick={async () => {
                    if (!zavuApiKey || !zavuSenderId) return alert('Campos vacíos');
                    setSaving(true);
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      const res = await fetch('/api/business/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` }, body: JSON.stringify({ zavu_api_key: zavuApiKey, zavu_sender_id: zavuSenderId }) });
                      if (res.ok) { setZavuConnected(true); alert('WhatsApp conectado'); } else alert('Error al conectar');
                    } catch (e) { console.error(e); } finally { setSaving(false); }
                  }} disabled={saving} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2">Conectar WhatsApp</button>
                </div>
              ) : (
                <div className="flex justify-between items-center bg-green-50 p-4 rounded-xl border border-green-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600"><CheckCircle className="w-6 h-6" /></div>
                    <p className="font-bold text-green-900 text-sm">Agente vinculado correctamente</p>
                  </div>
                  <button onClick={async () => { if(!confirm('¿Desconectar?')) return; const { data: { session } } = await supabase.auth.getSession(); await fetch('/api/business/disconnect-zavu', { method: 'POST', headers: { 'Authorization': `Bearer ${session?.access_token}` } }); setZavuConnected(false); }} className="text-xs font-bold text-red-400 hover:text-red-600 underline">Desconectar</button>
                </div>
              )}
            </div>

            {/* Google Calendar */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">📅 Google Calendar</h2>
                  <p className="text-sm text-gray-500 mt-1">Agendamiento automático sincronizado.</p>
                </div>
                {calendarConnected ? <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">Conectado</span> : <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-bold">Sin conexión</span>}
              </div>
              <button onClick={async () => { 
                setSaving(true);
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  const res = await fetch('/api/calendar/authorize', { headers: { 'Authorization': `Bearer ${session?.access_token}` } });
                  const data = await res.json();
                  if (data.authUrl) window.location.href = data.authUrl;
                } catch (e) { console.error(e); } finally { setSaving(false); }
              }} className="w-full py-4 bg-white border-2 border-gray-200 text-gray-700 rounded-2xl font-bold hover:border-blue-500 hover:text-blue-600 transition flex items-center justify-center gap-2">
                {calendarConnected ? '⚙️ Re-sincronizar Calendario' : '🔗 Conectar Google Calendar'}
              </button>
            </div>

            {/* Blacklist */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-red-50">
              <h2 className="text-xl font-bold text-red-900 mb-6 flex items-center gap-2"><ShieldAlert className="w-6 h-6 text-red-600" /> Números Bloqueados</h2>
              <div className="flex gap-2 mb-4">
                <input type="text" value={newBlockedNumber} onChange={e => setNewBlockedNumber(e.target.value)} placeholder="Ej: 56912345678" className="flex-1 px-4 py-3 border border-red-100 rounded-xl outline-none" />
                <button onClick={() => { if(!newBlockedNumber) return; setBlockedNumbers([...blockedNumbers, newBlockedNumber]); setNewBlockedNumber(''); }} className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition">Bloquear</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {blockedNumbers.map(num => <div key={num} className="flex items-center gap-2 px-3 py-1 bg-red-50 text-red-700 rounded-full text-xs font-bold border border-red-100">{num} <button onClick={() => setBlockedNumbers(blockedNumbers.filter(n => n !== num))}><Trash2 className="w-3 h-3" /></button></div>)}
              </div>
            </div>

            <button onClick={handleSaveAll} disabled={saving} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2 text-lg">Guardar Todo</button>
          </div>
        )}
      </main>
    </div>
  );
}
