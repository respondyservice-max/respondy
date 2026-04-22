// app/dashboard/conversations/page.tsx - CONVERSACIONES (NUEVO DISEÑO + AUTO SCROLL)
'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardNav from '@/components/DashboardNav';
import { MessageSquare, ArrowLeft, Search, User, Send } from 'lucide-react';
import type { Business, Conversation } from '@/types';

export default function ConversationsPage() {
  const router = useRouter();
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [contactNames, setContactNames] = useState<Record<string, string>>({});

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
          .order('timestamp', { ascending: false });

        setConversations(convs || []);

        const { data: apps } = await supabase
          .from('appointments')
          .select('patient_phone, patient_name')
          .eq('business_id', biz.id);

        if (apps) {
          const names: Record<string, string> = {};
          apps.forEach(app => {
            if (app.patient_phone && app.patient_name) {
              const cleanPhone = app.patient_phone.replace(/\+/g, '').replace(/\s+/g, '');
              names[cleanPhone] = app.patient_name;
            }
          });
          setContactNames(names);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  // Auto-scroll al final del chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [selectedPhone, conversations]);

  // Agrupar mensajes por teléfono
  const contacts = useMemo(() => {
    const grouped: Record<string, { lastMessage: string; timestamp: string; phone: string }> = {};
    
    conversations.forEach(c => {
      if (!grouped[c.phone_from]) {
        grouped[c.phone_from] = {
          phone: c.phone_from,
          lastMessage: c.message_text,
          timestamp: c.timestamp
        };
      }
    });

    return Object.values(grouped).filter(contact => {
      const cleanPhone = contact.phone.replace(/\+/g, '').replace(/\s+/g, '');
      const name = contactNames[cleanPhone] || '';
      return contact.phone.includes(search) || 
             contact.lastMessage.toLowerCase().includes(search.toLowerCase()) ||
             name.toLowerCase().includes(search.toLowerCase());
    });
  }, [conversations, search, contactNames]);

  // Mensajes del contacto seleccionado
  const activeChatMessages = useMemo(() => {
    if (!selectedPhone) return [];
    return conversations
      .filter(c => c.phone_from === selectedPhone)
      .sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        
        if (timeA !== timeB) return timeA - timeB;
        
        // Si la hora es igual, el 'incoming' (cliente) va antes que el 'outgoing' (bot)
        return a.message_type === 'incoming' ? -1 : 1;
      })
      .slice(-6);
  }, [conversations, selectedPhone]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!business) return null;

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <DashboardNav business={business} />

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar: Lista de Contactos */}
        <aside className={`w-full sm:w-80 lg:w-96 bg-white border-r border-gray-100 flex flex-col ${selectedPhone ? 'hidden sm:flex' : 'flex'}`}>
          <div className="p-4 border-b border-gray-50">
            <h1 className="text-xl font-bold text-gray-900 mb-4">Conversaciones</h1>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition text-sm"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {contacts.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                No se encontraron contactos
              </div>
            ) : (
              contacts.map((contact) => (
                <button
                  key={contact.phone}
                  onClick={() => setSelectedPhone(contact.phone)}
                  className={`w-full p-4 flex items-start gap-3 border-b border-gray-50 transition hover:bg-gray-50 text-left ${
                    selectedPhone === contact.phone ? 'bg-blue-50/50 border-l-4 border-l-blue-600' : ''
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-gray-900 truncate text-sm">
                        {contact.phone} {contactNames[contact.phone.replace(/\+/g, '').replace(/\s+/g, '')] ? <span className="font-normal text-gray-500">({contactNames[contact.phone.replace(/\+/g, '').replace(/\s+/g, '')]})</span> : ''}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(contact.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{contact.lastMessage}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Área de Chat */}
        <section className={`flex-1 flex flex-col bg-white ${!selectedPhone ? 'hidden sm:flex' : 'flex'}`}>
          {selectedPhone ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-gray-100 flex items-center gap-4">
                <button onClick={() => setSelectedPhone(null)} className="sm:hidden p-2 -ml-2 text-gray-400">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">
                    {selectedPhone} {contactNames[selectedPhone.replace(/\+/g, '').replace(/\s+/g, '')] ? <span className="font-normal text-gray-500">- {contactNames[selectedPhone.replace(/\+/g, '').replace(/\s+/g, '')]}</span> : ''}
                  </h2>
                  <p className="text-[10px] text-green-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                    Activo por WhatsApp
                  </p>
                </div>
              </div>

              {/* Messages Area */}
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#f8f9fa] scroll-smooth">
                <div className="bg-blue-50 text-blue-800 text-xs text-center p-3 rounded-xl mb-4 border border-blue-100">
                  Mostrando los últimos 6 mensajes de la conversación. Si quieres ver el historial completo, revisa la app en tu teléfono.
                </div>
                {activeChatMessages.map((msg, idx) => (
                  <div key={msg.id} className={`flex ${msg.message_type === 'incoming' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-3 sm:p-4 shadow-sm relative ${
                      msg.message_type === 'incoming' 
                        ? 'bg-white text-gray-800 rounded-tl-none' 
                        : 'bg-blue-600 text-white rounded-tr-none'
                    }`}>
                      <p className="text-sm leading-relaxed">{msg.message_text}</p>
                      <span className={`text-[9px] mt-1 block text-right ${
                        msg.message_type === 'incoming' ? 'text-gray-400' : 'text-blue-200'
                      }`}>
                        {new Date(msg.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <MessageSquare className="w-10 h-10 text-gray-200" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Selecciona una conversación</h2>
              <p className="text-gray-500 max-w-xs mx-auto text-sm">
                Haz clic en uno de tus clientes a la izquierda para ver el historial completo de su chat con el bot.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
