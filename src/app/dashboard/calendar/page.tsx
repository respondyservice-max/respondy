// app/dashboard/calendar/page.tsx - CALENDARIO
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardNav from '@/components/DashboardNav';
import { Calendar, Clock, Phone, Trash2, Edit3, X, Check } from 'lucide-react';
import type { Business, Appointment } from '@/types';

export default function CalendarPage() {
  const router = useRouter();
  const [business, setBusiness] = useState<Business | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/auth/login');
          return;
        }

        const { data: biz } = await supabase
          .from('businesses')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (!biz) {
          router.push('/dashboard');
          return;
        }

        if (biz.plan !== 'ia_calendar') {
          router.push('/dashboard');
          return;
        }

        setBusiness(biz);

        const { data: appts } = await supabase
          .from('appointments')
          .select('*')
          .eq('business_id', biz.id)
          .gte('date_time', new Date().toISOString())
          .order('date_time', { ascending: true });

        setAppointments(appts || []);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Cancelar esta cita? (También se eliminará de Google Calendar)')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const res = await fetch('/api/calendar/delete-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ appointment_id: id })
      });

      if (!res.ok) throw new Error('Error al cancelar');
      setAppointments(appointments.filter((a) => a.id !== id));
    } catch (e) {
      alert('Hubo un error al intentar cancelar la cita. Revisa la consola.');
      console.error(e);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editDate || !editTime) {
      alert('Por favor selecciona una fecha y hora');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const res = await fetch('/api/calendar/update-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ appointment_id: id, date: editDate, time: editTime })
      });

      if (!res.ok) throw new Error('Error al actualizar');
      
      // Actualizar localmente UI
      const updatedAppts = appointments.map(a => {
        if (a.id === id) {
          return { ...a, date_time: new Date(`${editDate}T${editTime}:00`).toISOString() };
        }
        return a;
      });
      // Sort again
      updatedAppts.sort((a,b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime());
      
      setAppointments(updatedAppts);
      setEditId(null);
    } catch (e) {
      alert('Hubo un error al intentar reagendar la cita.');
      console.error(e);
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">📅 Calendario</h1>
          <p className="text-gray-500 mt-1">
            {appointments.length} citas próximas
            {business.google_calendar_email && (
              <span className="ml-2 text-green-600">
                • Sincronizado con {business.google_calendar_email}
              </span>
            )}
          </p>
        </div>

        {appointments.length === 0 ? (
          <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Sin citas próximas</h3>
            <p className="text-gray-500 text-sm">
              Las citas agendadas por el bot aparecerán aquí automáticamente.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {appointments.map((appt) => {
              const date = new Date(appt.date_time);
              return (
                <div
                  key={appt.id}
                  className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      {/* Date block */}
                      <div className="bg-blue-50 rounded-xl p-3 text-center min-w-[70px]">
                        <p className="text-xs text-blue-600 font-medium uppercase">
                          {date.toLocaleDateString('es-CL', { weekday: 'short' })}
                        </p>
                        <p className="text-2xl font-bold text-blue-700">
                          {date.getDate()}
                        </p>
                        <p className="text-xs text-blue-500">
                          {date.toLocaleDateString('es-CL', { month: 'short' })}
                        </p>
                      </div>

                      {/* Details */}
                      <div>
                        <h3 className="font-semibold text-gray-900">{appt.patient_name}</h3>
                        <div className="flex flex-col gap-1 mt-1.5">
                          <span className="flex items-center gap-2 text-sm text-gray-500">
                            <Clock className="w-4 h-4" />
                            {date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {appt.patient_phone && (
                            <span className="flex items-center gap-2 text-sm text-gray-500">
                              <Phone className="w-4 h-4" />
                              {appt.patient_phone}
                            </span>
                          )}
                          {appt.service && (
                            <span className="inline-block mt-1 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                              {appt.service}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2">
                      {editId === appt.id ? (
                        <>
                          <button
                            onClick={() => handleUpdate(appt.id)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                            title="Guardar cambios"
                          >
                            <Check className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => setEditId(null)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                            title="Cancelar edición"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              const d = new Date(appt.date_time);
                              setEditId(appt.id);
                              setEditDate(d.toISOString().split('T')[0]);
                              setEditTime(d.toTimeString().substring(0, 5));
                            }}
                            className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition"
                            title="Reagendar cita"
                          >
                            <Edit3 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(appt.id)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                            title="Cancelar cita"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {/* Edit Form */}
                  {editId === appt.id && (
                    <div className="mt-4 pt-4 border-t border-gray-100 flex gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Nueva Fecha</label>
                        <input 
                          type="date" 
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="px-3 py-2 border rounded-md text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Nueva Hora</label>
                        <input 
                          type="time" 
                          value={editTime}
                          onChange={(e) => setEditTime(e.target.value)}
                          className="px-3 py-2 border rounded-md text-sm"
                        />
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
