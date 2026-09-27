// Owner dashboard: how people use the product (SPEC §14).
import { useEffect, useState } from 'react';
import { api } from '../api.ts';

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

const v = (x: unknown) => (x === null || x === undefined ? '—' : String(x));

export function Owner() {
  const [platform, setPlatform] = useState('');
  const [m, setM] = useState<any>(null);
  useEffect(() => {
    setM(null);
    api('GET', `/api/owner/metrics${platform ? `?platform=${platform}` : ''}`).then(setM).catch(() => {});
  }, [platform]);
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Owner dashboard</h1>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform">
          <option value="">All platforms</option><option value="mt5">MT5</option><option value="tv">TradingView</option><option value="mt4">MT4</option>
        </select>
      </div>
      {!m ? <p className="muted">Loading…</p> : (
        <div className="grid two">
          <Panel title="Funnel">
            <p>Sign-ups {m.funnel.signups} · connected {m.funnel.connected} · <strong>activated {m.funnel.activated}</strong></p>
          </Panel>
          <Panel title="Safety">
            <p>Guarded exits <strong>{m.safety.guardedExits}</strong> · "should not have been paused" reports {m.safety.safetyReports}</p>
          </Panel>
          <Panel title="Behavior">
            <p>Pauses {m.behavior.pauses} · held {m.behavior.held} ({v(m.behavior.heldRate)}%)</p>
            <p>Bypass rate {v(m.behavior.bypassRate)}% · displacement {v(m.behavior.displacement)}% · skip rate {v(m.behavior.skipRate)}% (diagnostic)</p>
            <p>Reactance (off within 24 h of a pause): {m.behavior.reactanceUsers} users</p>
          </Panel>
          <Panel title="Retention">
            <p>{m.retention.retained} of {m.retention.eligible} eligible ({v(m.retention.rate)}%) · kept on, not working: {m.retention.keptOnNotWorking}</p>
          </Panel>
          <Panel title="Payment">
            <p>Trials ended {m.payment.trialsEnded} · paid {m.payment.paidUsers} (early-bird {m.payment.paidEarlyBird}, list {m.payment.paidList})</p>
            <p>Trial → paid {v(m.payment.trialToPaid)}% · activated → paid {v(m.payment.activatedToPaid)}%</p>
            <p className="small muted">By country: {m.payment.byCountry.map((c: any) => `${c.country} ${c.n}`).join(' · ') || '—'}</p>
          </Panel>
          <Panel title="Speed">
            <p>Panel entries {m.speed.panelEntries} · possibly delayed {m.speed.delayedClicks} ({v(m.speed.delayedShare)}%)</p>
          </Panel>
          <Panel title="Support load">
            <p>Reports per 100 active users: {v(m.support.per100)} (active in 7 days: {m.support.activeUsers7d})</p>
            <p className="small muted">{m.support.reports.map((r: any) => `${r.type} ${r.n}`).join(' · ') || 'No reports'}</p>
          </Panel>
          <Panel title="Setup failures (30 days)">
            <p className="small">{m.setupFailures.map(([k, n]: [string, number]) => `${k} ${n}`).join(' · ') || 'None reported'}</p>
          </Panel>
          <Panel title="&quot;Tell me when it's ready&quot;">
            <p className="small">{m.tellMe.map((t: any) => `${t.platform} ${t.n}`).join(' · ') || 'None yet'}</p>
          </Panel>
        </div>
      )}
    </div>
  );
}
