// Owner dashboard: how many people use DisciplineGuard, and totals (server/src/owner.ts).
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { Stat } from '../ui/viz.tsx';

type Count = { k: string; n: number };

interface Metrics {
  users: { total: number; new7d: number; connected: number; active7d: number };
  accounts: Count[];
  week: { pauses: number; trades: number };
  tellMe: Count[];
  reports: Count[];
}

const list = (rows: Count[], none: string) => rows.map((r) => `${r.k} ${r.n}`).join(' · ') || none;

export function Owner() {
  const [m, setM] = useState<Metrics | null>(null);
  useEffect(() => {
    api<Metrics>('GET', '/api/owner/metrics').then(setM).catch(() => {});
  }, []);
  return (
    <div className="stack">
      <h1>Owner dashboard</h1>
      {!m ? <p className="muted">Loading…</p> : (
        <>
          <div className="grid four">
            <Stat label="Users" value={m.users.total} note={`${m.users.new7d} new this week`} />
            <Stat label="Connected" value={m.users.connected} note="a device turned on" />
            <Stat label="Active" value={m.users.active7d} note="a device seen this week" />
            <Stat label="Pauses" value={m.week.pauses} note={`${m.week.trades} trades this week`} />
          </div>
          <div className="card">
            <h2>Accounts</h2>
            <p>{list(m.accounts, 'None yet')}</p>
          </div>
          <div className="card">
            <h2>"Tell me when it's ready"</h2>
            <p className="small">{list(m.tellMe, 'None yet')}</p>
          </div>
          <div className="card">
            <h2>Problem reports</h2>
            <p className="small">{list(m.reports, 'None yet')}</p>
          </div>
        </>
      )}
    </div>
  );
}
