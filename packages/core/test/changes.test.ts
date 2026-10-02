import { describe, expect, it } from 'vitest';
import { autoLockAt, compareChange, requestChange, splitWindow, DEFAULT_POPUP, DAY, HOUR, MIN, type ChangeContext } from '../src/index.ts';

const BASE = Date.UTC(2026, 9, 5); // Monday
const resetsUtc = Array.from({ length: 20 }, (_, i) => BASE + (i - 5) * DAY);
const at = (h: number, m = 0, d = 0) => BASE + d * DAY + h * HOUR + m * MIN;
const locked = (now: number): ChangeContext => ({ now, userResets: resetsUtc, setupMode: false });
const R1 = (max: number) => ({ on: true, max });

describe('SPEC §15.5 setup mode and rule changes', () => {
  it('SET-01: setup mode applies at once', () => {
    const r = requestChange('rule:R1', { active: R1(5) }, R1(8), { now: at(10), userResets: resetsUtc, setupMode: true });
    expect(r.appliesAt).toBe('now');
  });

  it('SET-02: setup-mode cool-off after a real pause', () => {
    const r = requestChange('rule:R1', { active: R1(5) }, R1(8), { now: at(10, 20), userResets: resetsUtc, setupMode: true, lastRealPauseAt: at(10, 14) });
    expect(r.appliesAt).toBe(at(10, 44));
  });

  it('SET-03: auto-lock at the first reset at least 72 h after the first On', () => {
    expect(autoLockAt(resetsUtc, at(10))).toBe(at(0, 0, 4)); // Friday 00:00
  });

  it('CHG-01: lower max applies now', () => expect(requestChange('rule:R1', { active: R1(5) }, R1(3), locked(at(14))).appliesAt).toBe('now'));
  it('CHG-02', () => expect(requestChange('rule:R1', { active: R1(5) }, R1(8), locked(at(10))).appliesAt).toBe(at(0, 0, 1)));
  it('CHG-03', () => expect(requestChange('rule:R1', { active: R1(5) }, R1(8), locked(at(14))).appliesAt).toBe(at(2, 0, 1)));
  it('CHG-04', () => expect(requestChange('rule:R1', { active: R1(5) }, R1(8), locked(at(23, 55))).appliesAt).toBe(at(11, 55, 1)));
  it('CHG-05', () => expect(requestChange('rule:R1', { active: R1(5) }, R1(8), locked(at(12))).appliesAt).toBe(at(0, 0, 1)));

  it('CHG-06: stricter change drops the pending one', () => {
    const r = requestChange('rule:R1', { active: R1(5), pending: { value: R1(8), effectiveAt: at(0, 0, 1), requestedAt: at(10) } }, R1(4), locked(at(11)));
    expect(r.row).toEqual({ active: R1(4) });
  });

  it('CHG-07: a new loosening replaces the pending one and recalculates', () => {
    const r = requestChange('rule:R1', { active: R1(5), pending: { value: R1(8), effectiveAt: at(0, 0, 1), requestedAt: at(10) } }, R1(10), locked(at(11)));
    expect(r.row.active).toEqual(R1(5));
    expect(r.row.pending).toEqual({ value: R1(10), effectiveAt: at(0, 0, 1), requestedAt: at(11) });
  });

  it('CHG-08: disabling is looser', () => expect(compareChange('rule:R7', { on: true, minutes: 10, doubleAfter2: false }, { on: false, minutes: 10, doubleAfter2: false })).toBe('looser'));
  it('CHG-09: timezone change is looser', () => expect(compareChange('tz', 'UTC', 'Asia/Singapore')).toBe('looser'));
  it('CHG-10: lower wait is looser', () => expect(compareChange('popup', { ...DEFAULT_POPUP, wait: 10 }, { ...DEFAULT_POPUP, wait: 5 })).toBe('looser'));
  it('CHG-11: higher wait is stricter', () => expect(compareChange('popup', DEFAULT_POPUP, { ...DEFAULT_POPUP, wait: 10 })).toBe('stricter'));

  const w = (s: number, e: number) => ({ on: true, windows: [0, 1, 2, 3, 4].map((day) => ({ day, start: s, end: e })) });
  it('CHG-12: narrower hours are stricter', () => expect(compareChange('rule:R4', w(870, 1020), w(900, 960))).toBe('stricter'));
  it('CHG-13: earlier start is looser', () => expect(compareChange('rule:R4', w(870, 1020), w(840, 960))).toBe('looser'));

  it('CHG-14: a higher override is looser', () => expect(compareChange('acct:A:r5', { r5Max: 0.5 }, { r5Max: 0.5, r5Overrides: [{ prefix: 'EURUSD', max: 2 }] })).toBe('looser'));
  it('CHG-15: a lower override is stricter', () => expect(compareChange('acct:A:r5', { r5Max: 0.5 }, { r5Max: 0.5, r5Overrides: [{ prefix: 'XAUUSD', max: 0.1 }] })).toBe('stricter'));
  it('R5 first value applies now', () => expect(compareChange('acct:A:r5', undefined, { r5Max: 0.5 })).toBe('stricter'));

  it('CHG-16: adding a note is stricter', () => expect(compareChange('note:2', null, { text: 'x', tag: 'any' })).toBe('stricter'));
  it('CHG-17: editing a note is looser', () => expect(compareChange('note:1', { text: 'x', tag: 'any' }, { text: 'y', tag: 'any' })).toBe('looser'));

  it('SET-01 (popup): wait 10 → 3 when locked is scheduled', () => {
    const r = requestChange('popup', { active: { ...DEFAULT_POPUP, wait: 10 } }, { ...DEFAULT_POPUP, wait: 3 }, locked(at(10)));
    expect(r.appliesAt).toBe(at(0, 0, 1));
  });
  it('SET-02 (popup): turning type to confirm on applies now', () =>
    expect(compareChange('popup', DEFAULT_POPUP, { ...DEFAULT_POPUP, typeConfirm: { mode: 'always', n: 3 } })).toBe('stricter'));

  it('R3: longer window with same count is stricter, shorter is looser', () => {
    expect(compareChange('rule:R3', { on: true, count: 3, seconds: 120 }, { on: true, count: 3, seconds: 180 })).toBe('stricter');
    expect(compareChange('rule:R3', { on: true, count: 3, seconds: 120 }, { on: true, count: 2, seconds: 60 })).toBe('looser');
  });
  it('R6/R8 unit change is always looser', () => expect(compareChange('acct:A:r8', { unit: 'amount', value: 300 }, { unit: 'pct', value: 1 })).toBe('looser'));
  it('keyboard place anyway on is looser', () => expect(compareChange('popup', DEFAULT_POPUP, { ...DEFAULT_POPUP, keyboardPlace: true })).toBe('looser'));
  it('type to confirm after fewer placed-anyway is stricter', () =>
    expect(compareChange('popup', { ...DEFAULT_POPUP, typeConfirm: { mode: 'after', n: 3 } }, { ...DEFAULT_POPUP, typeConfirm: { mode: 'after', n: 2 } })).toBe('stricter'));
  it('mixed popup change (one stricter, one looser) is looser', () =>
    expect(compareChange('popup', DEFAULT_POPUP, { ...DEFAULT_POPUP, wait: 30, skipCard: false })).toBe('looser'));
  it('count once: turning on is looser', () => expect(compareChange('countOnce', false, true)).toBe('looser'));
  it('close outside trades: turning on applies now, turning off waits for the reset', () => {
    expect(requestChange('closeOutside', { active: false }, true, locked(at(14))).appliesAt).toBe('now');
    expect(requestChange('closeOutside', { active: true }, false, locked(at(14))).appliesAt).toBe(at(2, 0, 1));
  });

  it('R4-06: 22:00–02:00 Mon–Fri splits into two windows', () => {
    const s = splitWindow([0, 1, 2, 3, 4], 22 * 60, 2 * 60);
    expect(s).toContainEqual({ day: 4, start: 1320, end: 1440 });
    expect(s).toContainEqual({ day: 5, start: 0, end: 120 });
    expect(s.length).toBe(10);
  });
});
