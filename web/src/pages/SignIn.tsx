// Sign-up and sign-in: Continue with Google, or email → a link and a 6-digit code (EXPERIENCE §5.2, SPEC §10.9).
import { useEffect, useState } from 'react';
import { TRUST_LINES } from '@dg/core';
import { api, ApiError } from '../api.ts';

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

  if (link) {
    return (
      <div className="center-page">
        <div className="card">
          <h1>{link.sameBrowser ? 'Sign in' : `Sign in as ${link.email} on this device?`}</h1>
          <p className="muted">This link works once.</p>
          {err && <p role="alert">{err}</p>}
          <button className="primary" disabled={busy} onClick={() => run(async () => {
            await api('POST', '/v1/auth/verify', { token: link.token });
            onDone();
          })}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="center-page">
      <div className="card">
        <div className="row" style={{ marginBottom: 14 }}>
          <img src="/mark.svg" alt="" width={28} height={28} />
          <strong>DisciplineGuard</strong>
        </div>
        {!sent ? (
          <form onSubmit={(e) => { e.preventDefault(); void run(async () => { await api('POST', '/v1/auth/email', { email, nonce: nonce() }); setSent(true); }); }}>
            <h1>Sign in or create your account</h1>
            {google && (
              <>
                <a className="btn" style={{ width: '100%', margin: '10px 0 4px' }} href={`/v1/auth/google?next=${encodeURIComponent(next)}`}>
                  Continue with Google
                </a>
                {emailOn && <p className="muted small" style={{ textAlign: 'center', margin: '8px 0' }}>or</p>}
              </>
            )}
            {emailOn && (
              <>
                <p className="muted">We'll email you a link and a code.</p>
                <label className="field">
                  Email
                  <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
              </>
            )}
            {err && <p role="alert" style={{ marginTop: 10 }}>{err}</p>}
            {emailOn && (
              <button className="primary" style={{ width: '100%', marginTop: 12 }} disabled={busy}>
                Continue
              </button>
            )}
            {!emailOn && !google && <p className="muted">Sign-in opens soon.</p>}
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void run(async () => { await api('POST', '/v1/auth/verify', { email, code }); onDone(); }); }}>
            <h1>Check your email</h1>
            <p className="muted">Sent to {email}. Open the link, or enter the code.</p>
            <label className="field">
              6-digit code
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            {err && <p role="alert" style={{ marginTop: 10 }}>{err}</p>}
            <button className="primary" style={{ width: '100%', marginTop: 12 }} disabled={busy || code.trim().length < 6}>
              Sign in
            </button>
            <button type="button" className="link" style={{ marginTop: 12 }} onClick={() => { setSent(false); setCode(''); }}>
              Use a different email
            </button>
          </form>
        )}
        <hr className="sep" />
        <ul className="small muted" style={{ paddingLeft: 18, margin: 0 }}>
          {TRUST_LINES.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </div>
    </div>
  );
}
