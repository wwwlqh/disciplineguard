// Signs the EA build the Windows app ships (SPEC §10.9, clients/windows/core/src/release.rs).
//   node scripts/sign-ea-manifest.ts --new-key            prints a new release key pair (keep the private key secret)
//   DG_RELEASE_KEY=<private key> node scripts/sign-ea-manifest.ts <DisciplineGuard.ex5> <version>
// Writes clients/windows/app/ea/: the EA, ea-manifest.json and ea-manifest.sig. Prints the public key for DG_RELEASE_PUB.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pubHex = (key: ReturnType<typeof createPublicKey>) => key.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');

if (process.argv[2] === '--new-key') {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  console.log(`DG_RELEASE_KEY=${privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')}`);
  console.log(`DG_RELEASE_PUB=${pubHex(publicKey)}`);
  process.exit(0);
}

const [ex5, version] = process.argv.slice(2);
if (!ex5 || !version || !process.env.DG_RELEASE_KEY) {
  console.error('Usage: DG_RELEASE_KEY=<key> node scripts/sign-ea-manifest.ts <DisciplineGuard.ex5> <version>');
  process.exit(1);
}
const key = createPrivateKey({ key: Buffer.from(process.env.DG_RELEASE_KEY, 'base64'), format: 'der', type: 'pkcs8' });
const out = fileURLToPath(new URL('../clients/windows/app/ea/', import.meta.url));
const ea = readFileSync(ex5);
const manifest = Buffer.from(JSON.stringify({ ea: { version, sha256: createHash('sha256').update(ea).digest('hex') } }));
mkdirSync(out, { recursive: true });
copyFileSync(ex5, `${out}DisciplineGuard.ex5`);
writeFileSync(`${out}ea-manifest.json`, manifest);
writeFileSync(`${out}ea-manifest.sig`, sign(null, manifest, key).toString('hex'));
console.log(`Signed EA ${version}. DG_RELEASE_PUB=${pubHex(createPublicKey(key))}`);
