// Hashing, tokens and signing, all through WebCrypto (Workers and Node).

const enc = new TextEncoder();

export function hex(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/** 128-bit or longer random token, URL-safe. */
export function token(bytes = 32): string {
  return b64url(randomBytes(bytes));
}

export function randomId(prefix = ''): string {
  return prefix + hex(randomBytes(12));
}

export async function sha256(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

const hmacKeys = new Map<string, Promise<CryptoKey>>();

export async function hmac(secret: string, msg: string): Promise<string> {
  let k = hmacKeys.get(secret);
  if (!k) {
    k = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    hmacKeys.set(secret, k);
  }
  return hex(await crypto.subtle.sign('HMAC', await k, enc.encode(msg)));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** 6-digit sign-in code. */
export function digits6(): string {
  const b = randomBytes(4);
  const n = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  return String(n % 1_000_000).padStart(6, '0');
}

let signKey: Promise<CryptoKey> | undefined;
let signKeySrc = '';

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Ed25519 signature (hex) over the UTF-8 bytes of `msg`. */
export async function sign(pkcs8b64: string, msg: string): Promise<string> {
  if (!signKey || signKeySrc !== pkcs8b64) {
    signKeySrc = pkcs8b64;
    signKey = crypto.subtle.importKey('pkcs8', b64ToBytes(pkcs8b64), { name: 'Ed25519' }, false, ['sign']);
  }
  return hex(await crypto.subtle.sign({ name: 'Ed25519' }, await signKey, enc.encode(msg)));
}

export async function verify(pubHex: string, msg: string, sigHex: string): Promise<boolean> {
  const pub = new Uint8Array(pubHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const sig = new Uint8Array(sigHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
  return crypto.subtle.verify({ name: 'Ed25519' }, key, sig, enc.encode(msg));
}

/** Normalizes an email for trial checks (SPEC §12.5). */
export function normalizeEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 0) return e;
  let local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === 'gmail.com' || domain === 'googlemail.com') return `${local.replace(/\./g, '')}@gmail.com`;
  return `${local}@${domain}`;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

/** Deterministic UUIDv5-style id for platform events (SPEC §4.3), from the parts that make it unique. */
export async function eventId(...parts: string[]): Promise<string> {
  const h = await sha256(parts.join(':'));
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

