import { useCallback, useEffect, useState } from 'react';
import {
  addTarget,
  clearLocalData,
  deletePreset,
  geminiUsageToday,
  issueWidgetToken,
  listPresets,
  listTargets,
  reorder,
  revokeWidgetToken,
  savePreset,
  saveTarget,
  widgetTokenStatus,
  widgetUrl,
  type PresetRow,
  type Target,
  type WidgetTokenStatus,
} from '../lib/api';
import { fmt, presetSub, KIND_TAG, PERIOD_WORD } from '../lib/display';
import { queue } from '../lib/queueInstance';
import { move, renumber } from '../lib/reorder';
import type { Period, SummaryItem } from '../lib/types';
import { EntryForm, type FieldTarget } from '../components/EntryForm';
import { supabase } from '../lib/supabase';
import { Sheet } from '../components/Sheet';

const KEYED: Record<string, string> = { kcal: 'カロリー', p: 'タンパク質', f: '脂質', c: '炭水化物', money: '使えるお金' };

function when(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const asField = (t: Target): FieldTarget => ({ target_id: t.id, key: t.key, name: t.name, unit: t.unit });
const asSummary = (t: Target) => ({ target_id: t.id, key: t.key }) as SummaryItem;

function UpDown({ onUp, onDown, first, last, label }: { onUp: () => void; onDown: () => void; first: boolean; last: boolean; label: string }) {
  return (
    <span className="updown">
      <button type="button" onClick={onUp} disabled={first} aria-label={`${label}を上へ`}>
        ↑
      </button>
      <button type="button" onClick={onDown} disabled={last} aria-label={`${label}を下へ`}>
        ↓
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// ターゲット（§3.2, §5.4）
// ---------------------------------------------------------------------------

const PERIOD_HINT: Record<Period, string> = {
  day: '毎朝4:00に目標の量に戻ります。',
  week: '月曜の朝4:00に戻ります。その週のあいだ、残りが減っていきます（ホームに「今週の残り」と「今日の量」を出します）。',
  month: '毎月1日の朝4:00に戻ります。その月のあいだ、残りが減っていきます。',
};

function TargetSheet({ target, nextSort, onSaved, onClose }: { target: Target | null; nextSort: number; onSaved: () => void; onClose: () => void }) {
  const [name, setName] = useState(target?.name ?? '');
  const [unit, setUnit] = useState(target?.unit ?? '');
  const [kind, setKind] = useState<'reach' | 'cap'>(target?.kind ?? 'cap');
  const [period, setPeriod] = useState<Period>(target?.period ?? 'day');
  const [goal, setGoal] = useState(target ? String(target.daily_goal) : '');
  const [holidayGoal, setHolidayGoal] = useState(target?.holiday_goal == null ? '' : String(target.holiday_goal));
  const [active, setActive] = useState(target?.active ?? true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const keyed = Boolean(target?.key);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const g = Number(goal);
    if (!name.trim()) return setError('名前を入れてください');
    if (goal === '' || !Number.isFinite(g) || g < 0) return setError('目標は0以上の数で入れてください');
    const hg = holidayGoal.trim() === '' || period !== 'day' ? null : Number(holidayGoal);
    if (hg != null && (!Number.isFinite(hg) || hg < 0)) return setError('休日の目標は0以上の数で入れてください（同じなら空欄）');
    if (unit.length > 10) return setError('単位は10文字までです');
    setBusy(true);
    try {
      if (target) {
        await saveTarget({ id: target.id, name: name.trim(), unit: unit.trim(), kind, daily_goal: g, holiday_goal: hg, period, active });
      } else {
        await addTarget({ name: name.trim(), unit: unit.trim(), kind, daily_goal: g, holiday_goal: hg, period, sort: nextSort });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Sheet title={target ? 'ターゲットを直す' : 'ターゲットを追加'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="field">
          名前
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </label>
        <div className="field">
          目標の期間
          <div className="seg" role="group" aria-label="目標の期間">
            {(['day', 'week', 'month'] as const).map((p) => (
              <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} style={{ flex: 1 }}>
                {PERIOD_WORD[p].label}
              </button>
            ))}
          </div>
        </div>
        <p className="hint">{PERIOD_HINT[period]}</p>
        <div className="grid-fields two">
          <label className="field">
            {PERIOD_WORD[period].label}の目標
            <input type="number" inputMode="decimal" min="0" step="any" value={goal} onChange={(e) => setGoal(e.target.value)} />
          </label>
          <label className="field">
            単位
            <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={10} disabled={keyed} />
          </label>
        </div>
        {period === 'day' && (
          <>
            <label className="field">
              休日の目標（土日祝。平日と同じなら空欄）
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={holidayGoal}
                placeholder={goal ? `空欄なら ${goal}` : '空欄なら平日と同じ'}
                onChange={(e) => setHolidayGoal(e.target.value)}
              />
            </label>
            <p className="hint">有給や休日出勤の日は、ホームの日付の横の「平日／休日」をタップして切り替えられます。</p>
          </>
        )}
        <div className="field">
          種類
          <div className="seg" role="group" aria-label="種類">
            <button type="button" aria-pressed={kind === 'cap'} onClick={() => setKind('cap')} style={{ flex: 1 }}>
              上限（超えないようにする）
            </button>
            <button type="button" aria-pressed={kind === 'reach'} onClick={() => setKind('reach')} style={{ flex: 1 }}>
              到達（届かせる）
            </button>
          </div>
        </div>
        {target && (
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            使う（外すと今日から表示しない。過去の日はそのまま）
          </label>
        )}
        {keyed && <p className="hint">「{KEYED[target!.key!]}」は写真の読み取りや節約の計算で使うので、単位は変えられません。</p>}
        <p className="hint">目標や期間を変えると今日から反映されます。過去の日の目標は変わりません。</p>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="primary" disabled={busy}>
          保存する
        </button>
      </form>
    </Sheet>
  );
}

function TargetsSection({ onChanged }: { onChanged: () => void }) {
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [editing, setEditing] = useState<Target | 'new' | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setTargets(await listTargets());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function moveRow(i: number, dir: -1 | 1) {
    if (!targets) return;
    const next = renumber(move(targets, i, dir));
    const before = targets;
    setTargets(next);
    try {
      await reorder('targets', next, before);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
      setTargets(before);
    }
  }

  return (
    <section className="card settings-section" aria-labelledby="sec-targets">
      <h2 id="sec-targets">ターゲット</h2>
      {error && <div className="error">{error}</div>}
      {!targets ? (
        <div className="notice">読み込み中…</div>
      ) : (
        <ul className="settings-list">
          {targets.map((t, i) => (
            <li key={t.id} className={t.active ? '' : 'inactive'}>
              <button type="button" className="row-main" onClick={() => setEditing(t)}>
                <span className="title-row">
                  <span className="name">{t.name}</span>
                  <span className="tag">{KIND_TAG[t.kind]}</span>
                  {!t.active && <span className="tag">使っていない</span>}
                </span>
                <span className="meta">
                  {PERIOD_WORD[t.period].label} {t.key === 'money' ? `¥${fmt(t.daily_goal)}` : `${fmt(t.daily_goal)}${t.unit}`}
                  {t.period === 'day' && t.holiday_goal != null && `（休日 ${t.key === 'money' ? `¥${fmt(t.holiday_goal)}` : `${fmt(t.holiday_goal)}${t.unit}`}）`}
                </span>
              </button>
              <UpDown label={t.name} first={i === 0} last={i === targets.length - 1} onUp={() => moveRow(i, -1)} onDown={() => moveRow(i, 1)} />
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="secondary" onClick={() => setEditing('new')} disabled={!targets}>
        ＋ ターゲットを追加
      </button>
      {editing && (
        <TargetSheet
          target={editing === 'new' ? null : editing}
          nextSort={Math.max(0, ...(targets ?? []).map((t) => t.sort)) + 10}
          onSaved={() => {
            void load();
            onChanged();
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// プリセット（§5.4）
// ---------------------------------------------------------------------------

function PresetsSection() {
  const [presets, setPresets] = useState<PresetRow[] | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [editing, setEditing] = useState<PresetRow | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([listPresets(), listTargets()]);
      setPresets(p);
      setTargets(t);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const active = targets.filter((t) => t.active);
  const summaryItems = targets.map(asSummary);

  async function moveRow(i: number, dir: -1 | 1) {
    if (!presets) return;
    const next = renumber(move(presets, i, dir));
    const before = presets;
    setPresets(next);
    try {
      await reorder('presets', next, before);
    } catch (e) {
      setError((e as Error).message);
      setPresets(before);
    }
  }

  async function remove(p: PresetRow) {
    if (!window.confirm(`プリセット「${p.label}」を削除しますか？\nこれまでの記録は消えません。`)) return;
    try {
      await deletePreset(p.id);
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="card settings-section" aria-labelledby="sec-presets">
      <h2 id="sec-presets">プリセット</h2>
      <p className="hint">今日の画面のボタンは、よく使う順の上位3つ。「すべてのプリセット」はこの並び順です。</p>
      {error && <div className="error">{error}</div>}
      {!presets ? (
        <div className="notice">読み込み中…</div>
      ) : presets.length === 0 ? (
        <div className="notice">まだありません。記録するときに「プリセットに保存」で作れます。</div>
      ) : (
        <ul className="settings-list">
          {presets.map((p, i) => (
            <li key={p.id}>
              <button type="button" className="row-main" onClick={() => setEditing(p)}>
                <span className="name">{p.label}</span>
                <span className="meta">{presetSub(p.amounts, summaryItems)}</span>
              </button>
              <UpDown label={p.label} first={i === 0} last={i === presets.length - 1} onUp={() => moveRow(i, -1)} onDown={() => moveRow(i, 1)} />
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <EntryForm
          items={active.map(asField)}
          initial={{ label: editing.label, values: editing.amounts }}
          title="プリセットを直す"
          submitLabel="保存する"
          requireLabel
          onSubmit={async (r) => {
            // 使っていないターゲットの値は、画面に出していないのでそのまま残す
            const kept = Object.fromEntries(Object.entries(editing.amounts).filter(([id]) => !active.some((t) => t.id === id)));
            await savePreset({ id: editing.id, label: r.label, amounts: { ...kept, ...r.values } });
            await load();
          }}
          onDelete={() => remove(editing)}
          deleteLabel="このプリセットを削除する"
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// ウィジェット用トークン（§7）
// ---------------------------------------------------------------------------

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function WidgetSection() {
  const [status, setStatus] = useState<WidgetTokenStatus | null | undefined>(undefined);
  // 発行したトークンは、この画面を開いているあいだだけメモリに持つ（端末にも保存しない）
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await widgetTokenStatus());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => setToken('');
  }, [load]);

  async function issue() {
    const again = Boolean(status);
    if (again && !window.confirm('トークンを再発行しますか？\nいまのトークンは使えなくなるので、Scriptable の設定も新しいトークンに変えてください。')) return;
    setBusy(true);
    setError('');
    try {
      setToken(await issueWidgetToken());
      setCopied('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!window.confirm('トークンを無効にしますか？\nウィジェットに残量が出なくなります。')) return;
    setBusy(true);
    try {
      await revokeWidgetToken();
      setToken('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const url = widgetUrl();

  return (
    <section className="card settings-section" aria-labelledby="sec-widget">
      <h2 id="sec-widget">ウィジェット</h2>
      {status === undefined ? (
        <div className="notice">読み込み中…</div>
      ) : status ? (
        <p className="hint">
          トークン発行：{when(status.issued_at)} ／ 最後に使われた：{when(status.last_used_at)}
        </p>
      ) : (
        <p className="hint">トークンはまだありません。</p>
      )}

      {token && (
        <div className="token-box" role="status">
          <p className="hint strong">新しいトークン（この画面を閉じると二度と表示されません）</p>
          <code>{token}</code>
          <button type="button" className="secondary" onClick={async () => setCopied((await copy(token)) ? 'token' : 'fail')}>
            {copied === 'token' ? 'コピーしました' : 'トークンをコピー'}
          </button>
          <p className="hint">Scriptable の「URLとトークンを設定」に貼り付けてください。メモやチャットには貼らないでください。</p>
        </div>
      )}
      {copied === 'fail' && <div className="error">コピーできませんでした。長押しで選んでコピーしてください。</div>}

      <div className="field">
        ウィジェットの URL
        <code className="url">{url}</code>
        <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={async () => setCopied((await copy(url)) ? 'url' : 'fail')}>
          {copied === 'url' ? 'コピーしました' : 'URLをコピー'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      <button type="button" className="secondary" onClick={issue} disabled={busy || status === undefined}>
        {status ? 'トークンを再発行' : 'トークンを発行'}
      </button>
      {status && (
        <button type="button" className="link-btn danger" onClick={revoke} disabled={busy}>
          トークンを無効にする
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 写真の読み取り・アカウント
// ---------------------------------------------------------------------------

function UsageSection() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    void geminiUsageToday().then(setN);
  }, []);
  return (
    <section className="card settings-section" aria-labelledby="sec-usage">
      <h2 id="sec-usage">写真の読み取り</h2>
      <p className="hint">
        今日の読み取り回数：{n == null ? '—' : `${n}回`}（1日の上限はEdge Functionの設定。日付は太平洋時間の0時＝日本時間16〜17時に切り替わります）
      </p>
    </section>
  );
}

/** パスワードを変える（今のパスワードは聞かない）。シートを使わず、設定画面の中で入れる */
function PasswordSection() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setDone(false);
    if (pw.length < 12) return setError('12文字以上にしてください');
    if (pw !== pw2) return setError('2つのパスワードが同じではありません');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(error.message);
    setPw('');
    setPw2('');
    setDone(true);
  }

  return (
    <section className="card settings-section" aria-labelledby="sec-password">
      <h2 id="sec-password">パスワードを変える</h2>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label className="field">
          新しいパスワード（12文字以上）
          <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        <label className="field">
          もう一度
          <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        {done && (
          <p className="hint strong" role="status">
            変えました。次からは、メールアドレスとこのパスワードでログインしてください。
          </p>
        )}
        <button className="secondary" disabled={busy || !pw || !pw2}>
          {busy ? '変えています…' : 'パスワードを変える'}
        </button>
      </form>
    </section>
  );
}

function AccountSection({ onSignOut }: { onSignOut: () => void }) {
  function signOut() {
    const n = queue.unsentCount;
    const msg = n > 0 ? `未送信の記録が${n}件あります。ログアウトすると、この記録は消えます。ログアウトしますか？` : 'ログアウトしますか？';
    if (!window.confirm(msg)) return;
    // この端末に残した記録のコピーと未送信の記録を消してからログアウトする
    queue.clear();
    clearLocalData();
    onSignOut();
  }

  return (
    <section className="card settings-section" aria-labelledby="sec-account">
      <h2 id="sec-account">アカウント</h2>
      <button type="button" className="link-btn danger" onClick={signOut}>
        ログアウト
      </button>
    </section>
  );
}

/** 設定（§5.4） */
export function Settings({ onSignOut }: { onSignOut: () => void }) {
  const [changed, setChanged] = useState(false);
  // 版（commit の先頭7文字）と、作った日時（日本時間）。アプリが新しくなったかを確かめるため、画面の一番下に出す
  const versionText = `版 ${__APP_VERSION__}（${new Date(__APP_BUILT_AT__).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })} 作成）`;
  return (
    <div className="settings-screen">
      <header className="day-header">
        <h1>設定</h1>
      </header>
      {changed && <div className="notice">ターゲットの変更は、ホームに戻ると反映されます</div>}
      <TargetsSection onChanged={() => setChanged(true)} />
      <PresetsSection />
      <WidgetSection />
      <UsageSection />
      <PasswordSection />
      <AccountSection onSignOut={onSignOut} />
      <p className="settings-version">{versionText}</p>
    </div>
  );
}
