import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);

// shiori と同じプロジェクトなので、このアプリのテーブルとRPCは zanryo スキーマを使う
export const supabase = createClient(url || 'http://localhost', key || 'missing', {
  db: { schema: 'zanryo' },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'zanryo-auth',
  },
});
