// Today (EXPERIENCE §5.4).
import { useEffect, useState } from 'react';
import { placedWhere, RULE_NAMES, type TitleId } from '@dg/core';
import { api, type Connection, type Me } from '../api.ts';
import { ago, money, platformName, plural, time } from '../fmt.ts';
import { onLink } from '../router.ts';
import { DeletionBanner, Dot, Sheet, useToast, type StatusKind } from '../ui/kit.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { Gauge, Ring, Stat, WeekStrip, type DayCell } from '../ui/viz.tsx';
import type { PageProps } from '../main.tsx';

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
  if (kind === 'tz') return `Timezone: ${value}`;
  if (kind === 'reset') return 'Day reset';
  if (kind === 'default' || kind === 'acct') return ({ r5: 'Max position size', r5bet: 'Max bet', r6: 'Max risk per trade', r8: 'Daily loss limit' } as Record<string, string>)[sub ?? id] ?? `Account limit (${sub ?? id})`;
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
    <div className="card checkin">
      <span className="tile accent"><Icon name="target" /></span>
      <div className="checkin-text">
        <strong>Tighten for today only?</strong>
        <span className="small muted">Never looser than your rules.</span>
      </div>
      <div className="checkin-fields">
        <label className="check">
          <input type="checkbox" checked={useR1} onChange={(e) => setUseR1(e.target.checked)} />
          <span>Stop after <input className="tiny" inputMode="numeric" value={r1} onChange={(e) => setR1(e.target.value)} aria-label="Trades" /> trades</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={useR8} onChange={(e) => setUseR8(e.target.checked)} />
          <span>Stop after a loss of <input className="tiny" inputMode="decimal" value={r8} onChange={(e) => setR8(e.target.value)} aria-label="Loss" /></span>
        </label>
      </div>
      <div className="checkin-actions">
        <button className="primary" disabled={!ok} onClick={() => void apply()}>Tighten until {time(d.nextReset, d.now)}</button>
        <button className="ghost small" onClick={hide}>Not today</button>
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
  meters: { tradesToday: number; breaksToday: number; r1Max: number | null; cooldownUntil: number | null; breakUntil: number | null; doneUntil: number | null; hours: { open: boolean; next: number | null } | null };
  pending: { key: string; value: any; effectiveAt: number }[];
  /** Today's trades that broke a rule, newest first. */
  broken: { t: number; accountId: string | null; symbol?: string; side?: string; size?: number; label?: string; violations: string[] }[];
  coverage: { gaps: { accountId: string; last3: string; from: number; to: number; trades: number }[]; unclassified: number; off: { t: number; reason?: string; last3?: string }[] };
  week: { breaks: number; daysTraded: number; daysKept: number; keptToday: boolean; days?: DayCell[] };
  calibration: { rule: string; count: number } | null;
}


export function Today({ me, reload }: PageProps) {
  const [d, setD] = useState<TodayData | null>(null);
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
    toast(kind === 'break' ? `Break until ${time(r.until)}.` : `Done for today. A trade before ${time(r.until)} is marked as past your rule.`);
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
  const timer = d.meters.doneUntil ?? d.meters.breakUntil ?? d.meters.cooldownUntil;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Today</h1>
          <div className="sub"><Icon name="refresh" size={14} /> Resets {time(d.nextReset, d.now)}</div>
        </div>
      </div>

      <DeletionBanner me={me} reload={reload} />
      {d.setupMode && (
        <div className="banner">
          <span><Icon name="unlock" /> Setup mode: changes apply instantly{d.lockAt ? ` until ${time(d.lockAt, d.now)}` : ''}.</span>
          <a className="btn primary" href="/rules?lock=1" onClick={onLink}><Icon name="lock" size={16} /> Lock my rules</a>
        </div>
      )}
      {lic.state === 'past_due' && (
        <div className="banner amber">
          <span><Icon name="alert" /> Payment failed. Update your card by {time(lic.validUntil, d.now)}.</span>
          {me.user.updateCardUrl && <a className="btn primary" href={me.user.updateCardUrl}>Update card</a>}
        </div>
      )}
      {lic.enforcing && lic.validUntil - d.now <= 60 * 60_000 && !(lic.state === 'active' && !me.user.cancelAtPeriodEnd) && (
        <div className="banner amber">
          <span><Icon name="alert" /> Counting ends at {time(lic.validUntil, d.now)}.</span>
          <a className="btn" href="/plans" onClick={onLink}>See plans</a>
        </div>
      )}
      {r5Missing.map((a) => (
        <div key={a.id} className="banner amber">
          <span><Icon name="layers" /> Max size not set for {platformName(a.platform, a.server)} …{a.last3}.</span>
          <a className="btn" href="/rules#accounts" onClick={onLink}>Set it</a>
        </div>
      ))}
      {d.coverage.off.filter((o) => o.last3).map((o) => (
        <div key={o.t} className="banner amber"><span><Icon name="alert" /> Account …{o.last3} moved to another login. Not you? Check Devices.</span></div>
      ))}

      <HeroStatus d={d} onBreak={() => setConfirm('break')} onDone={() => setConfirm('done')} />

      {!noDevice && <CheckIn d={d} onDone={() => void load()} />}

      <div className="meters">
        <div className="card meter-card">
          {d.meters.r1Max ? (
            <Ring value={d.meters.tradesToday} max={d.meters.r1Max} tone={d.meters.tradesToday >= d.meters.r1Max ? 'amber' : 'accent'} label={`${d.meters.tradesToday} of ${d.meters.r1Max} trades today`}>
              <b>{d.meters.tradesToday}<small>/{d.meters.r1Max}</small></b>
              <span>trades</span>
            </Ring>
          ) : (
            <span className="tile accent big-tile"><b>{d.meters.tradesToday}</b></span>
          )}
          <div className="meter-text">
            <span className="eyebrow">Trades today</span>
            <strong>{tradesLine(d.meters.tradesToday, d.meters.r1Max)}</strong>
            <span className="small muted">Counts again from {time(d.nextReset, d.now)}</span>
          </div>
        </div>
        {d.accounts.filter((a) => a.r8On).map((a) => <LossMeter key={a.id} a={a} now={d.now} />)}
        {timer && (
          <div className="card meter-card">
            <span className="tile amber big-tile"><Icon name={d.meters.doneUntil ? 'moon' : d.meters.breakUntil ? 'coffee' : 'hourglass'} size={24} /></span>
            <div className="meter-text">
              <span className="eyebrow">{d.meters.doneUntil ? 'Done for today' : d.meters.breakUntil ? 'Break' : 'Cooldown'}</span>
              <strong>Until {time(timer, d.now)}, every trade is marked</strong>
            </div>
          </div>
        )}
        {d.meters.hours && (
          <div className="card meter-card">
            <span className={`tile big-tile ${d.meters.hours.open ? 'accent' : ''}`}><Icon name={d.meters.hours.open ? 'sun' : 'moon'} size={24} /></span>
            <div className="meter-text">
              <span className="eyebrow">Trading hours</span>
              <strong>{d.meters.hours.open ? 'Open now' : 'Closed'}</strong>
              {!d.meters.hours.open && d.meters.hours.next && <span className="small muted">Opens {time(d.meters.hours.next, d.now)}</span>}
            </div>
          </div>
        )}
      </div>

      <div className="split">
        <div className="card">
          <div className="card-head"><h2><Icon name="activity" /> Activity</h2><span className="small faint">{d.meters.breaksToday} past a rule</span></div>
          <TodayTimeline d={d} />
        </div>
        <div className="card">
          <div className="card-head"><h2><Icon name="calendar" /> This week</h2><a className="small" href="/stats" onClick={onLink}>Stats</a></div>
          {d.week.days && d.week.days.length > 0 && <WeekStrip days={d.week.days} today={d.now} />}
          <div className="kpis">
            <Stat label="Past a rule" value={d.week.breaks} />
            <Stat label="Days kept" value={<>{d.week.daysKept}<small> of {d.week.daysTraded}</small></>} />
          </div>
        </div>
      </div>

      {d.pending.length > 0 && (
        <div className="card">
          <div className="card-head"><h2><Icon name="clock" /> Scheduled changes</h2></div>
          <ul className="list">
            {d.pending.map((p) => (
              <li key={p.key} className="row between">
                <span>{pendingLabel(p.key, p.value)} <span className="faint">· from {time(p.effectiveAt, d.now)}</span></span>
                <button className="link" onClick={() => cancel(p.key)}>Cancel change</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.calibration && (
        <div className="banner neutral">
          <span><Icon name="info" /> {d.calibration.count} trades went past {RULE_NAMES[d.calibration.rule as TitleId] ?? d.calibration.rule} this week, more than any other rule. Is it set right?</span>
          <a className="btn" href="/rules" onClick={onLink}>Review rules</a>
        </div>
      )}

      {confirm && (
        <Sheet label="Confirm" onClose={() => setConfirm(null)}>
          <span className="tile amber sheet-icon"><Icon name={confirm === 'break' ? 'coffee' : 'moon'} /></span>
          <h2>{confirm === 'break' ? 'Take a 15-minute break?' : 'Done for today?'}</h2>
          <p className="muted">Until {confirm === 'break' ? time(d.now + 15 * 60_000, d.now) : time(d.nextReset, d.now)}, every trade is marked as past your rule. Can't be shortened.</p>
          <div className="row">
            <button className="primary" onClick={() => tighten(confirm)}>{confirm === 'break' ? 'Start the break' : "I'm done for today"}</button>
            <button onClick={() => setConfirm(null)}>Not now</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function tradesLine(n: number, max: number | null): string {
  if (!max) return plural(n, 'trade');
  if (n < max) return `${max - n} left before your limit`;
  if (n === max) return 'Limit reached';
  return `${n - max} over your limit`;
}

/** On, needs a look, or not running, with each device on one line. */
function HeroStatus({ d, onBreak, onDone }: { d: TodayData; onBreak(): void; onDone(): void }) {
  const st = d.connections.map((c) => ({ c, s: deviceStatus(c, d.now) }));
  const on = st.some((x) => x.s.kind === 'on');
  const kind = !d.license.enforcing || st.length === 0 ? 'off' : st.some((x) => x.s.kind === 'attention') ? 'attention' : on ? 'on' : 'off';
  const title = !d.license.enforcing ? 'Counting is off' : st.length === 0 ? 'Connect your platform' : kind === 'on' ? 'Counting' : kind === 'attention' ? 'Needs attention' : 'Not running';
  return (
    <div className="card hero-card">
      <div className={`shield-badge ${kind === 'on' ? '' : kind}`}>
        <Icon name={kind === 'on' ? 'shieldCheck' : kind === 'attention' ? 'alert' : 'shield'} size={30} strokeWidth={1.9} />
      </div>
      <div>
        <h2>{title}</h2>
        {st.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>Your rules apply once your platform is connected. <a href="/devices" onClick={onLink}>Connect now</a></p>
        ) : (
          <div className="devices">
            {st.map(({ c, s }) => (
              <span key={c.id}><Dot kind={s.kind} live={s.kind === 'on'} /> {c.name} <span className="faint">· {s.label} · {ago(c.lastSeen, d.now)}</span></span>
            ))}
          </div>
        )}
      </div>
      <div className="hero-actions">
        <button onClick={onBreak}><Icon name="coffee" size={16} /> 15-minute break</button>
        <button onClick={onDone}><Icon name="moon" size={16} /> Done for today</button>
      </div>
    </div>
  );
}

/** Loss today against the daily limit, for one account. */
function LossMeter({ a, now }: { a: TodayData['accounts'][number]; now: number }) {
  const cur = a.currency ?? 'USD';
  const name = a.nickname ?? `${platformName(a.platform, a.server)} …${a.last3}`;
  if (a.loss === null || a.limit === null) {
    return (
      <div className="card meter-card">
        <span className="tile big-tile"><Icon name="trendDown" size={24} /></span>
        <div className="meter-text">
          <span className="eyebrow">Loss today · {name}</span>
          <strong>Not read yet</strong>
          <span className="small muted">Shows once the account reports its balance.</span>
        </div>
      </div>
    );
  }
  const loss = Math.max(0, a.loss);
  const ratio = a.limit > 0 ? loss / a.limit : 0;
  return (
    <div className="card meter-card gauge-card">
      <span className="eyebrow">Loss today · {name}</span>
      <Gauge value={loss} max={a.limit} tone={ratio >= 1 ? 'danger' : ratio >= 0.75 ? 'amber' : 'accent'} label={`Loss today ${money(loss, cur)} of ${money(a.limit, cur)}`}>
        <b>{a.loss < 0 ? money(-a.loss, cur, true) : money(loss, cur)}</b>
        <span>{a.loss < 0 ? 'up today' : `of ${money(a.limit, cur)} limit`}</span>
      </Gauge>
      {a.inLimit && a.limitUntil && <span className="chip amber"><Icon name="moon" size={13} /> Rest until {time(a.limitUntil, now)}</span>}
    </div>
  );
}

/** Today's trades past a rule and gaps in one timeline, newest first. */
function TodayTimeline({ d }: { d: TodayData }) {
  type Item = { t: number; icon: IconName; tone: string; title: string; detail?: string; chip?: [string, string] };
  const items: Item[] = [
    ...d.broken.map((b): Item => ({
      t: b.t,
      icon: 'alert',
      tone: 'amber',
      title: RULE_NAMES[b.violations[0] as TitleId] ?? 'Past a rule',
      detail: [
        b.symbol ? `${b.side === 'sell' ? 'Sell' : 'Buy'} ${b.size ?? ''} ${b.symbol}`.replace(/\s+/g, ' ') + (placedWhere(b.label) ? ` ${placedWhere(b.label)}` : '') : '',
        b.violations.length > 1 ? `Also: ${b.violations.slice(1).map((v) => RULE_NAMES[v as TitleId] ?? v).join(', ')}` : '',
      ].filter(Boolean).join(' · ') || undefined,
      chip: ['Past a rule', 'amber'],
    })),
    ...d.coverage.gaps.map((g): Item => ({
      t: g.from,
      icon: 'alert',
      tone: 'amber',
      title: `DisciplineGuard was off on …${g.last3}`,
      detail: `${time(g.from, d.now)} to ${time(g.to, d.now)}${g.trades ? ` · ${plural(g.trades, 'trade')}` : ''}`,
    })),
  ].sort((a, b) => b.t - a.t);
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <span className="tile accent"><Icon name="check" size={22} /></span>
        <strong>No trade went past a rule today</strong>
        <span className="small">Every trade is counted. A trade that goes past a rule shows here.</span>
      </div>
    );
  }
  return (
    <>
      <ol className="timeline">
        {items.map((it, i) => (
          <li key={`${it.t}${i}`}>
            <span className={`tl-node ${it.tone}`}><Icon name={it.icon} size={16} /></span>
            <span className="tl-body">
              <strong>{it.title}</strong>
              {it.detail && <span>{it.detail}</span>}
              {it.chip && <span><span className={`chip ${it.chip[1]}`}>{it.chip[0]}</span></span>}
            </span>
            <span className="tl-time">{time(it.t, d.now)}</span>
          </li>
        ))}
      </ol>
      {d.coverage.unclassified > 0 && <p className="small muted" style={{ marginTop: 12 }}>Orders we couldn't check: {d.coverage.unclassified}.</p>}
    </>
  );
}
