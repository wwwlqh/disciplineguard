// "Allow DisciplineGuard on this computer?" for the Windows app's sign-in (EXPERIENCE §7.1, SPEC §9.5).
import { useState } from 'react';
import { TRUST_LINES } from '@dg/core';
import { api, type Me } from '../api.ts';

export function Allow({ me }: { me: Me }) {
  const q = new URLSearchParams(location.search);
  const port = q.get('port') ?? '';
  const challenge = q.get('challenge') ?? '';
  const name = (q.get('name') ?? 'this computer').slice(0, 60);
  const [state, setState] = useState<'ask' | 'done' | 'cancelled' | 'error'>('ask');
  const valid = /^\d{2,5}$/.test(port) && /^[0-9a-f]{64}$/.test(challenge);

  async function allow() {
    try {
      const { code } = await api<{ code: string }>('POST', '/api/desktop/allow', { challenge, name });
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
          <p>This link is incomplete. Open DisciplineGuard on your computer and sign in from there.</p>
        ) : state === 'done' ? (
          <p>Allowed. Go back to the DisciplineGuard app.</p>
        ) : state === 'cancelled' ? (
          <p>Nothing was allowed. You can close this tab.</p>
        ) : (
          <>
            <h1>Allow DisciplineGuard on {name}?</h1>
            <p className="muted">Signed in as {me.user.email}. The app will protect the MetaTrader you tick on that computer, using your rules.</p>
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
