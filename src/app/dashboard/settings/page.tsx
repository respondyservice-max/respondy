// app/dashboard/settings/page.tsx - SETTINGS SIMPLIFICADO FINAL
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import DashboardNav from '@/components/DashboardNav';
import { useRouter } from 'next/navigation';
import { CheckCircle, Loader, ExternalLink, HelpCircle, Info } from 'lucide-react';
import type { Business } from '@/types';

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

  const [form, setForm] = useState({
    name: '',
    business_type: '',
    location: '',
    services: '',
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
          services: data.services?.join(', ') || '',
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

      } catch (error) { console.error(error); }
      finally { setLoading(false); }
    };
    fetchBusiness();
  }, [router]);

  const handleGeneratePrompt = () => {
    let personalityPrompt = agentPersonality === 'formal' ? "Usa un lenguaje formal y profesional." : 
                           agentPersonality === 'divertido' ? "Sé divertido y usa muchos emojis 😃✨." : 
                           "Sé amable y servicial.";

    const servicesStr = form.services ? ` Ofrecemos: ${form.services}.` : "";
    const base = promptMode === 'conversacional' 
      ? `Eres ${agentName} de ${form.name}. ${personalityPrompt}${servicesStr} Charla amigablemente y luego invita a agendar.`
      : `Eres ${agentName} de ${form.name}. ${personalityPrompt}${servicesStr} Tu meta es agendar rápido pidiendo nombre y fecha.`;
    
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
          prompt_mode: promptMode
        } 
      };

      await supabase.from('businesses').update({ 
        name: form.name,
        services: form.services.split(',').map(s => s.trim()).filter(Boolean),
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Nombre del Agente" className="px-4 py-3 border rounded-xl" />
                <select value={agentPersonality} onChange={(e) => setAgentPersonality(e.target.value)} className="px-4 py-3 border rounded-xl bg-gray-50">
                  <option value="amable">Amable</option>
                  <option value="formal">Formal</option>
                  <option value="divertido">Divertido 😃</option>
                </select>
                <textarea value={form.services} onChange={(e) => setForm({...form, services: e.target.value})} placeholder="Servicios (ej: Corte, Color)" className="md:col-span-2 px-4 py-3 border rounded-xl" rows={2} />
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
                  <p className="text-xs text-blue-700 mb-3">
                    Crea tu "Página de citas" en Google Calendar y pega el enlace aquí abajo.
                  </p>
                  <button 
                    onClick={() => setShowHelpModal(true)}
                    className="text-xs font-bold text-blue-600 underline flex items-center gap-1"
                  >
                    ¿Cómo obtener mi link? <HelpCircle className="w-3 h-3" />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">TU LINK DE RESERVA DE GOOGLE</label>
                  <input 
                    type="url" 
                    value={bookingLink} 
                    onChange={(e) => setBookingLink(e.target.value)}
                    placeholder="https://calendar.google.com/calendar/appointments/..."
                    className="w-full px-4 py-3 border rounded-xl text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Prompt */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">📝 Instrucciones</h2>
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                  <button onClick={() => setPromptMode('conversacional')} className={`px-3 py-1 rounded-md text-xs font-bold ${promptMode === 'conversacional' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Conversacional</button>
                  <button onClick={() => setPromptMode('agendador')} className={`px-3 py-1 rounded-md text-xs font-bold ${promptMode === 'agendador' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Agendador</button>
                </div>
              </div>
              <button onClick={handleGeneratePrompt} className="w-full py-2 bg-gray-900 text-white rounded-xl text-sm font-bold mb-4">✨ Generar Instrucciones Automáticamente</button>
              <textarea value={form.prompt_custom} onChange={(e) => setForm({...form, prompt_custom: e.target.value})} rows={5} className="w-full px-4 py-3 border rounded-xl text-sm font-mono bg-gray-50" />
            </div>

            <button onClick={handleSaveAll} disabled={saving} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-lg">
              {saving ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        )}

        {activeTab === 'integraciones' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold mb-4">📱 WhatsApp (Zavu)</h2>
              {zavuConnected ? <p className="text-green-600 font-bold">✓ Conectado</p> : <p className="text-gray-400">No conectado</p>}
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold mb-4">📅 Google Calendar</h2>
              {calendarConnected ? <p className="text-green-600 font-bold">✓ Conectado</p> : <p className="text-gray-400">No conectado</p>}
            </div>
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
                {/* Fallback si no hay imagen: */}
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
