// Local development: runs the Worker's handler on Node with SQLite. Not deployed.
// Usage: node dev.ts   (API on http://localhost:8787; the web app's Vite server proxies /api and /v1 here)
// Emails are kept in the outbox: http://localhost:8787/dev/outbox
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeD1 } from './src/d1-node.ts';
import { handle } from './src/index.ts';
import { runScheduled } from './src/jobs.ts';
import type { Env } from './src/env.ts';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const keyFile = join(here, '.dev.keys.json');

if (!existsSync(keyFile)) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  writeFileSync(
    keyFile,
    JSON.stringify({
      SIGNING_KEY: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
      SIGNING_PUB: publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex'),
      HMAC_SECRET: randomBytes(32).toString('base64url'),
    }),
  );
}
const keys = JSON.parse(readFileSync(keyFile, 'utf8'));
const db = new NodeD1(join(here, '.dev.sqlite'));
db.migrate(join(here, 'migrations'));

const env: Env = {
  DB: db,
  APP_URL: process.env.APP_URL ?? 'http://localhost:5173',
  DEV: '1',
  OWNER_EMAILS: process.env.OWNER_EMAILS ?? 'owner@example.com',
  LS_CHECKOUT_EARLYBIRD: process.env.LS_CHECKOUT_EARLYBIRD ?? 'https://example.lemonsqueezy.com/buy/early-bird',
  ...keys,
};

const pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p.catch(() => undefined)) };

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const url = `http://localhost:${PORT}${req.url}`;
  if (req.url === '/dev/outbox') {
    const rows = db.db.prepare('SELECT id, to_email, subject, body, created_at FROM outbox_email ORDER BY id DESC LIMIT 20').all();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(rows, null, 1));
    return;
  }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const body = chunks.length && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined;
  const r = await handle(new Request(url, { method: req.method, headers, body }), env, ctx);
  const out: Record<string, string> = {};
  r.headers.forEach((v, k) => (out[k] = v));
  res.writeHead(r.status, out);
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, () => console.log(`DisciplineGuard dev API on http://localhost:${PORT}`));

setInterval(() => void runScheduled(env, ctx).catch((e) => console.log('cron', e)), 60_000);
