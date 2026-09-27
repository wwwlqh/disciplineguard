// The remote page config (SPEC §9.1 "Page config"): a signed copy of PAGE, so a TradingView change can be fixed
// without a new release. Data only: every value is a selector or a text marker for a named field of the bundled
// schema; unknown keys are ignored. It must verify with the bundled page key (kept offline, separate from the rule
// cache key), and its version must be higher than any accepted before. A new version reaches 5% of installs for
// 30 minutes before everyone else.
import { PAGE, type PageConfig } from './tv.ts';

declare const __DG_PAGE_PUBKEY__: string;
export const PAGE_PUBKEY: string = typeof __DG_PAGE_PUBKEY__ === 'string' ? __DG_PAGE_PUBKEY__ : 'cfd8f01ab9a9661dfa38593fe41b41d8aaecd0f8d4d51254b141d4244f4e0333';

export const PAGE_STORE = 'dg_page';
export const STAGE_MS = 30 * 60_000;
export const STAGE_PCT = 5;

export interface SignedPage {
  payload: string;
  sig: string;
}

/** A copy of `x` shaped like PAGE, or undefined when any field is missing or not a short string (list). */
export function validPage(x: unknown, shape: unknown = PAGE): unknown {
  if (typeof shape === 'number') return Number.isInteger(x) && (x as number) > 0 ? x : undefined;
  if (typeof shape === 'string') return typeof x === 'string' && x.length > 0 && x.length <= 300 ? x : undefined;
  if (Array.isArray(shape)) {
    if (!Array.isArray(x) || x.length === 0 || x.length > 20) return undefined;
    return x.every((s) => typeof s === 'string' && s.length <= 60) ? x.map((s: string) => s.toLowerCase()) : undefined;
  }
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(shape as object)) {
    const v = validPage((x as Record<string, unknown>)[k], (shape as Record<string, unknown>)[k]);
    if (v === undefined) return undefined;
    out[k] = v;
  }
  return out;
}

const hexBytes = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));

/** The page config in a signed file, if the signature, schema, version and rollout stage all allow it. */
export async function acceptPage(signed: SignedPage, highest: number, bucket: number, t = Date.now(), pub = PAGE_PUBKEY): Promise<PageConfig | undefined> {
  try {
    if (typeof signed?.payload !== 'string' || typeof signed.sig !== 'string' || !/^[0-9a-f]{128}$/.test(signed.sig)) return undefined;
    const key = await crypto.subtle.importKey('raw', hexBytes(pub), { name: 'Ed25519' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'Ed25519' }, key, hexBytes(signed.sig), new TextEncoder().encode(signed.payload));
    if (!ok) return undefined;
    const p = JSON.parse(signed.payload);
    const page = validPage(p.page) as PageConfig | undefined;
    if (!page || page.version <= Math.max(highest, PAGE.version)) return undefined;
    if (typeof p.rolloutAt !== 'number' || (bucket >= STAGE_PCT && t < p.rolloutAt + STAGE_MS)) return undefined;
    return page;
  } catch {
    return undefined;
  }
}

/** In the content script: the stored page config when it is newer than the bundled one and its selectors parse. */
export async function loadPage(use: (p: PageConfig) => void): Promise<void> {
  const apply = (p: unknown) => {
    const page = validPage(p) as PageConfig | undefined;
    if (!page || page.version <= PAGE.version) return;
    const frag = document.createDocumentFragment();
    try {
      const sels = [page.panel, page.floating, page.account, page.summary].flatMap((o) => Object.values(o));
      for (const s of [...sels, page.symbol, page.chart]) frag.querySelector(s);
    } catch {
      return;
    }
    use(page);
  };
  apply((await chrome.storage.local.get(PAGE_STORE))[PAGE_STORE]);
  chrome.storage.onChanged.addListener((c) => c[PAGE_STORE] && apply(c[PAGE_STORE].newValue));
}
