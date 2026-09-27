// Build-time settings. `node build.ts` replaces the __DG_*__ values; a dev build can point at a local server.
declare const __DG_API__: string;
declare const __DG_PUBKEY__: string;

/** The DisciplineGuard web app and API (same origin). */
export const API: string = typeof __DG_API__ === 'string' ? __DG_API__ : 'https://disciplineguard.com';
/** The Ed25519 public key that signs the rule cache (SPEC §10.5). The EA bundles the same key. */
export const PUBKEY: string = typeof __DG_PUBKEY__ === 'string' ? __DG_PUBKEY__ : 'd059b26c8d64b174944c018029dc8a47353a3035056cc31b2a1af6f2b09518ec';
export const VERSION = '0.1.0';
