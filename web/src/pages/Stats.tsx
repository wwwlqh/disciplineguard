// Stats, Phase 1 (EXPERIENCE §5.8). Counts and facts only. Never money saved.
import { useEffect, useState } from 'react';
import { REASONS, RULE_NAMES, type TitleId } from '@dg/core';
import { api } from '../api.ts';
import { date } from '../fmt.ts';
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
  coverage: { outside: number; unprotected: number; unclassified: number; stopChanges: number; offEvents: number };
  baseline: { entries: number; from: number; to: number } | null;
}

export function Stats({ me }: PageProps) {
  const [days, setDays] = useState(30);
  const [account, setAccount] = useState('');
  const [s, setS] = useState<StatsData | null>(null);
  useEffect(() => {
    api<StatsData>('GET', `/api/stats?days=${days}${account ? `&account=${account}` : ''}`).then(setS).catch(() => {});
  }, [days, account]);
  const maxHour = Math.max(1, ...(s?.byHour ?? [1]));
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Stats</h1>
        <div className="row">
          <select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Account">
            <option value="">All accounts</option>
            {me.accounts.map((a) => <option key={a.id} value={a.id}>{a.nickname ?? `${a.platform.toUpperCase()} …${a.last3}`}</option>)}
          </select>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
            <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
          </select>
        </div>
      </div>
      {!s ? <p className="muted">Loading…</p> : s.pauses === 0 && s.daysTraded === 0 ? (
        <div className="card"><p className="muted">Stats start after your first trading day.</p></div>
      ) : (
        <>
          <div className="card">
            <h2>Days kept</h2>
            <p className="stat">Kept your rules on {s.daysKept} of the {s.daysTraded} days you traded</p>
            {s.cameBackDays > 0 && <p className="muted">{s.cameBackDays} {s.cameBackDays === 1 ? 'day' : 'days'} with one trade placed anyway, then rules kept.</p>}
          </div>
          <div className="grid two">
            <div className="card">
              <h2>Pauses by outcome</h2>
              <ul className="list">
                <li className="row between"><span>Skipped</span><strong className="num">{s.byOutcome.skip ?? 0}</strong></li>
                <li className="row between"><span>Timed out</span><strong className="num">{s.byOutcome.timeout ?? 0}</strong></li>
                <li className="row between"><span>Placed anyway</span><strong className="num">{s.byOutcome.place ?? 0}</strong></li>
              </ul>
            </div>
            <div className="card">
              <h2>Pauses by rule</h2>
              <ul className="list">
                {Object.entries(s.byRule).sort((a, b) => b[1] - a[1]).map(([r, n]) => (
                  <li key={r} className="row between"><span>{RULE_NAMES[r as TitleId] ?? 'Check your plan'}</span><strong className="num">{n}</strong></li>
                ))}
              </ul>
            </div>
          </div>
          {Object.keys(s.byReason).length > 0 && (
            <div className="card">
              <h2>Reasons you named</h2>
              <ul className="list">
                {Object.entries(s.byReason).sort((a, b) => b[1] - a[1]).map(([r, n]) => (
                  <li key={r} className="row between"><span>{REASONS.find(([id]) => id === r)?.[1] ?? r}</span><strong className="num">{n}</strong></li>
                ))}
              </ul>
            </div>
          )}
          <div className="card">
            <h2>Pauses by hour of day</h2>
            <div className="bars" role="img" aria-label="Pauses by hour of day">
              {s.byHour.map((n, h) => <i key={h} style={{ height: `${(n / maxHour) * 100}%` }} title={`${h}:00 · ${n}`} />)}
            </div>
            <div className="row between small faint"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
          </div>
          <div className="card">
            <h2>Coverage</h2>
            <ul className="list">
              <li className="row between"><span>Trades placed outside DisciplineGuard</span><strong>{s.coverage.outside}</strong></li>
              <li className="row between"><span>Trades placed while DisciplineGuard was off</span><strong>{s.coverage.unprotected}</strong></li>
              <li className="row between"><span>Times DisciplineGuard was turned off</span><strong>{s.coverage.offEvents}</strong></li>
              <li className="row between"><span>Stops removed or widened</span><strong>{s.coverage.stopChanges}</strong></li>
              <li className="row between"><span>Orders we couldn't check</span><strong>{s.coverage.unclassified}</strong></li>
            </ul>
          </div>
          {s.baseline && (
            <div className="card">
              <h2>Your baseline (MT5)</h2>
              <p className="muted">{s.baseline.entries} trades loaded ({date(s.baseline.from)} – {date(s.baseline.to)}). The comparison shows 3 weeks after you lock.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
