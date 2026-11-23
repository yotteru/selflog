import { useEffect, useMemo, useRef, useState } from 'react';
import { estimate, type EstimateMode, type EstimateResult } from '../lib/api';
import { convertAmount, convertBasis, describeRecord, labelRecord, photoRecord, round1, toAmounts, type Basis, type Nutrients } from '../lib/capture';
import { formatDayLong } from '../lib/dayKey';
import { cropToJpeg, loadImage, type CropRect } from '../lib/image';
import type { Amounts, Entry, SummaryItem } from '../lib/types';
import { Cropper } from '../components/Cropper';

export interface CaptureResult {
  label: string;
  values: Amounts;
  source: Entry['source'];
  saveAsPreset: boolean;
}

const MODES: { id: EstimateMode; label: string; hint: string }[] = [
  { id: 'photo', label: '料理の写真', hint: '料理だけが入るように切り抜いてください' },
  { id: 'label', label: '成分表示', hint: '栄養成分表示の枠だけを切り抜いてください' },
  { id: 'receipt', label: 'レシート', hint: '品目と合計の部分だけを切り抜いてください（カード番号・会員番号などは入れない）' },
];

const REASONS: Record<string, string> = {
  daily_limit: '今日の推定回数の上限に達しました。手入力してください。',
  rate_limited: '今は推定できません（無料枠の上限）。少し待つか、手入力してください。',
  offline: 'オフラインのため推定できません。手入力してください。',
  not_member: 'このアプリの利用者として登録されていません。',
  bad_request: '写真を送れませんでした。手入力してください。',
  failed: 'うまく読み取れませんでした。手入力してください。',
};

const EMPTY: Nutrients = { kcal: 0, p: 0, f: 0, c: 0 };
const CENTER: CropRect = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };

function NumField({ label, value, onChange, step = 'any' }: { label: string; value: number; onChange: (n: number) => void; step?: string }) {
  // 表示は小数1桁まで（中の値は丸めない）
  const show = (v: number) => (v ? String(round1(v)) : '');
  const [text, setText] = useState(show(value));
  useEffect(() => {
    if (Number(text || 0) !== round1(value)) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="field">
      {label}
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step={step}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) && n >= 0 ? n : 0);
        }}
      />
    </label>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)} style={{ flex: 1 }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 撮影 → 切り抜き → 確認 → 記録（§5.2, モック Capture） */
export function Capture({
  day,
  isToday,
  items,
  onRecord,
  onClose,
}: {
  day: string;
  isToday: boolean;
  items: SummaryItem[];
  onRecord: (r: CaptureResult) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<EstimateMode>('photo');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [rect, setRect] = useState<CropRect>(CENTER);
  const [phase, setPhase] = useState<'pick' | 'crop' | 'estimating' | 'edit'>('pick');
  const [thumb, setThumb] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 下書き（どのモードでも手で直せる）
  const [name, setName] = useState('');
  const [vals, setVals] = useState<Nutrients>(EMPTY);
  const [servings, setServings] = useState(1);
  const [basis, setBasis] = useState<Basis>('per100g');
  const [unitLabel, setUnitLabel] = useState('1袋');
  const [unitGrams, setUnitGrams] = useState<number>(0);
  const [amount, setAmount] = useState(100);
  const [money, setMoney] = useState(0);
  const [receiptItems, setReceiptItems] = useState<{ name: string; price: number }[]>([]);
  const [saveAsPreset, setSaveAsPreset] = useState(true);

  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (img) URL.revokeObjectURL(img.src);
  }, [img]);

  function reset(m: EstimateMode) {
    setMode(m);
    setName('');
    setVals(EMPTY);
    setServings(1);
    setBasis('per100g');
    setUnitLabel('1袋');
    setUnitGrams(0);
    setAmount(100);
    setMoney(0);
    setReceiptItems([]);
    setSaveAsPreset(m !== 'receipt');
    setNotice('');
    setError('');
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const loaded = await loadImage(file);
      setImg(loaded);
      setRect(CENTER);
      setPhase('crop');
      setNotice('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function apply(r: EstimateResult) {
    if (!r.ok) {
      setNotice(REASONS[r.reason] ?? REASONS.failed);
      return;
    }
    if (r.mode === 'photo') {
      const { name: n, confidence, ...v } = r.draft;
      setName(n);
      setVals(v);
      setNotice(confidence === 'low' ? '自信の低い推定です。値を確かめてください。' : '');
    } else if (r.mode === 'label') {
      const { basis: b, unit_label, unit_grams, ...v } = r.draft;
      setVals(v);
      setBasis(b);
      setUnitLabel(b === 'per_unit' ? unit_label : '1袋');
      setUnitGrams(unit_grams ?? 0);
      setAmount(b === 'per100g' ? unit_grams ?? 100 : 1);
    } else {
      setName(r.draft.store);
      setMoney(r.draft.total);
      setReceiptItems(r.draft.items);
      if (!r.draft.total) setNotice(REASONS.failed);
    }
  }

  async function run() {
    if (!img) return;
    setPhase('estimating');
    setError('');
    try {
      const { base64, dataUrl } = await cropToJpeg(img, rect);
      setThumb(dataUrl);
      // 元の写真はもう使わない（端末のメモリからも外す）
      URL.revokeObjectURL(img.src);
      setImg(null);
      apply(await estimate(mode, base64));
    } catch (err) {
      setNotice(REASONS.failed);
      setError((err as Error).message);
    }
    setPhase('edit');
  }

  function manual() {
    if (img) URL.revokeObjectURL(img.src);
    setImg(null);
    setThumb('');
    setNotice('');
    setPhase('edit');
  }

  function switchBasis(to: Basis) {
    if (to === basis) return;
    const g = unitGrams > 0 ? unitGrams : null;
    const converted = convertBasis(vals, basis, to, g);
    if (!converted) {
      setError(`「${unitLabel}」が何gか入れると切り替えられます`);
      return;
    }
    setError('');
    setVals(converted);
    setAmount(convertAmount(amount, basis, to, g));
    setBasis(to);
  }

  const record = useMemo(() => {
    if (mode === 'receipt') return { money };
    const n = mode === 'photo' ? photoRecord(vals, servings) : labelRecord(vals, basis, amount);
    return { ...n, money };
  }, [mode, vals, servings, basis, amount, money]);

  const values = toAmounts(record, items);
  const empty = Object.keys(values).length === 0;

  async function submit() {
    setError('');
    if (empty) return setError('どれか1つは量を入れてください');
    const label = name.trim() || (mode === 'receipt' ? 'レシート' : mode === 'label' ? '成分表示' : '料理');
    setBusy(true);
    try {
      await onRecord({ label, values, source: mode, saveAsPreset: saveAsPreset && mode !== 'receipt' });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const hint = MODES.find((m) => m.id === mode)!.hint;

  return (
    <main className="screen">
      <header className="header" style={{ minHeight: 44 }}>
        <button type="button" className="link-btn" style={{ color: 'var(--ink)' }} onClick={onClose}>
          ‹ 戻る
        </button>
        <strong style={{ fontSize: 16 }}>確認して記録</strong>
        <span style={{ width: 52 }} />
      </header>
      {!isToday && <div className="banner">{formatDayLong(day)} の記録として保存します</div>}

      <Seg
        label="写真の種類"
        value={mode}
        options={MODES}
        onChange={(m) => {
          reset(m);
          // 読み取り済みの写真は別の種類として読み直せないので、撮り直しに戻す
          if (phase === 'edit' && thumb) {
            setThumb('');
            setPhase('pick');
          }
        }}
      />

      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={library} type="file" accept="image/*" hidden onChange={pick} />

      {phase === 'pick' && (
        <>
          <button type="button" className="photo-drop" onClick={() => camera.current?.click()}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            <span>タップして撮影</span>
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button type="button" className="link-btn" onClick={() => library.current?.click()}>
              写真から選ぶ
            </button>
            <button type="button" className="link-btn" onClick={manual}>
              写真なしで手入力
            </button>
          </div>
        </>
      )}

      {phase === 'crop' && img && (
        <>
          <Cropper src={img.src} rect={rect} onChange={setRect} />
          <p className="privacy">
            {hint}。枠の中だけが Google（Gemini）に送られます。無料枠では、送った画像が Google の製品改善に使われ、人が見ることがあります。
            人の顔や部屋の中、個人情報が枠に入らないようにしてください。
          </p>
          <button type="button" className="primary" onClick={run}>
            この範囲で読み取る
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button type="button" className="link-btn" onClick={() => camera.current?.click()}>
              撮り直す
            </button>
            <button type="button" className="link-btn" onClick={manual}>
              送らずに手入力
            </button>
          </div>
        </>
      )}

      {phase === 'estimating' && <div className="notice" style={{ padding: 40 }}>読み取っています…</div>}

      {phase === 'edit' && (
        <>
          {thumb && <img className="thumb" src={thumb} alt="送った範囲" />}
          {notice && <div className="banner" role="status">{notice}</div>}

          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span className="caption">
              {mode === 'receipt' ? 'レシートの読み取り（直せます）' : mode === 'label' ? '読み取った成分表示（直せます）' : 'Geminiの推定（大まかな値・直せます）'}
            </span>

            {mode !== 'label' && (
              <label className="field">
                {mode === 'receipt' ? '店名' : '料理名'}
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              </label>
            )}
            {mode === 'label' && (
              <label className="field">
                名前（プリセットの名前になります）
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：ポテトチップス" maxLength={80} />
              </label>
            )}

            {mode === 'label' && (
              <>
                <Seg
                  label="表示の基準"
                  value={basis}
                  options={[
                    { id: 'per100g', label: '100gあたり' },
                    { id: 'per_unit', label: `${unitLabel}あたり` },
                  ]}
                  onChange={switchBasis}
                />
                <div className="grid-fields">
                  <label className="field">
                    1つ分の呼び方
                    <input value={unitLabel} onChange={(e) => setUnitLabel(e.target.value || '1袋')} maxLength={10} />
                  </label>
                  <NumField label={`${unitLabel}は何g`} value={unitGrams} onChange={setUnitGrams} />
                </div>
              </>
            )}

            {mode !== 'receipt' && (
              <div className="grid-fields four">
                <NumField label="kcal" value={vals.kcal} onChange={(n) => setVals({ ...vals, kcal: n })} />
                <NumField label="P (g)" value={vals.p} onChange={(n) => setVals({ ...vals, p: n })} />
                <NumField label="F (g)" value={vals.f} onChange={(n) => setVals({ ...vals, f: n })} />
                <NumField label="C (g)" value={vals.c} onChange={(n) => setVals({ ...vals, c: n })} />
              </div>
            )}

            {mode === 'photo' && (
              <div className="row-between">
                <span>分量</span>
                <div className="stepper">
                  <button type="button" aria-label="分量を減らす" onClick={() => setServings(Math.max(0.5, servings - 0.5))}>
                    −
                  </button>
                  <strong>×{servings.toFixed(1)}</strong>
                  <button type="button" aria-label="分量を増やす" onClick={() => setServings(servings + 0.5)}>
                    ＋
                  </button>
                </div>
              </div>
            )}

            {mode === 'label' && (
              <div className="row-between">
                <span>食べた量</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    className="amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={amount || ''}
                    onChange={(e) => setAmount(Number(e.target.value) || 0)}
                    aria-label="食べた量"
                  />
                  <span className="caption">{basis === 'per100g' ? 'g' : `×${unitLabel.replace(/^1/, '')}`}</span>
                </span>
              </div>
            )}

            {mode === 'receipt' && receiptItems.length > 0 && (
              <ul className="receipt-items">
                {receiptItems.map((it, i) => (
                  <li key={i}>
                    <span>{it.name}</span>
                    <span>¥{it.price.toLocaleString('ja-JP')}</span>
                  </li>
                ))}
              </ul>
            )}

            <NumField label={mode === 'receipt' ? '合計（円）' : '使ったお金（円・任意）'} value={money} onChange={setMoney} step="1" />
          </section>

          <section className="card row-between">
            <span className="caption">記録する値</span>
            <strong>{describeRecord(record)}</strong>
          </section>

          {mode !== 'receipt' && (
            <label className="check">
              <input type="checkbox" checked={saveAsPreset} onChange={(e) => setSaveAsPreset(e.target.checked)} />
              プリセットに保存（次回からワンタップ）
            </label>
          )}
          {error && <div className="error" role="alert">{error}</div>}
          <button type="button" className="primary" onClick={submit} disabled={busy}>
            記録する
          </button>
          {thumb && (
            <button type="button" className="link-btn" onClick={() => { reset(mode); setThumb(''); setPhase('pick'); }}>
              撮り直す
            </button>
          )}
        </>
      )}
      {phase !== 'edit' && error && <div className="error" role="alert">{error}</div>}
    </main>
  );
}
