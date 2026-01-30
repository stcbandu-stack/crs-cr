import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase credentials missing! Please check .env file or Vercel Environment Variables.');
}

export const supabase: SupabaseClient = createClient(supabaseUrl || '', supabaseKey || '');

export default supabase;
