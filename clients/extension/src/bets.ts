// The bet counter shared by the prediction-market content scripts (Polymarket, Kalshi). Same contract as content.ts on
// TradingView: it reads each Buy the trader sends, passively in the capture phase, and counts it against the cached
// rules. It never holds, delays or blocks a bet. Selling isn't an entry, so it isn't counted. Bets have no stop loss, so
// "Stop loss required" doesn't apply. Loss today = the portfolio value at the first read of the day minus the value
// now (kept in the extension). Each site only supplies its page reader (pm.ts, kalshi.ts).
import {
  accountResets, activeCooldown, dayOf, entriesToday, evaluate, nextReset, r8Status, round8,
  BREAK_MINUTES, type Order, type Rules, type State, type Violation,
} from '@dg/core';
import { CACHE_KEY, accountKey, type Cache, type QueuedEvent, type TvAccount } from './messages.ts';
import { makeFmt, NoteUI } from './note.ts';
import { Pill, type PillView } from './pill.ts';
import { API } from './config.ts';

export interface BetSite {
  /** "Polymarket", as the pill names it. */
  name: string;
  /** What the account is called there: "wallet" or "account". */
  accountWord: string;
  /** Prefix of event ids and of the day-start key. Never change it: the day start is stored under it. */
  prefix: string;
  /** The Buy submit this event is on, or null. Never a sell, a deposit or a sign-in. */
  orderTarget(e: Event): Element | null;
  readAccount(): TvAccount | undefined;
  /** Portfolio value, or undefined when it can't be read. */
  readEquity(): number | undefined;
  /** The bet this submit places, or undefined when it can't be read (then it isn't counted). */
  readOrder(submit: Element, account: string): Omit<Order, 'kind'> | undefined;
}

const EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'keydown'] as const;

export function countBets(site: BetSite): void {
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

  const ui = new NoteUI();
  const local: {
    entries: State['entries'];
    breakUntil?: number;
    doneUntil?: number;
    limitReachedAt: Record<string, number>;
  } = { entries: [], limitReachedAt: {} };

  interface Gesture {
    el: Element;
    /** The bet this gesture places, read at its start: counted at the click that ends it. */
    entry?: { order: Order; violations: Violation[] };
  }
  let gesture: Gesture | null = null;

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
      breakUntil: later(snap.breakUntil, local.breakUntil),
      doneUntil: later(snap.doneUntil, local.doneUntil),
      accounts,
      clock: { verified: true },
    };
  }

  /** Reads the bet a gesture on a Buy submit places, and the rules it breaks. Never holds it. */
  function read(e: Event, el: Element): Gesture {
    const none: Gesture = { el };
    if (!e.isTrusted) return none;
    const account = site.readAccount();
    if (!account) return none;
    reportAccount(account);
    const c = cache;
    const acct = c?.accounts[accountKey(account)];
    if (!c?.signed || !acct || !acct.enforced || !c.signed.license.enforcing) return none;
    const o = site.readOrder(el, acct.id);
    if (!o) {
      send(account, [{ type: 'unclassified', t: now() }]);
      return none;
    }
    const order: Order = { ...o, kind: 'entry' };
    const violations = evaluate({ rules: betRules(c.signed.rules), time: c.signed.time, state: stateFor(c, acct.id), order, now: now() });
    return { el, entry: { order, violations } };
  }

  /** The bet went through (the gesture's final click or Enter): count it once, with the rules it broke. */
  function counted(g: Gesture) {
    const account = site.readAccount();
    if (!g.entry || !account) return;
    const { order, violations } = g.entry;
    const t = now();
    local.entries.push({ t, account: order.account, symbol: order.symbol, side: order.side, size: order.size });
    send(account, [{ type: 'entry', t, symbol: order.symbol, side: order.side, size: order.size, source: 'click', violations: violations.map((v) => v.rule) }]);
    const s = cache?.signed;
    if (s && violations.length) ui.broke(violations, order, makeFmt(s.time, 'USD', s.hideAmounts), t, s.rules.R3.seconds);
  }

  function onEvent(e: Event) {
    if (pill.owns(e)) return;
    let el: Element | null = null;
    try {
      el = site.orderTarget(e);
    } catch {
      return;
    }
    if (!el) return;
    const starts = e.type === 'pointerdown' || e.type === 'keydown' || (e.type === 'mousedown' && gesture?.el !== el);
    if (starts || !gesture || gesture.el !== el) {
      try {
        gesture = read(e, el);
      } catch {
        gesture = { el };
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
    if (!c || c.status === 'signed_out') return { tone: 'off', text: 'Off · Signed out', lines: ['Bets aren’t counted.', 'Sign in from the DisciplineGuard toolbar button.'], actions: false };
    const account = site.readAccount();
    const acct = account && c.accounts[accountKey(account)];
    const refused = account && !acct ? c.refused?.[accountKey(account)] : undefined;
    if (refused === 'account_taken') {
      return { tone: 'off', text: 'Off · On another login', lines: [`This ${site.accountWord} is counted under another DisciplineGuard login.`], actions: false };
    }
    if (refused === 'account_cap') {
      return { tone: 'off', text: 'Off · Account limit', lines: ['The free plan covers 1 trading account.', 'Remove the other account on disciplineguard.leowqiheng.workers.dev/devices.'], actions: false };
    }
    if (!account || !acct || !c.signed) return { tone: 'setup', text: 'Setting up', lines: [`Log in to ${site.name} to start counting.`], actions: false };
    const where = `${site.name} …${acct.last3}`;
    if (c.status === 'attention') return { tone: 'attention', text: 'Needs attention', lines: ['Sign in again. Your saved rules still apply.', where], actions: false };
    if (!acct.enforced) return { tone: 'off', text: 'Off', lines: [`Bets on this ${site.accountWord} aren’t counted.`], actions: false };
    if (!c.signed.license.enforcing) return { tone: 'off', text: 'Off', lines: ['Bets aren’t counted.'], actions: false };

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
    lines.push(`Counting ${where}`);
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
