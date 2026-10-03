// What the content script, popup and service worker say to each other, and the cache they share.
import type { ResolvedTime, Rules } from '@dg/core';

/** A TradingView broker account, as read from the Account Manager. */
export interface TvAccount {
  /** Broker name, e.g. "Paper Trading". */
  broker: string;
  /** The broker's account id. Only its HMAC and last 3 characters reach the server. */
  login: string;
  currency?: string;
}

/** One queued event for /v1/sync (SPEC §10.3). */
export interface QueuedEvent {
  id: string;
  type: string;
  t: number;
  [k: string]: unknown;
}

/** The verified rule cache and snapshot, per account key. Written by the service worker, read by the content script. */
export interface Cache {
  status: Status;
  /** "broker:login" → the server's account id, for accounts DisciplineGuard protects. */
  accounts: Record<string, { id: string; enforced: boolean; last3: string }>;
  /** "broker:login" → why the server refused it: the plan's account limit, or live under another login. */
  refused?: Record<string, 'account_cap' | 'account_taken'>;
  signed?: {
    rules: Rules;
    time: ResolvedTime;
    hideAmounts: boolean;
    license: { state: string; validUntil: number; enforcing: boolean };
  };
  snapshot?: any;
  /** Server time minus local time at the last sync. */
  skew: number;
  syncedAt: number;
}

export type Status = 'signed_out' | 'setting_up' | 'on' | 'offline' | 'off' | 'attention';

export type Msg =
  | { type: 'account'; account: TvAccount }
  | { type: 'events'; accountKey: string; events: QueuedEvent[] }
  | { type: 'sign_in' }
  | { type: 'sign_out' }
  | { type: 'status' };

export const accountKey = (a: TvAccount) => `${a.broker}:${a.login}`;
export const CACHE_KEY = 'dg_cache';
