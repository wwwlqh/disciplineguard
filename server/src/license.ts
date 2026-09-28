// Plan states and valid_until (SPEC §12.1, §12.2).
import { DAY, HOUR, nextReset } from '@dg/core';

export interface PlanUser {
  created_at: number;
  first_on_at: number | null;
  plan_state: string;
  paid_until: number | null;
  past_due_since: number | null;
  provider_end_at: number | null;
  deleted_at: number | null;
  plan_kind: string | null;
}

export interface License {
  state: 'free' | 'active' | 'past_due' | 'deleted';
  /** Protection ends at this instant if nothing changes. */
  validUntil: number;
  enforcing: boolean;
}

/** Free protection is confirmed this far ahead, rolling forward with each sync. */
export const FREE_WINDOW_DAYS = 30;

/** The first reset at or after `t`. */
export function resetAtOrAfter(resets: number[], t: number): number {
  return nextReset(resets, t - 1);
}

/** Free for everyone, with one trading account; a paid plan adds accounts (SPEC §12.1). */
export function license(u: PlanUser, resets: number[], now: number): License {
  if (u.deleted_at !== null) return { state: 'deleted', validUntil: u.deleted_at, enforcing: false };
  let paid: { state: 'active' | 'past_due'; validUntil: number } | null = null;
  if (u.plan_state === 'active' && u.paid_until !== null) paid = { state: 'active', validUntil: resetAtOrAfter(resets, u.paid_until) };
  else if (u.plan_state === 'past_due' && u.past_due_since !== null) paid = { state: 'past_due', validUntil: resetAtOrAfter(resets, u.past_due_since + 3 * DAY) };
  if (paid && u.provider_end_at !== null) paid.validUntil = Math.min(paid.validUntil, u.provider_end_at);
  if (paid && now < paid.validUntil) return { ...paid, enforcing: true };
  // No plan, or the paid period is over: back to free.
  return { state: 'free', validUntil: resetAtOrAfter(resets, now + FREE_WINDOW_DAYS * DAY), enforcing: true };
}

/** Refund, chargeback or provider cancellation: protection stays until max(next reset, event + 12 h) (SPEC §12.2). */
export function providerEnd(resets: number[], at: number): number {
  return Math.max(nextReset(resets, at), at + 12 * HOUR);
}
