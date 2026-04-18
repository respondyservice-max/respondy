// lib/supabase.ts - CLIENTE SUPABASE
import { createClient } from '@supabase/supabase-js';

// Usamos fallbacks ("dummy") para que el compilador de Vercel no se rompa al analizar el archivo
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Para operaciones con service role (backend)
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_secret';
export const supabaseAdmin = createClient(supabaseUrl, serviceKey);
