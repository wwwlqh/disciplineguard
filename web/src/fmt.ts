// Numbers and times in the trader's frame (EXPERIENCE §2.4).
import type { Fmt, Order } from '@dg/core';

let TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
let hideAmounts = false;

export function setFormatContext(tz: string, hide: boolean): void {
  TZ = tz;
  hideAmounts = hide;
}

export function browserTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function dayKey(t: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
}

/** "10:14" today, "Tue 02:00" another day (within a week), "12 Sep 02:00" further away. */
export function time(t: number, now = Date.now()): string {
  const hm = new Intl.DateTimeFormat(undefined, { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(t);
  if (dayKey(t) === dayKey(now)) return hm;
  if (Math.abs(t - now) < 6 * 86_400_000) return `${new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short' }).format(t)} ${hm}`;
  return `${date(t)} ${hm}`;
}

/** "12 Sep" */
export function date(t: number): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' }).format(t);
}

/** "Mon" in the trader's timezone. */
export function weekday(t: number): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short' }).format(t);
}

/** 0 for Monday … 6 for Sunday, in the trader's timezone. */
export function weekdayIndex(t: number): number {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday(t));
}

/** "4 min ago", "2 h ago", or the time. */
export function ago(t: number | null | undefined, now = Date.now()): string {
  if (!t) return 'never';
  const s = Math.round((now - t) / 1000);
  if (s < 60) return `${Math.max(s, 1)} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return time(t, now);
}

/** "in 12 hours" for the verdict line. */
export function inHours(t: number, now = Date.now()): string {
  const h = (t - now) / 3_600_000;
  if (h < 1) return `in ${Math.max(1, Math.round(h * 60))} minutes`;
  return `in ${Math.round(h)} hour${Math.round(h) === 1 ? '' : 's'}`;
}

/** Money with the sign first: "−$120". Hidden as "—" when "Hide amounts on screen" is on. */
export function money(x: number, currency = 'USD', signed = false): string {
  if (hideAmounts) return '—';
  const whole = Math.abs(x) % 1 === 0;
  const abs = new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(Math.abs(x));
  if (!signed) return abs;
  return `${x < 0 ? '−' : x > 0 ? '+' : ''}${abs}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const coreFmt = (currencyOf: (account: string) => string = () => 'USD'): Fmt => ({
  time: (t: number) => time(t),
  money: (x: number, account: string) => money(x, currencyOf(account)),
  size: (x: number, _o: Order) => lots(x),
});

/** Sizes as traders write them: 0.50, 1.20, 1000. */
export function lots(x: number): string {
  return x >= 100 ? String(Math.round(x * 100) / 100) : x.toFixed(2);
}
