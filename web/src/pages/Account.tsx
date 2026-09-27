// Account (EXPERIENCE §5.10): plan, privacy, security, report a problem, sign out.
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { ago, time } from '../fmt.ts';
import { onLink } from '../router.ts';
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
            <p className="muted small">Beta early-bird: $79 a year, kept at every renewal while your plan never lapses. Ends if you switch to monthly or the plan lapses. Full refund within 14 days of your first payment.</p>
            <button className="primary" onClick={checkout}>Get the early-bird plan</button>
          </div>
        )}
        {lic.state === 'active' && <p className="small"><a href="mailto:support@disciplineguard.com?subject=Withdraw%20or%20refund">Withdraw or request a refund</a> · Manage billing in the receipt email's customer portal link.</p>}
      </div>

      <div className="card">
        <h2>Privacy</h2>
        <ul className="list">
          <li className="row between">
            <span>Share product usage (never trade details)</span>
            <Switch label="Share product usage" checked={me.user.analyticsConsent === 1} onChange={(v) => pref({ analyticsConsent: v })} />
          </li>
          <li className="row between">
            <span>Hide amounts on screen <span className="small muted">(for screen sharing and streaming)</span></span>
            <Switch label="Hide amounts" checked={me.user.hideAmounts} onChange={(v) => pref({ hideAmounts: v })} />
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>Security</h2>
        <p className="small muted">Signed in as {me.user.email}. Every change to your rules, notes, plan or devices is emailed to you.</p>
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
        <p className="small muted" style={{ marginTop: 8 }}>Signing out web sessions doesn't disconnect your devices.</p>
      </div>

      <div className="card">
        <h2>Report a problem</h2>
        <div className="stack">
          <select value={report.type} onChange={(e) => setReport({ ...report, type: e.target.value })} aria-label="Problem type">
            {REPORT_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <textarea placeholder="What happened? Beta users: say if you'd like a 10-minute setup call." value={report.text} onChange={(e) => setReport({ ...report, text: e.target.value })} />
          <p className="small muted">We attach: your devices' type, version and status, and today's event types without values. Never your notes, plan or reasons.</p>
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
        <p className="small">To export or delete your data during the beta, email <a href="mailto:support@disciplineguard.com">support@disciplineguard.com</a>. We reply within the legal deadlines. Deletion waits like a loosening while protection is active.</p>
        <p className="small"><a href="/legal#wellbeing" onClick={onLink}>Trading and wellbeing</a></p>
      </div>
    </div>
  );
}
