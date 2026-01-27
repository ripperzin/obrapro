
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL and Anon Key must be provided in .env.local');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        // Prevent aggressive session refresh on visibility change
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        // Disable auto-refresh based on visibility change
        // This prevents re-renders when switching tabs
    },
    global: {
        // Optional: Configure fetch behavior
    }
});
