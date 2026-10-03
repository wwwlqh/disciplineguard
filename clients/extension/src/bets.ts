// The bet guard shared by the prediction-market content scripts (Polymarket, Kalshi). Same contract as content.ts on
// TradingView: it holds a Buy that breaks the trader's rules in the capture phase, decides from the cached rules only,
// and anything it can't read passes. Selling is never paused (invariant 1). Bets have no stop loss, so "Stop loss
// required" doesn't apply. Loss today = the portfolio value at the first read of the day minus the value now (kept in
// the extension). Each site only supplies its page reader (pm.ts, kalshi.ts).
import {
  accountResets, activeCooldown, dayOf, entriesToday, evaluate, nextReset, planPause, r8Status, round8,
  BREAK_MINUTES, type EvalInput, type Order, type Rules, type State,
} from '@dg/core';
import { CACHE_KEY, accountKey, type Cache, type QueuedEvent, type TvAccount } from './messages.ts';
import { makeFmt, PauseUI } from './pause.ts';
import { Pill, type PillView } from './pill.ts';
import { API } from './config.ts';

export interface BetSite {
  /** "Polymarket", as the pill names it. */
  name: string;
  /** What the account is called there: "wallet" or "account". */
  accountWord: string;
  /** Prefix of event ids and of the day-start key. Never change it: the day start is stored under it. */
  prefix: string;
  /** The guarded submit this event is on, or null. Never a sell, a deposit or a sign-in. */
  guardedTarget(e: Event): Element | null;
  readAccount(): TvAccount | undefined;
  /** Portfolio value, or undefined when it can't be read. */
  readEquity(): number | undefined;
  /** The bet this submit would place, or undefined when it can't be read (the click then passes). */
  readOrder(submit: Element, account: string): Omit<Order, 'kind'> | undefined;
}

export function orderKey(o: Omit<Order, 'kind'>): string {
  return [o.account, o.symbol, o.side, o.size].join('|');
}

const PASS_MS = 10_000;
const EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'keydown'] as const;

function textOf(el: Element): string {
  return ((el as HTMLElement).innerText ?? el.textContent ?? '').trim().replace(/\s+/g, ' ');
}

export function guardBets(site: BetSite): void {
  const DAY_START_KEY = `dg_${site.prefix}_day_start`;
  let cache: Cache | undefined;
  let dayStarts: Record<string, { dayStart: number; balance: number }> = {};
  chrome.storage.local.get([CACHE_KEY, DAY_START_KEY]).then((v) => {
    cache = v[CACHE_KEY] as Cache | undefined;
    dayStarts = (v[DAY_START_KEY] as typeof dayStarts | undefined) ?? {};
  });
  chrome.storage.onChanged.addListener((c) => {
    if (c[CACHE_KEY]) cache = c[CACHE_KEY].newValue as Cache | undefined;
  });

  const ui = new PauseUI();
  const local: {
    entries: State['entries'];
    overrides: number[];
    lastSkip?: State['lastSkip'];
    breakUntil?: number;
    doneUntil?: number;
    limitReachedAt: Record<string, number>;
  } = { entries: [], overrides: [], limitReachedAt: {} };

  interface Gesture {
    el: Element;
    hold: boolean;
    entry?: { order: Omit<Order, 'kind'>; pauseId?: string };
  }
  let gesture: Gesture | null = null;
  let pass: { el: Element; key: string; until: number; pauseId: string } | null = null;

  const now = () => Date.now() + (cache?.skew ?? 0);
  const rid = () => crypto.getRandomValues(new Uint32Array(3)).reduce((s, x) => s + x.toString(36), '');

  /** The trader's rules without "Stop loss required": bets have no stop loss. */
  const betRules = (r: Rules): Rules => ({ ...r, R9: { ...r.R9, on: false } });

  function send(account: TvAccount, events: Omit<QueuedEvent, 'id'>[]) {
    const withIds = events.map((e) => ({ id: `${site.prefix}_${rid()}`, ...e }) as QueuedEvent);
    chrome.runtime.sendMessage({ type: 'events', accountKey: accountKey(account), events: withIds }).catch(() => {});
  }

  let lastReport = 0;
  function reportAccount(a: TvAccount) {
    if (performance.now() - lastReport < 4000) return;
    lastReport = performance.now();
    chrome.runtime.sendMessage({ type: 'account', account: a }).catch(() => {});
  }

  function lossToday(c: Cache, accountId: string, equity: number | undefined): number | undefined {
    if (!c.signed || equity === undefined) return undefined;
    const start = dayOf(accountResets(c.signed.time, accountId), now()).start;
    let rec = dayStarts[accountId];
    if (!rec || rec.dayStart !== start) {
      rec = dayStarts[accountId] = { dayStart: start, balance: equity };
      void chrome.storage.local.set({ [DAY_START_KEY]: dayStarts });
    }
    return round8(rec.balance - equity);
  }

  function stateFor(c: Cache, accountId: string): State {
    const snap = c.snapshot ?? {};
    const accounts: State['accounts'] = {};
    for (const a of Object.values(c.accounts)) {
      const sa = snap.accounts?.[a.id];
      accounts[a.id] = { platform: 'tv', netting: true, positions: [], limitReachedAt: sa?.limitReachedAt ?? local.limitReachedAt[a.id] };
    }
    accounts[accountId] = { ...accounts[accountId], platform: 'tv', netting: true, positions: [], tvLoss: lossToday(c, accountId, site.readEquity()) };
    const since = snap.asOf ?? 0;
    const later = (a?: number | null, b?: number) => Math.max(a ?? 0, b ?? 0) || undefined;
    return {
      entries: [...(snap.entries ?? []), ...local.entries.filter((e) => e.t > since)],
      closes: snap.closes ?? [],
      overrides: [...(snap.overrides ?? []), ...local.overrides.filter((t) => t > since)],
      breakUntil: later(snap.breakUntil, local.breakUntil),
      doneUntil: later(snap.doneUntil, local.doneUntil),
      lastSkip: local.lastSkip && (!snap.lastSkip || local.lastSkip.t > snap.lastSkip.t) ? local.lastSkip : (snap.lastSkip ?? undefined),
      accounts,
      clock: { verified: true },
    };
  }

  function decide(e: Event, el: Element): Gesture {
    const through: Gesture = { el, hold: false };
    if (!e.isTrusted) return through;
    const account = site.readAccount();
    if (!account) return through;
    reportAccount(account);
    const c = cache;
    const acct = c?.accounts[accountKey(account)];
    if (!c?.signed || !acct || !acct.enforced || !c.signed.license.enforcing) return through;
    const read = site.readOrder(el, acct.id);
    if (!read) {
      send(account, [{ type: 'unclassified', t: now() }]);
      return through;
    }
    const key = orderKey(read);
    if (pass && pass.el === el && pass.key === key && performance.now() < pass.until) {
      return { el, hold: false, entry: { order: read, pauseId: pass.pauseId } };
    }
    const order: Order = { ...read, kind: 'entry' };
    const input: EvalInput = { rules: betRules(c.signed.rules), time: c.signed.time, state: stateFor(c, acct.id), order, now: now() };
    const plan = planPause(input, evaluate(input), c.signed.popup);
    if (!plan) return { el, hold: false, entry: { order: read } };
    showPause(account, order, plan, c, el, key);
    return { el, hold: true };
  }

  function showPause(account: TvAccount, order: Order, plan: NonNullable<ReturnType<typeof planPause>>, c: Cache, el: Element, key: string) {
    const s = c.signed!;
    const pauseId = `${site.prefix}p_${rid()}`;
    const button = textOf(el) || 'Buy';
    ui.show(
      { plan, order, fmt: makeFmt(s.time, 'USD', s.hideAmounts), r3Seconds: s.rules.R3.seconds },
      (decision, info) => {
        const t = now();
        send(account, [{
          type: 'pause', t, pauseId, rules: plan.violations.map((v) => v.rule), title: plan.title, decision, shownSec: info.shownSec, waitSec: plan.waitSec,
          placedAnyway: decision === 'place' ? plan.placedAnyway + 1 : undefined, reattempt: plan.reattemptAgoSec !== undefined,
          symbol: order.symbol, side: order.side, size: order.size, sent: false, reason: info.reason,
        }]);
        if (decision === 'place') {
          pass = { el, key, until: performance.now() + PASS_MS, pauseId };
          ui.note(`Click ${button} to place it (10 s).`, PASS_MS);
        } else {
          local.lastSkip = { t, symbol: order.symbol, side: order.side, waitSec: plan.waitSec };
        }
      },
    );
  }

  function counted(g: Gesture) {
    const account = site.readAccount();
    if (!g.entry || !account) return;
    const { order, pauseId } = g.entry;
    const t = now();
    local.entries.push({ t, account: order.account, symbol: order.symbol, side: order.side, size: order.size });
    const events: Omit<QueuedEvent, 'id'>[] = [{ type: 'entry', t, symbol: order.symbol, side: order.side, size: order.size, source: 'panel', pauseId }];
    if (pauseId) {
      local.overrides.push(t);
      events.unshift({ type: 'pause_sent', t, pauseId });
      pass = null;
      ui.hideNote();
    }
    send(account, events);
  }

  function onEvent(e: Event) {
    if (ui.owns(e) || pill.owns(e)) return;
    let el: Element | null = null;
    try {
      el = site.guardedTarget(e);
    } catch {
      return;
    }
    if (!el) return;
    const starts = e.type === 'pointerdown' || e.type === 'keydown' || (e.type === 'mousedown' && gesture?.el !== el);
    if (starts || !gesture || gesture.el !== el) {
      try {
        gesture = ui.open ? { el, hold: true } : decide(e, el);
      } catch {
        gesture = { el, hold: false };
      }
    }
    const current = gesture;
    if (current.hold) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    if (e.type === 'click' || e.type === 'keydown') {
      if (!current.hold) counted(current);
      gesture = null;
    }
  }

  for (const t of EVENTS) window.addEventListener(t, onEvent, { capture: true });

  /** Every 2 s: report the account, and tell the server the first time loss today reaches the limit. */
  function watch() {
    const account = site.readAccount();
    if (!account) return;
    reportAccount(account);
    const c = cache;
    const acct = c?.accounts[accountKey(account)];
    if (!c?.signed || !acct) return;
    const state = stateFor(c, acct.id);
    const t = now();
    const r8 = r8Status({ rules: c.signed.rules, time: c.signed.time, state }, acct.id, t);
    if (r8.inLimit && state.accounts[acct.id].limitReachedAt === undefined) {
      local.limitReachedAt[acct.id] = t;
      const dayStart = dayOf(accountResets(c.signed.time, acct.id), t).start;
      send(account, [{ type: 'limit_reached', t, dayStart, loss: r8.loss, limit: r8.limit }]);
    }
  }

  const pill = new Pill(
    {
      open: (page) => window.open(`${API}/${page}`, '_blank', 'noopener'),
      takeBreak: () => tighten('break', now() + BREAK_MINUTES * 60_000),
      doneToday: () => cache?.signed && tighten('done_today', nextReset(cache.signed.time.userResets, now())),
    },
    () => new DOMRect(0, 0, innerWidth, innerHeight),
  );

  function tighten(type: 'break' | 'done_today', until: number) {
    const account = site.readAccount();
    if (!account) return;
    if (type === 'break') local.breakUntil = until;
    else local.doneUntil = until;
    send(account, [{ type, t: now(), until }]);
    renderPill();
  }

  const mmss = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`;

  function pillView(): PillView | undefined {
    const c = cache;
    if (!c || c.status === 'signed_out') return { tone: 'off', text: 'Off · Signed out', lines: ['Bets go through normally.', 'Sign in from the DisciplineGuard toolbar button.'], actions: false };
    const account = site.readAccount();
    const acct = account && c.accounts[accountKey(account)];
    const refused = account && !acct ? c.refused?.[accountKey(account)] : undefined;
    if (refused === 'account_taken') {
      return { tone: 'off', text: 'Off · On another login', lines: [`This ${site.accountWord} is protected under another DisciplineGuard login.`, 'Bets go through normally.'], actions: false };
    }
    if (refused === 'account_cap') {
      return { tone: 'off', text: 'Off · Account limit', lines: ['The free plan covers 1 trading account.', 'Remove the other account on disciplineguard.leowqiheng.workers.dev/devices. Bets go through normally.'], actions: false };
    }
    if (!account || !acct || !c.signed) return { tone: 'setup', text: 'Setting up', lines: [`Log in to ${site.name} to turn on protection.`], actions: false };
    const where = `${site.name} …${acct.last3}`;
    if (c.status === 'attention') return { tone: 'attention', text: 'Needs attention', lines: ['Sign in again. Your saved rules still apply.', where], actions: false };
    if (!acct.enforced) return { tone: 'off', text: 'Off', lines: [`This ${site.accountWord} isn’t protected. Bets go through normally.`], actions: false };
    if (!c.signed.license.enforcing) return { tone: 'off', text: 'Off', lines: ['Bets are no longer paused.'], actions: false };

    const s = c.signed;
    const t = now();
    const state = stateFor(c, acct.id);
    const fmt = makeFmt(s.time, 'USD', s.hideAmounts);
    const parts: string[] = [];
    const lines: string[] = [];
    if (state.doneUntil && t < state.doneUntil) parts.push('done for today');
    else if (state.breakUntil && t < state.breakUntil) parts.push(state.breakUntil - t > 3_600_000 ? `break until ${fmt.time(state.breakUntil)}` : `break ${mmss(state.breakUntil - t)}`);
    if (s.rules.R1.on) {
      const n = entriesToday({ rules: s.rules, time: s.time, state }, t);
      parts.push(`${n} of ${s.rules.R1.max} bets`);
      lines.push(`Bets today: ${n} of ${s.rules.R1.max}`);
    }
    const r8 = r8Status({ rules: s.rules, time: s.time, state }, acct.id, t);
    if (r8.applies) {
      if (!s.rules.R1.on) parts.push(r8.inLimit ? 'loss limit reached' : `loss ${fmt.money(r8.loss, acct.id)} of ${fmt.money(r8.limit, acct.id)}`);
      lines.push(r8.inLimit ? 'Daily loss limit reached' : `Loss today: ${fmt.money(Math.max(0, r8.loss), acct.id)} of ${fmt.money(r8.limit, acct.id)}`);
    }
    if (s.rules.R7.on) {
      const cd = activeCooldown(s.rules, state.closes, t);
      if (cd && t < cd.until) parts.push(`cooldown ${mmss(cd.until - t)}`);
    }
    lines.push(`Protecting ${where}`);
    return { tone: 'on', text: [c.status === 'offline' ? 'On (offline)' : 'On', ...parts.slice(0, 2)].join(' · '), lines, actions: true };
  }

  function renderPill() {
    try {
      const v = pillView();
      if (v) pill.render(v);
    } catch {}
  }

  const timers = [
    setInterval(() => {
      try {
        watch();
      } catch {}
    }, 2000),
    setInterval(renderPill, 1000),
  ];
  addEventListener('pagehide', () => timers.forEach(clearInterval));
}
