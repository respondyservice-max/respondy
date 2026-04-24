// app/dashboard/settings/page.tsx - SETTINGS CON SERVICIOS ESTRUCTURADOS
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import DashboardNav from '@/components/DashboardNav';
import { useRouter } from 'next/navigation';
import { CheckCircle, Loader, ExternalLink, HelpCircle, Info, Plus, Trash2, Video, VideoOff } from 'lucide-react';
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
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [servicesList, setServicesList] = useState<ServiceItem[]>([]);

  const [form, setForm] = useState({
    name: '',
    business_type: '',
    location: '',
    prompt_custom: '',
  });

  // Cargar datos
  useEffect(() => {
    const fetchBusiness = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/auth/login'); return; }

        const { data, error } = await supabase
          .from('businesses')
          .select('*')
          .eq('user_id', user.id)
          .single();

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
        setCalendarConnected(!!data.google_calendar_id);

        const config = data.weekly_schedule?._config || {};
        setAgentName(config.agent_name || 'Sofía');
        setAgentPersonality(config.agent_personality || 'amable');
        setPromptMode(config.prompt_mode || 'agendador');

        // Cargar servicios estructurados o migrar los viejos
        if (config.services_list) {
          setServicesList(config.services_list);
        } else if (data.services && data.services.length > 0) {
          const migrated = data.services.map((s: string) => ({
            id: Math.random().toString(36).substring(7),
            name: s,
            isVideo: false
          }));
          setServicesList(migrated);
        } else {
          setServicesList([{ id: '1', name: 'Consulta', isVideo: false }]);
        }

      } catch (error) { console.error(error); }
      finally { setLoading(false); }
    };
    fetchBusiness();
  }, [router]);

  const addService = () => {
    setServicesList([...servicesList, { id: Math.random().toString(36).substring(7), name: '', isVideo: false }]);
  };

  const removeService = (id: string) => {
    setServicesList(servicesList.filter(s => s.id !== id));
  };

  const updateService = (id: string, updates: Partial<ServiceItem>) => {
    setServicesList(servicesList.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleGeneratePrompt = () => {
    const personalityMap = {
      amable: "Tu tono es cálido, empático y servicial. Usa un lenguaje cercano pero respetuoso.",
      formal: "Tu tono es profesional, ejecutivo y directo. Evita coloquialismos y mantén la elegancia.",
      divertido: "Eres vibrante, lleno de energía y entusiasmo. Usa emojis estratégicos para transmitir alegría 😃✨."
    };

    const servicesStr = servicesList.map(s => s.name).filter(Boolean).join(', ');
    const onlineServices = servicesList.filter(s => s.isVideo).map(s => s.name);
    
    const base = `
# PERSONALIDAD Y ROL
Eres ${agentName}, la asistente experta de ${form.name}. ${personalityMap[agentPersonality as keyof typeof personalityMap]}

# OBJETIVO
Tu misión es ayudar a los pacientes a resolver dudas y agendar sus citas de manera fluida.

# SERVICIOS
Ofrecemos los siguientes servicios: ${servicesStr}.
${onlineServices.length > 0 ? `IMPORTANTE: Contamos con servicios de videollamada para: ${onlineServices.join(', ')}. Menciona esta opción si el paciente busca comodidad desde casa.` : ''}

# REGLAS DE ORO
1. No confirmes una cita sin tener: Nombre, Servicio, Fecha y Hora.
2. Si el paciente pregunta por disponibilidad, consulta la lista que te proporcionaré y ofrece opciones claras.
3. Sé breve en WhatsApp. No escribas párrafos largos.
4. ${promptMode === 'conversacional' ? 'Prioriza la conexión humana: charla un poco antes de ir directo al grano del agendamiento.' : 'Sé eficiente: guía al paciente al agendamiento lo más rápido posible de forma amable.'}
    `.trim();
    
    setForm({ ...form, prompt_custom: base });
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
          services_list: servicesList
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

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader className="animate-spin text-blue-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav business={business!} />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8 text-gray-900">Configuración</h1>

        <div className="flex gap-1 mb-8 bg-gray-100 p-1 rounded-xl max-w-sm">
          <button onClick={() => setActiveTab('agente')} className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'agente' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Agente IA</button>
          <button onClick={() => setActiveTab('integraciones')} className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'integraciones' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Integraciones</button>
        </div>

        {activeTab === 'agente' && (
          <div className="space-y-6">
            {/* Perfil */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold mb-6">🤖 Perfil del Agente IA</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">Nombre de la IA</label>
                  <input type="text" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Ej: Sofía" className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 transition-all outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">Personalidad</label>
                  <select value={agentPersonality} onChange={(e) => setAgentPersonality(e.target.value)} className="w-full px-4 py-3 border rounded-xl bg-gray-50 outline-none">
                    <option value="amable">Amable</option>
                    <option value="formal">Formal</option>
                    <option value="divertido">Divertido 😃</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-gray-400 uppercase ml-1">Servicios Ofrecidos</label>
                  <button onClick={addService} className="text-xs font-bold text-blue-600 flex items-center gap-1 hover:bg-blue-50 px-2 py-1 rounded-lg transition-all"><Plus className="w-3 h-3" /> Añadir Servicio</button>
                </div>
                
                <div className="space-y-2">
                  {servicesList.map((service) => (
                    <div key={service.id} className="flex items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-100 group">
                      <input 
                        type="text" 
                        value={service.name} 
                        onChange={(e) => updateService(service.id, { name: e.target.value })}
                        placeholder="Nombre del servicio"
                        className="flex-1 bg-transparent px-2 py-1 text-sm outline-none"
                      />
                      <button 
                        onClick={() => updateService(service.id, { isVideo: !service.isVideo })}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${service.isVideo ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-500'}`}
                        title={service.isVideo ? "Videollamada habilitada" : "Cita presencial"}
                      >
                        {service.isVideo ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                        {service.isVideo ? 'Videollamada' : 'Presencial'}
                      </button>
                      <button 
                        onClick={() => removeService(service.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Agendamiento */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold mb-4">📅 Modo de Agendamiento</h2>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button onClick={() => setSchedulingMode('link')} className={`p-4 rounded-xl border-2 text-left ${schedulingMode === 'link' ? 'border-blue-600 bg-blue-50' : 'border-gray-100'}`}>
                  <div className="text-xl mb-1">🔗</div>
                  <div className="font-bold text-sm">Por Enlace</div>
                  <div className="text-xs text-gray-500">Comparte tu link</div>
                </button>
                <button onClick={() => setSchedulingMode('auto')} className={`p-4 rounded-xl border-2 text-left ${schedulingMode === 'auto' ? 'border-blue-600 bg-blue-50' : 'border-gray-100'}`}>
                  <div className="text-xl mb-1">⚡</div>
                  <div className="font-bold text-sm">Automático</div>
                  <div className="text-xs text-gray-500">IA agenda directo</div>
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-sm text-blue-800 font-medium flex items-center gap-2 mb-2">
                    <Info className="w-4 h-4" /> Configura tu disponibilidad en Google
                  </p>
                  <button 
                    onClick={() => setShowHelpModal(true)}
                    className="text-xs font-bold text-blue-600 underline flex items-center gap-1"
                  >
                    ¿Cómo obtener mi link? <HelpCircle className="w-3 h-3" />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1 ml-1">Tu Link de Reserva</label>
                  <input 
                    type="url" 
                    value={bookingLink} 
                    onChange={(e) => setBookingLink(e.target.value)}
                    placeholder="https://calendar.google.com/calendar/appointments/..."
                    className="w-full px-4 py-3 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Prompt */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">📝 Instrucciones del Agente</h2>
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                  <button onClick={() => setPromptMode('conversacional')} className={`px-3 py-1 rounded-md text-xs font-bold ${promptMode === 'conversacional' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Conversacional</button>
                  <button onClick={() => setPromptMode('agendador')} className={`px-3 py-1 rounded-md text-xs font-bold ${promptMode === 'agendador' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Agendador</button>
                </div>
              </div>
              <button onClick={handleGeneratePrompt} className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-bold mb-4 hover:shadow-lg transition-all">✨ Generar Instrucciones Automáticamente</button>
              <textarea value={form.prompt_custom} onChange={(e) => setForm({...form, prompt_custom: e.target.value})} rows={5} className="w-full px-4 py-3 border rounded-xl text-sm font-mono bg-gray-50 focus:bg-white outline-none transition-all" />
            </div>

            <button onClick={handleSaveAll} disabled={saving} className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold text-lg shadow-xl hover:scale-[1.01] transition-all disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        )}

        {activeTab === 'integraciones' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold">📱 WhatsApp (Zavu)</h2>
                <p className="text-sm text-gray-500">Conexión con tu número de WhatsApp</p>
              </div>
              <div className="flex items-center gap-3">
                {zavuConnected ? (
                  <>
                    <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">Conectado</span>
                    <button onClick={() => router.push('/dashboard/setup')} className="text-xs font-bold text-gray-400 hover:text-red-500 underline">Desconectar</button>
                  </>
                ) : (
                  <button onClick={() => router.push('/dashboard/setup')} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all">Conectar Zavu</button>
                )}
              </div>
            </div>
            
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold">📅 Google Calendar</h2>
                <p className="text-sm text-gray-500">Sincronización de citas y disponibilidad</p>
              </div>
              <div className="flex items-center gap-3">
                {calendarConnected ? (
                  <>
                    <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">Conectado</span>
                    <button onClick={() => router.push('/api/auth/google')} className="text-xs font-bold text-gray-400 hover:text-red-500 underline">Re-conectar</button>
                  </>
                ) : (
                  <button onClick={() => router.push('/api/auth/google')} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all">Conectar Google</button>
                )}
              </div>
            </div>

            {/* LISTA NEGRA */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold mb-2">🚫 Números Bloqueados (Lista Negra)</h2>
              <p className="text-xs text-gray-500 mb-4">El bot ignorará automáticamente cualquier mensaje de estos números.</p>
              
              <div className="flex gap-2 mb-4">
                <input 
                  type="text" 
                  id="new-blocked-number"
                  placeholder="Ej: 56912345678" 
                  className="flex-1 px-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500"
                />
                <button 
                  onClick={() => {
                    const input = document.getElementById('new-blocked-number') as HTMLInputElement;
                    if (input.value) {
                      const updated = { 
                        ...(business?.weekly_schedule || {}), 
                        _config: { 
                          ...(business?.weekly_schedule?._config || {}),
                          blocked_numbers: [...(business?.weekly_schedule?._config?.blocked_numbers || []), input.value.replace(/\D/g, '')]
                        } 
                      };
                      setBusiness({ ...business!, weekly_schedule: updated });
                      input.value = '';
                    }
                  }}
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-bold border border-red-100 hover:bg-red-100 transition-all"
                >
                  Bloquear
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {(business?.weekly_schedule?._config?.blocked_numbers || []).map((num: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 text-sm">
                    <span className="font-mono">{num}</span>
                    <button 
                      onClick={() => {
                        const updated = { 
                          ...(business?.weekly_schedule || {}), 
                          _config: { 
                            ...(business?.weekly_schedule?._config || {}),
                            blocked_numbers: business?.weekly_schedule?._config?.blocked_numbers.filter((n: string) => n !== num)
                          } 
                        };
                        setBusiness({ ...business!, weekly_schedule: updated });
                      }}
                      className="text-gray-400 hover:text-red-500"
                    >
                      &times;
                    </button>
                  </div>
                ))}
                {(!business?.weekly_schedule?._config?.blocked_numbers || business?.weekly_schedule?._config?.blocked_numbers.length === 0) && (
                  <p className="text-xs text-gray-400 italic">No hay números bloqueados.</p>
                )}
              </div>
            </div>

            <button onClick={handleSaveAll} disabled={saving} className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold text-lg shadow-xl hover:scale-[1.01] transition-all disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        )}
      </main>

      {/* MODAL DE AYUDA */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl relative">
            <button onClick={() => setShowHelpModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl font-bold">&times;</button>
            <h3 className="text-xl font-bold mb-4 text-gray-900">Configura tu Agendamiento</h3>
            <ol className="space-y-4 text-sm text-gray-600 mb-6">
              <li>1. Ve a <a href="https://calendar.google.com/" target="_blank" className="text-blue-600 font-bold underline">Google Calendar</a>.</li>
              <li>2. Busca el botón <strong>"+"</strong> al lado de <strong>"Páginas de reserva"</strong>:</li>
              <div className="bg-gray-50 p-4 rounded-xl flex justify-center border border-gray-100">
                <img src="/images/google-help.png" alt="Instrucción Google" className="max-h-12" />
                <div className="flex items-center gap-2 text-gray-800 font-medium">Páginas de reserva <span className="text-xl">+</span></div>
              </div>
              <li>3. Configura tus horarios y guarda.</li>
              <li>4. Haz clic en <strong>"Compartir"</strong>, copia el enlace y pégalo en Respondy.</li>
            </ol>
            <button onClick={() => setShowHelpModal(false)} className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold">Entendido</button>
          </div>
        </div>
      )}
    </div>
  );
}
