import { describe, expect, it } from 'vitest';
import { evaluate, planPause } from '../src/index.ts';
import { CASES, type Case } from './cases.ts';

export function run(c: Case) {
  const violations = evaluate(c.input);
  const plan = c.popup ? planPause(c.input, violations, c.popup) : undefined;
  return { violations, plan };
}

describe('SPEC §15 shared cases', () => {
  it('starts on a Monday', () => {
    expect(new Date(Date.UTC(2026, 9, 5)).getUTCDay()).toBe(1);
  });

  for (const c of CASES) {
    it(c.id, () => {
      const { violations, plan } = run(c);
      const e = c.expect;
      if (e.pass) {
        expect(violations).toEqual([]);
        if (c.popup) expect(plan).toBeNull();
        return;
      }
      if (e.title === 'CHECK') expect(violations).toEqual([]);
      else if (e.title) expect(violations[0]?.rule).toBe(e.title);
      if (e.rules) expect(violations.map((v) => v.rule)).toEqual(e.rules);
      const v = violations[0];
      if (e.observed !== undefined) expect(v.observed).toBeCloseTo(e.observed, 6);
      if (e.limit !== undefined) expect(v.limit).toBeCloseTo(e.limit, 6);
      if (e.clearsAt !== undefined) expect(v.clearsAt).toBe(e.clearsAt);
      if (e.fixSize !== undefined) expect(v.fix?.size).toBeCloseTo(e.fixSize, 6);
      if (e.fixAddSl !== undefined) expect(v.fix?.addSl).toBe(e.fixAddSl);
      if (e.wait !== undefined || e.typeConfirm !== undefined || e.reattemptAgoSec !== undefined || e.title === 'CHECK') {
        expect(plan).toBeTruthy();
        if (e.title) expect(plan!.title).toBe(e.title);
        if (e.wait !== undefined) expect(plan!.waitSec).toBe(e.wait);
        if (e.typeConfirm !== undefined) expect(plan!.typeConfirm ?? null).toBe(e.typeConfirm);
        if (e.reattemptAgoSec !== undefined) expect(plan!.reattemptAgoSec).toBe(e.reattemptAgoSec);
      }
    });
  }
});
