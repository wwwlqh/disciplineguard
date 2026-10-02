// Today (EXPERIENCE §5.4).
import { useEffect, useState } from 'react';
import { RULE_NAMES, type TitleId } from '@dg/core';
import { api, type Connection, type Me } from '../api.ts';
import { ago, money, plural, time } from '../fmt.ts';
import { onLink } from '../router.ts';
import { DeletionBanner, Dot, PracticePause, Sheet, useToast, type StatusKind } from '../ui/kit.tsx';
import type { PageProps } from '../main.tsx';

/** What "Close outside trades" did with an outside trade (SPEC §9.2). */
const AUTO_CLOSE: Record<string, string> = {
  pending: 'Closing it.',
  closed: 'DisciplineGuard closed it.',
  failed: "DisciplineGuard couldn't close it. Close it in MetaTrader.",
  kept: 'A stop loss was added in time. It counts.',
};

/** Maps what a device last reported to the status vocabulary (EXPERIENCE §8). */
export function deviceStatus(c: Connection, now = Date.now()): { kind: StatusKind; label: string } {
  if (c.offReason) return { kind: 'off', label: 'Off' };
  if (!c.lastSeen) return { kind: 'setting_up', label: 'Setting up' };
  if (now - c.lastSeen > 7 * 60_000) return { kind: 'not_running', label: 'Not running' };
  switch (c.status) {
    case 'needs_attention':
      return { kind: 'attention', label: 'Needs attention' };
    case 'setting_up':
      return { kind: 'setting_up', label: 'Setting up' };
    case 'off':
      return { kind: 'off', label: 'Off' };
    default:
      return { kind: 'on', label: c.role === 'secondary' ? 'On (panel only)' : 'On' };
  }
}

export function pendingLabel(key: string, value: any): string {
  const [kind, id, sub] = key.split(':');
  if (kind === 'rule') {
    const name = RULE_NAMES[id as TitleId] ?? id;
    if (!value?.on) return `${name}: turn off`;
    if (id === 'R1' || id === 'R2') return `${name}: ${value.max}`;
    if (id === 'R7' || id === 'R10') return `${name}: ${value.minutes} min`;
    return `${name}: changed`;
  }
  if (kind === 'acct' && sub === 'removed') return 'Remove an account';
  if (kind === 'conn') return 'Remove a device';
  if (kind === 'popup') return 'Popup settings';
  if (kind === 'closeOutside') return `Close outside trades: turn ${value ? 'on' : 'off'}`;
  if (kind === 'note') return value ? 'Edit a note' : 'Delete a note';
  if (kind === 'plan') return 'Your plan';
  if (kind === 'tz') return `Timezone: ${value}`;
  if (kind === 'reset') return 'Day reset';
  if (kind === 'default' || kind === 'acct') return `Account limit (${sub ?? id})`;
  return key;
}

const CHECKIN_KEY = 'dg_checkin';

/** Session check-in (EXPERIENCE §9.9): tighten for today only. Optional, dismissible, once per trading day. */
function CheckIn({ d, onDone }: { d: TodayData; onDone(): void }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(CHECKIN_KEY) === String(d.nextReset);
    } catch {
      return false;
    }
  });
  const [r1, setR1] = useState(String(d.tightenSuggest.r1));
  const [r8, setR8] = useState(String(d.tightenSuggest.r8));
  const [useR1, setUseR1] = useState(true);
  const [useR8, setUseR8] = useState(false);
  const toast = useToast();
  if (d.tighten || hidden) return null;
  const hide = () => {
    try {
      localStorage.setItem(CHECKIN_KEY, String(d.nextReset));
    } catch {}
    setHidden(true);
  };
  const ok = (useR1 && Number(r1) >= 1) || (useR8 && Number(r8) > 0);
  async function apply() {
    await api('POST', '/api/tighten-today', { r1: useR1 ? Number(r1) : undefined, r8: useR8 ? Number(r8) : undefined });
    toast(`Tighter until ${time(d.nextReset, d.now)}.`);
    onDone();
  }
  return (
    <div className="card">
      <div className="row between">
        <h2>Tighten for today only?</h2>
        <button className="link small" onClick={hide}>Not today</button>
      </div>
      <label className="check" style={{ marginBottom: 8 }}>
        <input type="checkbox" checked={useR1} onChange={(e) => setUseR1(e.target.checked)} />
        <span>Stop after <input className="narrow" inputMode="numeric" value={r1} onChange={(e) => setR1(e.target.value)} aria-label="Trades" /> trades</span>
      </label>
      <label className="check" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={useR8} onChange={(e) => setUseR8(e.target.checked)} />
        <span>Pause after a loss of <input className="narrow" inputMode="decimal" value={r8} onChange={(e) => setR8(e.target.value)} aria-label="Loss" /></span>
      </label>
      <div className="row">
        <button className="primary" disabled={!ok} onClick={() => void apply()}>Tighten until {time(d.nextReset, d.now)}</button>
        <span className="small muted">Never looser than your rules.</span>
      </div>
    </div>
  );
}

interface TodayData {
  now: number;
  nextReset: number;
  license: Me['license'];
  setupMode: boolean;
  lockAt: number | null;
  connections: Connection[];
  accounts: (Me['accounts'][number] & { loss: number | null; limit: number | null; r8On: boolean; inLimit: boolean; limitUntil: number | null })[];
  tighten: { r1?: number; r8?: number; until: number } | null;
  tightenSuggest: { r1: number; r8: number };
  meters: { tradesToday: number; r1Max: number | null; cooldownUntil: number | null; breakUntil: number | null; doneUntil: number | null; hours: { open: boolean; next: number | null } | null };
  pending: { key: string; value: any; effectiveAt: number }[];
  pauses: { t: number; title: string; decision: string; symbol?: string; side?: string; size?: number }[];
  outside: { t: number; accountId: string; symbol: string; label?: string; violations: string[]; unprotected: boolean; autoClose?: 'pending' | 'closed' | 'failed' | 'kept' | 'gone' | 'off' }[];
  coverage: { gaps: { accountId: string; last3: string; from: number; to: number; trades: number }[]; unclassified: number; off: { t: number; reason?: string; last3?: string }[] };
  week: { pauses: number; skipped: number; placed: number; daysTraded: number; daysKept: number; keptToday: boolean };
  calibration: { rule: string; count: number } | null;
}

const DECISION: Record<string, string> = { skip: 'Skipped', timeout: 'Skipped (timed out)', place: 'Placed anyway', reinit: 'Closed' };

export function Today({ me, reload }: PageProps) {
  const [d, setD] = useState<TodayData | null>(null);
  // The Windows app's "Try a practice pause" opens /today?practice.
  const [practice, setPractice] = useState(() => new URLSearchParams(location.search).has('practice'));
  const [confirm, setConfirm] = useState<'break' | 'done' | null>(null);
  const toast = useToast();

  const load = () => api<TodayData>('GET', '/api/today').then(setD).catch(() => {});
  useEffect(() => {
    void load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  async function tighten(kind: 'break' | 'done') {
    const r = await api('POST', kind === 'break' ? '/api/break' : '/api/done-today');
    setConfirm(null);
    toast(kind === 'break' ? `Break until ${time(r.until)}.` : `Done for today. Trades are paused until ${time(r.until)}.`);
    await load();
  }

  async function cancel(key: string) {
    await api('POST', '/api/settings/cancel', { key });
    toast('Cancelled. Your current rule stays.');
    await Promise.all([load(), reload()]);
  }

  if (!d) return <p className="muted">Loading…</p>;
  const lic = d.license;
  const noDevice = d.connections.length === 0;
  const r5Missing = me.rules.R5.on ? d.accounts.filter((a) => !a.r5Set) : [];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Today</h1>
          <div className="muted small">Resets {time(d.nextReset, d.now)}</div>
        </div>
        <button onClick={() => setPractice(true)}>Practice pause</button>
      </div>

      <DeletionBanner me={me} reload={reload} />
      {d.setupMode && (
        <div className="banner">
          <span>Setup mode: changes apply instantly{d.lockAt ? ` until ${time(d.lockAt, d.now)}` : ''}.</span>
          <a className="btn primary" href="/rules?lock=1" onClick={onLink}>Lock my rules</a>
        </div>
      )}
      {lic.state === 'past_due' && (
        <div className="banner amber">
          <span>Payment failed. Update your card by {time(lic.validUntil, d.now)}.</span>
          {me.user.updateCardUrl && <a className="btn primary" href={me.user.updateCardUrl}>Update card</a>}
        </div>
      )}
      {lic.enforcing && lic.validUntil - d.now <= 60 * 60_000 && !(lic.state === 'active' && !me.user.cancelAtPeriodEnd) && (
        <div className="banner amber">
          <span>Protection ends at {time(lic.validUntil, d.now)}.</span>
          <a className="btn" href="/plans" onClick={onLink}>See plans</a>
        </div>
      )}
      {r5Missing.map((a) => (
        <div key={a.id} className="banner amber">
          <span>Max size not set for {a.platform.toUpperCase()} …{a.last3}.</span>
          <a className="btn" href="/rules#accounts" onClick={onLink}>Set it</a>
        </div>
      ))}
      {d.coverage.off.filter((o) => o.last3).map((o) => (
        <div key={o.t} className="banner amber">Account …{o.last3} moved to another login. Not you? Check Devices.</div>
      ))}

      {!noDevice && <CheckIn d={d} onDone={() => void load()} />}

      <div className="card">
        <h2>Devices</h2>
        {noDevice ? (
          <p className="muted">No devices yet. <a href="/devices" onClick={onLink}>Connect MT5</a></p>
        ) : (
          <ul className="list">
            {d.connections.map((c) => {
              const st = deviceStatus(c, d.now);
              return (
                <li key={c.id} className="row between">
                  <span className="row"><Dot kind={st.kind} /> {c.name}</span>
                  <span className="small muted">{st.label} · seen {ago(c.lastSeen, d.now)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="grid three">
        <div className="card meter">
          <span className="small muted">Trades today</span>
          <span className="value num">{d.meters.r1Max ? (d.meters.tradesToday > d.meters.r1Max ? `${d.meters.tradesToday} · limit ${d.meters.r1Max}` : `${d.meters.tradesToday} of ${d.meters.r1Max}`) : d.meters.tradesToday}</span>
          {d.meters.r1Max && <div className="bar"><i style={{ width: `${Math.min(100, (d.meters.tradesToday / d.meters.r1Max) * 100)}%` }} /></div>}
        </div>
        {d.accounts.filter((a) => a.r8On).map((a) => (
          <div key={a.id} className="card meter">
            <span className="small muted">Loss today · {a.nickname ?? `…${a.last3}`}</span>
            <span className="value num">{a.loss !== null && a.limit !== null ? `Loss ${money(-a.loss, a.currency ?? 'USD', true)} of ${money(a.limit, a.currency ?? 'USD')}` : 'Not read yet'}</span>
                        {a.inLimit && a.limitUntil && <span className="small">Rest until {time(a.limitUntil, d.now)}</span>}
          </div>
        ))}
        {(d.meters.cooldownUntil || d.meters.breakUntil || d.meters.doneUntil) && (
          <div className="card meter">
            <span className="small muted">{d.meters.doneUntil ? 'Done for today' : d.meters.breakUntil ? 'Break' : 'Cooldown'}</span>
            <span className="value num">until {time((d.meters.doneUntil ?? d.meters.breakUntil ?? d.meters.cooldownUntil)!, d.now)}</span>
          </div>
        )}
        {d.meters.hours && (
          <div className="card meter">
            <span className="small muted">Trading hours</span>
            <span className="value">{d.meters.hours.open ? 'Open' : 'Closed'}</span>
            {!d.meters.hours.open && d.meters.hours.next && <span className="small">Next: {time(d.meters.hours.next, d.now)}</span>}
          </div>
        )}
      </div>

      <div className="row">
        <button onClick={() => setConfirm('break')}>Take a 15-minute break</button>
        <button onClick={() => setConfirm('done')}>Done for today</button>
      </div>

      {d.pending.length > 0 && (
        <div className="card">
          <h2>Scheduled changes</h2>
          <ul className="list">
            {d.pending.map((p) => (
              <li key={p.key} className="row between">
                <span>{pendingLabel(p.key, p.value)} · from {time(p.effectiveAt, d.now)}</span>
                <button className="link" onClick={() => cancel(p.key)}>Cancel change</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>Today's pauses</h2>
        {d.pauses.length === 0 ? (
          <p className="muted">No pauses yet.</p>
        ) : (
          <ul className="list">
            {d.pauses.map((p) => (
              <li key={p.t} className="row between">
                <span>{time(p.t, d.now)} · {RULE_NAMES[p.title as TitleId] ?? 'Check your plan'}{p.symbol ? ` · ${p.side === 'sell' ? 'Sell' : 'Buy'} ${p.symbol}` : ''}</span>
                <span className="small muted">{DECISION[p.decision] ?? p.decision}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(d.coverage.gaps.length > 0 || d.outside.length > 0 || d.coverage.unclassified > 0) && (
        <div className="card">
          <h2>Coverage</h2>
          <ul className="list">
            {d.coverage.gaps.map((g) => (
              <li key={`${g.accountId}${g.from}`}>DisciplineGuard was off on …{g.last3} from {time(g.from, d.now)} to {time(g.to, d.now)}{g.trades ? ` (${plural(g.trades, 'trade')})` : ''}.</li>
            ))}
            {d.outside.filter((o) => o.violations.length > 0).map((o) => (
              <li key={o.t}>{time(o.t, d.now)} · Outside trade{o.label ? ` (${o.label})` : ''} went past {o.violations.map((v) => `"${RULE_NAMES[v as TitleId] ?? v}"`).join(', ')}. {AUTO_CLOSE[o.autoClose ?? ''] ?? 'It counts.'}</li>
            ))}
            {d.coverage.unclassified > 0 && <li>Orders we couldn't check: {d.coverage.unclassified}.</li>}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>This week</h2>
        <div className="grid three">
          <div><div className="stat num">{d.week.pauses}</div><div className="small muted">pauses</div></div>
          <div><div className="stat num">{d.week.skipped}</div><div className="small muted">skipped</div></div>
          <div><div className="stat num">{d.week.placed}</div><div className="small muted">placed anyway</div></div>
          <div><div className="stat num">{d.week.daysKept} of {d.week.daysTraded}</div><div className="small muted">days kept</div></div>
        </div>
      </div>

      {d.calibration && (
        <div className="banner neutral">
          <span>{RULE_NAMES[d.calibration.rule as TitleId] ?? d.calibration.rule} paused {d.calibration.count} trades this week, mostly placed anyway or in your plan. Limit wrong? Change it.</span>
          <a className="btn" href="/rules" onClick={onLink}>Review rules</a>
        </div>
      )}

      {me.user.reasonAsked && me.user.reasonConsent === null && (
        <div className="banner neutral">
          <span>Save the reasons you pick? Only you see them, in your stats.</span>
          <span className="row">
            <button className="primary" onClick={() => void api('PUT', '/api/prefs', { reasonConsent: true }).then(reload)}>Save my reasons</button>
            <button onClick={() => void api('PUT', '/api/prefs', { reasonConsent: false }).then(reload)}>Don't save</button>
          </span>
        </div>
      )}

      {confirm && (
        <Sheet label="Confirm" onClose={() => setConfirm(null)}>
          <h2>{confirm === 'break' ? 'Take a 15-minute break?' : 'Done for today?'}</h2>
          <p>New trades pause until {confirm === 'break' ? time(d.now + 15 * 60_000, d.now) : time(d.nextReset, d.now)}. Can't be shortened.</p>
          <div className="row">
            <button className="primary" onClick={() => tighten(confirm)}>{confirm === 'break' ? 'Start the break' : "I'm done for today"}</button>
            <button onClick={() => setConfirm(null)}>Not now</button>
          </div>
        </Sheet>
      )}
      {practice && <PracticePause me={me} onClose={() => setPractice(false)} />}
    </div>
  );
}
