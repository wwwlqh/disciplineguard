// Generates the Ed25519 signing key pair for the rule cache and a random HMAC secret.
// The public key (hex) is bundled into the EA (clients/mt5/DG/Config.mqh) and the extension.
import { generateKeyPairSync, randomBytes } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
console.log(`SIGNING_KEY=${pkcs8}`);
console.log(`SIGNING_PUB=${pub}`);
console.log(`HMAC_SECRET=${randomBytes(32).toString('base64url')}`);
