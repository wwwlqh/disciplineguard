// The content script on TradingView charts (SPEC §9.1). It runs at document_start and listens passively in the
// capture phase on window: it reads each order the trader sends and counts it against the cached rules. It never
// holds, delays or blocks an order, and never waits for the network.
import {
  accountResets, activeCooldown, classifyOrder, dayOf, entriesToday, evaluate, nextReset, r8Status, round8,
  BREAK_MINUTES, type Order, type Position, type State, type Violation,
} from '@dg/core';
import { CACHE_KEY, accountKey, type Cache, type QueuedEvent, type TvAccount } from './messages.ts';
import { loadPage } from './pageconfig.ts';
import { makeFmt, NoteUI } from './note.ts';
import { Pill, type PillView } from './pill.ts';
import {
  chartRect, orderTarget, isOrder, panelOpen, readAccount, readOrder, readPositions, readSummary, tradeRows, usePage, type OrderTarget,
} from './tv.ts';
import { diffPositions, unexplained, type Expected } from './watch.ts';
import { API } from './config.ts';

const EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'keydown'] as const;

const ONE_CLICK_KEY = 'dg_one_click';
const DAY_START_KEY = 'dg_day_start';

let cache: Cache | undefined;
/** Whether the chart's Buy/Sell buttons send orders (one-click trading). Learned from what a click does; unknown = not counted at the click. */
let oneClick: boolean | undefined;
/** Balance at the first read of each account's trading day, for R8 (kept in the extension, SPEC §9.1). */
let dayStarts: Record<string, { dayStart: number; balance: number }> = {};
chrome.storage.local.get([CACHE_KEY, ONE_CLICK_KEY, DAY_START_KEY]).then((v) => {
  cache = v[CACHE_KEY] as Cache | undefined;
  oneClick = v[ONE_CLICK_KEY] as boolean | undefined;
  dayStarts = (v[DAY_START_KEY] as typeof dayStarts | undefined) ?? {};
});
chrome.storage.onChanged.addListener((c) => {
  if (c[CACHE_KEY]) cache = c[CACHE_KEY].newValue as Cache | undefined;
  if (c[ONE_CLICK_KEY]) oneClick = c[ONE_CLICK_KEY].newValue as boolean | undefined;
});
void loadPage((p) => usePage(p));

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

const ui = new NoteUI();
/** Events from this page since the last sync, so the next trade counts them before the server has. */
const local: {
  entries: State['entries'];
  closes: State['closes'];
  breakUntil?: number;
  doneUntil?: number;
  limitReachedAt: Record<string, number>;
} = { entries: [], closes: [], limitReachedAt: {} };
/** Entries counted at the click, not yet seen in the positions table, so they aren't counted twice. */
const expected: Expected[] = [];

interface Gesture {
  el: Element;
  /** The order this gesture sends, read at its start: counted at the click that ends it. */
  entry?: { order: Order; violations: Violation[]; at: number };
}
let gesture: Gesture | null = null;

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

/** Loss today on this account: balance at the start of its trading day minus equity now. Undefined if unreadable. */
function lossToday(c: Cache, accountId: string, sum: { balance?: number; equity?: number }): number | undefined {
  if (!c.signed) return undefined;
  const start = dayOf(accountResets(c.signed.time, accountId), now()).start;
  let rec = dayStarts[accountId];
  if (!rec || rec.dayStart !== start) {
    if (sum.balance === undefined) return undefined;
    rec = dayStarts[accountId] = { dayStart: start, balance: sum.balance };
    void chrome.storage.local.set({ [DAY_START_KEY]: dayStarts });
  }
  return sum.equity === undefined ? undefined : round8(rec.balance - sum.equity);
}

function stateFor(c: Cache, accountId: string, positions = readPositions() ?? [], sum = readSummary()): State {
  const snap = c.snapshot ?? {};
  const accounts: State['accounts'] = {};
  for (const a of Object.values(c.accounts)) {
    const sa = snap.accounts?.[a.id];
    accounts[a.id] = { platform: 'tv', netting: true, positions: [], limitReachedAt: sa?.limitReachedAt ?? local.limitReachedAt[a.id] };
  }
  accounts[accountId] = { ...accounts[accountId], platform: 'tv', netting: true, positions, tvLoss: lossToday(c, accountId, sum) };
  const since = snap.asOf ?? 0;
  const later = (a?: number | null, b?: number) => Math.max(a ?? 0, b ?? 0) || undefined;
  return {
    entries: [...(snap.entries ?? []), ...local.entries.filter((e) => e.t > since)],
    closes: [...(snap.closes ?? []), ...local.closes.filter((e) => e.t > since)],
    breakUntil: later(snap.breakUntil, local.breakUntil),
    doneUntil: later(snap.doneUntil, local.doneUntil),
    accounts,
    clock: { verified: true },
  };
}

/** Reads the order a gesture on a Buy/Sell control sends, and the rules it breaks. Never holds it. */
function read(e: Event, g: OrderTarget): Gesture {
  const none: Gesture = { el: g.el };
  if (!e.isTrusted) return none;
  const account = readAccount();
  if (!account) return none;
  reportAccount(account);
  // Floating buttons send an order only with one-click on (SPEC §9.1). Until that is known, it is learned.
  if (g.path === 'floating' && oneClick !== true) {
    if (e.type === 'pointerdown' || e.type === 'mousedown') learnOneClick();
    return none;
  }
  const c = cache;
  const acct = c?.accounts[accountKey(account)];
  if (!c?.signed || !acct || !acct.enforced || !c.signed.license.enforcing) return none;
  const o = readOrder(g, acct.id);
  if (!o && !isOrder(g)) return none;
  if (!o) {
    send(account, [{ type: 'unclassified', t: now() }]);
    return none;
  }
  const state = stateFor(c, acct.id);
  const cls = classifyOrder(state.accounts[acct.id], readPositions(), o.symbol, o.side, o.size);
  // Closing and reducing aren't entries. Without the positions table the order can't be classified: it counts as an
  // order we couldn't check (SPEC §4.5), and the positions table counts it if it opens a position.
  if (cls.kind === 'exit') return none;
  if (cls.kind === 'unclassified') {
    send(account, [{ type: 'unclassified', t: now() }]);
    return none;
  }
  const order: Order = { ...o, kind: 'entry' };
  const at = now();
  return { el: g.el, entry: { order, at, violations: evaluate({ rules: c.signed.rules, time: c.signed.time, state, order, now: at }) } };
}

/** The order went through (the gesture's final click or Enter): count it once, with the rules it broke. */
function counted(g: Gesture) {
  const account = readAccount();
  if (!g.entry || !account) return;
  const { order, violations } = g.entry;
  const t = now();
  local.entries.push({ t, account: order.account, symbol: order.symbol, side: order.side, size: order.size });
  expected.push({ t: Date.now(), symbol: order.symbol, side: order.side, size: order.size, pending: order.type !== 'market' });
  send(account, [{ type: 'entry', t, symbol: order.symbol, side: order.side, size: order.size, pending: order.type !== 'market', source: 'click', violations: violations.map((v) => v.rule) }]);
  showBroke(account, order, violations, t);
}

function showBroke(account: TvAccount, order: Order, violations: Violation[], at: number) {
  const s = cache?.signed;
  if (s && violations.length) ui.broke(violations, order, makeFmt(s.time, account.currency, s.hideAmounts), at, s.rules.R3.seconds);
}

function onEvent(e: Event) {
  if (pill.owns(e)) return;
  let g: OrderTarget | null = null;
  try {
    g = orderTarget(e);
  } catch {
    return;
  }
  if (!g) return;
  const starts = e.type === 'pointerdown' || e.type === 'keydown' || (e.type === 'mousedown' && gesture?.el !== g.el);
  if (starts || !gesture || gesture.el !== g.el) {
    try {
      gesture = read(e, g);
    } catch {
      gesture = { el: g.el };
    }
  }
  if (e.type === 'click' || e.type === 'keydown') {
    try {
      counted(gesture);
    } catch {}
    gesture = null;
  }
}

for (const t of EVENTS) window.addEventListener(t, onEvent, { capture: true, passive: true });

//--- the Account Manager: trades placed elsewhere, closes and R8 (SPEC §9.1 "Table detection", §5.2) ---------

/** The last read of the counted account on this chart. The first read is the baseline: nothing is counted from it. */
let seen: { key: string; positions?: Position[]; pending?: Position[]; balance?: number; close?: { size: number; balance?: number; at: number } } | undefined;

function tableEntry(account: TvAccount, c: Cache, accountId: string, enforcing: boolean, p: { symbol: string; side: 'buy' | 'sell'; size: number }) {
  const t = now();
  const order: Order = { platform: 'tv', account: accountId, symbol: p.symbol, side: p.side, size: p.size, type: 'market', kind: 'entry' };
  // Its stop loss can't be read from the table, so "Stop loss required" isn't judged here.
  const rules = { ...c.signed!.rules, R9: { on: false } };
  const violations = enforcing ? evaluate({ rules, time: c.signed!.time, state: stateFor(c, accountId), order, now: t }) : [];
  local.entries.push({ t, account: accountId, symbol: p.symbol, side: p.side, size: p.size });
  send(account, [{ type: 'entry', t, symbol: p.symbol, side: p.side, size: p.size, source: 'history', violations: violations.map((v) => v.rule) }]);
  showBroke(account, order, violations, t);
}

function watch() {
  const account = readAccount();
  if (!account) return;
  reportAccount(account);
  const c = cache;
  const acct = c?.accounts[accountKey(account)];
  if (!c?.signed || !acct) return;
  const k = accountKey(account);
  if (seen?.key !== k) seen = { key: k };
  const enforcing = acct.enforced && c.signed.license.enforcing;
  const sum = readSummary();
  const read = readPositions();
  // A table change counts only when two reads in a row agree: TradingView can show an empty table while it reconnects.
  const same = (a?: Position[], b?: Position[]) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
  const positions = read && (!seen.positions || same(read, seen.pending)) ? read : undefined;
  seen.pending = read;
  if (positions && seen.positions) {
    const d = diffPositions(seen.positions, positions);
    const t = Date.now();
    // Pending orders counted at the click wait for their fill until the trading day ends.
    const start = dayOf(c.signed.time.userResets, now()).start - (c.skew ?? 0);
    for (let i = expected.length - 1; i >= 0; i--) if (expected[i].t < start) expected.splice(i, 1);
    for (const o of d.opened) {
      const size = unexplained(o, expected, t);
      if (size > 0) tableEntry(account, c, acct.id, enforcing, { ...o, size });
    }
    const closed = d.closed.reduce((s, x) => s + x.size, 0);
    if (closed > 0) seen.close = { size: round8((seen.close?.size ?? 0) + closed), balance: seen.close?.balance ?? seen.balance, at: t };
  }
  if (positions) seen.positions = positions;
  // A close's net is the balance change it makes. TradingView may update the balance a moment after the table.
  if (seen.close && (sum.balance !== seen.close.balance || Date.now() - seen.close.at > 5000)) {
    if (sum.balance !== undefined && seen.close.balance !== undefined) {
      const t = now();
      const net = round8(sum.balance - seen.close.balance);
      local.closes.push({ t, account: acct.id, net, size: seen.close.size });
      send(account, [{ type: 'close', t, net, size: seen.close.size }]);
    }
    seen.close = undefined;
  }
  // The balance before a close: kept while a table change waits to be confirmed.
  if (sum.balance !== undefined && !seen.close && (!read || same(read, seen.positions))) seen.balance = sum.balance;

  // R8: the first time loss today reaches the limit, the server is told (it alerts and starts the rest).
  const state = stateFor(c, acct.id, positions ?? [], sum);
  const t = now();
  const r8 = r8Status({ rules: c.signed.rules, time: c.signed.time, state }, acct.id, t);
  if (r8.inLimit && state.accounts[acct.id].limitReachedAt === undefined) {
    local.limitReachedAt[acct.id] = t;
    const dayStart = dayOf(accountResets(c.signed.time, acct.id), t).start;
    send(account, [{ type: 'limit_reached', t, dayStart, loss: r8.loss, limit: r8.limit }]);
  }
}

//--- the pill (EXPERIENCE §6.3) ------------------------------------------------------------------------------------

const pill = new Pill(
  {
    open: (page) => window.open(`${API}/${page}`, '_blank', 'noopener'),
    takeBreak: () => tighten('break', now() + BREAK_MINUTES * 60_000),
    doneToday: () => cache?.signed && tighten('done_today', nextReset(cache.signed.time.userResets, now())),
  },
  () => chartRect(),
);

function tighten(type: 'break' | 'done_today', until: number) {
  const account = readAccount();
  if (!account) return;
  if (type === 'break') local.breakUntil = until;
  else local.doneUntil = until;
  send(account, [{ type, t: now(), until }]);
  renderPill();
}

const mmss = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`;

function pillView(): PillView | undefined {
  const c = cache;
  if (!c || c.status === 'signed_out') return { tone: 'off', text: 'Off · Signed out', lines: ['Trades aren’t counted.', 'Sign in from the DisciplineGuard toolbar button.'], actions: false };
  const account = readAccount();
  const acct = account && c.accounts[accountKey(account)];
  const refused = account && !acct ? c.refused?.[accountKey(account)] : undefined;
  if (refused === 'account_taken') {
    return { tone: 'off', text: 'Off · On another login', lines: ['This account is counted under another DisciplineGuard login. Sign in with that one, or remove the account there.'], actions: false };
  }
  if (refused === 'account_cap') {
    return { tone: 'off', text: 'Off · Account limit', lines: ['The free plan covers 1 trading account. Paper Trading doesn’t count.', 'Remove the other account on disciplineguard.leowqiheng.workers.dev/devices.'], actions: false };
  }
  if (!account || !acct || !c.signed) {
    return { tone: 'setup', text: 'Setting up', lines: ['Connect your broker in TradingView’s trading panel to start counting.'], actions: false };
  }
  const where = `${account.broker} …${acct.last3}`;
  if (c.status === 'attention') return { tone: 'attention', text: 'Needs attention', lines: ['Sign in again. Your saved rules still apply.', where], actions: false };
  if (!acct.enforced) return { tone: 'off', text: 'Off', lines: ['Trades on this account aren’t counted.'], actions: false };
  if (!c.signed.license.enforcing) return { tone: 'off', text: 'Off', lines: ['Trades aren’t counted.'], actions: false };

  const s = c.signed;
  const t = now();
  const state = stateFor(c, acct.id);
  const fmt = makeFmt(s.time, account.currency, s.hideAmounts);
  const parts: string[] = [];
  const lines: string[] = [];
  if (state.doneUntil && t < state.doneUntil) parts.push('done for today');
  else if (state.breakUntil && t < state.breakUntil) parts.push(state.breakUntil - t > 3_600_000 ? `break until ${fmt.time(state.breakUntil)}` : `break ${mmss(state.breakUntil - t)}`);
  if (s.rules.R1.on) {
    const n = entriesToday({ rules: s.rules, time: s.time, state }, t);
    parts.push(`${n} of ${s.rules.R1.max} trades`);
    lines.push(`Trades today: ${n} of ${s.rules.R1.max}`);
  }
  const r8 = r8Status({ rules: s.rules, time: s.time, state }, acct.id, t);
  if (r8.applies) {
    if (!s.rules.R1.on) parts.push(r8.inLimit ? 'loss limit reached' : `loss ${fmt.money(r8.loss, acct.id)} of ${fmt.money(r8.limit, acct.id)}`);
    lines.push(r8.inLimit ? 'Daily loss limit reached' : `Loss today: ${fmt.money(Math.max(0, r8.loss), acct.id)} of ${fmt.money(r8.limit, acct.id)}`);
  } else if (s.rules.R8.on && s.rules.accounts[acct.id]?.r8) {
    lines.push('Loss today: open the Account Manager to read it');
  }
  if (s.rules.R7.on) {
    const cd = activeCooldown(s.rules, state.closes, t);
    if (cd && t < cd.until) {
      parts.push(`cooldown ${mmss(cd.until - t)}`);
      lines.push(`Cooldown until ${fmt.time(cd.until)}`);
    }
  }
  lines.push(`Counting ${where}`);
  const offline = c.status === 'offline';
  return { tone: 'on', text: [offline ? 'On (offline)' : 'On', ...parts.slice(0, 2)].join(' · '), lines, actions: true };
}

function renderPill() {
  try {
    const v = pillView();
    if (v) pill.render(v);
  } catch {}
}

// The Account Manager can appear any time: read it every 2 s, and redraw the pill every second.
const timers = [
  setInterval(() => {
    try {
      watch();
    } catch {}
  }, 2000),
  setInterval(renderPill, 1000),
];
addEventListener('pagehide', () => timers.forEach(clearInterval));
