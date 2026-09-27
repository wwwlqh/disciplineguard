import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from './harness.ts';

const ENV = { GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'secret' };

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function idToken(w: World, claims: Record<string, unknown> = {}) {
  return `${b64({ alg: 'RS256' })}.${b64({ iss: 'https://accounts.google.com', aud: ENV.GOOGLE_CLIENT_ID, email: 'Trader@Gmail.com', email_verified: true, exp: Math.floor(w.t / 1000) + 3600, ...claims })}.sig`;
}

/** Starts the flow and returns what Google would send back, plus the state cookie the browser holds. */
async function start(w: World, next = '/today') {
  const r = await w.call('GET', `/v1/auth/google?next=${encodeURIComponent(next)}`);
  expect(r.status).toBe(302);
  const to = new URL(r.headers.get('location')!);
  const cookie = r.headers.get('set-cookie')!.split(';')[0];
  return { to, cookie, state: to.searchParams.get('state')! };
}

afterEach(() => vi.unstubAllGlobals());

describe('Google sign-in', () => {
  it('is hidden and inert until configured', async () => {
    const w = new World();
    expect((await w.call('GET', '/v1/auth/options')).data).toEqual({ google: false });
    expect((await w.call('GET', '/v1/auth/google')).headers.get('location')).toBe('https://app.test/signin');
  });

  it('sends the trader to Google with PKCE, then signs in the verified email and returns to next', async () => {
    const w = new World(ENV);
    expect((await w.call('GET', '/v1/auth/options')).data).toEqual({ google: true });
    const { to, cookie, state } = await start(w, '/allow?ext=abc&challenge=def');
    expect(to.origin + to.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(to.searchParams.get('code_challenge_method')).toBe('S256');
    expect(to.searchParams.get('redirect_uri')).toBe('https://app.test/v1/auth/google/callback');
    expect(cookie).toMatch(/^dg_g=/);

    const tokenCall = vi.fn(async (_u: string, _i: RequestInit) => new Response(JSON.stringify({ id_token: idToken(w) })));
    vi.stubGlobal('fetch', tokenCall);
    const r = await w.call('GET', `/v1/auth/google/callback?code=c1&state=${state}`, undefined, { cookie });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('https://app.test/allow?ext=abc&challenge=def');
    const sent = new URLSearchParams(String(tokenCall.mock.calls[0][1].body));
    expect(sent.get('code_verifier')).toBeTruthy();
    expect(sent.get('client_secret')).toBe('secret');

    const session = r.headers.getSetCookie().find((c) => c.startsWith('dg_s='))!.split(';')[0];
    const me = await w.call('GET', '/api/me', undefined, { cookie: session });
    expect(me.status).toBe(200);
    expect(me.data.user.email).toBe('trader@gmail.com');
  });

  it('is the same user as the email code', async () => {
    const w = new World(ENV);
    const web = await w.signIn('trader@gmail.com');
    const before = (await web.get('/api/me')).data.user.id;
    const { cookie, state } = await start(w);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ id_token: idToken(w) })));
    const r = await w.call('GET', `/v1/auth/google/callback?code=c1&state=${state}`, undefined, { cookie });
    const session = r.headers.getSetCookie().find((c) => c.startsWith('dg_s='))!.split(';')[0];
    expect((await w.call('GET', '/api/me', undefined, { cookie: session })).data.user.id).toBe(before);
  });

  it('fails closed: wrong state, unverified email, another audience, a failed exchange', async () => {
    const w = new World(ENV);
    const cases: [string, Record<string, unknown> | null][] = [
      ['state', {}],
      ['unverified', { email_verified: false }],
      ['audience', { aud: 'someone-else' }],
      ['expired', { exp: Math.floor(w.t / 1000) - 3600 }],
      ['exchange', null],
    ];
    for (const [what, claims] of cases) {
      const { cookie, state } = await start(w);
      vi.stubGlobal('fetch', async () => (claims ? new Response(JSON.stringify({ id_token: idToken(w, claims) })) : new Response('{}', { status: 400 })));
      const r = await w.call('GET', `/v1/auth/google/callback?code=c&state=${what === 'state' ? 'forged' : state}`, undefined, { cookie });
      expect(r.headers.get('location'), what).toBe('https://app.test/signin?google=failed');
      expect(r.headers.getSetCookie().some((c) => c.startsWith('dg_s=')), what).toBe(false);
    }
  });

  it('never returns to another site', async () => {
    const w = new World(ENV);
    for (const next of ['//evil.test/x', 'https://evil.test', '/\\evil.test']) {
      const { cookie, state } = await start(w, next);
      vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ id_token: idToken(w) })));
      const r = await w.call('GET', `/v1/auth/google/callback?code=c&state=${state}`, undefined, { cookie });
      expect(r.headers.get('location')).toBe('https://app.test/today');
    }
  });
});
