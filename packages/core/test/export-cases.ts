// Writes the shared cases as JSON for the MQL5 runner (clients/mt5/tests).
import { writeFileSync } from 'node:fs';
import { CASES } from './cases.ts';

const out = CASES.map((c) => ({ id: c.id, input: c.input, popup: c.popup ?? null, expect: c.expect }));
const path = process.argv[2] ?? 'cases.json';
writeFileSync(path, JSON.stringify(out));
console.log(`${out.length} cases → ${path}`);
