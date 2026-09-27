// Account (EXPERIENCE §5.10): plan, privacy, security, report a problem, sign out.
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { ago, time } from '../fmt.ts';
import { Switch, useToast } from '../ui/kit.tsx';
import type { PageProps } from '../main.tsx';

const REPORT_TYPES = [
  ['should_not_pause', 'This order should not have been paused'],
  ['should_pause', "This order should have been paused but wasn't"],
  ['setup', 'Setup'],
  ['billing', 'Billing'],
  ['other', 'Other'],
] as const;

export function AccountPage({ me, reload }: PageProps) {
  const toast = useToast();
  const [sessions, setSessions] = useState<{ sessions: any[]; events: any[] } | null>(null);
  const [report, setReport] = useState({ type: 'setup', text: '' });
  const lic = me.license;

  useEffect(() => {
    api('GET', '/api/sessions').then(setSessions).catch(() => {});
  }, []);

  async function pref(p: Record<string, unknown>) {
    await api('PUT', '/api/prefs', p);
    await reload();
  }

  async function checkout() {
    try {
      const r = await api('POST', '/api/checkout', { plan: 'earlybird_yearly' });
      location.href = r.url;
    } catch {
      toast('Checkout isn\'t open yet. It opens when your trial ends.');
    }
  }

  const planLine =
    lic.state === 'trial' ? (lic.trialDay ? `Trial · day ${lic.trialDay} of 14 · ends ${time(lic.trialEndsAt ?? lic.validUntil)}` : 'Trial · starts when your first device turns on')
      : lic.state === 'active' ? `${me.user.planKind === 'earlybird_yearly' ? 'Early-bird yearly' : me.user.planKind === 'monthly' ? 'Monthly' : 'Yearly'} · ${me.user.cancelAtPeriodEnd ? 'ends' : 'renews'} ${time(lic.validUntil)}`
        : lic.state === 'past_due' ? `Payment failed · protection until ${time(lic.validUntil)}`
          : 'Plan ended · rules saved for 90 days';

  return (
    <div className="stack">
      <h1>Account</h1>
      <div className="card">
        <h2>Plan</h2>
        <p>{planLine}</p>
        {lic.state !== 'active' && me.user.isBeta && (
          <div className="stack">
            <p className="muted small">$79 a year, kept while your plan renews. Full refund within 14 days.</p>
            <button className="primary" onClick={checkout}>Get the early-bird plan</button>
          </div>
        )}
        {lic.state === 'active' && <p className="small"><a href="mailto:support@disciplineguard.com?subject=Refund">Request a refund</a> · Manage billing from your receipt email.</p>}
      </div>

      <div className="card">
        <h2>Privacy</h2>
        <ul className="list">
          <li className="row between">
            <span>Save the reasons I pick <span className="small muted">(only you see them)</span></span>
            <Switch label="Save the reasons I pick" checked={me.user.reasonConsent === 1} onChange={(v) => pref({ reasonConsent: v })} />
          </li>
          <li className="row between">
            <span>Hide amounts on screen <span className="small muted">(for streaming)</span></span>
            <Switch label="Hide amounts" checked={me.user.hideAmounts} onChange={(v) => pref({ hideAmounts: v })} />
          </li>
        </ul>
        <button className="link small" onClick={async () => { await pref({ deleteReasons: true }); toast('Reason history deleted.'); }}>Delete my reason history</button>
      </div>

      <div className="card">
        <h2>Security</h2>
        <p className="small muted">Signed in as {me.user.email}.</p>
        {sessions && (
          <ul className="list">
            {sessions.sessions.map((s) => (
              <li key={s.id} className="row between small">
                <span>{(s.user_agent || 'Unknown browser').slice(0, 70)}{s.current ? ' · this browser' : ''}</span>
                <span className="muted">{ago(s.last_seen)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={async () => { await api('POST', '/api/sessions/signout-all'); location.href = '/signin'; }}>Sign out all web sessions</button>
          <button onClick={async () => { await api('POST', '/v1/auth/signout'); location.href = '/signin'; }}>Sign out</button>
        </div>
      </div>

      <div className="card" id="report">
        <h2>Report a problem</h2>
        <div className="stack">
          <select value={report.type} onChange={(e) => setReport({ ...report, type: e.target.value })} aria-label="Problem type">
            {REPORT_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <textarea placeholder="What happened?" value={report.text} onChange={(e) => setReport({ ...report, text: e.target.value })} />
          <p className="small muted">We attach your devices' version and status. Never your notes.</p>
          <button
            className="primary"
            disabled={!report.text.trim()}
            onClick={async () => {
              await api('POST', '/api/report', { ...report, diagnostics: { connections: me.connections.map((c) => ({ kind: c.kind, version: c.version, status: c.status, lastSeen: c.lastSeen })), ua: navigator.userAgent } });
              setReport({ type: 'setup', text: '' });
              toast('Sent. We reply by email.');
            }}
          >
            Send
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Data</h2>
        <p className="small">To export or delete your data, email <a href="mailto:support@disciplineguard.com">support@disciplineguard.com</a>.</p>
      </div>
    </div>
  );
}
