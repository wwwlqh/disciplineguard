import { describe, expect, it } from 'vitest';
import { dayOf, effectiveAt, localParts, resets, transitions, tzOffset, wallToUtc, localDayNumber, DAY, HOUR, MIN } from '../src/index.ts';

const SPRING = Date.UTC(2026, 2, 29); // Sunday, London 01:00 → 02:00

describe('resolver (SPEC §3)', () => {
  it('DAY-05: a reset at 01:30 on the spring change happens at 02:00 local', () => {
    const r = resets({ at: '01:30', tz: 'Europe/London' }, SPRING - DAY, SPRING + 2 * DAY);
    // 02:00 BST = 01:00 UTC
    expect(r).toContain(SPRING + 1 * HOUR);
  });

  it('a reset time that occurs twice happens at its first occurrence (autumn)', () => {
    const AUTUMN = Date.UTC(2026, 9, 25); // Sunday, London 02:00 → 01:00
    // 01:30 local happens at 00:30 UTC (BST) and 01:30 UTC (GMT). First: 00:30 UTC.
    expect(wallToUtc('Europe/London', localDayNumber('Europe/London', AUTUMN + 12 * HOUR), 90 * MIN)).toBe(AUTUMN + 30 * MIN);
  });

  it('DAY-06: Prague and Kolkata trading days in summer', () => {
    const now = Date.UTC(2026, 6, 15, 23, 0); // 23:00 UTC, 15 Jul 2026
    const prague = resets({ at: '00:00', tz: 'Europe/Prague' }, now - 3 * DAY, now + 3 * DAY);
    const kolkata = resets({ at: '00:00', tz: 'Asia/Kolkata' }, now - 3 * DAY, now + 3 * DAY);
    expect(dayOf(prague, now).start).toBe(Date.UTC(2026, 6, 15, 22, 0));
    expect(dayOf(kolkata, now).start).toBe(Date.UTC(2026, 6, 15, 18, 30));
  });

  it('DAY-02: forex close is 17:00 New York', () => {
    const t = Date.UTC(2026, 9, 5, 12);
    const r = resets({ at: '17:00', tz: 'America/New_York' }, t - DAY, t + DAY);
    expect(r).toContain(Date.UTC(2026, 9, 5, 21, 0));
  });

  it('DAY-04: the London spring day is 23 hours long', () => {
    const r = resets({ at: '00:00', tz: 'Europe/London' }, SPRING - DAY, SPRING + 2 * DAY);
    const d = dayOf(r, SPRING + 12 * HOUR);
    expect(d.end - d.start).toBe(23 * HOUR);
  });

  it('transitions give the right wall clock on both sides of a change', () => {
    const off = transitions('Europe/London', SPRING - 2 * DAY, SPRING + 2 * DAY);
    expect(off.length).toBe(2);
    expect(off[1][0]).toBe(SPRING + 1 * HOUR);
    expect(localParts(off, SPRING + 2 * HOUR).msOfDay).toBe(3 * HOUR); // 02:00 UTC = 03:00 BST
    expect(localParts(off, SPRING - HOUR).weekday).toBe(5); // Saturday 23:00
  });

  it('tzOffset handles half-hour zones', () => {
    expect(tzOffset('Asia/Kolkata', Date.UTC(2026, 0, 1))).toBe(19800);
  });

  it('effective_at examples (SPEC §6.3, CHG-02..05)', () => {
    const base = Date.UTC(2026, 9, 5);
    const r = Array.from({ length: 5 }, (_, i) => base + i * DAY);
    expect(effectiveAt(r, base + 10 * HOUR)).toBe(base + DAY);
    expect(effectiveAt(r, base + 14 * HOUR)).toBe(base + DAY + 2 * HOUR);
    expect(effectiveAt(r, base + 23 * HOUR + 55 * MIN)).toBe(base + DAY + 11 * HOUR + 55 * MIN);
    expect(effectiveAt(r, base + 12 * HOUR)).toBe(base + DAY);
  });
});
