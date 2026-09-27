// "Allow DisciplineGuard on this computer?" for the Windows app's and the browser extension's sign-in (SPEC §9.1, §9.5).
import { useState } from 'react';
import { TRUST_LINES } from '@dg/core';
import { api, type Me } from '../api.ts';

export function Allow({ me }: { me: Me }) {
  const q = new URLSearchParams(location.search);
  const port = q.get('port') ?? '';
  const challenge = q.get('challenge') ?? '';
  const name = (q.get('name') ?? 'this computer').slice(0, 60);
  const [state, setState] = useState<'ask' | 'done' | 'cancelled' | 'error'>('ask');
  // The extension passes its own id; Chrome delivers the code only to that extension, and only its PKCE verifier redeems it.
  const ext = q.get('ext') ?? '';
  const toExtension = /^[a-p]{32}$/.test(ext);
  const valid = (toExtension || /^\d{2,5}$/.test(port)) && /^[0-9a-f]{64}$/.test(challenge);

  async function allow() {
    try {
      const { code } = await api<{ code: string }>('POST', '/api/desktop/allow', { challenge, name });
      if (toExtension) {
        const runtime = (window as any).chrome?.runtime;
        if (!runtime?.sendMessage) throw new Error('no extension');
        await runtime.sendMessage(ext, { type: 'dg_code', code });
        setState('done');
        return;
      }
      setState('done');
      // Loopback only: the code goes to the app on this computer (RFC 8252).
      location.href = `http://127.0.0.1:${port}/cb?code=${encodeURIComponent(code)}`;
    } catch {
      setState('error');
    }
  }

  return (
    <div className="center-page">
      <div className="card stack">
        {!valid ? (
          <p>This link is incomplete. Sign in from the DisciplineGuard app or extension.</p>
        ) : state === 'done' ? (
          <p>{toExtension ? 'Allowed. Open a TradingView chart.' : 'Allowed. Go back to the DisciplineGuard app.'}</p>
        ) : state === 'cancelled' ? (
          <p>Nothing was allowed. You can close this tab.</p>
        ) : (
          <>
            <h1>Allow DisciplineGuard on {name}?</h1>
            <p className="muted">Signed in as {me.user.email}.</p>
            {state === 'error' && <p role="alert">Something went wrong. Try again from the app.</p>}
            <div className="row">
              <button className="primary" onClick={allow}>Allow</button>
              <button onClick={() => setState('cancelled')}>Cancel</button>
            </div>
            <ul className="small muted" style={{ paddingLeft: 18 }}>{TRUST_LINES.map((l) => <li key={l}>{l}</li>)}</ul>
          </>
        )}
      </div>
    </div>
  );
}
