// The content script on TradingView charts (SPEC §9.1, §7.5). It runs at document_start and listens in the capture
// phase on window, before TradingView's own listeners. It decides from the cached rules only: an order never waits
// for the network, and anything it can't read or decide passes (invariants 1–3).
import { classifyOrder, evaluate, planPause, type EvalInput, type Order, type State } from '@dg/core';
import { CACHE_KEY, accountKey, type Cache, type QueuedEvent, type TvAccount } from './messages.ts';
import { makeFmt, PauseUI } from './pause.ts';
import { guardedTarget, orderKey, panelOpen, readAccount, readOrder, readPositions, tradeRows, type Guarded } from './tv.ts';

const PASS_MS = 10_000;
const EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'keydown'] as const;

const ONE_CLICK_KEY = 'dg_one_click';

let cache: Cache | undefined;
/** Whether the chart's Buy/Sell buttons send orders (one-click trading). Learned from what a click does; unknown = pass. */
let oneClick: boolean | undefined;
chrome.storage.local.get([CACHE_KEY, ONE_CLICK_KEY]).then((v) => {
  cache = v[CACHE_KEY] as Cache | undefined;
  oneClick = v[ONE_CLICK_KEY] as boolean | undefined;
});
chrome.storage.onChanged.addListener((c) => {
  if (c[CACHE_KEY]) cache = c[CACHE_KEY].newValue as Cache | undefined;
  if (c[ONE_CLICK_KEY]) oneClick = c[ONE_CLICK_KEY].newValue as boolean | undefined;
});

/** A floating Buy/Sell click that went through: did it open the order panel (one-click off) or send an order (on)? */
function learnOneClick() {
  const panelBefore = panelOpen();
  const rowsBefore = tradeRows();
  setTimeout(() => {
    let v: boolean | undefined;
    if (!panelBefore && panelOpen()) v = false;
    else if (tradeRows() !== rowsBefore) v = true;
    if (v !== undefined && v !== oneClick) void chrome.storage.local.set({ [ONE_CLICK_KEY]: v });
  }, 1200);
}

const ui = new PauseUI();
/** Entries and overrides from this page since the last sync, so the next order counts them before the server has. */
const local: { entries: State['entries']; overrides: number[]; lastSkip?: State['lastSkip'] } = { entries: [], overrides: [] };

interface Gesture {
  el: Element;
  hold: boolean;
  /** Set when the order goes through: counted at the click that ends the gesture. */
  entry?: { key: string; order: Omit<Order, 'kind'>; pauseId?: string };
}
let gesture: Gesture | null = null;
/** One-time pass after Place anyway: the trader's next click on the same control with the same order goes through. */
let pass: { el: Element; key: string; until: number; pauseId: string } | null = null;

const now = () => Date.now() + (cache?.skew ?? 0);
const rid = () => crypto.getRandomValues(new Uint32Array(3)).reduce((s, x) => s + x.toString(36), '');

function send(account: TvAccount, events: Omit<QueuedEvent, 'id'>[]) {
  const withIds = events.map((e) => ({ id: `tv_${rid()}`, ...e }) as QueuedEvent);
  chrome.runtime.sendMessage({ type: 'events', accountKey: accountKey(account), events: withIds }).catch(() => {});
}

/** Tells the service worker which account this chart trades on. Repeated, since the trader may sign in later. */
let lastReport = 0;
function reportAccount(a: TvAccount) {
  if (performance.now() - lastReport < 4000) return;
  lastReport = performance.now();
  chrome.runtime.sendMessage({ type: 'account', account: a }).catch(() => {});
}

function stateFor(c: Cache, accountId: string): State {
  const snap = c.snapshot ?? {};
  const accounts: State['accounts'] = {};
  for (const a of Object.values(c.accounts)) {
    const sa = snap.accounts?.[a.id];
    accounts[a.id] = { platform: 'tv', netting: true, positions: [], limitReachedAt: sa?.limitReachedAt };
  }
  accounts[accountId] = { ...accounts[accountId], platform: 'tv', netting: true, positions: readPositions() ?? [] };
  const since = snap.asOf ?? 0;
  return {
    entries: [...(snap.entries ?? []), ...local.entries.filter((e) => e.t > since)],
    closes: snap.closes ?? [],
    overrides: [...(snap.overrides ?? []), ...local.overrides.filter((t) => t > since)],
    breakUntil: snap.breakUntil ?? undefined,
    doneUntil: snap.doneUntil ?? undefined,
    lastSkip: local.lastSkip && (!snap.lastSkip || local.lastSkip.t > snap.lastSkip.t) ? local.lastSkip : (snap.lastSkip ?? undefined),
    accounts,
    clock: { verified: true },
  };
}

/** Decides one gesture on a guarded control: hold it for a pause, or let it through. */
function decide(e: Event, g: Guarded): Gesture {
  const through: Gesture = { el: g.el, hold: false };
  if (!e.isTrusted) return through;
  const account = readAccount();
  if (!account) return through;
  reportAccount(account);
  // Floating buttons send an order only with one-click on (SPEC §9.1). Until that is known, they pass and it is learned.
  if (g.path === 'floating' && oneClick !== true) {
    if (e.type === 'pointerdown' || e.type === 'mousedown') learnOneClick();
    return through;
  }
  const c = cache;
  const acct = c?.accounts[accountKey(account)];
  if (!c?.signed || !acct || !acct.enforced || !c.signed.license.enforcing) return through;
  const read = readOrder(g, acct.id);
  if (!read) {
    send(account, [{ type: 'unclassified', t: now() }]);
    return through;
  }
  const key = orderKey(read);
  if (pass && pass.el === g.el && pass.key === key && performance.now() < pass.until) {
    return { el: g.el, hold: false, entry: { key, order: read, pauseId: pass.pauseId } };
  }
  const state = stateFor(c, acct.id);
  const cls = classifyOrder(state.accounts[acct.id], readPositions(), read.symbol, read.side, read.size);
  // Closing and reducing are never paused (invariant 1). Without the positions table the order can't be classified:
  // it passes and counts as an order we couldn't check (SPEC §4.5).
  if (cls.kind === 'exit') return through;
  if (cls.kind === 'unclassified') {
    send(account, [{ type: 'unclassified', t: now() }]);
    return through;
  }
  const order: Order = { ...read, kind: 'entry' };
  const input: EvalInput = { rules: c.signed.rules, time: c.signed.time, state, order, now: now() };
  const plan = planPause(input, evaluate(input), c.signed.popup);
  if (!plan) return { el: g.el, hold: false, entry: { key, order: read } };
  showPause(account, order, plan, c, g.el, key);
  return { el: g.el, hold: true };
}

function showPause(account: TvAccount, order: Order, plan: NonNullable<ReturnType<typeof planPause>>, c: Cache, el: Element, key: string) {
  const s = c.signed!;
  const note = s.notes[0];
  const pauseId = `tvp_${rid()}`;
  ui.show(
    { plan, order, note, planText: s.plan, fmt: makeFmt(s.time, account.currency, s.hideAmounts), r3Seconds: s.rules.R3.seconds },
    (decision, info) => {
      const t = now();
      send(account, [{
        type: 'pause', t, pauseId, rules: plan.violations.map((v) => v.rule), title: plan.title, decision, shownSec: info.shownSec, waitSec: plan.waitSec,
        placedAnyway: decision === 'place' ? plan.placedAnyway + 1 : undefined, reattempt: plan.reattemptAgoSec !== undefined,
        symbol: order.symbol, side: order.side, size: order.size, sent: false, reason: info.reason,
      }]);
      if (decision === 'place') {
        pass = { el, key, until: performance.now() + PASS_MS, pauseId };
        ui.note(`Click ${order.side === 'buy' ? 'Buy' : 'Sell'} to place it (10 s).`, PASS_MS);
      } else {
        local.lastSkip = { t, symbol: order.symbol, side: order.side, waitSec: plan.waitSec };
      }
    },
  );
}

/** The order went through (the gesture's final click or Enter): count it once. */
function counted(g: Gesture) {
  const account = readAccount();
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
  if (ui.owns(e)) return;
  let g: Guarded | null = null;
  try {
    g = guardedTarget(e);
  } catch {
    return;
  }
  if (!g) return;
  const starts = e.type === 'pointerdown' || e.type === 'keydown' || (e.type === 'mousedown' && gesture?.el !== g.el);
  if (starts || !gesture || gesture.el !== g.el) {
    try {
      gesture = ui.open ? { el: g.el, hold: true } : decide(e, g);
    } catch {
      gesture = { el: g.el, hold: false };
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

// The Account Manager can appear any time: tell the service worker which account this chart trades on.
const seen = setInterval(() => {
  const a = readAccount();
  if (a) reportAccount(a);
}, 5000);
addEventListener('pagehide', () => clearInterval(seen));
