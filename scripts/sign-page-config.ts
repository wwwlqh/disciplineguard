// Signs the TradingView page config the extension fetches (SPEC §9.1 "Page config", clients/extension/src/pageconfig.ts).
//   node scripts/sign-page-config.ts --new-key         prints a new page key pair (keep the private key offline)
//   node scripts/sign-page-config.ts --bundled         prints the bundled config, a starting point for edits
//   DG_PAGE_KEY=<private key> node scripts/sign-page-config.ts <config.json>
// The private key can also sit in ~/.disciplineguard/page-key. Writes web/public/tv-page.json, which the web app
// serves; deploy to publish. Bump `version` each time. The new version reaches 5% of installs for 30 minutes first.
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE } from '../clients/extension/src/tv.ts';

const pubHex = (key: ReturnType<typeof createPublicKey>) => key.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');

if (process.argv[2] === '--new-key') {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  console.log(`DG_PAGE_KEY=${privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')}`);
  console.log(`page public key (clients/extension/src/pageconfig.ts): ${pubHex(publicKey)}`);
  process.exit(0);
}
if (process.argv[2] === '--bundled') {
  console.log(JSON.stringify(PAGE, null, 2));
  process.exit(0);
}

const file = process.argv[2];
const keyFile = join(homedir(), '.disciplineguard', 'page-key');
const b64 = process.env.DG_PAGE_KEY ?? (existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : undefined);
if (!file || !b64) {
  console.error('Usage: DG_PAGE_KEY=<key> node scripts/sign-page-config.ts <config.json>');
  process.exit(1);
}
const page = JSON.parse(readFileSync(file, 'utf8'));
if (!Number.isInteger(page.version) || page.version <= PAGE.version) {
  console.error(`version must be an integer above the bundled ${PAGE.version}`);
  process.exit(1);
}
const key = createPrivateKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'pkcs8' });
const payload = JSON.stringify({ page, rolloutAt: Date.now() });
const sig = sign(null, Buffer.from(payload), key).toString('hex');
const out = fileURLToPath(new URL('../web/public/tv-page.json', import.meta.url));
writeFileSync(out, JSON.stringify({ payload, sig }) + '\n');
console.log(`wrote ${out} (version ${page.version}, public key ${pubHex(createPublicKey(key))})`);
