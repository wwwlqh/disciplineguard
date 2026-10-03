// Small shared widgets: switch, toast, sheet, verdict line, status dot.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, saveSetting, type Me, type Verdict } from '../api.ts';
import { inHours, time } from '../fmt.ts';

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
  if (setupMode) return `Setup mode: applies at ${time(v.appliesAt)}, 30 minutes after your last trade past a rule.`;
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
