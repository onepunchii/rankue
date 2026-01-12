import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client with admin privileges (if SERVICE_ROLE_KEY provided)
// Or just regular client if using ANON_KEY (but limited by RLS)
// For internal server scripts (schedulers), we usually need to bypass RLS or use a user context.
// Ideally, use SERVICE_ROLE_KEY for admin tasks.

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Supabase credentials not found in environment variables.');
} else {
    const keyType = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE' : 'ANON';
    console.log(`✅ Supabase initialized with ${keyType} key`);
    console.log(`   URL: ${supabaseUrl}`);
    console.log(`   Key (first 20 chars): ${supabaseKey.substring(0, 20)}...`);
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});
