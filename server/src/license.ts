// Trial and plan states, and valid_until (SPEC §12.1, §12.2).
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
  state: 'trial' | 'active' | 'past_due' | 'ended' | 'deleted';
  /** Protection ends at this instant if nothing changes. */
  validUntil: number;
  enforcing: boolean;
  trialEndsAt?: number;
  /** Trial day 1..14, once the trial started from the first connection. */
  trialDay?: number;
}

export const TRIAL_DAYS = 14;
export const NO_CONNECTION_DAYS = 21;

/** The first reset at or after `t`. */
export function resetAtOrAfter(resets: number[], t: number): number {
  return nextReset(resets, t - 1);
}

export function trialEnd(u: PlanUser, resets: number[]): number {
  const noConnDeadline = u.created_at + NO_CONNECTION_DAYS * DAY;
  if (u.first_on_at !== null && u.first_on_at < noConnDeadline) return resetAtOrAfter(resets, u.first_on_at + TRIAL_DAYS * DAY);
  return resetAtOrAfter(resets, noConnDeadline);
}

export function license(u: PlanUser, resets: number[], now: number): License {
  if (u.deleted_at !== null) return { state: 'deleted', validUntil: u.deleted_at, enforcing: false };
  const tEnd = trialEnd(u, resets);
  let state: License['state'];
  let validUntil: number;
  if (u.plan_state === 'active' && u.paid_until !== null) {
    state = 'active';
    validUntil = resetAtOrAfter(resets, u.paid_until);
  } else if (u.plan_state === 'past_due' && u.past_due_since !== null) {
    state = 'past_due';
    validUntil = resetAtOrAfter(resets, u.past_due_since + 3 * DAY);
  } else if (u.plan_state === 'ended' && u.paid_until !== null) {
    state = 'ended';
    validUntil = resetAtOrAfter(resets, u.paid_until);
  } else {
    state = 'trial';
    validUntil = tEnd;
  }
  if (u.provider_end_at !== null) validUntil = Math.min(validUntil, u.provider_end_at);
  // Paying after the end resumes at once (SPEC §12.2): a paid period is never shortened by the trial end.
  const enforcing = now < validUntil;
  if (!enforcing) state = 'ended';
  const out: License = { state, validUntil, enforcing };
  if (state === 'trial') {
    out.trialEndsAt = tEnd;
    if (u.first_on_at !== null) out.trialDay = Math.min(TRIAL_DAYS, Math.floor((now - u.first_on_at) / DAY) + 1);
  }
  return out;
}

/** Refund, chargeback or provider cancellation: protection stays until max(next reset, event + 12 h) (SPEC §12.2). */
export function providerEnd(resets: number[], at: number): number {
  return Math.max(nextReset(resets, at), at + 12 * HOUR);
}
