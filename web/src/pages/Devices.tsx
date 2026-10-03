// Devices and accounts (EXPERIENCE §5.6).
import { useState } from 'react';
import { api } from '../api.ts';
import { ago, date, platformName, time } from '../fmt.ts';
import { ConnectBrowser, ConnectMt5 } from '../ui/Connect.tsx';
import { Dot, Sheet, useToast } from '../ui/kit.tsx';
import { Icon } from '../ui/Icon.tsx';
import { deviceStatus } from './Today.tsx';
import { onLink } from '../router.ts';
import type { PageProps } from '../main.tsx';

const STATE_LABEL: Record<string, string> = {
  active: 'Active',
  not_seen: 'Not seen',
  ended: 'Ended',
};

export function Devices({ me, reload }: PageProps) {
  const [adding, setAdding] = useState<'mt5' | 'browser' | null>(null);
  const toggle = (k: 'mt5' | 'browser') => setAdding(adding === k ? null : k);
  const [removing, setRemoving] = useState<{ kind: 'account' | 'device'; id: string; label: string; ended: boolean } | null>(null);
  const toast = useToast();
  const accounts = [...me.accounts].sort((a, b) => (a.state === 'ended' ? -1 : 0) - (b.state === 'ended' ? -1 : 0));

  async function remove() {
    if (!removing) return;
    const r = await api('DELETE', removing.kind === 'account' ? `/api/accounts/${removing.id}` : `/api/connections/${removing.id}`);
    setRemoving(null);
    toast(r.appliesAt === 'now' ? 'Removed.' : `Removed at ${time(r.appliesAt)}.`);
    await reload();
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Devices</h1>
          <div className="sub">{me.accounts.length} of 10 accounts</div>
        </div>
        <div className="row">
          <button onClick={() => toggle('browser')}><Icon name={adding === 'browser' ? 'x' : 'globe'} size={16} /> {adding === 'browser' ? 'Close' : 'Add TradingView, Polymarket, Kalshi'}</button>
          <button className="primary" onClick={() => toggle('mt5')}><Icon name={adding === 'mt5' ? 'x' : 'plus'} size={16} /> {adding === 'mt5' ? 'Close' : 'Add MT5'}</button>
        </div>
      </div>

      {adding === 'mt5' && (
        <div className="card">
          <div className="card-head"><h2><Icon name="window" /> MetaTrader 5 · Windows app</h2></div>
          <ConnectMt5 me={me} onlyNew onConnected={() => void reload()} />
        </div>
      )}
      {adding === 'browser' && (
        <div className="card">
          <div className="card-head"><h2><Icon name="globe" /> TradingView, Polymarket and Kalshi · Chrome or Edge</h2></div>
          <ConnectBrowser me={me} onlyNew onConnected={() => void reload()} />
        </div>
      )}
      {!adding && me.connections.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <span className="tile accent"><Icon name="devices" size={22} /></span>
            <strong>No devices yet</strong>
            <span className="small">MetaTrader 5 connects through the Windows app. TradingView, Polymarket and Kalshi through the browser extension.</span>
            <div className="row" style={{ marginTop: 6, justifyContent: 'center' }}>
              <button className="primary" onClick={() => setAdding('mt5')}><Icon name="window" size={16} /> Add MT5</button>
              <button onClick={() => setAdding('browser')}><Icon name="globe" size={16} /> Add TradingView, Polymarket, Kalshi</button>
            </div>
          </div>
        </div>
      )}

      {me.connections.map((c) => {
        const st = deviceStatus(c);
        const tone = st.kind === 'on' ? 'accent' : st.kind === 'attention' ? 'amber' : st.kind === 'setting_up' ? 'blue' : '';
        return (
          <div key={c.id} className="card device-card">
            <span className={`tile ${tone}`}><Icon name={c.kind === 'mt5' || c.kind === 'mt4' ? 'window' : 'globe'} /></span>
            <div className="rule-main">
              <div className="rule-name">{c.name} <span className={`chip ${tone}`}><Dot kind={st.kind} live={st.kind === 'on'} /> {st.label}</span></div>
              <div className="device-meta">
                <span><Icon name="clock" size={13} /> Seen {ago(c.lastSeen)}</span>
                {c.version && <span><Icon name="cpu" size={13} /> v{c.version}</span>}
                {c.role === 'secondary' && <span>Panel only. Another chart is doing the counting.</span>}
              </div>
              {c.unknownBuild && <div className="banner amber small" style={{ margin: '10px 0 0' }}><span><Icon name="alert" /> Unknown EA build. Reinstall DisciplineGuard for Windows.</span></div>}
              {(st.kind === 'setting_up' || st.kind === 'attention' || st.kind === 'off') && <a className="small" href="/help" onClick={onLink}>Show me how</a>}
            </div>
            {c.removalAt ? (
              <span className="small faint">Removed at {time(c.removalAt)}</span>
            ) : (
              <button className="ghost small" onClick={() => setRemoving({ kind: 'device', id: c.id, label: c.name, ended: false })}>Remove</button>
            )}
          </div>
        );
      })}

      {accounts.length > 0 && (
        <div className="card table-card">
          <div className="card-head" style={{ padding: '18px 20px 4px' }}><h2><Icon name="layers" /> Accounts</h2></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead><tr><th>Account</th><th>State</th><th>Last seen</th><th /></tr></thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.nickname ? `${a.nickname} · ` : ''}{platformName(a.platform, a.server)}</strong> <span className="muted">{a.server && a.server !== platformName(a.platform, a.server) ? `· ${a.server} ` : ''}· …{a.last3}</span>{a.demo ? <span className="chip" style={{ marginLeft: 8 }}>demo</span> : null}</td>
                    <td>
                      <span className={`chip${a.state === 'active' ? ' accent' : ''}`}>{STATE_LABEL[a.state]}</span>
                      {a.state === 'not_seen' && a.lastSeen ? <span className="small muted"> since {date(a.lastSeen)}</span> : ''}
                    </td>
                    <td className="small muted">{ago(a.lastSeen)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {a.removalAt ? <span className="small">Removal {time(a.removalAt)}</span> : (
                        <button className="ghost small" onClick={() => setRemoving({ kind: 'account', id: a.id, label: `…${a.last3}`, ended: a.state === 'ended' })}>Remove</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {me.accounts.length >= 10 && <p className="small" style={{ padding: '0 20px 16px' }}>10 accounts is the limit. Remove one to add another.</p>}
        </div>
      )}

      {removing && (
        <Sheet label="Remove" onClose={() => setRemoving(null)}>
          <span className="tile amber sheet-icon"><Icon name="trash" /></span>
          <h2>Remove {removing.label}?</h2>
          <p className="muted">
            {removing.ended || me.user.setupMode
              ? 'This applies now.'
              : 'This waits until your next day reset (at least 12 hours). It stays protected until then.'}
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
