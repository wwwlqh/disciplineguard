// Account (EXPERIENCE §5.10): plan, privacy, security, report a problem, sign out.
import { useEffect, useState } from 'react';
import { api, type AlertKind } from '../api.ts';
import { onLink } from '../router.ts';
import { ago, date, time } from '../fmt.ts';
import { Sheet, Switch, useToast } from '../ui/kit.tsx';
import type { PageProps } from '../main.tsx';

const REPORT_TYPES = [
  ['should_not_pause', 'This order should not have been paused'],
  ['should_pause', "This order should have been paused but wasn't"],
  ['setup', 'Setup'],
  ['billing', 'Billing'],
  ['other', 'Other'],
] as const;

const ALERTS: [AlertKind, string][] = [
  ['limit', 'Daily loss limit reached'],
  ['after_limit', 'Placed anyway after the daily loss limit'],
  ['off', 'DisciplineGuard turned off, or trades while it was off'],
  ['moved', 'Account connected to another login'],
  ['outside', 'Outside trade went past a rule'],
  ['unchecked', "Orders we couldn't check"],
  ['summary', 'End-of-session summary'],
  ['placed', 'Placed anyway (other rules)'],
  ['stop', 'Stop loss removed or widened'],
];

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function AccountPage({ me, reload }: PageProps) {
  const toast = useToast();
  const [sessions, setSessions] = useState<{ sessions: any[]; events: any[] } | null>(null);
  const [report, setReport] = useState({ type: 'setup', text: '' });
  const lic = me.license;
  const [sheet, setSheet] = useState<'cancel' | 'monthly' | 'yearly' | 'refund' | null>(null);

  useEffect(() => {
    api('GET', '/api/sessions').then(setSessions).catch(() => {});
  }, []);

  async function pref(p: Record<string, unknown>) {
    await api('PUT', '/api/prefs', p);
    await reload();
  }

  async function alerts(p: Record<string, unknown>) {
    await api('PUT', '/api/alerts', p);
    await reload();
  }

  async function planAction(action: 'cancel' | 'monthly' | 'yearly' | 'refund') {
    setSheet(null);
    try {
      if (action === 'cancel') {
        const r = await api('POST', '/api/plan/cancel');
        toast(`Cancelled. Protection stays on until ${date(r.until)}. Your rules are saved for 90 days after that.`);
      } else if (action === 'refund') {
        await api('POST', '/api/plan/refund');
        toast("Refund requested. You won't be charged again.");
      } else {
        await api('POST', '/api/plan/change', { plan: action });
        toast(`Switched to ${action}. It applies from your next renewal.`);
      }
    } catch {
      toast("That didn't work. Try again in a moment.");
    }
    await reload();
  }

  const planLine =
    lic.state === 'trial' ? (lic.trialDay ? `Trial · day ${lic.trialDay} of 14 · ends ${time(lic.trialEndsAt ?? lic.validUntil)}` : 'Trial · starts when your first device turns on')
      : lic.state === 'active' ? `${me.user.planKind === 'earlybird_yearly' ? 'Early-bird yearly' : me.user.planKind === 'monthly' ? 'Monthly' : 'Yearly'} · ${me.user.cancelAtPeriodEnd ? 'ends' : 'renews'} ${time(lic.validUntil)}`
        : lic.state === 'past_due' ? `Payment failed · protection until ${time(lic.validUntil)}`
          : 'Plan ended · rules saved for 90 days';

  return (
    <div className="stack">
      <h1>Account</h1>
      <div className="card" id="plan">
        <h2>Plan</h2>
        <p>{planLine}</p>
        {lic.state === 'past_due' && me.user.updateCardUrl && <a className="btn primary" href={me.user.updateCardUrl}>Update your card</a>}
        {lic.state === 'active' || lic.state === 'past_due' ? (
          <div className="row" style={{ marginTop: 10 }}>
            {me.user.planKind === 'monthly' ? <button onClick={() => setSheet('yearly')}>Switch to yearly</button> : <button onClick={() => setSheet('monthly')}>Switch to monthly</button>}
            {me.user.portalUrl && <a className="btn" href={me.user.portalUrl}>Billing and receipts</a>}
            {me.user.refundable && <button className="link small" onClick={() => setSheet('refund')}>Request a full refund</button>}
            {!me.user.cancelAtPeriodEnd && <button className="link small" onClick={() => setSheet('cancel')}>Cancel plan</button>}
          </div>
        ) : (
          <a className="btn primary" href="/plans" onClick={onLink}>See plans</a>
        )}
      </div>
      {sheet && (
        <Sheet label="Plan" onClose={() => setSheet(null)}>
          <h2>{sheet === 'cancel' ? 'Cancel your plan?' : sheet === 'refund' ? 'Request a full refund?' : `Switch to ${sheet}?`}</h2>
          <p>
            {sheet === 'cancel' && `Protection stays on until ${date(lic.validUntil)}. You won't be charged again.`}
            {sheet === 'refund' && 'The full amount goes back to your card, and the plan ends.'}
            {sheet === 'monthly' && `From your next renewal.${me.user.planKind === 'earlybird_yearly' ? ' The early-bird price ends.' : ''}`}
            {sheet === 'yearly' && 'From your next renewal.'}
          </p>
          <div className="row">
            <button className={sheet === 'cancel' || sheet === 'refund' ? 'danger' : 'primary'} onClick={() => planAction(sheet)}>
              {sheet === 'cancel' ? 'Cancel plan' : sheet === 'refund' ? 'Request refund' : `Switch to ${sheet}`}
            </button>
            <button onClick={() => setSheet(null)}>Keep it</button>
          </div>
        </Sheet>
      )}

      <div className="card" id="alerts">
        <h2>Alerts</h2>
        <p className="small muted">
          {me.user.hasApp ? 'Shown as notifications on your computer by DisciplineGuard for Windows.' : <>Alerts show on your computer through DisciplineGuard for Windows. <a href="/devices" onClick={onLink}>Install it</a></>}
        </p>
        <ul className="list">
          {ALERTS.map(([k, label]) => (
            <li key={k} className="row between">
              <span>{label}</span>
              <Switch label={label} checked={me.user.alerts.on[k]} onChange={(v) => alerts({ on: { [k]: v } })} />
            </li>
          ))}
          <li className="row between">
            <span>Summary time</span>
            <select value={me.user.alerts.summaryAt ?? ''} onChange={(e) => alerts({ summaryAt: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Summary time">
              <option value="">End of trading hours, or 60 min after the last trade</option>
              {Array.from({ length: 48 }, (_, i) => i * 30).map((m) => <option key={m} value={m}>{hm(m)}</option>)}
            </select>
          </li>
          <li className="row between">
            <span>Include amounts</span>
            <Switch label="Include amounts" checked={me.user.alerts.amounts} onChange={(v) => alerts({ amounts: v })} />
          </li>
        </ul>
        {me.user.hasApp && (
          <button style={{ marginTop: 10 }} onClick={async () => { await api('POST', '/api/alerts/test'); toast('Sent. It shows within a minute.'); }}>Send a test</button>
        )}
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
