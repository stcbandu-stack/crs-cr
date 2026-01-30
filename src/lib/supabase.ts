import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://crogaiqfxaaydpfmoqbc.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_85_6DqvJkJo3t93qH0K31A_PbGQIaRw';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

export default supabase;
