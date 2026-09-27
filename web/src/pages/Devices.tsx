// Devices and accounts (EXPERIENCE §5.7).
import { useState } from 'react';
import { api } from '../api.ts';
import { ago, date, time } from '../fmt.ts';
import { ConnectMt5 } from '../ui/Connect.tsx';
import { Dot, Sheet, useToast } from '../ui/kit.tsx';
import { deviceStatus } from './Today.tsx';
import type { PageProps } from '../main.tsx';

const STATE_LABEL: Record<string, string> = {
  active: 'Active',
  not_seen: 'Not seen',
  ended: 'Ended',
  not_enforced: 'Not enforced',
};

export function Devices({ me, reload }: PageProps) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<{ kind: 'account' | 'device'; id: string; label: string; ended: boolean } | null>(null);
  const toast = useToast();
  const accounts = [...me.accounts].sort((a, b) => (a.state === 'ended' ? -1 : 0) - (b.state === 'ended' ? -1 : 0));

  async function remove() {
    if (!removing) return;
    const r = await api('DELETE', removing.kind === 'account' ? `/api/accounts/${removing.id}` : `/api/connections/${removing.id}`);
    setRemoving(null);
    toast(r.appliesAt === 'now' ? 'Removed. Slot freed.' : `Scheduled for ${time(r.appliesAt)}. Until then it stays protected.`);
    await reload();
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Devices</h1>
          <div className="small muted">{me.accounts.length} of 10 accounts</div>
        </div>
        <button className="primary" onClick={() => setAdding(!adding)}>{adding ? 'Close' : 'Add MT5'}</button>
      </div>

      {adding && (
        <div className="card">
          <h2>Add MT5</h2>
          <ConnectMt5 me={me} onConnected={() => void reload()} />
        </div>
      )}
      {!adding && me.connections.length === 0 && (
        <div className="card">
          <p>No devices yet. Connect MT5 to turn protection on.</p>
          <button className="primary" onClick={() => setAdding(true)}>Add MT5</button>
        </div>
      )}

      {me.connections.map((c) => {
        const st = deviceStatus(c);
        return (
          <div key={c.id} className="card">
            <div className="row between">
              <div className="row"><Dot kind={st.kind} /> <strong>{c.name}</strong></div>
              <span className="small muted">{st.label} · seen {ago(c.lastSeen)} {c.version ? `· v${c.version}` : ''}</span>
            </div>
            {c.unknownBuild && <p className="banner amber small" style={{ marginTop: 10 }}>This EA build isn't one we released. Reinstall DisciplineGuard for Windows from this page.</p>}
            {c.role === 'secondary' && <p className="small muted">Panel only. Another chart is doing the counting.</p>}
            {c.removalAt ? (
              <p className="small">Removal scheduled for {time(c.removalAt)}. It stays protected until then.</p>
            ) : (
              <button className="link small" onClick={() => setRemoving({ kind: 'device', id: c.id, label: c.name, ended: false })}>Remove device</button>
            )}
          </div>
        );
      })}

      {accounts.length > 0 && (
        <div className="card">
          <h2>Accounts</h2>
          <table className="data">
            <thead><tr><th>Account</th><th>State</th><th>Last seen</th><th /></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.nickname ? `${a.nickname} · ` : ''}{a.platform.toUpperCase()} · {a.server} · …{a.last3}{a.demo ? ' (demo)' : ''}</td>
                  <td>
                    {STATE_LABEL[a.state]}
                    {a.state === 'not_seen' && a.lastSeen ? ` since ${date(a.lastSeen)}` : ''}
                    {a.state === 'not_enforced' && <div className="small muted">This account already used a free trial with another login. Subscribe to protect it.</div>}
                  </td>
                  <td className="small muted">{ago(a.lastSeen)}</td>
                  <td>
                    {a.removalAt ? <span className="small">Removal {time(a.removalAt)}</span> : (
                      <button className="link small" onClick={() => setRemoving({ kind: 'account', id: a.id, label: `…${a.last3}`, ended: a.state === 'ended' })}>Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {me.accounts.length >= 10 && <p className="small">You've reached 10 accounts. Remove an account to add another. Ended accounts are removed at once.</p>}
        </div>
      )}

      {removing && (
        <Sheet label="Remove" onClose={() => setRemoving(null)}>
          <h2>Remove {removing.label}?</h2>
          <p>
            {removing.ended || me.user.setupMode
              ? 'This applies now.'
              : 'Removing is a loosening. It takes effect at your next day reset, or 12 hours from now if that is later. Until then this stays protected.'}
          </p>
          <div className="row">
            <button className="danger" onClick={remove}>Remove</button>
            <button onClick={() => setRemoving(null)}>Keep it</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
