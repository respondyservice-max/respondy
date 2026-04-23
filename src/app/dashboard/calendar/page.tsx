// app/dashboard/calendar/page.tsx - CALENDARIO (lee de Google Calendar directamente)
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardNav from '@/components/DashboardNav';
import { Calendar, Clock, Phone, Trash2, Edit3, X, Check, Link } from 'lucide-react';
import type { Business } from '@/types';

interface CalendarEvent {
  id: string;
  google_event_id: string;
  patient_name: string;
  patient_phone: string;
  service: string;
  date_time: string;
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

        const { data: biz } = await supabase
          .from('businesses')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (!biz) { router.push('/dashboard'); return; }
        if (biz.plan !== 'ia_calendar') { router.push('/dashboard'); return; }

        setBusiness(biz);

        // Leer eventos directamente de Google Calendar (incluye Página de Reservas)
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/calendar/upcoming-events', {
          headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
        });
        const json = await res.json();
        setEvents(json.events || []);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
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
    } catch {
      alert('Error al cancelar la cita.');
    }
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
      setEvents(prev =>
        prev
          .map(e => e.google_event_id === googleEventId
            ? { ...e, date_time: new Date(`${editDate}T${editTime}:00`).toISOString() }
            : e)
          .sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime())
      );
      setEditId(null);
    } catch {
      alert('Error al reagendar la cita.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!business) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav business={business} />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">📅 Calendario</h1>
            <p className="text-gray-500 mt-1">
              {events.length} citas próximas
              {business.google_calendar_email && (
                <span className="ml-2 text-green-600">• {business.google_calendar_email}</span>
              )}
            </p>
          </div>
          <p className="text-xs text-gray-400 text-right mt-2">
            Incluye citas por IA y por enlace 🔗
          </p>
        </div>

        {events.length === 0 ? (
          <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Sin citas próximas</h3>
            <p className="text-gray-500 text-sm">
              Aquí aparecerán todas tus citas de Google Calendar, tanto las agendadas por el bot como las reservadas por enlace.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((event) => {
              const date = new Date(event.date_time);
              const isFromLink = !event.patient_phone;
              return (
                <div key={event.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      {/* Bloque de fecha */}
                      <div className="bg-blue-50 rounded-xl p-3 text-center min-w-[70px]">
                        <p className="text-xs text-blue-600 font-medium uppercase">
                          {date.toLocaleDateString('es-CL', { weekday: 'short', timeZone: 'America/Santiago' })}
                        </p>
                        <p className="text-2xl font-bold text-blue-700">
                          {date.toLocaleDateString('es-CL', { day: 'numeric', timeZone: 'America/Santiago' })}
                        </p>
                        <p className="text-xs text-blue-500">
                          {date.toLocaleDateString('es-CL', { month: 'short', timeZone: 'America/Santiago' })}
                        </p>
                      </div>

                      {/* Detalles */}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900">{event.patient_name}</h3>
                          {isFromLink ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs font-medium border border-purple-100">
                              <Link className="w-3 h-3" /> Enlace
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100">
                              🤖 IA
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 mt-1.5">
                          <span className="flex items-center gap-2 text-sm text-gray-500">
                            <Clock className="w-4 h-4" />
                            {date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })}
                          </span>
                          {event.patient_phone && (
                            <span className="flex items-center gap-2 text-sm text-gray-500">
                              <Phone className="w-4 h-4" /> {event.patient_phone}
                            </span>
                          )}
                          {event.service && (
                            <span className="inline-block mt-1 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                              {event.service}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex flex-col gap-2">
                      {editId === event.google_event_id ? (
                        <>
                          <button onClick={() => handleUpdate(event.google_event_id)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition" title="Guardar">
                            <Check className="w-5 h-5" />
                          </button>
                          <button onClick={() => setEditId(null)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition" title="Cancelar edición">
                            <X className="w-5 h-5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              const d = new Date(event.date_time);
                              setEditId(event.google_event_id);
                              // Formato YYYY-MM-DD en zona horaria de Chile
                              const pad = (n: number) => String(n).padStart(2, '0');
                              const inCL = new Date(d.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
                              setEditDate(`${inCL.getFullYear()}-${pad(inCL.getMonth() + 1)}-${pad(inCL.getDate())}`);
                              setEditTime(`${pad(inCL.getHours())}:${pad(inCL.getMinutes())}`);
                            }}
                            className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition"
                            title="Reagendar"
                          >
                            <Edit3 className="w-5 h-5" />
                          </button>
                          <button onClick={() => handleDelete(event.google_event_id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Cancelar cita">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {editId === event.google_event_id && (
                    <div className="mt-4 pt-4 border-t border-gray-100 flex gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Nueva Fecha</label>
                        <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="px-3 py-2 border rounded-md text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Nueva Hora</label>
                        <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className="px-3 py-2 border rounded-md text-sm" />
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
