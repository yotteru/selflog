import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Sheet } from './Sheet';

/** パスワードを決める・変える（ホーム画面のアプリでログインするため） */
export function PasswordSheet({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (pw.length < 12) return setError('12文字以上にしてください');
    if (pw !== pw2) return setError('2つのパスワードが同じではありません');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setError(error.message);
    else setDone(true);
  }

  return (
    <Sheet title="パスワードを決める" onClose={onClose}>
      {done ? (
        <>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            決めました。ホーム画面のアプリでは、メールアドレスとこのパスワードでログインしてください。
            <br />
            パスワード管理アプリ（iCloud キーチェーンなど）に保存しておくと安心です。
          </p>
          <button type="button" className="primary" onClick={onClose}>
            閉じる
          </button>
        </>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field">
            新しいパスワード（12文字以上）
            <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
          <label className="field">
            もう一度
            <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </label>
          {error && <div className="error" role="alert">{error}</div>}
          <button className="primary" disabled={busy}>
            決める
          </button>
        </form>
      )}
    </Sheet>
  );
}
