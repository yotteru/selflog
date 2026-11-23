import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { bootstrap } from './lib/api';
import { configured, supabase } from './lib/supabase';
import { Login } from './screens/Login';
import { Home } from './screens/Home';

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) return;
    setReady(false);
    // 初回だけ既定のターゲットを作る（2回目以降は何もしない）。オフラインならそのまま進む
    bootstrap()
      .then(() => setReady(true))
      .catch((e: Error) => {
        if (!navigator.onLine || e.message.includes('fetch')) setReady(true);
        else setError(e.message);
      });
  }, [uid]);

  if (!configured) {
    return (
      <main className="screen login">
        <h1>設定がありません</h1>
        <p>VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してビルドしてください（.env.example）。</p>
      </main>
    );
  }
  if (session === undefined) return <main className="screen"><div className="notice">読み込み中…</div></main>;
  if (!session) return <Login />;
  if (error) {
    return (
      <main className="screen login">
        <h1>使えません</h1>
        <p>{error}</p>
        <button className="secondary" onClick={() => void supabase.auth.signOut()}>
          ログアウト
        </button>
      </main>
    );
  }
  if (!ready) return <main className="screen"><div className="notice">読み込み中…</div></main>;
  return <Home onSignOut={() => void supabase.auth.signOut()} />;
}
