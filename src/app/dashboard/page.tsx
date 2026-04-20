// app/dashboard/page.tsx - DASHBOARD PRINCIPAL
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardNav from '@/components/DashboardNav';
import { AlertCircle, CheckCircle, Clock, MessageSquare, TrendingUp, ArrowRight } from 'lucide-react';
import type { Business } from '@/types';

export default function Dashboard() {
  const router = useRouter();
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    messages: 0,
    appointments: 0,
    conversations: 0,
  });

  const [aiBotEnabled, setAiBotEnabled] = useState(true);

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
          // Primera vez - redirigir a setup
          router.push('/dashboard/setup');
          return;
        }

        setBusiness(data);
        setAiBotEnabled(data.ai_bot_enabled !== false);

        // Fetch stats
        const { count: conversations } = await supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', data.id);

        const { count: appointments } = await supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', data.id);

        setStats({
          messages: conversations || 0,
          appointments: appointments || 0,
          conversations: conversations || 0,
        });
      } catch (error) {
        console.error('Error:', error);
        router.push('/auth/login');
      } finally {
        setLoading(false);
      }
    };

    fetchBusiness();
  }, [router]);

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
        console.error('Error al actualizar Bot IA:', error);
        setAiBotEnabled(!newValue); // Revertir si falló
        alert('Error al actualizar el estado del bot');
      }
    } catch (error) {
      console.error('Error:', error);
      setAiBotEnabled(!newValue);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-gray-500 text-sm">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  if (!business) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav business={business} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Hola, {business.name}! 👋
          </h1>
          <p className="text-gray-600 mt-2">
            {business.plan === 'ia_messaging'
              ? '📱 Plan: IA Mensajería'
              : '📅 Plan: IA + Calendario'}
          </p>
        </div>

        {/* Status Alert */}
        {!business.zavu_api_key_encrypted ? (
          <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 p-5 mb-8 rounded-xl">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-yellow-900">⚠️ Configuración pendiente</h3>
                <p className="text-yellow-800 text-sm mt-1">
                  Necesitas conectar tu Zavu para que el agente funcione.{' '}
                  <a href="/dashboard/settings" className="underline font-semibold hover:text-yellow-900 transition">
                    Ir a configuración →
                  </a>
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className={`bg-gradient-to-r ${aiBotEnabled ? 'from-green-50 to-emerald-50 border-green-200' : 'from-gray-50 to-slate-100 border-gray-200'} border p-5 mb-8 rounded-xl transition-all duration-300`}>
            <div className="flex justify-between items-start">
              <div className="flex gap-3">
                {aiBotEnabled ? (
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <h3 className={`font-semibold ${aiBotEnabled ? 'text-green-900' : 'text-gray-700'}`}>
                    {aiBotEnabled ? '✅ Agente IA' : '⚪ Agente IA (Pausado)'}
                  </h3>
                  <p className={`${aiBotEnabled ? 'text-green-800' : 'text-gray-500'} text-sm mt-1`}>
                    {aiBotEnabled 
                      ? 'Tu agente de WhatsApp está funcionando correctamente.'
                      : 'El agente está desactivado. No responderá mensajes automáticamente.'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-600">
                  {aiBotEnabled ? 'Encendido' : 'Apagado'}
                </span>
                <button
                  onClick={handleToggleAiBot}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    aiBotEnabled ? 'bg-green-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      aiBotEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <StatCard
            title="Mensajes (Enviados y recibidos)"
            value={`${stats.conversations} / 2000`}
            icon={<MessageSquare className="w-6 h-6 text-blue-600" />}
            subtitle="Plan mensual"
            color="blue"
          />
          <StatCard
            title="Citas agendadas"
            value={stats.appointments}
            icon={<Clock className="w-6 h-6 text-emerald-600" />}
            subtitle="este mes"
            color="emerald"
          />
        </div>

        {/* Quick Actions */}
        <h2 className="text-xl font-bold text-gray-900 mb-4">Acciones rápidas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {business.plan === 'ia_calendar' && (
            <QuickAction
              title="📅 Ver calendario"
              description="Gestiona tus citas, reschedule o cancela"
              href="/dashboard/calendar"
            />
          )}
          <QuickAction
            title="💬 Conversaciones"
            description="Revisa el historial de mensajes"
            href="/dashboard/conversations"
          />
          <QuickAction
            title="⚙️ Configuración"
            description="Edita prompt, horarios y servicios"
            href="/dashboard/settings"
          />
          <QuickAction
            title="📞 Soporte"
            description="Contacta a nuestro equipo"
            href="mailto:soporte@respondy.cl"
          />
        </div>
      </main>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  subtitle,
  color,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  subtitle: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-gray-500 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold mt-1 text-gray-900">{value}</p>
          <p className="text-gray-400 text-xs mt-1">{subtitle}</p>
        </div>
        <div className={`p-3 bg-${color}-50 rounded-xl`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group block bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all duration-300"
    >
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        </div>
        <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all duration-300" />
      </div>
    </a>
  );
}
