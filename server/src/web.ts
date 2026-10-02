// JSON API for the web app (SPEC §10.4 "Web app API"). Every route needs a web session.
import {
  accountLoss, activeCooldown, autoLockAt, buildTemplate, dayOf, DAY, entriesToday, HOUR, insideWindows, localParts, MIN,
  nextReset, nextWindowStart, r8Status, requestChange, type Choice, type State, type TemplateAccount,
} from '@dg/core';
import { isEnded } from './accounts.ts';
import { isOwner, requireSession, type Session } from './auth.ts';
import { audit, rateLimit, securityEmail, sendEmail, type Ctx } from './common.ts';
import { enforcedRules, resolvedTime, userCtx, type AccountRow, type UserCtx } from './context.ts';
import { coverageGaps } from './coverage.ts';
import { dayRows, isKept } from './days.ts';
import { now as clock, type Env } from './env.ts';
import { body, HttpError, json, str } from './http.ts';
import { allowDesktop } from './desktop.ts';
import { saveSetting, toRow } from './settings.ts';
import { buildSnapshot } from './sync.ts';
import { validateSetting } from './validate.ts';
import { ownerMetrics } from './owner.ts';
import { REFUND_DAYS, cancelPlan, changePlan, checkoutUrl, plans, requestRefund } from './billing.ts';
import { ALERT_KINDS, alertPrefs } from './alerts.ts';
import { cancelDeletion, requestDeletion, requestExport } from './data.ts';

type Handler = (req: Request, env: Env, s: Session, ctx: Ctx, params: string[]) => Promise<Response>;

const routes: [string, RegExp, Handler][] = [
  ['GET', /^\/api\/me$/, me],
  ['PUT', /^\/api\/settings$/, putSetting],
  ['POST', /^\/api\/settings\/cancel$/, cancelPending],
  ['POST', /^\/api\/lock$/, lockRules],
  ['POST', /^\/api\/break$/, (r, e, s, c) => tighten(r, e, s, c, 'break')],
  ['POST', /^\/api\/done-today$/, (r, e, s, c) => tighten(r, e, s, c, 'done')],
  ['POST', /^\/api\/tighten-today$/, (r, e, s) => tightenToday(r, e, s)],
  ['GET', /^\/api\/today$/, today],
  ['GET', /^\/api\/stats$/, stats],
  ['PUT', /^\/api\/onboarding$/, saveOnboarding],
  ['POST', /^\/api\/onboarding\/apply$/, applyOnboarding],
  ['PUT', /^\/api\/prefs$/, prefs],
  ['PUT', /^\/api\/alerts$/, putAlerts],
  ['POST', /^\/api\/alerts\/test$/, testAlert],
  ['POST', /^\/api\/desktop\/allow$/, (r, e, s) => allowDesktop(r, e, s.user)],
  ['PUT', /^\/api\/accounts\/([\w-]+)$/, renameAccount],
  ['DELETE', /^\/api\/accounts\/([\w-]+)$/, removeAccount],
  ['DELETE', /^\/api\/connections\/([\w-]+)$/, removeConnection],
  ['GET', /^\/api\/sessions$/, sessions],
  ['POST', /^\/api\/sessions\/signout-all$/, signOutAll],
  ['POST', /^\/api\/report$/, report],
  ['POST', /^\/api\/tell-me$/, tellMe],
  ['POST', /^\/api\/checkout$/, async (r, e, s) => checkoutUrl(r, e, s.user)],
  ['GET', /^\/api\/plans$/, async (_r, e, s) => plans(e, s.user)],
  ['POST', /^\/api\/export$/, async (_r, e, s, c) => requestExport(e, s, c)],
  ['POST', /^\/api\/account\/delete$/, requestDeletion],
  ['POST', /^\/api\/account\/delete\/cancel$/, async (_r, e, s) => cancelDeletion(e, s)],
  ['POST', /^\/api\/plan\/cancel$/, async (_r, e, s, c) => cancelPlan(e, s.user, c)],
  ['POST', /^\/api\/plan\/change$/, async (r, e, s) => changePlan(r, e, s.user)],
  ['POST', /^\/api\/plan\/refund$/, async (_r, e, s, c) => requestRefund(e, s.user, c)],
  ['GET', /^\/api\/owner\/metrics$/, async (r, e, s) => {
    if (!isOwner(e, s.user)) throw new HttpError(404, 'not_found');
    return ownerMetrics(r, e);
  }],
];

export async function webApi(req: Request, env: Env, ctx: Ctx): Promise<Response> {
  const path = new URL(req.url).pathname;
  for (const [method, re, h] of routes) {
    const m = re.exec(path);
    if (m && method === req.method) {
      const s = await requireSession(req, env);
      return h(req, env, s, ctx, m.slice(1));
    }
  }
  throw new HttpError(404, 'not_found');
}

function planPaid(uc: UserCtx): boolean {
  return uc.license.state === 'active' || uc.license.state === 'past_due';
}

function accountView(a: AccountRow, uc: UserCtx) {
  const r5 = uc.asm.rules.accounts[a.id]?.r5Max;
  let state = 'active';
  if (isEnded(a, uc.now)) state = 'ended';
  else if (!a.last_seen || uc.now - a.last_seen > DAY) state = 'not_seen';
  return {
    id: a.id, platform: a.platform, last3: a.last3, nickname: a.nickname, server: a.server_name, broker: a.broker, firm: a.firm,
    currency: a.currency, netting: !!a.netting, demo: !!a.is_demo, state, lastSeen: a.last_seen, r5Set: r5 !== undefined,
    removalAt: uc.settings.get(`acct:${a.id}:removed`)?.pending?.effectiveAt ?? null,
  };
}

async function connectionsView(env: Env, uc: UserCtx) {
  const { results } = await env.DB.prepare(
    'SELECT c.id, c.kind, c.name, c.version, c.role, c.status, c.last_seen, c.first_on_at, c.created_at, c.off_reason, c.build_hash, GROUP_CONCAT(sb.account_id) AS accounts FROM connections c LEFT JOIN seen_by sb ON sb.connection_id = c.id WHERE c.user_id = ? AND c.removed_at IS NULL GROUP BY c.id ORDER BY c.created_at',
  ).bind(uc.user.id).all<any>();
  const known = (env.KNOWN_BUILDS ?? '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
  return results.map((c) => ({
    id: c.id, kind: c.kind, name: c.name, version: c.version, role: c.role, status: c.status, lastSeen: c.last_seen, firstOnAt: c.first_on_at,
    offReason: c.off_reason, accounts: c.accounts ? String(c.accounts).split(',') : [],
    unknownBuild: !!c.build_hash && known.length > 0 && !known.includes(String(c.build_hash).toLowerCase()),
    removalAt: uc.settings.get(`conn:${c.id}:removed`)?.pending?.effectiveAt ?? null,
  }));
}

async function me(req: Request, env: Env, s: Session): Promise<Response> {
  const uc = await userCtx(env, s.user.id, clock(env));
  const u = uc.user;
  const raw: Record<string, unknown> = {};
  for (const [k, v] of uc.settings) raw[k] = { active: v.active, pending: v.pending ?? null, setAt: v.setAt };
  return json({
    now: uc.now,
    user: {
      email: u.email, firstName: u.first_name, setupMode: !!u.setup_mode, lockedAt: u.locked_at, lockedBy: u.locked_by,
      lockAt: u.setup_mode && u.first_on_at ? autoLockAt(uc.userResets, u.first_on_at) : null, firstOnAt: u.first_on_at,
      lastRealPauseAt: u.last_real_pause_at, hideAmounts: !!u.hide_amounts, analyticsConsent: u.analytics_consent, reasonConsent: u.reason_consent, reasonAsked: u.reason_asked_at !== null,
      onboarding: u.onboarding_json ? JSON.parse(u.onboarding_json) : null,
      alerts: alertPrefs(u.alerts_json), hasApp: await hasApp(env, u.id),
      isBeta: !!u.is_beta, owner: isOwner(env, u), country: u.country, planKind: u.plan_kind, cancelAtPeriodEnd: !!u.cancel_at_period_end,
      portalUrl: u.portal_url, updateCardUrl: u.update_card_url, deletionAt: u.deletion_at,
      refundable: u.first_paid_at !== null && uc.now - u.first_paid_at <= REFUND_DAYS * DAY,
    },
    license: uc.license,
    rules: uc.asm.rules,
    popup: uc.asm.popup,
    tz: uc.asm.tz,
    notes: uc.asm.notes,
    plan: uc.asm.plan,
    settings: raw,
    pending: uc.asm.pending,
    time: resolvedTime(uc),
    accounts: uc.accounts.map((a) => accountView(a, uc)),
    connections: await connectionsView(env, uc),
  });
}

const PROTECTED_LABEL: Record<string, string> = {
  R1: 'Max trades per day', R2: 'Max trades per hour', R3: 'Too fast', R4: 'Trading hours', R5: 'Max position size', R6: 'Max risk per trade',
  R7: 'Cooldown after a loss', R8: 'Daily loss limit', R9: 'Stop loss required', R10: 'No bigger after a loss',
};

function describeKey(key: string): string {
  const [kind, id, sub] = key.split(':');
  if (kind === 'rule') return `Rule "${PROTECTED_LABEL[id] ?? id}"`;
  if (kind === 'acct') return `Account setting (${sub})`;
  if (kind === 'popup') return 'Popup settings';
  if (kind === 'note') return 'A note';
  if (kind === 'plan') return 'Your plan';
  if (kind === 'tz') return 'Timezone';
  if (kind === 'reset') return 'Day reset';
  return key;
}

/** PUT /api/settings {key, value, dryRun?}: stricter applies now, looser is scheduled (SPEC §6). */
async function putSetting(req: Request, env: Env, s: Session, ctx: Ctx): Promise<Response> {
  const b = await body(req);
  const key = str(b.key, 80);
  const t = clock(env);
  const uc = await userCtx(env, s.user.id, t);
  const value = validateSetting(key, b.value, (id) => uc.accounts.find((a) => a.id === id));
  const cur = uc.settings.get(key);
  const res = requestChange(key, toRow(cur), value, {
    now: t, userResets: uc.userResets, setupMode: !!uc.user.setup_mode, lastRealPauseAt: uc.user.last_real_pause_at ?? undefined,
  });
  if (b.dryRun === true) return json({ direction: res.direction, appliesAt: res.appliesAt });
  if (res.direction === 'same' && !cur?.pending) return json({ direction: 'same', appliesAt: 'now' });
  await saveSetting(env.DB, s.user.id, key, res.row, cur?.active, res.direction, res.appliesAt, t);
  const when = res.appliesAt === 'now' ? 'It applies now.' : `It starts at ${new Date(res.appliesAt).toISOString().slice(0, 16).replace('T', ' ')} UTC.`;
  await securityEmail(env, s.user.email, `${describeKey(key)} was changed. ${when}`, req, ctx);
  return json({ direction: res.direction, appliesAt: res.appliesAt });
}

/** POST /api/settings/cancel {key}: a scheduled change can always be cancelled at once (SPEC §6.4). */
async function cancelPending(req: Request, env: Env, s: Session, ctx: Ctx): Promise<Response> {
  const b = await body(req);
  const key = str(b.key, 80);
  const t = clock(env);
  const uc = await userCtx(env, s.user.id, t);
  const cur = uc.settings.get(key);
  if (!cur?.pending) return json({ ok: true });
  await env.DB.batch([
    env.DB.prepare('UPDATE settings SET pending_json = NULL, effective_at = NULL, requested_at = NULL WHERE user_id = ? AND key = ?').bind(s.user.id, key),
    env.DB.prepare("INSERT INTO setting_changes (user_id, key, from_json, to_json, direction, applies_at, created_at) VALUES (?, ?, ?, ?, 'cancel', ?, ?)")
      .bind(s.user.id, key, JSON.stringify(cur.pending.value), JSON.stringify(cur.active), t, t),
  ]);
  await securityEmail(env, s.user.email, `A scheduled change to ${describeKey(key).toLowerCase()} was cancelled.`, req, ctx);
  return json({ ok: true });
}

/** POST /api/lock {firstName}: ends setup mode, once (SPEC §6.1). */
async function lockRules(req: Request, env: Env, s: Session, ctx: Ctx): Promise<Response> {
  const b = await body(req);
  const name = str(b.firstName, 60).trim();
  if (name.length < 1) throw new HttpError(400, 'first_name');
  if (b.understood !== true) throw new HttpError(400, 'confirm');
  const t = clock(env);
  const r = await env.DB.prepare('UPDATE users SET setup_mode = 0, locked_at = ?, locked_by = ?, first_name = COALESCE(first_name, ?) WHERE id = ? AND setup_mode = 1')
    .bind(t, name, name, s.user.id)
    .run();
  if (r.meta.changes === 1) {
    await audit(env, s.user.id, 'user', 'locked');
    await securityEmail(env, s.user.email, `Your rules were locked by ${name}. From now on, looser changes wait until your next day reset, or 12 hours if that's later.`, req, ctx);
  }
  return json({ ok: true, lockedAt: t });
}

/** Take a break (15 min) or done for today: stricter, immediate, never shortened (SPEC §6.5). */
/** Take a break (15 minutes, or {days: 1 | 7 | 30} from Account), Done for today. Never shortened (SPEC §6.5). */
async function tighten(req: Request, env: Env, s: Session, ctx: Ctx, kind: 'break' | 'done'): Promise<Response> {
  const t = clock(env);
  const uc = await userCtx(env, s.user.id, t);
  const b = await body(req).catch(() => ({}) as Record<string, unknown>);
  const days = kind === 'break' && b.days !== undefined ? Number(b.days) : 0;
  if (days && ![1, 7, 30].includes(days)) throw new HttpError(400, 'bad_days');
  const until = kind === 'done' ? nextReset(uc.userResets, t) : t + (days ? days * DAY : 15 * MIN);
  const col = kind === 'break' ? 'break_until' : 'done_until';
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO user_state (user_id, ${col}) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET ${col} = MAX(COALESCE(${col}, 0), excluded.${col})`).bind(s.user.id, until),
    env.DB.prepare('INSERT INTO events (id, user_id, type, t, received_at, payload) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(`web:${kind}:${s.user.id}:${t}`, s.user.id, kind === 'break' ? 'break' : 'done_today', t, t, JSON.stringify({ until, from: 'web', days: days || undefined })),
  ]);
  return json({ ok: true, until });
}

/**
 * POST /api/tighten-today {r1?, r8?}: a lower max trades and daily loss limit until the next reset (SPEC §6.5,
 * EXPERIENCE §9.9). A second tighten the same day only goes lower.
 */
async function tightenToday(req: Request, env: Env, s: Session): Promise<Response> {
  const t = clock(env);
  const uc = await userCtx(env, s.user.id, t);
  const b = await body(req);
  const r1 = b.r1 === undefined ? undefined : Number(b.r1);
  const r8 = b.r8 === undefined ? undefined : Number(b.r8);
  if (r1 !== undefined && !(Number.isInteger(r1) && r1 >= 1 && r1 <= 100)) throw new HttpError(400, 'bad_r1');
  if (r8 !== undefined && !(Number.isFinite(r8) && r8 > 0 && r8 <= 1e9)) throw new HttpError(400, 'bad_r8');
  if (r1 === undefined && r8 === undefined) throw new HttpError(400, 'nothing');
  const old = uc.tighten;
  const low = (a?: number, b?: number) => (a === undefined ? b : b === undefined ? a : Math.min(a, b));
  const next = { r1: low(old?.r1, r1), r8: low(old?.r8, r8), until: nextReset(uc.userResets, t) };
  await env.DB.batch([
    env.DB.prepare('INSERT INTO user_state (user_id, tighten_json) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET tighten_json = excluded.tighten_json')
      .bind(s.user.id, JSON.stringify(next)),
    env.DB.prepare('INSERT INTO events (id, user_id, type, t, received_at, payload) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(`web:tighten:${s.user.id}:${t}`, s.user.id, 'tighten', t, t, JSON.stringify(next)),
  ]);
  return json({ ok: true, tighten: next });
}

function tightenSuggest(uc: UserCtx): { r1: number; r8: number } {
  const r = uc.asm.rules;
  const amounts = r.R8.on ? uc.accounts.map((a) => r.accounts[a.id]?.r8).filter((x) => x?.unit === 'amount').map((x) => x!.value) : [];
  return { r1: r.R1.on ? Math.max(1, Math.min(3, r.R1.max - 1)) : 3, r8: amounts.length ? Math.max(1, Math.round(Math.min(...amounts) / 2)) : 150 };
}

function stateFrom(snap: Awaited<ReturnType<typeof buildSnapshot>>, uc: UserCtx): State {
  const accounts: State['accounts'] = {};
  for (const a of uc.accounts) {
    const sa = snap.accounts[a.id];
    accounts[a.id] = {
      platform: a.platform, netting: !!a.netting, positions: [], dayStartBalance: sa?.dayStartBalance, equity: a.equity ?? undefined,
      credit: a.credit ?? undefined, limitReachedAt: sa?.limitReachedAt,
    };
  }
  return {
    entries: snap.entries, closes: snap.closes, overrides: snap.overrides, breakUntil: snap.breakUntil ?? undefined, doneUntil: snap.doneUntil ?? undefined,
    accounts, clock: { verified: true },
  };
}

async function today(req: Request, env: Env, s: Session): Promise<Response> {
  const t = clock(env);
  const uc = await userCtx(env, s.user.id, t);
  const snap = await buildSnapshot(env, uc);
  const state = stateFrom(snap, uc);
  const time = resolvedTime(uc);
  const rules = enforcedRules(uc);
  const input = { rules, time, state };
  const day = dayOf(uc.userResets, t);
  const cd = rules.R7.on ? activeCooldown(rules, state.closes, t) : undefined;

  const accounts = uc.accounts.map((a) => {
    const r8 = r8Status(input, a.id, t);
    return {
      ...accountView(a, uc),
      loss: accountLoss(state.accounts[a.id]) ?? null,
      limit: r8.applies ? r8.limit : null,
      r8On: rules.R8.on && !!rules.accounts[a.id]?.r8,
      inLimit: r8.inLimit,
      limitUntil: r8.until ?? null,
    };
  });

  const { results: pauses } = await env.DB.prepare("SELECT t, payload FROM events WHERE user_id = ? AND type = 'pause' AND t >= ? ORDER BY t DESC LIMIT 50")
    .bind(uc.user.id, day.start)
    .all<{ t: number; payload: string }>();
  const { results: outside } = await env.DB.prepare("SELECT t, account_id, payload FROM events WHERE user_id = ? AND type = 'entry' AND t >= ? AND json_extract(payload, '$.source') = 'outside' ORDER BY t DESC")
    .bind(uc.user.id, day.start)
    .all<any>();
  const unclassified = await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND type = 'unclassified' AND t >= ?").bind(uc.user.id, day.start).first<{ n: number }>();
  const { results: offEvents } = await env.DB.prepare("SELECT t, payload FROM events WHERE user_id = ? AND type IN ('protection_off', 'account_moved') AND t >= ? ORDER BY t DESC")
    .bind(uc.user.id, day.start - DAY)
    .all<any>();

  const gaps = [];
  for (const a of uc.accounts) {
    const firstSeen = Math.max(day.start, a.created_at);
    for (const g of await coverageGaps(env, a.id, firstSeen, t)) {
      const trades = outside.filter((o) => o.account_id === a.id && o.t >= g.from && o.t < g.to).length;
      gaps.push({ accountId: a.id, last3: a.last3, from: g.from, to: g.to, trades });
    }
  }

  const weekDays = await dayRows(env, uc, t - 7 * DAY, t + 1);
  const pausesWeek = await env.DB.prepare(
    "SELECT json_extract(payload, '$.decision') AS d, json_extract(payload, '$.title') AS title, json_extract(payload, '$.reason') = 'in_plan' AS ip, COUNT(*) AS n FROM events WHERE user_id = ? AND type = 'pause' AND t >= ? GROUP BY d, title, ip",
  )
    .bind(uc.user.id, t - 7 * DAY)
    .all<{ d: string; title: string; ip: number | null; n: number }>();
  // Calibration (EXPERIENCE §5.4): one rule caused most pauses, and most were placed anyway or marked "In my plan".
  const byTitle = new Map<string, { n: number; overruled: number }>();
  for (const r of pausesWeek.results) {
    const x = byTitle.get(r.title) ?? { n: 0, overruled: 0 };
    x.n += r.n;
    if (r.d === 'place' || r.ip === 1) x.overruled += r.n;
    byTitle.set(r.title, x);
  }
  const total = [...byTitle.values()].reduce((a, b) => a + b.n, 0);
  let calibration: { rule: string; count: number } | null = null;
  for (const [title, x] of byTitle) {
    if (total >= 5 && x.n / total > 0.5 && x.overruled / x.n > 0.5 && title !== 'CHECK') calibration = { rule: title, count: x.n };
  }

  return json({
    now: t,
    day,
    nextReset: day.end,
    license: uc.license,
    setupMode: !!uc.user.setup_mode,
    lockAt: uc.user.setup_mode && uc.user.first_on_at ? autoLockAt(uc.userResets, uc.user.first_on_at) : null,
    connections: await connectionsView(env, uc),
    accounts,
    meters: {
      tradesToday: entriesToday(input, t),
      r1Max: rules.R1.on ? rules.R1.max : null,
      cooldownUntil: cd && cd.until > t ? cd.until : null,
      breakUntil: state.breakUntil && state.breakUntil > t ? state.breakUntil : null,
      doneUntil: state.doneUntil && state.doneUntil > t ? state.doneUntil : null,
      hours: rules.R4.on ? { open: insideWindows({ rules, time }, t), next: nextWindowStart({ rules, time }, t) ?? null } : null,
    },
    // Tighten for today (EXPERIENCE §9.9): what's on, and the suggested values for the check-in card.
    tighten: uc.tighten ?? null,
    tightenSuggest: tightenSuggest(uc),
    pending: uc.asm.pending,
    pauses: pauses.map((p) => ({ t: p.t, ...JSON.parse(p.payload) })),
    outside: outside.map((o) => ({ t: o.t, accountId: o.account_id, ...JSON.parse(o.payload) })),
    coverage: { gaps, unclassified: unclassified?.n ?? 0, off: offEvents.map((e) => ({ t: e.t, ...JSON.parse(e.payload ?? '{}') })) },
    week: {
      pauses: total,
      skipped: pausesWeek.results.filter((r) => r.d === 'skip' || r.d === 'timeout').reduce((a, b) => a + b.n, 0),
      placed: pausesWeek.results.filter((r) => r.d === 'place').reduce((a, b) => a + b.n, 0),
      daysTraded: weekDays.filter((d) => d.entries + d.pauses > 0).length,
      daysKept: weekDays.filter(isKept).length,
      // The last 7 trading days, oldest first, for the week strip.
      days: weekDays.slice(-7).map((d) => ({ start: d.start, traded: d.entries + d.pauses > 0, kept: isKept(d) })),
      keptToday: (() => {
        const d = weekDays.find((x) => x.start === day.start);
        return d ? d.placed === 0 && d.outside === 0 && d.unprotected === 0 : true;
      })(),
    },
    calibration,
  });
}

async function stats(req: Request, env: Env, s: Session): Promise<Response> {
  const t = clock(env);
  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') ?? 30)));
  const account = url.searchParams.get('account');
  const uc = await userCtx(env, s.user.id, t);
  const from = t - days * DAY;
  const acctFilter = account ? ' AND account_id = ?' : '';
  const bind = (stmt: string) => (account ? env.DB.prepare(stmt).bind(uc.user.id, from, account) : env.DB.prepare(stmt).bind(uc.user.id, from));
  const { results: pauses } = await bind(`SELECT t, payload FROM events WHERE user_id = ? AND type = 'pause' AND t >= ?${acctFilter}`).all<{ t: number; payload: string }>();
  const byOutcome = { skip: 0, place: 0, timeout: 0 } as Record<string, number>;
  const byRule: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  const byHour = new Array(24).fill(0);
  const time = resolvedTime(uc);
  for (const p of pauses) {
    const x = JSON.parse(p.payload);
    byOutcome[x.decision] = (byOutcome[x.decision] ?? 0) + 1;
    byRule[x.title ?? 'CHECK'] = (byRule[x.title ?? 'CHECK'] ?? 0) + 1;
    if (x.reason) byReason[x.reason] = (byReason[x.reason] ?? 0) + 1;
    byHour[Math.floor(localParts(time.offsets, p.t).msOfDay / HOUR)]++;
  }
  const rows = await dayRows(env, uc, from, t + 1);
  const traded = rows.filter((d) => d.entries + d.pauses > 0);
  const cameBack = traded.filter((d) => d.placed === 1 && d.outside === 0 && d.unprotected === 0).length;
  const count = async (type: string, extra = '') =>
    (await bind(`SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND type = '${type}' AND t >= ?${acctFilter}${extra}`).first<{ n: number }>())?.n ?? 0;
  return json({
    days,
    pauses: pauses.length,
    byOutcome,
    byRule,
    byReason,
    byHour,
    daysTraded: traded.length,
    daysKept: traded.filter(isKept).length,
    cameBackDays: cameBack,
    // Every day of the period, oldest first, for the calendar.
    daily: rows.map((d) => ({ start: d.start, entries: d.entries, pauses: d.pauses, traded: d.entries + d.pauses > 0, kept: isKept(d) })),
    coverage: {
      outside: await count('entry', " AND json_extract(payload, '$.source') = 'outside'"),
      unprotected: await count('entry', " AND json_extract(payload, '$.unprotected') = 1"),
      unclassified: await count('unclassified'),
      stopChanges: await count('stop_change'),
      offEvents: await count('protection_off'),
    },
    baseline: await baselineSummary(env, uc),
  });
}

async function baselineSummary(env: Env, uc: UserCtx) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n, MIN(t) AS a, MAX(t) AS b FROM baseline WHERE user_id = ? AND kind = 'entry'").bind(uc.user.id).first<{ n: number; a: number; b: number }>();
  if (!row || !row.n) return null;
  return { entries: row.n, from: row.a, to: row.b };
}

async function saveOnboarding(req: Request, env: Env, s: Session): Promise<Response> {
  const b = await body(req, 32 * 1024);
  // Drafts never overwrite a finished onboarding.
  await env.DB.prepare("UPDATE users SET onboarding_json = ? WHERE id = ? AND (onboarding_json IS NULL OR COALESCE(json_extract(onboarding_json, '$.done'), 0) != 1)")
    .bind(JSON.stringify(b.state ?? {}), s.user.id)
    .run();
  return json({ ok: true });
}

const CHOICES: Choice[] = ['too_many', 'win_back', 'size_up', 'hours', 'skip_sl', 'bad_days', 'give_back'];

/**
 * POST /api/onboarding/apply: writes the starting rules and trading day (notes and plan are optional).
 * Only in setup mode, where every change applies at once.
 */
async function applyOnboarding(req: Request, env: Env, s: Session, ctx: Ctx): Promise<Response> {
  const b = await body(req, 64 * 1024);
  const t = clock(env);
  if (!s.user.setup_mode) throw new HttpError(409, 'locked');
  const uc = await userCtx(env, s.user.id, t);
  const writes: [string, unknown][] = [];
  const tzv = validateSetting('tz', b.tz, () => undefined);
  writes.push(['tz', tzv]);
  writes.push(['reset', validateSetting('reset', b.reset ?? { preset: 'midnight' }, () => undefined)]);
  const choices = (Array.isArray(b.choices) ? b.choices : []).filter((c: unknown): c is Choice => CHOICES.includes(c as Choice));
  if (b.rules && typeof b.rules === 'object') {
    // The rules screen already shows the template; the user may have edited it.
    for (const id of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10']) {
      if (b.rules[id]) writes.push([`rule:${id}`, validateSetting(`rule:${id}`, b.rules[id], () => undefined)]);
    }
  } else {
    const accounts: TemplateAccount[] = uc.accounts.map((a) => ({ id: a.id, platform: a.platform, type: 'own' }));
    const tpl = buildTemplate({ choices, style: b.style ?? 'day', accounts, userTz: tzv as string, session: b.session }, t);
    for (const id of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10'] as const) {
      if (tpl.rules[id].on) writes.push([`rule:${id}`, tpl.rules[id]]);
    }
  }
  if (b.defaults && typeof b.defaults === 'object') {
    for (const k of ['r5', 'r6', 'r8', 'r7ignore']) {
      if (b.defaults[k] !== undefined && b.defaults[k] !== null) writes.push([`default:${k}`, validateSetting(`default:${k}`, b.defaults[k], () => undefined)]);
    }
  }
  // Notes and plan are optional: onboarding asks the trader to type nothing.
  const notes = Array.isArray(b.notes) ? b.notes.slice(0, 3) : [];
  notes.forEach((n: unknown, i: number) => writes.push([`note:${i + 1}`, validateSetting(`note:${i + 1}`, n, () => undefined)]));
  if (typeof b.plan === 'string' && b.plan.trim()) writes.push(['plan', validateSetting('plan', b.plan, () => undefined)]);
  if (b.popup) writes.push(['popup', validateSetting('popup', b.popup, () => undefined)]);

  for (const [key, value] of writes) {
    const cur = uc.settings.get(key);
    await saveSetting(env.DB, s.user.id, key, { active: value }, cur?.active, 'setup', 'now', t);
  }
  const consent = b.analyticsConsent === true ? 1 : b.analyticsConsent === false ? 0 : null;
  await env.DB.prepare('UPDATE users SET analytics_consent = COALESCE(?, analytics_consent), onboarding_json = ? WHERE id = ?')
    .bind(consent, JSON.stringify({ done: true, choices, style: b.style ?? null, platforms: b.platforms ?? [], accountTypes: b.accountTypes ?? null }), s.user.id)
    .run();
  if (Array.isArray(b.tellMe)) {
    for (const p of b.tellMe.slice(0, 10)) {
      if (typeof p === 'string') await env.DB.prepare('INSERT OR IGNORE INTO tell_me (user_id, platform, created_at) VALUES (?, ?, ?)').bind(s.user.id, p.slice(0, 30), t).run();
    }
  }
  await audit(env, s.user.id, 'user', 'onboarding_applied', { choices });
  await securityEmail(env, s.user.email, 'Your starting rules, notes and plan were saved.', req, ctx);
  return json({ ok: true });
}

/** Not protected: reason consent, hide amounts, first name (SPEC §6.2 last row). */
async function prefs(req: Request, env: Env, s: Session): Promise<Response> {
  const b = await body(req);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (typeof b.analyticsConsent === 'boolean') (sets.push('analytics_consent = ?'), vals.push(b.analyticsConsent ? 1 : 0));
  if (typeof b.reasonConsent === 'boolean') (sets.push('reason_consent = ?'), vals.push(b.reasonConsent ? 1 : 0));
  if (typeof b.hideAmounts === 'boolean') (sets.push('hide_amounts = ?'), vals.push(b.hideAmounts ? 1 : 0));
  if (typeof b.firstName === 'string') (sets.push('first_name = ?'), vals.push(b.firstName.trim().slice(0, 60) || null));
  if (sets.length) await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, s.user.id).run();
  if (b.deleteReasons === true) {
    await env.DB.prepare("UPDATE events SET payload = json_remove(payload, '$.reason') WHERE user_id = ? AND type = 'pause'").bind(s.user.id).run();
  }
  return json({ ok: true });
}

async function hasApp(env: Env, userId: string): Promise<boolean> {
  return !!(await env.DB.prepare('SELECT 1 FROM desktop_installs WHERE user_id = ? AND revoked_at IS NULL LIMIT 1').bind(userId).first());
}

/** PUT /api/alerts {on?, summaryAt?, amounts?}: the trader's own alerts are not protected (SPEC §6.2 last row). */
async function putAlerts(req: Request, env: Env, s: Session): Promise<Response> {
  const b = await body(req);
  const cur = alertPrefs(s.user.alerts_json);
  if (b.on && typeof b.on === 'object') for (const k of ALERT_KINDS) if (typeof b.on[k] === 'boolean') cur.on[k] = b.on[k];
  if (b.summaryAt === null || (Number.isInteger(b.summaryAt) && b.summaryAt >= 0 && b.summaryAt < 1440)) cur.summaryAt = b.summaryAt;
  if (typeof b.amounts === 'boolean') cur.amounts = b.amounts;
  await env.DB.prepare('UPDATE users SET alerts_json = ? WHERE id = ?').bind(JSON.stringify(cur), s.user.id).run();
  return json(cur);
}

/** POST /api/alerts/test: one notification on this trader's computers. */
async function testAlert(req: Request, env: Env, s: Session): Promise<Response> {
  await rateLimit(env, `alert_test:${s.user.id}`, 5, 3600_000);
  await env.DB.prepare("INSERT INTO alerts (user_id, kind, title, text, created_at) VALUES (?, 'test', 'DisciplineGuard', 'Alerts work. They show here, on this computer.', ?)")
    .bind(s.user.id, clock(env))
    .run();
  return json({ ok: true });
}

async function renameAccount(req: Request, env: Env, s: Session, _c: Ctx, p: string[]): Promise<Response> {
  const b = await body(req);
  const nick = typeof b.nickname === 'string' ? b.nickname.trim().slice(0, 40) || null : undefined;
  const firm = typeof b.firm === 'string' ? b.firm.trim().slice(0, 40) || null : undefined;
  await env.DB.prepare('UPDATE trading_accounts SET nickname = COALESCE(?, nickname), firm = COALESCE(?, firm) WHERE id = ? AND user_id = ?')
    .bind(nick ?? null, firm ?? null, p[0], s.user.id)
    .run();
  return json({ ok: true });
}

/** Removing an account: immediate when Ended, otherwise a loosening (SPEC §6.2). */
async function removeAccount(req: Request, env: Env, s: Session, ctx: Ctx, p: string[]): Promise<Response> {
  const t = clock(env);
  const uc = await userCtx(env, s.user.id, t);
  const a = uc.accounts.find((x) => x.id === p[0]);
  if (!a) throw new HttpError(404, 'no_account');
  const key = `acct:${a.id}:removed`;
  const cur = uc.settings.get(key);
  let appliesAt: number | 'now';
  if (isEnded(a, t) || !!uc.user.setup_mode) {
    await saveSetting(env.DB, s.user.id, key, { active: true }, cur?.active, 'stricter', 'now', t);
    await env.DB.prepare('UPDATE trading_accounts SET removed_at = ? WHERE id = ?').bind(t, a.id).run();
    appliesAt = 'now';
  } else {
    const res = requestChange(key, toRow(cur), true, { now: t, userResets: uc.userResets, setupMode: false });
    await saveSetting(env.DB, s.user.id, key, res.row, cur?.active, res.direction, res.appliesAt, t);
    appliesAt = res.appliesAt;
  }
  await audit(env, s.user.id, 'user', 'account_remove', { account: a.id, appliesAt });
  await securityEmail(env, s.user.email, `Account …${a.last3} ${appliesAt === 'now' ? 'was removed' : 'is scheduled for removal'}.`, req, ctx);
  return json({ appliesAt });
}

/** Removing a device: a loosening, except when every account it sees is Ended (SPEC §6.2). */
async function removeConnection(req: Request, env: Env, s: Session, ctx: Ctx, p: string[]): Promise<Response> {
  const t = clock(env);
  const uc = await userCtx(env, s.user.id, t);
  const c = await env.DB.prepare('SELECT id, name FROM connections WHERE id = ? AND user_id = ? AND removed_at IS NULL').bind(p[0], s.user.id).first<any>();
  if (!c) throw new HttpError(404, 'no_connection');
  const { results } = await env.DB.prepare('SELECT account_id FROM seen_by WHERE connection_id = ?').bind(c.id).all<{ account_id: string }>();
  const allEnded = results.every((r) => {
    const a = uc.accounts.find((x) => x.id === r.account_id);
    return !a || isEnded(a, t);
  });
  const key = `conn:${c.id}:removed`;
  const cur = uc.settings.get(key);
  let appliesAt: number | 'now' = 'now';
  if (allEnded || uc.user.setup_mode) {
    await saveSetting(env.DB, s.user.id, key, { active: true }, cur?.active, 'stricter', 'now', t);
    await env.DB.prepare('UPDATE connections SET removed_at = ? WHERE id = ?').bind(t, c.id).run();
  } else {
    const res = requestChange(key, toRow(cur), true, { now: t, userResets: uc.userResets, setupMode: false });
    await saveSetting(env.DB, s.user.id, key, res.row, cur?.active, res.direction, res.appliesAt, t);
    appliesAt = res.appliesAt;
  }
  await securityEmail(env, s.user.email, `Device "${c.name}" ${appliesAt === 'now' ? 'was removed' : 'is scheduled for removal'}.`, req, ctx);
  return json({ appliesAt });
}

async function sessions(req: Request, env: Env, s: Session): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT id, created_at, last_seen, user_agent FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_seen DESC LIMIT 20')
    .bind(s.user.id)
    .all<any>();
  const { results: events } = await env.DB.prepare('SELECT action, created_at FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').bind(s.user.id).all();
  return json({ sessions: results.map((r) => ({ ...r, current: r.id === s.sessionId })), events });
}

async function signOutAll(req: Request, env: Env, s: Session, ctx: Ctx): Promise<Response> {
  await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(clock(env), s.user.id).run();
  await audit(env, s.user.id, 'user', 'signout_all');
  await securityEmail(env, s.user.email, 'All web sessions were signed out. Your devices stay connected.', req, ctx);
  return json({ ok: true });
}

const REPORT_TYPES = ['should_not_pause', 'should_pause', 'setup', 'billing', 'other'];

async function report(req: Request, env: Env, s: Session, ctx: Ctx): Promise<Response> {
  const b = await body(req, 64 * 1024);
  await rateLimit(env, `report:${s.user.id}`, 10, 3600_000);
  const type = REPORT_TYPES.includes(b.type) ? b.type : 'other';
  const text = typeof b.text === 'string' ? b.text.slice(0, 4000) : '';
  const t = clock(env);
  await env.DB.prepare('INSERT INTO problem_reports (user_id, type, text, diagnostics, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(s.user.id, type, text, JSON.stringify(b.diagnostics ?? {}).slice(0, 32_000), t)
    .run();
  const owners = (env.OWNER_EMAILS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  for (const o of owners) await sendEmail(env, o, `Problem report (${type})`, `From ${s.user.email}\n\n${text}`, ctx);
  return json({ ok: true });
}

async function tellMe(req: Request, env: Env, s: Session): Promise<Response> {
  const b = await body(req);
  await env.DB.prepare('INSERT OR IGNORE INTO tell_me (user_id, platform, created_at) VALUES (?, ?, ?)').bind(s.user.id, str(b.platform, 30), clock(env)).run();
  return json({ ok: true });
}
