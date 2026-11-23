import { useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * ログイン（メールのマジックリンク。§8）
 * ホーム画面に追加した PWA では、メールのリンクが Safari で開いてしまい、PWA 側はログインできない（iOS の仕様）。
 * そのため、メールに書かれた確認コードをここに入れてもログインできるようにしている。
 */
export function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
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

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError('コードが違うか、期限が切れています');
  }

  return (
    <main className="screen login">
      <h1>残量</h1>
      {!sent ? (
        <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p>メールアドレスにログイン用のメールを送ります。</p>
          <label className="field">
            メールアドレス
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <div className="error" role="alert">{error}</div>}
          <button className="primary" disabled={busy}>
            メールを送る
          </button>
        </form>
      ) : (
        <form onSubmit={verify} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p>
            {email} にメールを送りました。
            <br />
            メールに確認コードが書かれていれば、ここに入れてください。リンクを開いてもログインできます（ホーム画面のアプリでは、コードのほうが確実です）。
          </p>
          <label className="field">
            確認コード
            <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          {error && <div className="error" role="alert">{error}</div>}
          <button className="primary" disabled={busy || code.trim().length < 6}>
            ログイン
          </button>
          <button type="button" className="link-btn" onClick={() => setSent(false)}>
            メールアドレスを変える
          </button>
        </form>
      )}
    </main>
  );
}
