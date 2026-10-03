// Reading Kalshi's page. Everything page-specific is in KS_PAGE: data only, like tv.ts and pm.ts. Anything that can't be
// read isn't counted. Checked on a market page and the order panel's code on kalshi.com, 2 Oct 2026.
// A buy is placed by "Buy with 1-Click", or by "Review Buy" then "Submit Buy" on the review screen. The bet is counted at
// the click that places it; the order is read from the panel at "Review Buy", because the review screen has no fields.
import type { Order } from '@dg/core';
import type { TvAccount } from './messages.ts';

export const KS_PAGE = {
  /** The order panel's main button ("Review Buy", "Buy with 1-Click", or their Sell twins). Enter in the panel clicks it. */
  advance: '[data-order-panel-enter-advance]',
  /** The Buy/Sell tabs at the top of the order panel. */
  tab: '[role="tablist"] button[role="tab"]',
  /** The Yes/No (Up/Down on some markets) switch: the pressed one reads "YES 91.6¢". */
  side: '[role="group"] > button[aria-pressed="true"]',
  /** The market's name in the panel, e.g. "Democratic Party". */
  market: 'h3',
  /** The amount field. */
  amount: 'input[inputmode="decimal"]',
  /** The unit menu: "Dollars", "Shares" or "Limit". Limit orders aren't read yet, so they pass. */
  units: 'button[aria-haspopup="menu"]',
  /** Buttons that place a buy. Selling, "Sign up to trade" and everything else are never counted. */
  place: /^(buy with 1-click|submit buy)$/i,
  /** Opens the review screen. */
  review: /^review buy$/i,
  /** localStorage: the signed-in user's id. */
  userKey: 'userId',
  /** The navbar's portfolio link: "$1,234.56 Portfolio", "$12.35K Portfolio" from $10,000. */
  portfolio: 'a[href*="/portfolio"]',
};

export const KS_BROKER = 'Kalshi';
/** How long a reviewed order waits for its Submit Buy. */
const REVIEW_MS = 10 * 60_000;

function textOf(el: Element | null | undefined): string {
  return ((el as HTMLElement | null)?.innerText ?? el?.textContent ?? '').trim().replace(/\s+/g, ' ');
}

/** The order panel around a control: the nearest ancestor holding the Buy tab. */
function panelOf(el: Element): Element | null {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    for (const t of n.querySelectorAll(KS_PAGE.tab)) if (/^buy$/i.test(textOf(t))) return n;
  }
  return null;
}

/** The event this page is on: the last part of /markets/<series>/<title>/<event>. */
export function readEvent(): string | undefined {
  const parts = location.pathname.split('/').filter(Boolean);
  return parts[0] === 'markets' && parts.length > 1 ? parts[parts.length - 1].toUpperCase() : undefined;
}

interface Draft {
  symbol: string;
  size: number;
}

/** The bet the panel holds: market, outcome, and its size in dollars. */
function readDraft(panel: Element): Draft | undefined {
  const pressed = textOf(panel.querySelector(KS_PAGE.side));
  const m = /^(.*?)\s*([\d.]+)\s*¢/.exec(pressed);
  const outcome = (m ? m[1] : pressed).trim();
  const price = m ? Number(m[2]) : NaN;
  const market = textOf(panel.querySelector(KS_PAGE.market)) || readEvent();
  const input = panel.querySelector(KS_PAGE.amount);
  const value = input instanceof HTMLInputElement ? Number(input.value.replace(/[^\d.]/g, '')) : NaN;
  const units = textOf(panel.querySelector(KS_PAGE.units));
  let size = NaN;
  if (/^dollars$/i.test(units)) size = value;
  else if (/^shares$/i.test(units) && price > 0) size = Math.round(value * price) / 100;
  if (!market || !outcome || !(size > 0)) return undefined;
  return { symbol: `${market}:${outcome[0].toUpperCase()}${outcome.slice(1).toLowerCase()}`, size };
}

let reviewed: { draft: Draft; path: string; at: number } | undefined;

/** "Review Buy": remember what goes to the review screen. */
function noteReview(button: Element) {
  const panel = panelOf(button);
  const draft = panel ? readDraft(panel) : undefined;
  reviewed = draft ? { draft, path: location.pathname, at: Date.now() } : undefined;
}

/** The Buy button this event is on, or null. Enter in the amount field counts as its main button. */
export function orderTarget(e: Event): Element | null {
  let button: Element | null = null;
  if (e.type === 'keydown') {
    if ((e as KeyboardEvent).key !== 'Enter') return null;
    const t = e.target as Element | null;
    if (!t?.matches?.(KS_PAGE.amount)) return null;
    button = panelOf(t)?.querySelector(KS_PAGE.advance) ?? null;
  } else {
    for (const n of e.composedPath()) {
      if (!(n instanceof Element) || n === document.body) break;
      if (n.tagName === 'BUTTON') {
        button = n;
        break;
      }
    }
  }
  if (!button) return null;
  const text = textOf(button);
  if (KS_PAGE.review.test(text)) {
    if (e.isTrusted) noteReview(button);
    return null;
  }
  return KS_PAGE.place.test(text) ? button : null;
}

export function readAccount(): TvAccount | undefined {
  let id: string | null = null;
  try {
    id = localStorage.getItem(KS_PAGE.userKey);
  } catch {}
  // The server keeps logins to 32 characters.
  const login = id?.replace(/[^0-9A-Za-z]/g, '').slice(-32);
  return login && login.length >= 6 ? { broker: KS_BROKER, login, currency: 'USD' } : undefined;
}

/** Portfolio value from the navbar. From $10,000 Kalshi shows it to $10 ("$12.35K"). Undefined if hidden or unread. */
export function readEquity(): number | undefined {
  for (const a of document.querySelectorAll(KS_PAGE.portfolio)) {
    const m = /\$\s?([\d,]+(?:\.\d+)?)\s*([KM])?/i.exec(textOf(a));
    if (!m || !/portfolio/i.test(textOf(a))) continue;
    const v = Number(m[1].replace(/,/g, '')) * (m[2]?.toUpperCase() === 'M' ? 1e6 : m[2] ? 1e3 : 1);
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : undefined;
  }
  return undefined;
}

/** The bet this button would place, or undefined when it can't be read (the click then passes). */
export function readOrder(button: Element, account: string): Omit<Order, 'kind'> | undefined {
  let draft: Draft | undefined;
  if (/^submit buy$/i.test(textOf(button))) {
    if (reviewed && reviewed.path === location.pathname && Date.now() - reviewed.at < REVIEW_MS) draft = reviewed.draft;
  } else {
    const panel = panelOf(button);
    draft = panel ? readDraft(panel) : undefined;
  }
  return draft && { platform: 'tv', account, symbol: draft.symbol, side: 'buy', size: draft.size, type: 'market' };
}
