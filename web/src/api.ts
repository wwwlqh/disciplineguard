// Same-origin JSON API. Mutating calls carry X-DG (the server's CSRF check).
import type { PopupSettings, ResolvedTime, Rules } from '@dg/core';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'content-type': 'application/json', 'x-dg': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message);
  return data as T;
}

export interface License {
  state: 'trial' | 'active' | 'past_due' | 'ended' | 'deleted';
  validUntil: number;
  enforcing: boolean;
  trialEndsAt?: number;
  trialDay?: number;
}

export interface Account {
  id: string;
  platform: 'mt5' | 'mt4' | 'tv';
  last3: string;
  nickname: string | null;
  server: string | null;
  broker: string | null;
  firm: string | null;
  currency: string | null;
  netting: boolean;
  demo: boolean;
  state: 'active' | 'not_seen' | 'ended' | 'not_enforced';
  lastSeen: number | null;
  r5Set: boolean;
  removalAt: number | null;
}

export interface Connection {
  id: string;
  kind: string;
  name: string;
  version: string | null;
  role: string | null;
  status: string | null;
  lastSeen: number | null;
  firstOnAt: number | null;
  offReason: string | null;
  accounts: string[];
  unknownBuild: boolean;
  removalAt: number | null;
}

export interface Pending {
  key: string;
  value: any;
  effectiveAt: number;
}

export interface Note {
  id: string;
  text: string;
  tag: 'any' | 'after_loss' | 'too_many';
  setAt: number;
}

export type AlertKind = 'limit' | 'after_limit' | 'off' | 'moved' | 'outside' | 'unchecked' | 'summary' | 'placed' | 'stop';

export interface AlertPrefs {
  on: Record<AlertKind, boolean>;
  summaryAt: number | null;
  amounts: boolean;
}

export interface Me {
  now: number;
  user: {
    email: string;
    firstName: string | null;
    setupMode: boolean;
    lockedAt: number | null;
    lockedBy: string | null;
    lockAt: number | null;
    firstOnAt: number | null;
    lastRealPauseAt: number | null;
    hideAmounts: boolean;
    analyticsConsent: number | null;
    reasonConsent: number | null;
    reasonAsked: boolean;
    alerts: AlertPrefs;
    hasApp: boolean;
    onboarding: any;
    isBeta: boolean;
    owner: boolean;
    country: string | null;
    planKind: string | null;
    cancelAtPeriodEnd: boolean;
  };
  license: License;
  rules: Rules;
  popup: PopupSettings;
  tz: string;
  notes: Note[];
  plan: string;
  settings: Record<string, { active: any; pending: { value: any; effectiveAt: number } | null; setAt: number }>;
  pending: Pending[];
  time: ResolvedTime;
  accounts: Account[];
  connections: Connection[];
}

export type Verdict = { direction: 'same' | 'stricter' | 'looser'; appliesAt: 'now' | number };

export function saveSetting(key: string, value: unknown, dryRun = false): Promise<Verdict> {
  return api('PUT', '/api/settings', { key, value, dryRun });
}
