// app/dashboard/conversations/page.tsx - CONVERSACIONES
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardNav from '@/components/DashboardNav';
import { MessageSquare, ArrowDownCircle, ArrowUpCircle, Search } from 'lucide-react';
import type { Business, Conversation } from '@/types';

export default function ConversationsPage() {
  const router = useRouter();
  const [business, setBusiness] = useState<Business | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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

        setBusiness(biz);

        const { data: convs } = await supabase
          .from('conversations')
          .select('*')
          .eq('business_id', biz.id)
          .order('timestamp', { ascending: false })
          .limit(100);

        setConversations(convs || []);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!business) return null;

  const filtered = conversations.filter(
    (c) =>
      c.phone_from.includes(search) ||
      c.message_text.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav business={business} />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Conversaciones</h1>
            <p className="text-gray-500 mt-1">{conversations.length} mensajes</p>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por teléfono o mensaje..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Sin conversaciones</h3>
            <p className="text-gray-500 text-sm">
              Las conversaciones aparecerán aquí cuando tu bot empiece a responder mensajes.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((conv) => (
              <div
                key={conv.id}
                className={`bg-white rounded-xl p-5 shadow-sm border transition hover:shadow-md ${
                  conv.message_type === 'incoming'
                    ? 'border-blue-100'
                    : 'border-green-100'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg flex-shrink-0 ${
                    conv.message_type === 'incoming'
                      ? 'bg-blue-50'
                      : 'bg-green-50'
                  }`}>
                    {conv.message_type === 'incoming' ? (
                      <ArrowDownCircle className="w-5 h-5 text-blue-600" />
                    ) : (
                      <ArrowUpCircle className="w-5 h-5 text-green-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {conv.message_type === 'incoming' ? '📩 Recibido' : '📤 Enviado (Bot)'}
                        <span className="text-gray-400 font-normal ml-2">{conv.phone_from}</span>
                      </p>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {new Date(conv.timestamp).toLocaleString('es-CL', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-gray-600 text-sm mt-1 break-words">{conv.message_text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
