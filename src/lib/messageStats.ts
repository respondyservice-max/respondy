// lib/messageStats.ts - SISTEMA DE CONTABILIZACIÓN DE MENSAJES POR CICLO MENSUAL

import { SupabaseClient } from '@supabase/supabase-js';

export interface MessageStats {
  used: number;
  limit: number;
  extra: number;
  cycleStart: Date;
  cycleEnd: Date;
  isOverLimit: boolean;
  isWarning: boolean; // >= 4000 pero sin superar el límite
  remaining: number;
  percentage: number;
}

/**
 * Calcula el inicio y fin del ciclo mensual actual basándose en la fecha
 * de creación de la cuenta. Ejemplo: cuenta creada el 13 de abril →
 * ciclo actual: 13 jun → 12 jul.
 */
export function getCurrentCycle(createdAt: string): { start: Date; end: Date } {
  const created = new Date(createdAt);
  const cycleDay = created.getDate(); // ej: 13
  const now = new Date();

  // Construir el inicio del ciclo en el mes actual
  let cycleStart = new Date(now.getFullYear(), now.getMonth(), cycleDay, 0, 0, 0, 0);

  // Si hoy es antes del día del ciclo, retrocedemos un mes
  if (now.getDate() < cycleDay) {
    cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, cycleDay, 0, 0, 0, 0);
  }

  // El ciclo termina exactamente un mes después del inicio
  const cycleEnd = new Date(cycleStart);
  cycleEnd.setMonth(cycleEnd.getMonth() + 1);

  return { start: cycleStart, end: cycleEnd };
}

/**
 * Calcula las estadísticas de uso de mensajes del ciclo actual para un negocio.
 * Consulta directamente la tabla `conversations` en el rango de fechas del ciclo.
 */
export async function getMessageStats(
  business: {
    id: string;
    created_at: string;
    message_limit?: number;
    extra_messages?: number;
  },
  supabaseAdmin: SupabaseClient
): Promise<MessageStats> {
  const { start, end } = getCurrentCycle(business.created_at);

  const { count, error } = await supabaseAdmin
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', business.id)
    .gte('timestamp', start.toISOString())
    .lt('timestamp', end.toISOString());

  if (error) {
    console.error('❌ Error al contar mensajes del ciclo:', error);
  }

  const baseLimit = business.message_limit ?? 5000;
  const extra = business.extra_messages ?? 0;
  const limit = baseLimit + extra;
  const used = count ?? 0;
  const remaining = Math.max(0, limit - used);
  const percentage = Math.min(100, Math.round((used / limit) * 100));
  const isOverLimit = used >= limit;
  // Aviso cuando quedan menos de 1000 mensajes (y aún no supera el límite)
  const isWarning = used >= 4000 && !isOverLimit;

  return {
    used,
    limit,
    extra,
    cycleStart: start,
    cycleEnd: end,
    isOverLimit,
    isWarning,
    remaining,
    percentage,
  };
}

/**
 * Formatea una fecha en español corto: "13 jun"
 */
export function formatCycleDate(date: Date): string {
  return date.toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Santiago',
  });
}
