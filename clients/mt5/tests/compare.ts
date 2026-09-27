// Diffs the MQL5 engine's output (dg_results.json) against the TypeScript engine on the same cases.
// Usage: node clients/mt5/tests/compare.ts <dg_results.json>
import { readFileSync } from 'node:fs';
import { evaluate, planPause } from '../../../packages/core/src/index.ts';
import { CASES } from '../../../packages/core/test/cases.ts';

const mql = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const byId = new Map<string, any>(mql.results.map((r: any) => [r.id, r]));
const close = (a: number | undefined, b: number | undefined) => (a === undefined && b === undefined) || (a !== undefined && b !== undefined && Math.abs(a - b) < 1e-6);
let fail = 0;
for (const c of CASES) {
  const got = byId.get(c.id);
  const problems: string[] = [];
  if (!got) problems.push('missing');
  else {
    const vs = evaluate(c.input);
    if (vs.length !== got.violations.length) problems.push(`violations ${vs.map((v) => v.rule)} vs ${got.violations.map((v: any) => v.rule)}`);
    vs.forEach((v, i) => {
      const g = got.violations[i];
      if (!g) return;
      if (g.rule !== v.rule) problems.push(`rule ${v.rule} vs ${g.rule}`);
      if (!close(v.observed, g.observed)) problems.push(`${v.rule} observed ${v.observed} vs ${g.observed}`);
      if (!close(v.limit, g.limit)) problems.push(`${v.rule} limit ${v.limit} vs ${g.limit}`);
      if (v.clearsAt !== g.clearsAt && !(v.clearsAt === Infinity && g.clearsAt === undefined)) problems.push(`${v.rule} clearsAt ${v.clearsAt} vs ${g.clearsAt}`);
      if (!close(v.fix?.size, g.fixSize)) problems.push(`${v.rule} fix ${v.fix?.size} vs ${g.fixSize}`);
      if (!!v.fix?.addSl !== !!g.fixAddSl) problems.push(`${v.rule} addSl`);
    });
    if (c.popup) {
      const p = planPause(c.input, vs, c.popup);
      if (!p !== !got.plan) problems.push(`plan ${!!p} vs ${!!got.plan}`);
      else if (p) {
        if (p.title !== got.plan.title) problems.push(`title ${p.title} vs ${got.plan.title}`);
        if (p.waitSec !== got.plan.waitSec) problems.push(`wait ${p.waitSec} vs ${got.plan.waitSec}`);
        if ((p.typeConfirm ?? null) !== (got.plan.typeConfirm ?? null)) problems.push(`typeConfirm ${p.typeConfirm} vs ${got.plan.typeConfirm}`);
        if ((p.reattemptAgoSec ?? null) !== (got.plan.reattemptAgoSec ?? null)) problems.push('reattempt');
        if (p.tradeNumber !== got.plan.tradeNumber) problems.push(`tradeNumber ${p.tradeNumber} vs ${got.plan.tradeNumber}`);
      }
    }
  }
  if (problems.length) {
    fail++;
    console.log(`FAIL ${c.id}: ${problems.join('; ')}`);
  }
}
console.log(`${CASES.length - fail}/${CASES.length} cases identical between TypeScript and MQL5 · MQL5 parse ${mql.parseUs} µs, evaluate ${mql.evalUs} µs total`);
process.exit(fail ? 1 : 0);
