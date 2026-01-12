
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase URL or Key is missing. Check your .env file.');
}

// Create a custom fetch that ignores AbortSignal to prevent AbortError
const customFetch: typeof fetch = (input, init?) => {
    // Remove the signal from init to prevent AbortError
    if (init?.signal) {
        const { signal, ...restInit } = init;
        console.log('🔧 [Supabase] Stripping AbortSignal from fetch request');
        return fetch(input, restInit);
    }
    return fetch(input, init);
};

// Create Supabase client with custom fetch
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
    global: {
        fetch: customFetch,
    }
});

// Debugging: attach to window
if (typeof window !== 'undefined') {
    (window as any).supabase = supabase;
}
