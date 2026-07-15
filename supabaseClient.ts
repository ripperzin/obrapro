
import { createClient } from '@supabase/supabase-js';

let supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// DEV: quando o Supabase é local (127.0.0.1/localhost) mas a página é acessada por
// outro host (ex.: celular na mesma rede via 192.168.x.x), aponta o backend para o
// mesmo host da página — senão o celular tentaria falar consigo mesmo ("Load failed").
// Só afeta URLs locais; produção (*.supabase.co) nunca é alterada.
try {
    if (supabaseUrl && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(supabaseUrl)) {
        const pageHost = typeof window !== 'undefined' ? window.location.hostname : '';
        if (pageHost && pageHost !== '127.0.0.1' && pageHost !== 'localhost') {
            supabaseUrl = supabaseUrl.replace(/127\.0\.0\.1|localhost/, pageHost);
        }
    }
} catch { /* noop */ }

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
