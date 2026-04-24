// app/dashboard/calendar/page.tsx - CALENDARIO CON VIDEOLLAMADAS DESTACADAS
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardNav from '@/components/DashboardNav';
import { Calendar, Clock, Phone, Trash2, Edit3, X, Check, Link, Video, Mail, ExternalLink } from 'lucide-react';
import type { Business } from '@/types';

interface CalendarEvent {
  id: string;
  google_event_id: string;
  patient_name: string;
  patient_phone: string;
  patient_email?: string;
  service: string;
  date_time: string;
  meet_link?: string;
}

export default function CalendarPage() {
  const router = useRouter();
  const [business, setBusiness] = useState<Business | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/auth/login'); return; }

        const { data: biz } = await supabase.from('businesses').select('*').eq('user_id', user.id).single();
        if (!biz) { router.push('/dashboard'); return; }
        
        setBusiness(biz);

        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/calendar/upcoming-events', {
          headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
        });
        const json = await res.json();
        setEvents(json.events || []);
      } catch (error) { console.error(error); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [router]);

  const handleDelete = async (googleEventId: string) => {
    if (!confirm('¿Cancelar esta cita? (Se eliminará de Google Calendar)')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/calendar/delete-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ google_event_id: googleEventId })
      });
      if (!res.ok) throw new Error();
      setEvents(prev => prev.filter(e => e.google_event_id !== googleEventId));
    } catch { alert('Error al cancelar la cita.'); }
  };

  const handleUpdate = async (googleEventId: string) => {
    if (!editDate || !editTime) { alert('Selecciona fecha y hora'); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/calendar/update-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ google_event_id: googleEventId, date: editDate, time: editTime })
      });
      if (!res.ok) throw new Error();
      setEvents(prev => prev.map(e => e.google_event_id === googleEventId ? { ...e, date_time: new Date(`${editDate}T${editTime}:00`).toISOString() } : e).sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime()));
      setEditId(null);
    } catch { alert('Error al reagendar la cita.'); }
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  if (!business) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav business={business} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">📅 Agenda de Citas</h1>
            <p className="text-gray-500 mt-1">{events.length} citas próximas configuradas</p>
          </div>
        </div>

        {events.length === 0 ? (
          <div className="bg-white rounded-3xl p-16 shadow-sm border border-gray-100 text-center">
            <Calendar className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">No tienes citas agendadas</h3>
            <p className="text-gray-500 max-w-sm mx-auto">Cuando tus clientes agenden por WhatsApp o mediante tu enlace, aparecerán aquí con todos sus detalles.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {events.map((event) => {
              const date = new Date(event.date_time);
              const isVideo = !!event.meet_link;
              return (
                <div key={event.id} className={`bg-white rounded-2xl p-6 shadow-sm border transition-all duration-300 hover:shadow-md ${isVideo ? 'border-indigo-100' : 'border-gray-100'}`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-start gap-5">
                      {/* Fecha Estilo Ticket */}
                      <div className={`rounded-2xl p-3 text-center min-w-[80px] ${isVideo ? 'bg-indigo-50 border border-indigo-100' : 'bg-blue-50 border border-blue-100'}`}>
                        <p className={`text-xs font-bold uppercase ${isVideo ? 'text-indigo-500' : 'text-blue-500'}`}>{date.toLocaleDateString('es-CL', { weekday: 'short', timeZone: 'America/Santiago' })}</p>
                        <p className={`text-2xl font-black ${isVideo ? 'text-indigo-700' : 'text-blue-700'}`}>{date.toLocaleDateString('es-CL', { day: 'numeric', timeZone: 'America/Santiago' })}</p>
                        <p className={`text-xs font-bold ${isVideo ? 'text-indigo-500' : 'text-blue-500'}`}>{date.toLocaleDateString('es-CL', { month: 'short', timeZone: 'America/Santiago' })}</p>
                      </div>

                      {/* Info Paciente */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="text-lg font-bold text-gray-900">{event.patient_name}</h3>
                          {isVideo && (
                            <a 
                              href={event.meet_link} 
                              target="_blank" 
                              className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-600 text-white rounded-full text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm hover:scale-105"
                            >
                              <Video className="w-3.5 h-3.5" /> Unirse a Meet
                            </a>
                          )}
                          {!event.patient_phone && <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[10px] font-bold uppercase">Enlace Web</span>}
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-500">
                          <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /> {date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })} hrs</span>
                          {event.patient_phone && <span className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> {event.patient_phone}</span>}
                          {event.patient_email && <span className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /> {event.patient_email}</span>}
                          <span className="flex items-center gap-2 font-medium text-gray-700 mt-1">
                            <span className={`w-2 h-2 rounded-full ${isVideo ? 'bg-indigo-500' : 'bg-blue-500'}`}></span>
                            {event.service || 'Servicio General'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-2 self-end md:self-center border-t md:border-t-0 pt-4 md:pt-0">
                      {editId === event.google_event_id ? (
                        <div className="flex gap-2">
                          <button onClick={() => handleUpdate(event.google_event_id)} className="p-2 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition"><Check className="w-5 h-5" /></button>
                          <button onClick={() => setEditId(null)} className="p-2 bg-gray-50 text-gray-400 rounded-xl hover:bg-gray-100 transition"><X className="w-5 h-5" /></button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => {
                            const d = new Date(event.date_time);
                            setEditId(event.google_event_id);
                            const pad = (n: number) => String(n).padStart(2, '0');
                            const inCL = new Date(d.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
                            setEditDate(`${inCL.getFullYear()}-${pad(inCL.getMonth() + 1)}-${pad(inCL.getDate())}`);
                            setEditTime(`${pad(inCL.getHours())}:${pad(inCL.getMinutes())}`);
                          }} className="p-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition" title="Reagendar"><Edit3 className="w-5 h-5" /></button>
                          <button onClick={() => handleDelete(event.google_event_id)} className="p-3 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition" title="Cancelar cita"><Trash2 className="w-5 h-5" /></button>
                        </>
                      )}
                    </div>
                  </div>

                  {editId === event.google_event_id && (
                    <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-4 animate-in fade-in slide-in-from-top-2">
                      <div className="flex-1 min-w-[150px]">
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1 ml-1">Nueva Fecha</label>
                        <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full px-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div className="flex-1 min-w-[150px]">
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1 ml-1">Nueva Hora</label>
                        <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className="w-full px-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
