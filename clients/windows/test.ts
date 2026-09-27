// `npm test` for the Windows app: starts the real server handler (server/dev.ts, empty in-memory database) on a free
// port, then runs the Rust tests against it.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const port: number = await new Promise((resolve) => {
  const s = createServer().listen(0, '127.0.0.1', () => {
    const p = (s.address() as { port: number }).port;
    s.close(() => resolve(p));
  });
});
const server = spawn(process.execPath, ['dev.ts'], {
  cwd: fileURLToPath(new URL('../../server/', import.meta.url)),
  env: { ...process.env, PORT: String(port), DG_DB: ':memory:' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise<void>((resolve, reject) => {
  server.stdout.on('data', (d: Buffer) => d.toString().includes('dev API on') && resolve());
  server.on('exit', (code) => reject(new Error(`server exited (${code})`)));
});
const cargo = ['test', '-p', 'dg-core', ...process.argv.slice(2)];
const r = spawnSync('cargo', cargo, { cwd: here, stdio: 'inherit', env: { ...process.env, DG_TEST_API: `http://127.0.0.1:${port}` } });
server.kill();
process.exit(r.status ?? 1);
