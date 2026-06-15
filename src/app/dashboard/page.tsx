// app/dashboard/page.tsx - DASHBOARD PRINCIPAL
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardNav from '@/components/DashboardNav';
import { AlertCircle, CheckCircle, Clock, MessageSquare, TrendingUp, ArrowRight } from 'lucide-react';
import type { Business } from '@/types';

interface MessageStatsData {
  used: number;
  limit: number;
  extra: number;
  cycleStart: string;
  cycleEnd: string;
  cycleStartFormatted: string;
  cycleEndFormatted: string;
  isOverLimit: boolean;
  isWarning: boolean;
  remaining: number;
  percentage: number;
}

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
  const [msgStats, setMsgStats] = useState<MessageStatsData | null>(null);
  const [buyingExtra, setBuyingExtra] = useState(false);

  const fetchMessageStats = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const res = await fetch('/api/business/message-stats', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setMsgStats(data);
      }
    } catch (error) {
      console.error('Error fetching message stats:', error);
    }
  };

  const handleBuyExtraMessages = async () => {
    if (buyingExtra) return;
    if (!confirm('¿Deseas comprar una bolsa de 1.000 mensajes extras? (Se activarán de inmediato)')) return;

    setBuyingExtra(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/business/buy-extra-messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message || 'Bolsa de mensajes activada con éxito');
        await fetchMessageStats();
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.error || 'No se pudo comprar la bolsa de mensajes'}`);
      }
    } catch (error) {
      console.error('Error buying extra messages:', error);
      alert('Error de conexión');
    } finally {
      setBuyingExtra(false);
    }
  };

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

        // Cargar estadísticas del ciclo mensual
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const res = await fetch('/api/business/message-stats', {
              headers: {
                'Authorization': `Bearer ${session.access_token}`
              }
            });
            if (res.ok) {
              const statsData = await res.json();
              setMsgStats(statsData);
            }
          }
        } catch (err) {
          console.error('Error fetching message stats in effect:', err);
        }
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
        ) : msgStats?.isOverLimit ? (
          <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 p-5 mb-8 rounded-xl transition-all duration-300">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-900">🔴 Agente IA Suspendido (Límite Excedido)</h3>
                <p className="text-red-800 text-sm mt-1">
                  El agente ha dejado de responder porque superaste el límite de mensajes de tu plan. Por favor, compra una bolsa extra para reanudar el servicio de inmediato.
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
          <MessageUsageCard
            stats={msgStats}
            onBuyExtra={handleBuyExtraMessages}
            loadingBuy={buyingExtra}
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

function MessageUsageCard({
  stats,
  onBuyExtra,
  loadingBuy,
}: {
  stats: MessageStatsData | null;
  onBuyExtra: () => void;
  loadingBuy: boolean;
}) {
  if (!stats) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
        <div className="h-2 bg-gray-200 rounded w-full mb-4"></div>
      </div>
    );
  }

  const {
    used,
    limit,
    cycleEndFormatted,
    isOverLimit,
    isWarning,
    percentage,
    remaining,
  } = stats;

  let barColor = 'bg-gradient-to-r from-blue-500 to-indigo-600';
  let textColor = 'text-indigo-600';
  let badgeColor = 'bg-indigo-50 text-indigo-700';

  if (isOverLimit) {
    barColor = 'bg-gradient-to-r from-red-500 to-rose-600';
    textColor = 'text-red-600';
    badgeColor = 'bg-red-50 text-red-700';
  } else if (isWarning) {
    barColor = 'bg-gradient-to-r from-amber-500 to-orange-500';
    textColor = 'text-amber-600';
    badgeColor = 'bg-amber-50 text-amber-700';
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="text-gray-500 text-sm font-medium">Consumo de mensajes</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-extrabold text-gray-900">{used.toLocaleString('es-CL')}</span>
              <span className="text-gray-400 text-sm">/ {limit.toLocaleString('es-CL')}</span>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badgeColor}`}>
            {isOverLimit ? 'Límite superado' : isWarning ? 'Cerca del límite' : 'Plan activo'}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-3 mb-3 mt-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="flex justify-between text-xs text-gray-500 mb-4">
          <span>Ciclo actual</span>
          <span className="font-semibold text-gray-700">
            Termina el {cycleEndFormatted}
          </span>
        </div>

        {/* Alerts inside card */}
        {isOverLimit && (
          <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm text-red-800 flex gap-2 mb-4">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">🔴 Agente Pausado</p>
              <p className="text-xs text-red-700 mt-0.5">
                Has alcanzado el límite de tu plan. Para reactivar el agente de inmediato, puedes comprar una bolsa de mensajes extras.
              </p>
            </div>
          </div>
        )}

        {isWarning && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-sm text-amber-800 flex gap-2 mb-4">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">⚠️ Mensajes Bajos</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Solo te quedan {remaining.toLocaleString('es-CL')} mensajes hasta el {cycleEndFormatted}.
              </p>
            </div>
          </div>
        )}
      </div>

      {(isWarning || isOverLimit) && (
        <button
          onClick={onBuyExtra}
          disabled={loadingBuy}
          className="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loadingBuy ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <>
              <TrendingUp className="w-4 h-4" />
              <span>+ Comprar bolsa de 1.000 mensajes</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
