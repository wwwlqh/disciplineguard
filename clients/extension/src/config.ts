// Build-time settings. `node build.ts` replaces the __DG_*__ values; a dev build can point at a local server.
declare const __DG_API__: string;
declare const __DG_PUBKEY__: string;
declare const __DG_VERSION__: string;

/** The DisciplineGuard web app and API (same origin). */
export const API: string = typeof __DG_API__ === 'string' ? __DG_API__ : 'https://disciplineguard.leowqiheng.workers.dev';
/** The Ed25519 public key that signs the rule cache (SPEC §10.5). The EA bundles the same key. */
export const PUBKEY: string = typeof __DG_PUBKEY__ === 'string' ? __DG_PUBKEY__ : '3079483957f95e2aea0f81c6893963b87dcfe89bab1ecfcca3050813f2b4c19e';
/** From package.json, so Devices shows the installed version. */
export const VERSION: string = typeof __DG_VERSION__ === 'string' ? __DG_VERSION__ : 'dev';
