// Reading TradingView's page (SPEC §9.1). Everything page-specific is in PAGE, the bundled page config: data only,
// so a signed remote copy can replace it later without code. Anything that can't be read makes the click pass.
import type { Order, Position, Side } from '@dg/core';
import type { TvAccount } from './messages.ts';

export interface PageConfig {
  version: number;
  /** Order panel: its root, the submit button, and the fields read for the order. */
  panel: { root: string; submit: string; side: string; qty: string; sl: string; limitPrice: string; typeTab: string };
  /** The chart's floating Buy/Sell buttons (one-click trading). */
  floating: { buy: string; sell: string; oneClickOn: string };
  /** The chart's symbol. */
  symbol: string;
  /** Account Manager: broker name, account id, positions table rows and their cells. */
  account: { broker: string; login: string; currency: string; positionRow: string; posSymbol: string; posSide: string; posQty: string };
}

export const PAGE: PageConfig = {
  version: 1,
  panel: {
    root: '[data-name="order-panel"]',
    submit: '[data-name="place-and-modify-button"]',
    side: '[data-name="side-control-buy"][aria-pressed="true"], [data-name="side-control-sell"][aria-pressed="true"]',
    qty: '[data-name="units-input"] input, input[data-name="quantity-input"]',
    sl: '[data-name="stop-loss-price-input"] input',
    limitPrice: '[data-name="price-input"] input',
    typeTab: '[data-name="order-type-tabs"] [aria-selected="true"]',
  },
  floating: {
    buy: '[data-name="buy-order-button"]',
    sell: '[data-name="sell-order-button"]',
    oneClickOn: '[data-name="buy-order-button"][data-one-click="true"]',
  },
  symbol: '#header-toolbar-symbol-search, [data-name="legend-source-title"]',
  account: {
    broker: '[data-name="account-manager"] [data-name="broker-name"]',
    login: '[data-name="account-manager"] [data-name="account-id"]',
    currency: '[data-name="account-manager"] [data-name="account-currency"]',
    positionRow: '[data-name="account-manager"] [data-name="positions-table"] tbody tr',
    posSymbol: '[data-label="Symbol"]',
    posSide: '[data-label="Side"]',
    posQty: '[data-label="Qty"]',
  },
};

/** Words that mark a close, reduce or cancel. A control with them is never guarded (invariant 1), whatever the config says. */
export const CLOSE_MARKERS = /\b(close|flatten|cancel|reduce|modify|exit|reverse)\b/i;

export type Path = 'panel' | 'floating';

export interface Guarded {
  el: Element;
  path: Path;
}

function textOf(el: Element | null): string {
  return (el?.textContent ?? '').trim().replace(/\s+/g, ' ');
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

/** The guarded control this event is on, or null. Enter in an order-panel field counts as the panel's submit. */
export function guardedTarget(e: Event, page = PAGE): Guarded | null {
  const path = e.composedPath();
  if (e.type === 'keydown') {
    if ((e as KeyboardEvent).key !== 'Enter') return null;
    const root = matchUp(path, page.panel.root);
    const submit = root?.querySelector(page.panel.submit);
    return submit && !CLOSE_MARKERS.test(textOf(submit)) ? { el: submit, path: 'panel' } : null;
  }
  const submit = matchUp(path, page.panel.submit);
  if (submit) return CLOSE_MARKERS.test(textOf(submit)) ? null : { el: submit, path: 'panel' };
  // Floating buttons send an order only with one-click trading on; otherwise they open the panel (SPEC §9.1).
  const floating = matchUp(path, `${page.floating.buy}, ${page.floating.sell}`);
  if (floating && document.querySelector(page.floating.oneClickOn)) return CLOSE_MARKERS.test(textOf(floating)) ? null : { el: floating, path: 'floating' };
  return null;
}

function num(s: string | null | undefined): number | undefined {
  if (!s) return undefined;
  const n = Number(s.replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) && s.trim() !== '' ? n : undefined;
}

function inputValue(sel: string, root: ParentNode = document): string | undefined {
  const el = root.querySelector(sel);
  return el instanceof HTMLInputElement ? el.value : undefined;
}

export function readSymbol(page = PAGE): string | undefined {
  const t = textOf(document.querySelector(page.symbol));
  return t ? t.split(/\s/)[0] : undefined;
}

export function readAccount(page = PAGE): TvAccount | undefined {
  const broker = textOf(document.querySelector(page.account.broker));
  const login = textOf(document.querySelector(page.account.login));
  if (!broker || !login) return undefined;
  return { broker, login, currency: textOf(document.querySelector(page.account.currency)) || undefined };
}

export function readPositions(page = PAGE): Position[] {
  const out: Position[] = [];
  for (const row of document.querySelectorAll(page.account.positionRow)) {
    const symbol = textOf(row.querySelector(page.account.posSymbol));
    const side: Side = /sell|short/i.test(textOf(row.querySelector(page.account.posSide))) ? 'sell' : 'buy';
    const size = num(textOf(row.querySelector(page.account.posQty)));
    if (symbol && size) out.push({ symbol, side, size: Math.abs(size) });
  }
  return out;
}

/** The order this control would send, or undefined when it can't be read (the click then passes). */
export function readOrder(g: Guarded, account: string, page = PAGE): Omit<Order, 'kind'> | undefined {
  const symbol = readSymbol(page);
  if (!symbol) return undefined;
  if (g.path === 'floating') {
    const side: Side = g.el.matches(page.floating.sell) ? 'sell' : 'buy';
    const size = num(inputValue(page.panel.qty)) ?? num(g.el.getAttribute('data-qty'));
    if (!size) return undefined;
    return { platform: 'tv', account, symbol, side, size, type: 'market' };
  }
  const root = g.el.closest(page.panel.root) ?? document;
  const sideEl = root.querySelector(page.panel.side);
  const side: Side | undefined = sideEl ? (/sell/i.test(sideEl.getAttribute('data-name') ?? '') ? 'sell' : 'buy') : /sell/i.test(textOf(g.el)) ? 'sell' : /buy/i.test(textOf(g.el)) ? 'buy' : undefined;
  const size = num(inputValue(page.panel.qty, root));
  if (!side || !size) return undefined;
  const typeText = textOf(root.querySelector(page.panel.typeTab)).toLowerCase();
  const type = typeText.includes('limit') ? 'limit' : typeText.includes('stop') ? 'stop' : 'market';
  const sl = num(inputValue(page.panel.sl, root));
  const price = type === 'market' ? undefined : num(inputValue(page.panel.limitPrice, root));
  return { platform: 'tv', account, symbol, side, size, type, sl, price };
}

/** Binds a Place anyway pass to exactly this order (SPEC §7.5 step 3). */
export function orderKey(o: Omit<Order, 'kind'>): string {
  return [o.account, o.symbol, o.side, o.size, o.sl ?? '', o.type, o.price ?? ''].join('|');
}
