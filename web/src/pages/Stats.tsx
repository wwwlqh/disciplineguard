// Stats, Phase 1 (EXPERIENCE §5.8). Counts and facts only. Never money saved.
import { useEffect, useState } from 'react';
import { REASONS, RULE_NAMES, type RuleId, type TitleId } from '@dg/core';
import { api } from '../api.ts';
import { date } from '../fmt.ts';
import { Icon, RULE_ICON, type IconName } from '../ui/Icon.tsx';
import { Calendar, Columns, HBars, Ring, Stat, StackedBar, type DayCell } from '../ui/viz.tsx';
import type { PageProps } from '../main.tsx';

interface StatsData {
  days: number;
  pauses: number;
  byOutcome: Record<string, number>;
  byRule: Record<string, number>;
  byReason: Record<string, number>;
  byHour: number[];
  daysTraded: number;
  daysKept: number;
  cameBackDays: number;
  daily?: (DayCell & { entries: number; pauses: number })[];
  coverage: { outside: number; unprotected: number; unclassified: number; stopChanges: number; offEvents: number };
  baseline: { entries: number; from: number; to: number } | null;
}

const COVERAGE: [keyof StatsData['coverage'], string, IconName][] = [
  ['outside', 'Trades placed outside DisciplineGuard', 'phone'],
  ['unprotected', 'Trades placed while DisciplineGuard was off', 'shield'],
  ['offEvents', 'Times DisciplineGuard was turned off', 'alert'],
  ['stopChanges', 'Stops removed or widened', 'stop'],
  ['unclassified', "Orders we couldn't check", 'info'],
];

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

export function Stats({ me }: PageProps) {
  const [days, setDays] = useState(30);
  const [account, setAccount] = useState('');
  const [s, setS] = useState<StatsData | null>(null);
  useEffect(() => {
    api<StatsData>('GET', `/api/stats?days=${days}${account ? `&account=${account}` : ''}`).then(setS).catch(() => {});
  }, [days, account]);
  const skipped = (s?.byOutcome.skip ?? 0) + (s?.byOutcome.timeout ?? 0);
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Stats</h1>
          <div className="sub">Counts and facts from your pauses and trades.</div>
        </div>
        <div className="row">
          <select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Account">
            <option value="">All accounts</option>
            {me.accounts.map((a) => <option key={a.id} value={a.id}>{a.nickname ?? `${a.platform.toUpperCase()} …${a.last3}`}</option>)}
          </select>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>
      {!s ? <p className="muted">Loading…</p> : s.pauses === 0 && s.daysTraded === 0 ? (
        <div className="card">
          <div className="empty-state">
            <span className="tile accent"><Icon name="stats" size={22} /></span>
            <strong>Stats start after your first trading day</strong>
            <span className="small">Pauses, skips and days kept show up here.</span>
          </div>
        </div>
      ) : (
        <>
          <div className="grid four">
            <Stat icon="calendar" label="Days kept" value={<>{s.daysKept}<small> of {s.daysTraded}</small></>} note="days you traded" />
            <Stat icon="pause" label="Pauses" value={s.pauses} />
            <Stat icon="check" label="Skipped" value={skipped} note={s.pauses ? `${Math.round((skipped / s.pauses) * 100)}% of pauses` : undefined} />
            <Stat icon="refresh" label="Came back" value={s.cameBackDays} note="one placed anyway, then rules kept" />
          </div>

          {s.daily && s.daily.length > 0 && (
            <div className="card">
              <div className="card-head"><h2><Icon name="calendar" /> Days kept</h2></div>
              <div className="kept-card">
                <Ring value={s.daysKept} max={Math.max(1, s.daysTraded)} size={136} stroke={11} label={`Kept your rules on ${s.daysKept} of the ${s.daysTraded} days you traded`}>
                  <b>{s.daysKept}<small>/{s.daysTraded}</small></b>
                  <span>days kept</span>
                </Ring>
                <Calendar days={s.daily} span={days} />
              </div>
              <div className="cal-legend">
                <span><i style={{ background: 'var(--accent)' }} /> Rules kept</span>
                <span><i style={{ background: 'color-mix(in srgb, var(--amber) 80%, transparent)' }} /> A rule was broken</span>
                <span><i style={{ background: 'var(--track)' }} /> No trading</span>
              </div>
            </div>
          )}

          <div className="grid two">
            <div className="card">
              <div className="card-head"><h2><Icon name="pause" /> Pauses by outcome</h2></div>
              <StackedBar
                label="Pauses by outcome"
                parts={[
                  { key: 'skip', label: 'Skipped', value: s.byOutcome.skip ?? 0, tone: 'c1' },
                  { key: 'timeout', label: 'Timed out', value: s.byOutcome.timeout ?? 0, tone: 'c2' },
                  { key: 'place', label: 'Placed anyway', value: s.byOutcome.place ?? 0, tone: 'c3' },
                ]}
              />
            </div>
            <div className="card">
              <div className="card-head"><h2><Icon name="rules" /> Pauses by rule</h2></div>
              <HBars
                label="Pauses by rule"
                rows={Object.entries(s.byRule).sort((a, b) => b[1] - a[1]).map(([r, n]) => ({
                  key: r, label: RULE_NAMES[r as TitleId] ?? 'Check your plan', value: n, icon: RULE_ICON[r as RuleId] ?? 'pause',
                }))}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2><Icon name="clock" /> Pauses by hour of day</h2>{s.byHour.some((n) => n > 0) && <span className="small faint">Most at {hh(s.byHour.indexOf(Math.max(...s.byHour)))}</span>}</div>
            <Columns
              label="Pauses by hour of day"
              values={s.byHour}
              tick={(i) => (i % 6 === 0 || i === 23 ? String(i).padStart(2, '0') : null)}
              tip={(i, v) => `${hh(i)}–${hh((i + 1) % 24)} · ${v} ${v === 1 ? 'pause' : 'pauses'}`}
            />
            <table className="sr-only">
              <caption>Pauses by hour of day</caption>
              <tbody>{s.byHour.map((n, h) => <tr key={h}><th>{hh(h)}</th><td>{n}</td></tr>)}</tbody>
            </table>
          </div>

          <div className="grid two">
            {Object.keys(s.byReason).length > 0 && (
              <div className="card">
                <div className="card-head"><h2><Icon name="quote" /> Reasons you named</h2></div>
                <HBars
                  label="Reasons you named"
                  rows={Object.entries(s.byReason).sort((a, b) => b[1] - a[1]).map(([r, n]) => ({ key: r, label: REASONS.find(([id]) => id === r)?.[1] ?? r, value: n }))}
                />
              </div>
            )}
            <div className="card">
              <div className="card-head"><h2><Icon name="shield" /> Coverage</h2></div>
              <ul className="list">
                {COVERAGE.map(([k, label, icon]) => (
                  <li key={k} className="row between">
                    <span className="row"><span className={`tile ${s.coverage[k] ? 'amber' : ''}`} style={{ width: 30, height: 30, borderRadius: 9 }}><Icon name={icon} size={15} /></span>{label}</span>
                    <strong className="num">{s.coverage[k]}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {s.baseline && (
            <div className="card">
              <div className="card-head"><h2><Icon name="file" /> Your baseline (MT5)</h2></div>
              <p className="muted" style={{ margin: 0 }}>{s.baseline.entries} trades loaded ({date(s.baseline.from)} – {date(s.baseline.to)}). The comparison shows 3 weeks after you lock.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
