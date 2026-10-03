import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/index.ts';
import { CASES } from './cases.ts';

describe('SPEC §15 shared cases', () => {
  it('starts on a Monday', () => {
    expect(new Date(Date.UTC(2026, 9, 5)).getUTCDay()).toBe(1);
  });

  for (const c of CASES) {
    it(c.id, () => {
      const violations = evaluate(c.input);
      const e = c.expect;
      if (e.pass) {
        expect(violations).toEqual([]);
        return;
      }
      if (e.title) expect(violations[0]?.rule).toBe(e.title);
      if (e.rules) expect(violations.map((v) => v.rule)).toEqual(e.rules);
      const v = violations[0];
      if (e.observed !== undefined) expect(v.observed).toBeCloseTo(e.observed, 6);
      if (e.limit !== undefined) expect(v.limit).toBeCloseTo(e.limit, 6);
      if (e.clearsAt !== undefined) expect(v.clearsAt).toBe(e.clearsAt);
      if (e.fixSize !== undefined) expect(v.fix?.size).toBeCloseTo(e.fixSize, 6);
      if (e.fixAddSl !== undefined) expect(v.fix?.addSl).toBe(e.fixAddSl);
    });
  }
});
