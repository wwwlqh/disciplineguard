// Sign-in for the Windows app (SPEC §9.5): the app opens the web app's Allow page, the trader presses Allow, and
// the page hands a single-use code to this app on a loopback address (RFC 8252). Only this app holds the PKCE
// verifier, so the code is useless to anyone else.
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface SignedIn {
  token: string;
  email: string;
}

export async function signIn(opts: { api: string; appUrl: string; name: string; version: string; open(url: string): void; timeoutMs?: number }): Promise<SignedIn> {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('hex');
  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const c = url.pathname === '/cb' ? url.searchParams.get('code') : null;
      res.writeHead(c ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
      res.end(c ? '<p style="font-family:sans-serif">DisciplineGuard is signed in on this computer. You can close this tab.</p>' : '');
      if (c) {
        clearTimeout(timer);
        server.close();
        resolve(c);
      }
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('timeout'));
    }, opts.timeoutMs ?? 10 * 60_000);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      const q = new URLSearchParams({ port: String(port), challenge, name: opts.name });
      opts.open(`${opts.appUrl}/allow?${q}`);
    });
  });
  const r = await fetch(`${opts.api}/v1/auth/desktop`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, verifier, version: opts.version }),
  });
  if (r.status !== 200) throw new Error(`sign-in failed (${r.status})`);
  return (await r.json()) as SignedIn;
}
