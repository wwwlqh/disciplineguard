// Small shared widgets: switch, toast, sheet, verdict line, status dot, practice pause.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { DAY, nextReset, type PausePlan, type Violation, type Order } from '@dg/core';
import { api, saveSetting, type Me, type Verdict } from '../api.ts';
import { coreFmt, inHours, time } from '../fmt.ts';
import { Pause } from './Pause.tsx';

export function Switch({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </span>
  );
}

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = (m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 4500);
  };
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export function Sheet({ children, onClose, label }: { children: ReactNode; onClose(): void; label: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

export type StatusKind = 'on' | 'setting_up' | 'attention' | 'off' | 'not_running';

export function Dot({ kind, live = false }: { kind: StatusKind; live?: boolean }) {
  return <span className={`dot ${kind}${live ? ' live' : ''}`} aria-hidden="true" />;
}

/** The live verdict line (EXPERIENCE §5.5), computed by the server with a dry run. */
export function useVerdict(key: string, value: unknown, enabled = true): Verdict | null {
  const [v, setV] = useState<Verdict | null>(null);
  const json = JSON.stringify(value);
  useEffect(() => {
    if (!enabled) return setV(null);
    let live = true;
    const id = setTimeout(() => {
      saveSetting(key, value, true)
        .then((r) => live && setV(r))
        .catch(() => live && setV(null));
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [key, json, enabled]);
  return v;
}

export function verdictText(v: Verdict, setupMode: boolean, now = Date.now()): string {
  if (v.direction === 'same') return 'No change.';
  if (v.appliesAt === 'now') return setupMode ? 'Setup mode: applies now.' : 'Tighter. Applies now.';
  if (setupMode) return `Setup mode: applies at ${time(v.appliesAt)}, 30 minutes after your last pause.`;
  return `Looser. Starts ${time(v.appliesAt)} (${inHours(v.appliesAt, now)}). Your current rule stays until then. You can cancel this change anytime.`;
}

export function VerdictLine({ v, setupMode }: { v: Verdict | null; setupMode: boolean }) {
  if (!v || v.direction === 'same') return null;
  const cls = setupMode ? 'setup' : v.appliesAt === 'now' ? 'stricter' : 'looser';
  return <div className={`verdict ${cls}`}>{verdictText(v, setupMode)}</div>;
}

/** The confirm button matches the verdict: "Apply now" or "Schedule change". */
export function applyLabel(v: Verdict | null): string {
  return v && v.appliesAt !== 'now' ? 'Schedule change' : 'Apply now';
}

/** A practice pause with the trader's own rules and wording, and an example order (SPEC §7.6). */
export function practice(me: Me): { plan: PausePlan; order: Order } {
  const r = me.rules;
  const now = Date.now();
  const reset = nextReset(me.time.userResets, now);
  const order: Order = { platform: 'mt5', account: 'practice', symbol: 'EURUSD', side: 'buy', size: 0.5, type: 'market', kind: 'entry', sl: 1.095 };
  let v: Violation | undefined;
  if (r.R8.on) v = { rule: 'R8', observed: 310, limit: 300, clearsAt: now + 12 * 3_600_000 };
  else if (r.R7.on) v = { rule: 'R7', observed: 4, limit: r.R7.minutes };
  else if (r.R1.on) v = { rule: 'R1', observed: r.R1.max + 1, limit: r.R1.max, clearsAt: reset };
  else if (r.R10.on) v = { rule: 'R10', observed: 1.2, limit: 0.8, fix: { size: 0.8 } };
  else if (r.R2.on) v = { rule: 'R2', observed: r.R2.max + 1, limit: r.R2.max };
  else if (r.R3.on) v = { rule: 'R3', observed: 2, limit: r.R3.count, clearsAt: now + 15_000 };
  else if (r.R4.on) v = { rule: 'R4', observed: 0, limit: 0, clearsAt: now + DAY / 3 };
  else if (r.R9.on) v = { rule: 'R9', observed: 0, limit: 0, fix: { addSl: true } };
  if (v?.rule === 'R9') order.sl = undefined;
  return {
    plan: { title: v?.rule ?? 'CHECK', violations: v ? [v] : [], waitSec: me.popup.wait, tradeNumber: 6, placedAnyway: 0 },
    order,
  };
}

export function PracticePause({ me, onClose }: { me: Me; onClose(): void }) {
  const [p] = useState(() => practice(me));
  return (
    <Pause
      practice
      plan={p.plan}
      order={p.order}
      fmt={coreFmt()}
      r3Seconds={me.rules.R3.seconds}
      keyboardPlace={me.popup.keyboardPlace}
      onDecision={onClose}
    />
  );
}

/** While a deletion is pending (EXPERIENCE §13.5): "Deletes Tue 02:00. [Cancel deletion]". */
export function DeletionBanner({ me, reload }: { me: Me; reload(): Promise<void> }) {
  if (!me.user.deletionAt) return null;
  return (
    <div className="banner amber">
      <span>Deletes {time(me.user.deletionAt)}.</span>
      <button onClick={async () => { await api('POST', '/api/account/delete/cancel'); await reload(); }}>Cancel deletion</button>
    </div>
  );
}
