// Builds the extension into dist/ (load it with chrome://extensions → Load unpacked).
// Every script is bundled: no remote code, no eval (SPEC §9.1). Content scripts can't be modules, so all are IIFE.
// Usage: node build.ts            production (https://disciplineguard.leowqiheng.workers.dev)
//        DG_API=http://localhost:8787 DG_PUBKEY=<hex> node build.ts   a dev build against a local server
//        DG_PAGE_PUBKEY=<hex> checks the page config with a test key
//        DG_TEST=1 adds nothing but an open shadow root, for test/e2e.ts
import { build } from 'rolldown';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const here = import.meta.dirname;
const out = join(here, process.env.DG_OUT ?? 'dist');
const api = process.env.DG_API ?? 'https://disciplineguard.leowqiheng.workers.dev';
const define: Record<string, string> = { __DG_API__: JSON.stringify(api) };
if (process.env.DG_PUBKEY) define.__DG_PUBKEY__ = JSON.stringify(process.env.DG_PUBKEY);
if (process.env.DG_PAGE_PUBKEY) define.__DG_PAGE_PUBKEY__ = JSON.stringify(process.env.DG_PAGE_PUBKEY);
if (process.env.DG_TEST) define.__DG_TEST__ = 'true';

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const name of ['background', 'content', 'popup', 'welcome']) {
  await build({
    input: join(here, 'src', `${name}.ts`),
    output: { file: join(out, `${name}.js`), format: 'iife', minify: false },
    transform: { define },
    logLevel: 'warn',
  });
}
cpSync(join(here, 'static'), out, { recursive: true });

const origin = new URL(api).origin;
const manifest = {
  manifest_version: 3,
  name: 'DisciplineGuard',
  version: '0.1.0',
  description: 'Pauses new TradingView trades that break your own rules. Closing is never paused.',
  icons: { 16: 'icon16.png', 48: 'icon48.png', 128: 'icon128.png' },
  action: { default_popup: 'popup.html', default_icon: { 16: 'icon16.png', 48: 'icon48.png' } },
  background: { service_worker: 'background.js' },
  permissions: ['storage', 'alarms', 'notifications'],
  host_permissions: ['https://www.tradingview.com/*', `${origin}/*`],
  content_scripts: [{ matches: ['https://www.tradingview.com/chart/*'], js: ['content.js'], run_at: 'document_start', all_frames: false }],
  externally_connectable: { matches: [`${origin}/*`] },
};
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`built dist/ for ${api}`);
