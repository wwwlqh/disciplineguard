// Reading Polymarket's page. Everything page-specific is in PM_PAGE: data only, like tv.ts. Anything that can't be
// read isn't counted. Selectors checked on a market page (signed in, $0 cash), 2 Oct 2026.
import type { Order } from '@dg/core';
import type { TvAccount } from './messages.ts';

export const PM_PAGE = {
  /** The trade box's submit button: "Buy Yes", "Trade", or "Deposit"/"Log in" when it isn't an order. */
  submit: '[data-trading-button-wrapper] > button.trading-button:not([role="radio"])',
  /** The Buy/Sell switch: only Buy is counted. */
  buyOn: 'button[role="radio"][value="BUY"][aria-checked="true"]',
  /** The outcome picked: "Yes40¢", "No61¢". */
  outcome: 'button.trading-button[role="radio"][aria-checked="true"]',
  /** The market order's dollar amount. Limit orders don't have it, so they aren't counted yet. */
  amount: '#market-order-amount-input',
  /** localStorage: the trader's Polymarket wallet, and the navbar's balances. */
  walletKey: 'polymarket.auth.proxyWallet',
  balancesKey: 'pm_navbar_balances_v2',
  /** Submit texts that aren't an order. */
  notOrder: /deposit|log ?in|sign ?(in|up)|connect|enter amount|insufficient/i,
};

export const PM_BROKER = 'Polymarket';
export const CLOSE_MARKERS = /\b(sell|cash ?out|close|cancel|redeem|claim)\b/i;

function textOf(el: Element | null | undefined): string {
  return ((el as HTMLElement | null)?.innerText ?? el?.textContent ?? '').trim().replace(/\s+/g, ' ');
}

/** The trade box around a control: the nearest ancestor holding the Buy/Sell switch. */
function boxOf(el: Element): Element | null {
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) if (n.querySelector('button[role="radio"][value="BUY"]')) return n;
  return null;
}

/** The Buy submit this event is on, or null. Enter in the amount field counts as the submit. */
export function orderTarget(e: Event): Element | null {
  let submit: Element | null = null;
  if (e.type === 'keydown') {
    if ((e as KeyboardEvent).key !== 'Enter') return null;
    const t = e.target as Element | null;
    if (!t?.matches?.(PM_PAGE.amount)) return null;
    submit = boxOf(t)?.querySelector(PM_PAGE.submit) ?? null;
  } else {
    for (const n of e.composedPath()) {
      if (!(n instanceof Element) || n === document.body) break;
      if (n.matches(PM_PAGE.submit)) {
        submit = n;
        break;
      }
    }
  }
  if (!submit) return null;
  const text = textOf(submit);
  if (PM_PAGE.notOrder.test(text) || CLOSE_MARKERS.test(text)) return null;
  // Selling is closing: never an entry.
  return boxOf(submit)?.querySelector(PM_PAGE.buyOn) ? submit : null;
}

/** The market this page is on: the last part of /event/<event>/<market>. */
export function readMarket(): string | undefined {
  const parts = location.pathname.split('/').filter(Boolean);
  return parts[0] === 'event' ? parts[parts.length - 1] : undefined;
}

export function readAccount(): TvAccount | undefined {
  let w: string | null = null;
  try {
    w = localStorage.getItem(PM_PAGE.walletKey);
  } catch {}
  const m = w?.match(/0x[0-9a-fA-F]{40}/);
  // The server keeps logins to 32 characters: the address's last 32 hex digits, so "…last 3" still matches the wallet.
  return m ? { broker: PM_BROKER, login: m[0].toLowerCase().slice(-32), currency: 'USD' } : undefined;
}

/** Portfolio value (positions and cash, as the navbar shows it). Undefined if it can't be read. */
export function readEquity(): number | undefined {
  try {
    const b = JSON.parse(localStorage.getItem(PM_PAGE.balancesKey) ?? 'null');
    const v = Number(b?.portfolio);
    return Number.isFinite(v) && b?.timestamp > Date.now() - 10 * 60_000 ? v : undefined;
  } catch {
    return undefined;
  }
}

/** The bet this submit would place, or undefined when it can't be read (the click then passes). */
export function readOrder(submit: Element, account: string): Omit<Order, 'kind'> | undefined {
  const box = boxOf(submit);
  const market = readMarket();
  const outcome = textOf(box?.querySelector(PM_PAGE.outcome)).replace(/[\d.,]+\s*¢?$/, '').trim();
  const input = box?.querySelector(PM_PAGE.amount);
  const size = input instanceof HTMLInputElement ? Number(input.value.replace(/[^\d.]/g, '')) : NaN;
  if (!market || !outcome || !(size > 0)) return undefined;
  return { platform: 'tv', account, symbol: `${market}:${outcome}`, side: 'buy', size, type: 'market' };
}
