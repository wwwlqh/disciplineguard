// Reading TradingView's page (SPEC §9.1). Everything page-specific is in PAGE, the bundled page config: data only,
// so a signed remote copy can replace it without a new release (src/pageconfig.ts). Anything that can't be read makes the click pass.
// Selectors checked on a signed-in Paper Trading chart, 27 Sep 2026.
import type { Order, OrderType, Position, Side } from '@dg/core';
import type { TvAccount } from './messages.ts';

export interface PageConfig {
  version: number;
  /** Order panel: its root, the submit button ("Buy 1 BTCUSD MARKET"), and the stop-loss switch, mode and field. */
  panel: { root: string; submit: string; slOn: string; slMode: string; sl: string };
  /** The chart's floating Buy/Sell buttons and their quantity. They send an order only with one-click trading on. */
  floating: { buy: string; sell: string; qty: string };
  /** The chart's symbol. */
  symbol: string;
  /** The chart area: the pill's default spot is its bottom-right. */
  chart: string;
  /** The trading panel: broker name, account selector (name, then currency), positions and orders tables. */
  account: { broker: string; selector: string; name: string; positions: string; orders: string };
  /** The Account Manager's summary fields (title, then value), and the field titles to read, lower case, per locale. */
  summary: { field: string; title: string; value: string };
  markers: { balance: string[]; equity: string[] };
}

export const PAGE: PageConfig = {
  version: 1,
  panel: {
    root: '[data-name="order-panel"]',
    submit: '[data-name="place-and-modify-button"]',
    slOn: 'input[data-qa-id^="order-ticket-stop-loss-checkbox"]',
    slMode: '[data-qa-id="order-ticket-stop-loss-dropdown-button"]',
    sl: 'input[data-qa-id~="order-ticket-stop-loss-input"]',
  },
  floating: { buy: '[data-name="buy-order-button"]', sell: '[data-name="sell-order-button"]', qty: '[data-name="qtyEl"]' },
  symbol: '#header-toolbar-symbol-search',
  chart: '.chart-container',
  account: {
    broker: '#footer-chart-panel [class*="titleText-"]',
    selector: '[data-qa-id="account-selector"]',
    name: '[class*="accountName-"]',
    positions: 'table[data-name$=".positions-table"]',
    orders: 'table[data-name$=".orders-table"]',
  },
  summary: { field: '.js-account-manager-header [class*="accountSummaryField-"]', title: '[class*="title-"]', value: '[class*="value-"]' },
  markers: { balance: ['account balance', 'balance'], equity: ['equity'] },
};

/** The page config in use: the bundled one, or a newer signed remote copy (src/pageconfig.ts). */
let active: PageConfig = PAGE;
export function usePage(p: PageConfig): void {
  active = p;
}

/** Words that mark a close, reduce or cancel. A control with them never sends an entry, whatever the config says. */
export const CLOSE_MARKERS = /\b(close|flatten|cancel|reduce|modify|exit|reverse)\b/i;

export type Path = 'panel' | 'floating';

export interface OrderTarget {
  el: Element;
  path: Path;
}

function textOf(el: Element | null | undefined): string {
  return ((el as HTMLElement | null)?.innerText ?? el?.textContent ?? '').trim().replace(/\s+/g, ' ');
}

function matchUp(start: EventTarget[], sel: string): Element | null {
  for (const n of start) {
    if (!(n instanceof Element)) continue;
    if (n === document.body) break;
    try {
      if (n.matches(sel)) return n;
    } catch {
      return null;
    }
  }
  return null;
}

/** The Buy/Sell control this event is on, or null. Enter in an order-panel field counts as the panel's submit. */
export function orderTarget(e: Event, page = active): OrderTarget | null {
  const path = e.composedPath();
  if (e.type === 'keydown') {
    if ((e as KeyboardEvent).key !== 'Enter') return null;
    const root = matchUp(path, page.panel.root);
    const submit = root?.querySelector(page.panel.submit);
    return submit && !CLOSE_MARKERS.test(textOf(submit)) ? { el: submit, path: 'panel' } : null;
  }
  const submit = matchUp(path, page.panel.submit);
  if (submit) return CLOSE_MARKERS.test(textOf(submit)) ? null : { el: submit, path: 'panel' };
  const floating = matchUp(path, `${page.floating.buy}, ${page.floating.sell}`);
  if (floating) return CLOSE_MARKERS.test(textOf(floating)) ? null : { el: floating, path: 'floating' };
  return null;
}

function num(s: string | null | undefined): number | undefined {
  if (!s) return undefined;
  const t = s.replace(/[,\s]/g, '').replace(/[^\d.\-]/g, '');
  const n = Number(t);
  return t !== '' && Number.isFinite(n) ? n : undefined;
}

export function readSymbol(page = active): string | undefined {
  const t = textOf(document.querySelector(page.symbol));
  return t ? t.split(' ')[0] : undefined;
}

export function readAccount(page = active): TvAccount | undefined {
  const broker = textOf(document.querySelector(page.account.broker));
  const sel = document.querySelector(page.account.selector);
  const login = textOf(sel?.querySelector(page.account.name));
  if (!broker || !login) return undefined;
  const currency = textOf(sel).replace(login, '').trim().split(' ')[0] || undefined;
  return { broker, login, currency };
}

/** Rows of a trading-panel table as {column data-name: text}. Cells are matched to headers by position. */
function tableRows(sel: string): Record<string, string>[] {
  const table = document.querySelector(sel);
  if (!table) return [];
  const cols = [...table.querySelectorAll('thead th')].map((th) => th.getAttribute('data-name') ?? '');
  return [...table.querySelectorAll('tbody tr')].map((tr) => {
    const row: Record<string, string> = {};
    [...tr.children].forEach((td, i) => cols[i] && (row[cols[i]] = textOf(td)));
    return row;
  });
}

/** Open positions on this account. Undefined when the table isn't in the page: the order is then "unclassified". */
export function readPositions(page = active): Position[] | undefined {
  if (!document.querySelector(page.account.positions)) return undefined;
  const out: Position[] = [];
  for (const r of tableRows(page.account.positions)) {
    const size = num(r['qty-column']);
    const symbol = (r['symbol-column'] ?? '').split(' ')[0];
    if (symbol && size) out.push({ symbol, side: /sell|short/i.test(r['side-column'] ?? '') ? 'sell' : 'buy', size: Math.abs(size) });
  }
  return out;
}

/** Balance and equity from the Account Manager summary. Each is undefined when it can't be read. */
export function readSummary(page = active): { balance?: number; equity?: number } {
  const out: { balance?: number; equity?: number } = {};
  for (const f of document.querySelectorAll(page.summary.field)) {
    const title = textOf(f.querySelector(page.summary.title)).toLowerCase();
    const v = num(textOf(f.querySelector(page.summary.value)));
    if (page.markers.balance.includes(title)) out.balance = v;
    else if (page.markers.equity.includes(title)) out.equity = v;
  }
  return out;
}

/** Rows in the positions and orders tables, to see an order arrive. */
export function tradeRows(page = active): number {
  return document.querySelectorAll(`${page.account.positions} tbody tr, ${page.account.orders} tbody tr`).length;
}

export function chartRect(page = active): DOMRect | undefined {
  return document.querySelector(page.chart)?.getBoundingClientRect();
}

export function panelOpen(page = active): boolean {
  const p = document.querySelector(page.panel.root) as HTMLElement | null;
  return !!p && p.getClientRects().length > 0;
}

/** "Buy 1 BTCUSD MARKET", "Sell 0.5 EURUSD @ 1.0850 LIMIT". */
const SUBMIT = /^(buy|sell)\s+([\d.,]+)\s+(\S+)(?:\s+@\s*([\d.,]+))?\s+(market|limit|stop)\b/i;

/** False when the panel's button isn't an order yet ("Start creating order" before a side is picked). */
export function isOrder(g: OrderTarget): boolean {
  return g.path === 'floating' || /^(buy|sell)/i.test(textOf(g.el));
}

/** The order this control would send, or undefined when it can't be read (the click then passes). */
export function readOrder(g: OrderTarget, account: string, page = active): Omit<Order, 'kind'> | undefined {
  if (g.path === 'floating') {
    const symbol = readSymbol(page);
    const size = num(textOf(document.querySelector(page.floating.qty)));
    if (!symbol || !size) return undefined;
    const side: Side = g.el.matches(page.floating.sell) ? 'sell' : 'buy';
    return { platform: 'tv', account, symbol, side, size, type: 'market' };
  }
  const m = SUBMIT.exec(textOf(g.el));
  if (!m) return undefined;
  const size = num(m[2]);
  if (!size) return undefined;
  const type = m[5].toLowerCase() as OrderType;
  const root = g.el.closest(page.panel.root) ?? document;
  const slOn = (root.querySelector(page.panel.slOn) as HTMLInputElement | null)?.checked;
  const slPrice = /price/i.test(textOf(root.querySelector(page.panel.slMode)));
  const slField = root.querySelector(page.panel.sl);
  const sl = slOn && slPrice && slField instanceof HTMLInputElement ? num(slField.value) : undefined;
  return { platform: 'tv', account, symbol: m[3], side: m[1].toLowerCase() as Side, size, type, sl, price: type === 'market' ? undefined : num(m[4]) };
}

