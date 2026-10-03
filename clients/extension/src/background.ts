// The service worker (SPEC §9.1): sign-in, one connection per TradingView broker account, sync, and the trader's
// alerts as browser notifications. Tokens live only here, in IndexedDB, never in content scripts.
import { API, PUBKEY, VERSION } from './config.ts';
import { PAGE_STORE, acceptPage } from './pageconfig.ts';
import { CACHE_KEY, accountKey, type Cache, type Msg, type QueuedEvent, type Status, type TvAccount } from './messages.ts';

//--- token store (IndexedDB: the service worker's own origin) --------------------------------------------

interface Link {
  token: string;
  connectionId: string;
  terminalId: string;
  account: TvAccount;
}

interface Secrets {
  appToken?: string;
  email?: string;
  /** The signed-in user's id, so a sign-in as someone else is noticed (SEC-01). */
  user?: string;
  links: Record<string, Link>;
  alertsAfter?: number;
  queue: Record<string, QueuedEvent[]>;
  seq: number;
}

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('dg', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function load(): Promise<Secrets> {
  const d = await db();
  return new Promise((resolve) => {
    const r = d.transaction('kv').objectStore('kv').get('s');
    r.onsuccess = () => resolve({ links: {}, queue: {}, seq: 0, ...(r.result ?? {}) });
    r.onerror = () => resolve({ links: {}, queue: {}, seq: 0 });
  });
}

async function save(s: Secrets): Promise<void> {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(s, 's');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Serializes read-modify-write of the secrets. */
let lock: Promise<unknown> = Promise.resolve();
function withSecrets<T>(f: (s: Secrets) => Promise<T> | T): Promise<T> {
  const run = lock.then(async () => {
    const s = await load();
    const out = await f(s);
    await save(s);
    return out;
  });
  lock = run.catch(() => {});
  return run;
}

//--- helpers ---------------------------------------------------------------------------------------------

async function post(path: string, token: string | undefined, body: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

const hexBytes = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The signed rule cache must verify with the bundled key; otherwise it is ignored (SPEC §10.5). */
async function verified(signed: { payload: string; sig: string }): Promise<any | null> {
  try {
    const key = await crypto.subtle.importKey('raw', hexBytes(PUBKEY), { name: 'Ed25519' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'Ed25519' }, key, hexBytes(signed.sig), new TextEncoder().encode(signed.payload));
    return ok ? JSON.parse(signed.payload) : null;
  } catch {
    return null;
  }
}

async function getCache(): Promise<Cache> {
  const v = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] as Cache | undefined;
  return v ?? { status: 'signed_out', accounts: {}, skew: 0, syncedAt: 0 };
}

async function setCache(c: Cache): Promise<void> {
  await chrome.storage.local.set({ [CACHE_KEY]: c });
  const badge: Record<Status, [string, string]> = {
    on: ['', '#0f766e'], offline: ['', '#0f766e'], setting_up: ['…', '#2563eb'], attention: ['!', '#f59e0b'], off: ['off', '#9ca3af'], signed_out: ['off', '#9ca3af'],
  };
  const [text, color] = badge[c.status];
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}

//--- sign-in (SPEC §9.1): Allow in the web app, PKCE, like the Windows app -------------------------------

async function signIn(): Promise<void> {
  const verifier = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await chrome.storage.session.set({ verifier });
  const name = /Edg\//.test(navigator.userAgent) ? 'Edge' : 'Chrome';
  const q = new URLSearchParams({ ext: chrome.runtime.id, challenge: await sha256hex(verifier), name });
  await chrome.tabs.create({ url: `${API}/allow?${q}` });
}

chrome.runtime.onMessageExternal.addListener((msg, sender, reply) => {
  // Only the DisciplineGuard web app may hand over a code (externally_connectable lists only its origin).
  if (sender.origin !== new URL(API).origin || msg?.type !== 'dg_code' || typeof msg.code !== 'string') return;
  (async () => {
    const { verifier } = await chrome.storage.session.get('verifier');
    if (typeof verifier !== 'string') return reply({ ok: false });
    const r = await post('/v1/auth/desktop', undefined, { code: msg.code, verifier, version: VERSION });
    if (r.status !== 200) return reply({ ok: false });
    await chrome.storage.session.remove('verifier');
    await withSecrets(async (s) => {
      // Another person: the old person's connections are turned off and forgotten (SEC-01).
      if (s.user !== r.data.user) {
        await protectionOff(s, 'switched_login');
        s.links = {};
        s.queue = {};
        s.alertsAfter = undefined;
      }
      s.appToken = r.data.token;
      s.email = r.data.email;
      s.user = r.data.user;
    });
    await setCache({ status: 'setting_up', accounts: {}, skew: 0, syncedAt: 0 });
    reply({ ok: true });
    await tick();
  })();
  return true;
});

/** Protection-off for every connection, best effort (SPEC §10.6). */
async function protectionOff(s: Secrets, reason: string): Promise<void> {
  for (const l of Object.values(s.links)) {
    const off = { type: 'protection_off', id: `off_${Date.now()}_${l.terminalId}`, t: Date.now(), reason };
    await post('/v1/sync', l.token, { v: 1, role: 'primary', version: VERSION, accounts: [], events: [off] }).catch(() => {});
  }
}

async function signOut(): Promise<void> {
  await withSecrets(async (s) => {
    await protectionOff(s, 'signed_out');
    s.appToken = undefined;
    s.email = undefined;
    s.user = undefined;
    s.links = {};
    s.queue = {};
  });
  await setCache({ status: 'signed_out', accounts: {}, skew: 0, syncedAt: 0 });
}

//--- accounts: every broker account seen on a chart is protected, like a new MT login after Protect ---------

async function register(account: TvAccount): Promise<void> {
  const known = await load();
  if (!known.appToken || known.links[accountKey(account)]) return;
  await withSecrets(async (s) => {
    const k = accountKey(account);
    if (!s.appToken || s.links[k]) return;
    const terminalId = `tv${(await sha256hex(`${chrome.runtime.id}:${k}`)).slice(0, 30)}`;
    const r = await post('/v1/desktop/terminals', s.appToken, {
      terminalId, kind: 'tv', server: account.broker, login: account.login, broker: account.broker, currency: account.currency, demo: /paper/i.test(account.broker), version: VERSION,
    });
    if (r.status === 401) s.appToken = undefined;
    const cache = await getCache();
    const refused = { ...cache.refused };
    delete refused[k];
    if (r.status === 409 && (r.data?.error === 'account_cap' || r.data?.error === 'account_taken')) refused[k] = r.data.error;
    await setCache({ ...cache, refused });
    if (r.status !== 200) return;
    s.links[k] = { token: r.data.token, connectionId: r.data.connectionId, terminalId, account };
  });
  await tick();
}

//--- sync (SPEC §10.3) -------------------------------------------------------------------------------------

async function syncAll(): Promise<void> {
  const s = await load();
  const cache = await getCache();
  if (!s.appToken) return setCache({ status: 'signed_out', accounts: {}, skew: 0, syncedAt: 0 });
  const keys = Object.keys(s.links);
  if (keys.length === 0) return setCache({ ...cache, status: 'setting_up' });
  let ok = false;
  let authFail = false;
  const next: Cache = { ...cache, accounts: { ...cache.accounts } };
  for (const k of keys) {
    const l = s.links[k];
    const queued = (s.queue[k] ?? []).slice(0, 100);
    const events = queued.map((e, i) => ({ ...e, seq: s.seq + i + 1, acct: k }));
    const sent = Date.now();
    let r;
    try {
      r = await post('/v1/sync', l.token, {
        v: 1, role: 'primary', version: VERSION, state: 'on', signedHash: '',
        accounts: [{ key: k, platform: 'tv', server: l.account.broker, login: l.account.login, currency: l.account.currency, protect: true }],
        events,
      });
    } catch {
      continue;
    }
    if (r.status === 410) {
      await withSecrets((x) => void delete x.links[k]);
      delete next.accounts[k];
      next.status = r.data?.status === 'account_deleted' ? 'off' : next.status;
      continue;
    }
    if (r.status === 401 || r.status === 403) {
      authFail = true;
      continue;
    }
    if (r.status !== 200) continue;
    ok = true;
    await withSecrets((x) => {
      x.queue[k] = (x.queue[k] ?? []).slice(queued.length);
      x.seq += queued.length;
    });
    const d = r.data;
    next.skew = d.serverTime - Math.round((sent + Date.now()) / 2);
    next.syncedAt = Date.now();
    if (d.signed) {
      const p = await verified(d.signed);
      if (p) next.signed = { rules: p.rules, popup: p.popup, time: p.time, hideAmounts: p.hideAmounts, license: p.license };
    }
    next.snapshot = d.snapshot;
    const a = (d.accounts ?? []).find((x: any) => x.key === k);
    if (a?.id) next.accounts[k] = { id: a.id, enforced: a.state === 'active', last3: a.last3 };
  }
  // A sign-in as someone else during this sync starts over.
  if ((await load()).user !== s.user) return;
  // Rules keep working from the last sync in every failure (SPEC §10.5).
  next.status = authFail ? 'attention' : !next.signed ? 'setting_up' : !next.signed.license.enforcing ? 'off' : ok ? 'on' : 'offline';
  await setCache(next);
}

async function alerts(): Promise<void> {
  const s = await load();
  if (!s.appToken) return;
  const r = await post('/v1/desktop/alerts', s.appToken, s.alertsAfter === undefined ? {} : { after: s.alertsAfter }).catch(() => null);
  if (!r || r.status !== 200) return;
  for (const a of r.data.alerts ?? []) {
    chrome.notifications.create(`dg_${a.id}`, { type: 'basic', iconUrl: 'icon128.png', title: a.title, message: a.text });
  }
  await withSecrets((x) => void (x.alertsAfter = r.data.cursor));
}

/** The signed page config, checked every 30 minutes. The content scripts pick it up from storage. */
async function pageConfig(): Promise<void> {
  const v = await chrome.storage.local.get([PAGE_STORE, 'dg_bucket', 'dg_page_at']);
  if (typeof v.dg_page_at === 'number' && Date.now() - v.dg_page_at < 30 * 60_000) return;
  let bucket = v.dg_bucket as number | undefined;
  if (typeof bucket !== 'number') bucket = crypto.getRandomValues(new Uint32Array(1))[0] % 100;
  await chrome.storage.local.set({ dg_bucket: bucket, dg_page_at: Date.now() });
  const res = await fetch(`${API}/tv-page.json`, { cache: 'no-cache' });
  if (!res.ok) return;
  const page = await acceptPage(await res.json(), (v[PAGE_STORE] as { version?: number } | undefined)?.version ?? 0, bucket);
  if (page) await chrome.storage.local.set({ [PAGE_STORE]: page });
}

async function tick(): Promise<void> {
  await syncAll().catch(() => {});
  await alerts().catch(() => {});
  await pageConfig().catch(() => {});
}

//--- wiring ------------------------------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg: Msg, sender, reply) => {
  (async () => {
    if (msg.type === 'account') await register(msg.account);
    else if (msg.type === 'events') {
      await withSecrets((s) => void (s.queue[msg.accountKey] = [...(s.queue[msg.accountKey] ?? []), ...msg.events].slice(-500)));
      await syncAll().catch(() => {});
    } else if (msg.type === 'sign_in') await signIn();
    else if (msg.type === 'sign_out') await signOut();
    const s = await load();
    reply({ cache: await getCache(), email: s.email ?? null, accounts: Object.values(s.links).map((l) => l.account.broker + ' …' + l.account.login.slice(-3)) });
  })();
  return true;
});

// Sync and alerts every minute (chrome.alarms, SPEC §9.1).
chrome.alarms.create('tick', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => a.name === 'tick' && void tick());
chrome.runtime.onStartup.addListener(() => void tick());
chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === 'install') chrome.tabs.create({ url: 'welcome.html' });
  void tick();
});
chrome.notifications.onClicked.addListener(() => void chrome.tabs.create({ url: `${API}/today` }));
