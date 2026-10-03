// The rule-break note (EXPERIENCE §9): a small card at the top right of the page, in a closed shadow root, after a
// counted trade broke a rule. It never holds or blocks anything: the trade has already gone through.
import { breakLine, localParts, RULE_NAMES, type Fmt, type Order, type ResolvedTime, type Violation } from '@dg/core';

declare const __DG_TEST__: boolean;

const NOTE_MS = 8000;

// The DisciplineGuard icon (web/public/mark.svg, simplified): two candlesticks.
const MARK = `<svg viewBox="0 0 256 256" aria-hidden="true"><defs><linearGradient id="dg-m" x1="40" y1="8" x2="216" y2="248" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#6af4cc"/><stop offset=".33" stop-color="#1cd0d0"/><stop offset=".67" stop-color="#1e98f2"/><stop offset="1" stop-color="#5262f4"/></linearGradient></defs><rect x="8" y="8" width="240" height="240" rx="62" fill="url(#dg-m)"/><g fill="#fff"><rect x="92" y="62" width="12" height="150" rx="6"/><rect x="76" y="92" width="44" height="94" rx="13"/><rect x="152" y="42" width="12" height="150" rx="6"/><rect x="136" y="70" width="44" height="94" rx="13"/></g></svg>`;

const CSS = `
:host { all: initial; }
.note { position: fixed; top: 64px; right: 16px; z-index: 2147483647; width: min(340px, calc(100vw - 32px)); box-sizing: border-box;
  padding: 14px 16px 13px; border-radius: 16px; border: 1px solid rgba(15,23,42,.08); font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
  background: linear-gradient(110deg, #5af0cf, #2fd3e3 50%, #3aaaf5) 16px 0 / calc(100% - 32px) 3px no-repeat, #fff; color: #131722;
  box-shadow: 0 24px 60px -20px rgba(15,50,110,.45); display: none; font-variant-numeric: tabular-nums; }
.note.dark { background-color: #1e222d; color: #d1d4dc; border-color: rgba(255,255,255,.08); }
.note.on { display: block; }
.label { font-size: 10.5px; letter-spacing: .12em; font-weight: 650; display: flex; gap: 7px; align-items: center; }
.label span { opacity: .6; }
.label svg { width: 15px; height: 15px; flex: none; }
.head { font-size: 14.5px; font-weight: 650; margin: 7px 0 3px; }
.line { opacity: .72; }
`;

export class NoteUI {
  private host = document.createElement('dg-note');
  private root: ShadowRoot;
  private box: HTMLDivElement;
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Closed in real builds; the end-to-end test build opens it so the test can read it.
    this.root = this.host.attachShadow({ mode: typeof __DG_TEST__ === 'boolean' && __DG_TEST__ ? 'open' : 'closed' });
    this.root.innerHTML = `<style>${CSS}</style><div class="note" role="status" aria-live="polite"></div>`;
    this.box = this.root.querySelector('.note')!;
  }

  /** A counted trade broke these rules: the first one in words, the rest by name. */
  broke(violations: Violation[], order: Order, fmt: Fmt, at: number, r3Seconds: number): void {
    if (!violations.length) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const also = violations.slice(1).map((v) => RULE_NAMES[v.rule]);
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);
    this.box.className = `note on${document.documentElement.classList.contains('theme-dark') ? ' dark' : ''}`;
    this.box.innerHTML = `
      <div class="label">${MARK}<span>PAST YOUR RULE · ${esc(RULE_NAMES[violations[0].rule].toUpperCase())}</span></div>
      <div class="head">${esc(breakLine(violations[0], order, fmt, at, r3Seconds))}</div>
      <div class="line">It counts toward today.${also.length ? ` Also: ${esc(also.join(', '))}.` : ''}</div>`;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.box.classList.remove('on'), NOTE_MS);
  }
}

/** Times in the trader's timezone, money in the account currency, sizes in units (EXPERIENCE §2.4). */
export function makeFmt(time: ResolvedTime, currency: string | undefined, hideAmounts: boolean): Fmt {
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    time(t: number) {
      const a = localParts(time.offsets, t);
      const now = localParts(time.offsets, Date.now());
      const hm = `${String(Math.floor(a.msOfDay / 3_600_000)).padStart(2, '0')}:${String(Math.floor((a.msOfDay % 3_600_000) / 60_000)).padStart(2, '0')}`;
      return a.dayNumber === now.dayNumber ? hm : `${WD[a.weekday]} ${hm}`;
    },
    money(x: number) {
      if (hideAmounts) return '—';
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(Math.abs(x));
    },
    size(x: number) {
      return String(+x.toFixed(8));
    },
  };
}
