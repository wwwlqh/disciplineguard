// Sign-up and sign-in: Continue with Google, or email → a link and a 6-digit code (EXPERIENCE §5.2, SPEC §10.9).
import { useEffect, useState } from 'react';
import { TRUST_LINES } from '@dg/core';
import { api, ApiError } from '../api.ts';
import { Brand, Mark } from '../ui/Brand.tsx';
import { Icon } from '../ui/Icon.tsx';

const NONCE_KEY = 'dg_signin_nonce';

function nonce(): string {
  try {
    let n = localStorage.getItem(NONCE_KEY);
    if (!n) {
      n = crypto.randomUUID();
      localStorage.setItem(NONCE_KEY, n);
    }
    return n;
  } catch {
    return 'none';
  }
}

const ERRORS: Record<string, string> = {
  rate_limited: 'Too many tries. Wait a while and try again.',
  bad_email: 'That email address doesn\'t look right.',
  code_invalid: 'Code expired or wrong. Ask for a new one.',
  link_invalid: 'This link expired or was already used. Ask for a new one.',
};

export function SignIn({ onDone }: { onDone(): void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ token: string; email: string; sameBrowser: boolean } | null>(null);
  const [google, setGoogle] = useState(false);
  const [emailOn, setEmailOn] = useState(true);

  useEffect(() => {
    api<{ google: boolean; email: boolean }>('GET', '/v1/auth/options').then((o) => { setGoogle(o.google); setEmailOn(o.email); }).catch(() => {});
    if (new URLSearchParams(location.search).get('google') === 'failed') {
      setErr("Google sign-in didn't work. Try again.");
      history.replaceState(null, '', '/signin');
    }
  }, []);

  // Back to the page that asked (the Allow page keeps its query), like the email sign-in.
  const next = location.pathname === '/signin' ? '/today' : location.pathname + location.search;

  useEffect(() => {
    const m = /#t=([\w-]+)/.exec(location.hash);
    if (!m) return;
    const token = m[1];
    history.replaceState(null, '', '/signin');
    api('POST', '/v1/auth/link-info', { token, nonce: nonce() })
      .then((r) => setLink({ token, ...r }))
      .catch((e) => setErr(ERRORS[(e as ApiError).code] ?? 'Something went wrong.'));
  }, []);

  async function run(f: () => Promise<void>) {
    setErr('');
    setBusy(true);
    try {
      await f();
    } catch (e) {
      setErr(ERRORS[(e as ApiError).code] ?? 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const side = (
    <aside className="auth-side">
      <Brand />
      <div>
        <div className="orbit" aria-hidden="true"><i /><i /><i /><Mark size={64} /></div>
        <h2>A pause before the trade that costs you.</h2>
        <p className="lead">Set your own trading rules. A trade that breaks one gets a short pause first.</p>
        <ul className="auth-promises">
          {TRUST_LINES.map((l) => <li key={l}><Icon name="shieldCheck" size={18} /><span>{l}</span></li>)}
        </ul>
      </div>
      <span className="small faint">MetaTrader 5 · TradingView · Polymarket · Kalshi</span>
    </aside>
  );

  if (link) {
    return (
      <div className="auth">
        {side}
        <main className="auth-main">
          <div className="auth-card stack">
            <h1>{link.sameBrowser ? 'Sign in' : `Sign in as ${link.email} on this device?`}</h1>
            <p className="muted">This link works once.</p>
            {err && <p role="alert" className="banner amber"><span><Icon name="alert" /> {err}</span></p>}
            <button className="primary big" style={{ width: '100%' }} disabled={busy} onClick={() => run(async () => {
              await api('POST', '/v1/auth/verify', { token: link.token });
              onDone();
            })}>
              Sign in
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="auth">
      {side}
      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-mobile-brand"><Brand /></div>
          {!sent ? (
            <form onSubmit={(e) => { e.preventDefault(); void run(async () => { await api('POST', '/v1/auth/email', { email, nonce: nonce() }); setSent(true); }); }}>
              <h1>Sign in or create your account</h1>
              <p className="muted">Free for 1 trading account. No card needed.</p>
              {google && (
                <>
                  <a className="btn big" style={{ width: '100%', marginTop: 8 }} href={`/v1/auth/google?next=${encodeURIComponent(next)}`}>
                    <GoogleG /> Continue with Google
                  </a>
                  {emailOn && <div className="or">or</div>}
                </>
              )}
              {emailOn && (
                <label className="field" style={{ marginTop: google ? 0 : 14 }}>
                  Email
                  <input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
              )}
              {err && <p role="alert" className="banner amber" style={{ marginTop: 12 }}><span><Icon name="alert" /> {err}</span></p>}
              {emailOn && (
                <button className="primary big" style={{ width: '100%', marginTop: 14 }} disabled={busy}>
                  <Icon name="mail" size={17} /> Email me a link and a code
                </button>
              )}
              {!emailOn && !google && <p className="muted">Sign-in opens soon.</p>}
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void run(async () => { await api('POST', '/v1/auth/verify', { email, code }); onDone(); }); }}>
              <span className="tile accent sheet-icon"><Icon name="mail" /></span>
              <h1>Check your email</h1>
              <p className="muted">Sent to {email}. Open the link, or enter the code.</p>
              <label className="field">
                6-digit code
                <input className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} />
              </label>
              {err && <p role="alert" className="banner amber" style={{ marginTop: 12 }}><span><Icon name="alert" /> {err}</span></p>}
              <button className="primary big" style={{ width: '100%', marginTop: 14 }} disabled={busy || code.trim().length < 6}>
                Sign in
              </button>
              <button type="button" className="link" style={{ marginTop: 14 }} onClick={() => { setSent(false); setCode(''); }}>
                Use a different email
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

/** Google's "G", for the Continue with Google button (Google's sign-in branding). */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5Z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7Z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1Z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48Z" />
    </svg>
  );
}
