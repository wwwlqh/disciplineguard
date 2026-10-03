// Editors for each rule's global fields, with plain meaning and platform badges.
import { splitWindow, type RuleId, type Rules, type TimeWindow } from '@dg/core';

export const RULE_ORDER: RuleId[] = ['R1', 'R2', 'R3', 'R4', 'R7', 'R8', 'R10', 'R5', 'R6', 'R9'];

export const RULE_INFO: Record<RuleId, { name: string; meaning: string; badges: string[] }> = {
  R1: { name: 'Max trades per day', meaning: 'Every trade past this many today is marked.', badges: [] },
  R2: { name: 'Max trades per hour', meaning: 'Every trade past this many in the last hour is marked.', badges: [] },
  R3: { name: 'Too fast', meaning: 'A trade that comes too soon after the ones before it is marked.', badges: [] },
  R4: { name: 'Trading hours', meaning: 'A trade outside the hours you chose is marked.', badges: [] },
  R5: { name: 'Max position size', meaning: 'A trade that makes your position bigger than your max is marked. Set per account.', badges: [] },
  R6: { name: 'Max risk per trade', meaning: 'A trade that risks more than this at its stop loss is marked.', badges: ['MT only'] },
  R7: { name: 'Cooldown after a loss', meaning: 'A trade soon after a trade closes at a loss is marked.', badges: ['Beta on TradingView'] },
  R8: { name: 'Daily loss limit', meaning: 'Once you are down this much today, every trade until your rest ends is marked.', badges: ['Beta on TradingView'] },
  R9: { name: 'Stop loss required', meaning: 'A trade with no stop loss is marked.', badges: [] },
  R10: { name: 'No bigger after a loss', meaning: 'After a losing trade, a bigger trade than the one you lost on is marked.', badges: ['Beta on TradingView'] },
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

function Num({ value, onChange, min, max, step = 1, label, unit }: { value: number; onChange(v: number): void; min: number; max: number; step?: number; label: string; unit?: string }) {
  return (
    <label className="field">
      {label}
      <span className="row">
        <input
          type="number"
          className="narrow"
          value={Number.isFinite(value) ? value : ''}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
        />
        {unit && <span className="small muted">{unit}</span>}
      </span>
    </label>
  );
}

/** Editor windows: one start–end per selected day set. Stored split at midnight (SPEC §5.2 R4). */
export function editorWindows(ws: TimeWindow[]): { days: number[]; start: number; end: number } {
  if (ws.length === 0) return { days: [0, 1, 2, 3, 4], start: 8 * 60, end: 17 * 60 };
  const first = ws.find((w) => w.end === 1440 && ws.some((x) => x.start === 0 && x.day === (w.day + 1) % 7)) ?? ws[0];
  if (first.end === 1440) {
    const tail = ws.find((x) => x.start === 0 && x.day === (first.day + 1) % 7);
    const days = ws.filter((w) => w.start === first.start && w.end === 1440).map((w) => w.day);
    return { days, start: first.start, end: tail ? tail.end : 1440 };
  }
  return { days: ws.filter((w) => w.start === first.start && w.end === first.end).map((w) => w.day), start: first.start, end: first.end };
}

export function RuleFields({ id, value, onChange, inWizard = false }: { id: RuleId; value: any; onChange(v: any): void; inWizard?: boolean }) {
  const set = (patch: object) => onChange({ ...value, ...patch });
  switch (id) {
    case 'R1':
      return <Num label="Trades per day" value={value.max} min={1} max={100} onChange={(max) => set({ max })} />;
    case 'R2':
      return <Num label="Trades per hour" value={value.max} min={1} max={50} onChange={(max) => set({ max })} />;
    case 'R3':
      return (
        <div className="row">
          <Num label="Trades" value={value.count} min={2} max={10} onChange={(count) => set({ count })} />
          <Num label="Within" value={value.seconds} min={10} max={600} unit="seconds" onChange={(seconds) => set({ seconds })} />
        </div>
      );
    case 'R4': {
      const ed = editorWindows(value.windows ?? []);
      const update = (days: number[], start: number, end: number) => set({ windows: splitWindow(days, start, end) });
      return (
        <div className="stack">
          <div className="row">
            <label className="field">
              From
              <input type="time" value={hm(ed.start)} onChange={(e) => update(ed.days, toMin(e.target.value), ed.end)} />
            </label>
            <label className="field">
              To
              <input type="time" value={hm(ed.end % 1440)} onChange={(e) => update(ed.days, ed.start, toMin(e.target.value) || 1440)} />
            </label>
          </div>
          <div className="row" role="group" aria-label="Weekdays">
            {DAYS.map((d, i) => (
              <label key={d} className="check small">
                <input
                  type="checkbox"
                  checked={ed.days.includes(i)}
                  onChange={(e) => update(e.target.checked ? [...ed.days, i].sort() : ed.days.filter((x) => x !== i), ed.start, ed.end)}
                />
                {d}
              </label>
            ))}
          </div>
          {ed.end < ed.start && ed.end !== 0 && <p className="small muted">{DAYS[ed.days[ed.days.length - 1] ?? 4]} {hm(ed.start)}–{DAYS[((ed.days[ed.days.length - 1] ?? 4) + 1) % 7]} {hm(ed.end)} counts as {DAYS[ed.days[ed.days.length - 1] ?? 4]}'s session.</p>}
        </div>
      );
    }
    case 'R7':
      return (
        <div className="stack">
          <Num label="Cooldown" value={value.minutes} min={1} max={240} unit="minutes" onChange={(minutes) => set({ minutes })} />
          <label className="check small">
            <input type="checkbox" checked={!!value.doubleAfter2} onChange={(e) => set({ doubleAfter2: e.target.checked })} />
            Double it after 2 losses in a row
          </label>
        </div>
      );
    case 'R8':
      return (
        <div className="stack">
          <Num label="Rest after the limit" value={value.restHours} min={0} max={24} unit="hours" onChange={(restHours) => set({ restHours })} />
          <label className="check small">
            <input type="checkbox" checked={!!value.allAccounts} onChange={(e) => set({ allAccounts: e.target.checked })} />
            Any account at its limit counts for all accounts
          </label>
          {!inWizard && <p className="small muted">The limit amount is set per account, under Accounts below.</p>}
        </div>
      );
    case 'R10':
      return <Num label="For" value={value.minutes} min={5} max={120} unit="minutes after a losing trade (after any cooldown)" onChange={(minutes) => set({ minutes })} />;
    case 'R5':
      return <p className="small muted">The max size is set per account, under Accounts below.</p>;
    case 'R6':
      return <p className="small muted">The max risk is set per account, under Accounts below.</p>;
    default:
      return null;
  }
}

export function ruleSummary(id: RuleId, r: Rules): string {
  const v: any = (r as any)[id];
  if (!v?.on) return 'Off';
  switch (id) {
    case 'R1':
      return `${v.max} trades a day`;
    case 'R2':
      return `${v.max} trades an hour`;
    case 'R3':
      return `${v.count} trades within ${v.seconds} s`;
    case 'R4': {
      const ed = editorWindows(v.windows);
      return `${hm(ed.start)}–${hm(ed.end % 1440)}, ${ed.days.map((d) => DAYS[d]).join(' ')}`;
    }
    case 'R7':
      return `${v.minutes} min${v.doubleAfter2 ? ', doubled after 2 losses' : ''}`;
    case 'R8':
      return `Rest ${v.restHours} h${v.allAccounts ? ', all accounts' : ''}`;
    case 'R10':
      return `${v.minutes} min`;
    default:
      return 'On';
  }
}

export function validRule(id: RuleId, v: any): boolean {
  const n = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  switch (id) {
    case 'R1':
      return n(v.max) && v.max >= 1 && v.max <= 100;
    case 'R2':
      return n(v.max) && v.max >= 1 && v.max <= 50;
    case 'R3':
      return n(v.count) && n(v.seconds) && v.count >= 2 && v.count <= 10 && v.seconds >= 10 && v.seconds <= 600;
    case 'R4':
      return Array.isArray(v.windows) && (!v.on || v.windows.length > 0);
    case 'R7':
      return n(v.minutes) && v.minutes >= 1 && v.minutes <= 240;
    case 'R8':
      return n(v.restHours) && v.restHours >= 0 && v.restHours <= 24;
    case 'R10':
      return n(v.minutes) && v.minutes >= 5 && v.minutes <= 120;
    default:
      return true;
  }
}
