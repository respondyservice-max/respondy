export const dynamic = 'force-dynamic';
// app/api/business/message-stats/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { getMessageStats, formatCycleDate } from '@/lib/messageStats';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split('Bearer ')[1];
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { data: business, error } = await supabaseAdmin
      .from('businesses')
      .select('id, created_at, message_limit, extra_messages')
      .eq('user_id', user.id)
      .single();

    if (error || !business) {
      return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 });
    }

    const stats = await getMessageStats(business, supabaseAdmin);

    return NextResponse.json({
      used: stats.used,
      limit: stats.limit,
      extra: stats.extra,
      cycleStart: stats.cycleStart.toISOString(),
      cycleEnd: stats.cycleEnd.toISOString(),
      cycleStartFormatted: formatCycleDate(stats.cycleStart),
      cycleEndFormatted: formatCycleDate(stats.cycleEnd),
      isOverLimit: stats.isOverLimit,
      isWarning: stats.isWarning,
      remaining: stats.remaining,
      percentage: stats.percentage,
    });
  } catch (err) {
    console.error('Error en message-stats:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
