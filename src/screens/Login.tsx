import { useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * ログイン
 * - ふだん：メールアドレス＋パスワード（ホーム画面のアプリでも使える）
 * - 初回だけ：Safari でメールのリンクを使ってログインし、アプリの中でパスワードを決める
 *   （ホーム画面のアプリはメールのリンクを受け取れないため。iOS の仕様）
 */
export function Login() {
  const [mode, setMode] = useState<'password' | 'link'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function loginWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError('メールアドレスかパスワードが違います（まだパスワードを決めていなければ、下の「はじめての方」から）');
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // shiori と同じプロジェクトなので、ここから新しいユーザーは作らない
        shouldCreateUser: false,
        emailRedirectTo: new URL(import.meta.env.BASE_URL, location.origin).toString(),
      },
    });
    setBusy(false);
    if (error) setError(error.message.includes('Signups not allowed') ? 'このメールアドレスのユーザーがいません' : error.message);
    else setSent(true);
  }

  const emailField = (
    <label className="field">
      メールアドレス
      <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
    </label>
  );

  return (
    <main className="screen login">
      <h1>残量</h1>
      {mode === 'password' ? (
        <form onSubmit={loginWithPassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {emailField}
          <label className="field">
            パスワード
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <div className="error" role="alert">{error}</div>}
          <button className="primary" disabled={busy}>
            ログイン
          </button>
          <button type="button" className="link-btn" onClick={() => { setMode('link'); setError(''); }}>
            はじめての方（パスワードをまだ決めていない）
          </button>
        </form>
      ) : sent ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p>
            {email} にメールを送りました。
            <br />
            <strong>この Safari で</strong>メールのリンクを開いてください。開くとログインした状態になるので、画面の下の「パスワードを決める」でパスワードを決めます。
          </p>
          <button type="button" className="link-btn" onClick={() => { setMode('password'); setSent(false); }}>
            戻る
          </button>
        </div>
      ) : (
        <form onSubmit={sendLink} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p>
            はじめの1回だけ、メールのリンクでログインしてパスワードを決めます。
            <br />
            ホーム画面のアプリではなく、<strong>Safari で</strong>このページを開いて進めてください。
          </p>
          {emailField}
          {error && <div className="error" role="alert">{error}</div>}
          <button className="primary" disabled={busy}>
            ログイン用のメールを送る
          </button>
          <button type="button" className="link-btn" onClick={() => { setMode('password'); setError(''); }}>
            パスワードでログインする
          </button>
        </form>
      )}
    </main>
  );
}
