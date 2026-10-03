// Charts and meters, drawn in SVG and CSS from the design tokens (dataviz: thin marks, one hue per series,
// 2px surface gaps, values in text ink, hover tips that never gate a value).
import { useEffect, useId, useState, type ReactNode } from 'react';
import { date, weekday, weekdayIndex } from '../fmt.ts';
import { Icon, type IconName } from './Icon.tsx';

export type Tone = 'accent' | 'amber' | 'danger' | 'muted' | 'blue';

const cssId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '');

/** The fill grows from 0 after mount, so meters animate in. */
function useGrow(target: number): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const f = requestAnimationFrame(() => setV(target));
    return () => cancelAnimationFrame(f);
  }, [target]);
  return v;
}

/** A ring meter: a value against a limit. The label inside is the reader's number. */
export function Ring({ value, max, size = 128, stroke = 10, tone = 'accent', label, children }: { value: number; max: number; size?: number; stroke?: number; tone?: Tone; label: string; children?: ReactNode }) {
  const id = cssId(useId());
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const shown = useGrow(ratio);
  return (
    <div className={`ring tone-${tone}`} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" className="stop-a" />
            <stop offset="1" className="stop-b" />
          </linearGradient>
        </defs>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          stroke={`url(#${id}g)`}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          opacity={ratio > 0 ? 1 : 0}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

/** A half-circle gauge: loss today against the daily limit. */
export function Gauge({ value, max, tone = 'accent', width = 200, stroke = 12, label, children }: { value: number; max: number; tone?: Tone; width?: number; stroke?: number; label: string; children?: ReactNode }) {
  const id = cssId(useId());
  const r = (width - stroke) / 2;
  const cy = r + stroke / 2;
  const len = Math.PI * r;
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const shown = useGrow(ratio);
  const d = `M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${width - stroke / 2} ${cy}`;
  return (
    <div className={`gauge tone-${tone}`} style={{ width }} role="img" aria-label={label}>
      <svg width={width} height={cy + stroke / 2} viewBox={`0 0 ${width} ${cy + stroke / 2}`} aria-hidden="true">
        <defs>
          <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" className="stop-a" />
            <stop offset="1" className="stop-b" />
          </linearGradient>
        </defs>
        <path className="ring-track" d={d} strokeWidth={stroke} fill="none" strokeLinecap="round" />
        <path className="ring-fill" d={d} strokeWidth={stroke} fill="none" strokeLinecap="round" stroke={`url(#${id}g)`} strokeDasharray={len} strokeDashoffset={len * (1 - shown)} opacity={ratio > 0 ? 1 : 0} />
      </svg>
      <div className="gauge-center">{children}</div>
    </div>
  );
}

/** Part-to-whole in one bar, with a legend that carries every value. */
export function StackedBar({ parts, label }: { parts: { key: string; label: string; value: number; tone: string }[]; label: string }) {
  const total = parts.reduce((a, b) => a + b.value, 0);
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);
  return (
    <div className="stacked">
      <div className="stacked-bar" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.value}`).join(', ')}`}>
        {total === 0 ? <i className="seg empty" /> : parts.filter((p) => p.value > 0).map((p) => (
          <i key={p.key} className={`seg ${p.tone}`} style={{ flexGrow: p.value }} data-tip={`${p.label} · ${p.value} (${pct(p.value)}%)`} />
        ))}
      </div>
      <ul className="legend big">
        {parts.map((p) => (
          <li key={p.key}>
            <span className="legend-name"><span className={`swatch ${p.tone}`} aria-hidden="true" />{p.label}</span>
            <strong>{p.value}</strong>
            <span className="faint">{pct(p.value)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars for one series, sorted, value at the tip. */
export function HBars({ rows, label }: { rows: { key: string; label: string; value: number; icon?: IconName }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const grown = useGrow(1);
  return (
    <ul className="hbars" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key}>
          <span className="hb-label">{r.icon && <Icon name={r.icon} size={15} />}{r.label}</span>
          <span className="hb-track"><i style={{ width: `${(r.value / max) * 100 * grown}%` }} /></span>
          <span className="hb-value">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** Columns for one series across ordered buckets (hours of the day). The busiest bucket is labelled. */
export function Columns({ values, tick, tip, label }: { values: number[]; tick(i: number): string | null; tip(i: number, v: number): string; label: string }) {
  const max = Math.max(1, ...values);
  const top = values.indexOf(Math.max(...values));
  const grown = useGrow(1);
  return (
    <div className="cols">
      <div className="cols-plot" role="img" aria-label={label}>
        {values.map((v, i) => (
          <span key={i} className={`col${i === top && v > 0 ? ' top' : ''}`} data-tip={tip(i, v)}>
            <i style={{ height: `${(v / max) * 100 * grown}%` }} />
            {i === top && v > 0 && <b className="col-label">{v}</b>}
          </span>
        ))}
      </div>
      <div className="cols-axis" aria-hidden="true">
        {values.map((_, i) => <span key={i}>{tick(i) ?? ''}</span>)}
      </div>
    </div>
  );
}

export interface DayCell {
  start: number;
  traded: boolean;
  kept: boolean;
  entries?: number;
  pauses?: number;
}

const DAY_STATE = (d: DayCell) => (!d.traded ? 'idle' : d.kept ? 'kept' : 'broke');
const DAY_WORD: Record<string, string> = { idle: 'No trading', kept: 'Rules kept', broke: 'A rule was broken' };

/** Days as a calendar: one column per week, Monday at the top. */
export function Calendar({ days: given, span }: { days: DayCell[]; span?: number }) {
  if (given.length === 0) return null;
  // The whole period: days before the account's history show as no trading.
  const days = [...given];
  while (span && days.length < span) days.unshift({ start: days[0].start - 86_400_000, traded: false, kept: false });
  const lead = weekdayIndex(days[0].start);
  const cells: (DayCell | null)[] = [...Array(Math.max(0, lead)).fill(null), ...days];
  return (
    <div className="calendar">
      <div className="cal-days" aria-hidden="true">{['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="cal-grid" role="img" aria-label={`${days.filter((d) => d.kept).length} days kept of ${days.filter((d) => d.traded).length} traded`}>
        {cells.map((d, i) => d ? (
          <i key={i} className={`cal-cell ${DAY_STATE(d)}`} data-tip={`${weekday(d.start)} ${date(d.start)} · ${DAY_WORD[DAY_STATE(d)]}${d.traded ? ` · ${d.entries ?? 0} trades, ${d.pauses ?? 0} pauses` : ''}`} />
        ) : <i key={i} className="cal-cell pad" />)}
      </div>
    </div>
  );
}

/** The last seven days, as a strip. */
export function WeekStrip({ days, today }: { days: DayCell[]; today: number }) {
  // Always seven slots: days before the account's history show as no trading.
  const shown = [...days.slice(-7)];
  while (shown.length < 7) shown.unshift({ start: shown[0].start - 86_400_000, traded: false, kept: false });
  return (
    <ol className="week-strip">
      {shown.map((d) => {
        const s = DAY_STATE(d);
        const isToday = d.start <= today && today < d.start + 86_400_000;
        return (
          <li key={d.start} className={`wk ${s}${isToday ? ' today' : ''}`} title={`${weekday(d.start)} ${date(d.start)} · ${DAY_WORD[s]}`}>
            <span className="wk-dot">{s === 'kept' ? <Icon name="check" size={14} strokeWidth={2.4} /> : s === 'broke' ? <Icon name="minus" size={14} strokeWidth={2.4} /> : null}</span>
            <span className="wk-day">{isToday ? 'Today' : weekday(d.start)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** A KPI tile: label, value, optional note. */
export function Stat({ label, value, note, icon }: { label: string; value: ReactNode; note?: ReactNode; icon?: IconName }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{icon && <Icon name={icon} size={15} />}{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}
