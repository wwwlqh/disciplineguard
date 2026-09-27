// The pause on TradingView (EXPERIENCE §9, SPEC §9.1 "Rendering"): a modal <dialog> in a closed shadow root, so it
// sits in the top layer, the page is inert and focus stays inside. Place anyway needs a real pointer click.
import { headline, localParts, otherRules, PAUSE_FOOTER, PAUSE_TIMEOUT_SEC, REASONS, wayOut, type Fmt, type Order, type PausePlan, type ResolvedTime } from '@dg/core';

declare const __DG_TEST__: boolean;

export type Decision = 'skip' | 'place' | 'timeout';

export interface PauseInput {
  plan: PausePlan;
  order: Order;
  note?: { text: string; setAt: number };
  planText: string;
  fmt: Fmt;
  r3Seconds: number;
  facts?: string;
}

const CSS = `
:host { all: initial; }
dialog { width: min(480px, calc(100vw - 32px)); border: 0; border-radius: 14px; padding: 22px; font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
  background: #fff; color: #131722; box-shadow: 0 16px 48px rgba(0,0,0,.35); font-variant-numeric: tabular-nums; }
dialog.dark { background: #1e222d; color: #d1d4dc; }
dialog::backdrop { background: rgba(0,0,0,.5); }
.label { font-size: 11px; letter-spacing: .08em; opacity: .65; display: flex; gap: 8px; align-items: center; }
.label b { width: 14px; height: 14px; border-radius: 4px; background: #0f766e; display: inline-block; }
.head { font-size: 18px; font-weight: 650; margin: 8px 0 6px; }
.others, .facts, .foot { font-size: 12px; opacity: .7; }
blockquote { font-size: 17px; margin: 10px 0 2px; }
.attrib { font-size: 12px; opacity: .6; margin-bottom: 6px; }
.lines div { margin: 4px 0; }
.chip { display: inline-block; font-size: 13px; border: 1px solid rgba(127,127,127,.4); border-radius: 999px; padding: 3px 10px; margin: 8px 0; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.chips button { min-height: 32px; padding: 4px 10px; font-size: 13px; border-radius: 999px; flex: none; }
.chips button[aria-pressed="true"] { border-color: #0f766e; color: #0f766e; }
.bar { height: 4px; background: rgba(127,127,127,.25); border-radius: 2px; overflow: hidden; margin: 10px 0 14px; }
.bar i { display: block; height: 100%; width: 0; background: #0f766e; }
.row { display: flex; gap: 8px; }
button { flex: 1; min-height: 44px; padding: 10px; border-radius: 10px; border: 1px solid rgba(127,127,127,.45); background: transparent; color: inherit; font: inherit; cursor: pointer; }
button.skip { background: #0f766e; border-color: #0f766e; color: #fff; font-weight: 600; }
button:disabled { opacity: .45; cursor: default; }
button:focus-visible { outline: 3px solid #5eead4; outline-offset: 2px; }
.foot { margin-top: 12px; }
.card { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 2147483647; background: #131722; color: #fff;
  padding: 10px 16px; border-radius: 10px; font: 13px system-ui, sans-serif; display: none; }
`;

export class PauseUI {
  private host = document.createElement('dg-pause');
  private root: ShadowRoot;
  private dlg: HTMLDialogElement;
  private card: HTMLDivElement;
  private cardTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Closed in real builds; the end-to-end test build opens it so the test can press the buttons.
    this.root = this.host.attachShadow({ mode: typeof __DG_TEST__ === 'boolean' && __DG_TEST__ ? 'open' : 'closed' });
    this.root.innerHTML = `<style>${CSS}</style><dialog aria-labelledby="h" aria-describedby="n"></dialog><div class="card" role="status"></div>`;
    this.dlg = this.root.querySelector('dialog')!;
    this.card = this.root.querySelector('.card')!;
    // TradingView's hotkeys never see keys typed in the pause.
    for (const t of ['keydown', 'keyup', 'keypress']) this.host.addEventListener(t, (e) => e.stopPropagation());
  }

  /** True when this event came from the pause itself. */
  owns(e: Event): boolean {
    return e.composedPath().includes(this.host);
  }

  get open(): boolean {
    return this.dlg.open;
  }

  private mount() {
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);
  }

  show(p: PauseInput, done: (d: Decision, info: { shownSec: number; reason?: string }) => void): void {
    this.mount();
    const opened = performance.now();
    const v = p.plan.violations[0];
    const out = wayOut(v, p.order, p.fmt);
    const others = otherRules(p.plan);
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const side = p.order.side === 'buy' ? 'Buy' : 'Sell';
    this.dlg.className = document.documentElement.classList.contains('theme-dark') ? 'dark' : '';
    this.dlg.innerHTML = `
      <div class="label"><b></b>PAUSE · YOUR RULE</div>
      <div class="head" id="h">${esc(headline(v, p.order, p.fmt, Date.now(), p.r3Seconds))}</div>
      ${others.length ? `<div class="others">Also: ${esc(others.join(' · '))}</div>` : ''}
      ${p.note ? `<blockquote id="n">“${esc(p.note.text)}”</blockquote><div class="attrib">you, ${new Date(p.note.setAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>` : ''}
      <div class="lines">
        ${p.planText ? `<div>Your plan: ${esc(p.planText)}.</div>` : ''}
        ${out ? `<div>${esc(out)}</div>` : ''}
        ${p.plan.reattemptAgoSec !== undefined ? `<div>You skipped this trade ${p.plan.reattemptAgoSec} s ago.</div>` : ''}
        <div>After Place anyway, click ${side} once more.</div>
      </div>
      ${p.facts ? `<div class="facts">${esc(p.facts)}</div>` : ''}
      <span class="chip">${side} ${esc(p.fmt.size(p.order.size, p.order))} ${esc(p.order.symbol)}${p.order.sl !== undefined ? ` · SL ${p.order.sl}` : ''}</span>
      <div class="chips" role="group" aria-label="Name it (optional)">${REASONS.map(([id, label]) => `<button data-r="${id}" aria-pressed="false">${label}</button>`).join('')}</div>
      <div class="bar" aria-hidden="true"><i></i></div>
      <div class="row"><button class="skip">Skip this trade</button><button class="place" disabled>Place anyway</button></div>
      <div class="foot">${esc(PAUSE_FOOTER)}</div>`;
    const place = this.dlg.querySelector<HTMLButtonElement>('.place')!;
    const bar = this.dlg.querySelector<HTMLElement>('.bar i')!;
    let reason: string | undefined;
    for (const b of this.dlg.querySelectorAll<HTMLButtonElement>('.chips button')) {
      b.addEventListener('click', () => {
        reason = reason === b.dataset.r ? undefined : b.dataset.r;
        for (const x of this.dlg.querySelectorAll<HTMLButtonElement>('.chips button')) x.setAttribute('aria-pressed', String(x.dataset.r === reason));
      });
    }
    const waitMs = p.plan.waitSec * 1000;
    let finished = false;
    const finish = (d: Decision) => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      this.dlg.close();
      done(d, { shownSec: Math.round((performance.now() - opened) / 100) / 10, reason });
    };
    const tick = () => {
      const elapsed = performance.now() - opened;
      const left = Math.max(0, waitMs - elapsed);
      bar.style.width = waitMs ? `${100 - (left / waitMs) * 100}%` : '100%';
      place.disabled = left > 0;
      place.textContent = left > 0 ? `Place anyway · 0:${String(Math.ceil(left / 1000)).padStart(2, '0')}` : `Place ${side} ${p.fmt.size(p.order.size, p.order)} ${p.order.symbol} anyway`;
      if (elapsed > PAUSE_TIMEOUT_SEC * 1000) finish('timeout');
    };
    const timer = setInterval(tick, 200);
    tick();
    this.dlg.querySelector('.skip')!.addEventListener('click', () => finish('skip'));
    // Only a real pointer click: keyboard activation arrives with detail 0 (SPEC §7.3).
    place.addEventListener('click', (e) => {
      if (e.isTrusted && e.detail > 0 && performance.now() - opened >= waitMs) finish('place');
    });
    place.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && e.preventDefault());
    this.dlg.oncancel = (e) => {
      e.preventDefault();
      finish('skip');
    };
    this.dlg.showModal();
    this.dlg.querySelector<HTMLButtonElement>('.skip')!.focus();
  }

  /** A small card, e.g. "Click Buy to place it (10 s)." */
  note(text: string, ms: number): void {
    this.mount();
    this.card.textContent = text;
    this.card.style.display = 'block';
    clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(() => (this.card.style.display = 'none'), ms);
  }

  hideNote(): void {
    this.card.style.display = 'none';
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
