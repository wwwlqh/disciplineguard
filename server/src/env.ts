// Runtime bindings. D1 types are declared here so the same code runs on Workers and on the Node dev shim.

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  meta: { changes: number; last_row_id?: number };
}

export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Like {
  prepare(sql: string): D1Stmt;
  batch(stmts: D1Stmt[]): Promise<D1Result[]>;
}

export interface Env {
  DB: D1Like;
  ASSETS?: { fetch(req: Request): Promise<Response> };
  /** Public origin of the web app and API, e.g. https://disciplineguard.com */
  APP_URL: string;
  /** Secret for account-number HMACs (SPEC §9.1). */
  HMAC_SECRET: string;
  /** Ed25519 private key, PKCS#8 base64. Signs the rule cache (SPEC §10.5). */
  SIGNING_KEY: string;
  /** Ed25519 public key, hex. Bundled in the EA and the extension. */
  SIGNING_PUB: string;
  RESEND_KEY?: string;
  EMAIL_FROM?: string;
  LS_WEBHOOK_SECRET?: string;
  LS_CHECKOUT_EARLYBIRD?: string;
  LS_CHECKOUT_YEARLY?: string;
  LS_CHECKOUT_MONTHLY?: string;
  LS_API_KEY?: string;
  /** Variant ids, to switch a subscription between monthly and yearly (SPEC §12.3). */
  LS_VARIANT_MONTHLY?: string;
  LS_VARIANT_YEARLY?: string;
  /** Comma-separated emails that can open the owner dashboard. */
  OWNER_EMAILS?: string;
  TURNSTILE_SECRET?: string;
  /** Google sign-in (OAuth client for a web application). Both unset: the button is hidden. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Comma-separated SHA-256 hashes of released EA builds (SPEC §10.9). */
  KNOWN_BUILDS?: string;
  /** "1" in local development: secure cookies off, emails kept in the outbox. */
  DEV?: string;
  /** Test hook: fixed clock. */
  NOW?: () => number;
}

export function now(env: Env): number {
  return env.NOW ? env.NOW() : Date.now();
}
