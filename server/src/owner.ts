// Owner dashboard: one panel per Phase 1 exit criterion, split by platform and wave (PHASES.md Phase 1A).
import { DAY } from '@dg/core';
import { now as clock, type Env } from './env.ts';
import { json } from './http.ts';

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export async function ownerMetrics(req: Request, env: Env): Promise<Response> {
  const t = clock(env);
  const url = new URL(req.url);
  const platform = url.searchParams.get('platform'); // mt5 | mt4 | tv | null (all)
  const q = async <T = any>(sql: string, ...b: unknown[]) => (await env.DB.prepare(sql).bind(...b).all<T>()).results;
  const one = async (sql: string, ...b: unknown[]) => Number(Object.values((await env.DB.prepare(sql).bind(...b).first<any>()) ?? { n: 0 })[0] ?? 0);

  // Users with a connection of this platform.
  const platUsers = platform
    ? `AND u.id IN (SELECT user_id FROM connections WHERE kind = '${platform === 'tv' ? 'tv' : platform === 'mt4' ? 'mt4' : 'mt5'}')`
    : '';
  const users = await q<any>(`SELECT u.id, u.created_at, u.first_on_at, u.locked_at, u.setup_mode, u.plan_state, u.is_beta FROM users u WHERE u.deleted_at IS NULL ${platUsers}`);
  const activated = users.filter((u) => u.first_on_at && u.locked_at);
  const ids = activated.map((u) => u.id);

  // Retention: guarded entry or pause on 2+ days in days 8–14 after activation (SPEC §2).
  let retained = 0;
  let keptOnNotWorking = 0;
  for (const u of activated) {
    const act = Math.max(u.first_on_at, u.locked_at);
    if (t < act + 14 * DAY) continue;
    const days = await q<{ d: number }>(
      "SELECT DISTINCT CAST(t / 86400000 AS INTEGER) AS d FROM events WHERE user_id = ? AND t >= ? AND t < ? AND (type = 'pause' OR (type = 'entry' AND json_extract(payload, '$.source') = 'panel'))",
      u.id, act + 7 * DAY, act + 14 * DAY,
    );
    const p = await q<{ d: string; n: number }>("SELECT json_extract(payload, '$.decision') AS d, COUNT(*) AS n FROM events WHERE user_id = ? AND type = 'pause' GROUP BY d", u.id);
    const total = p.reduce((a, b) => a + b.n, 0);
    const placed = p.find((x) => x.d === 'place')?.n ?? 0;
    if (total > 0 && placed / total > 0.9) {
      keptOnNotWorking++;
      continue;
    }
    if (days.length >= 2) retained++;
  }
  const eligibleForRetention = activated.filter((u) => t >= Math.max(u.first_on_at, u.locked_at) + 14 * DAY).length;

  const inUsers = ids.length ? `user_id IN (${ids.map(() => '?').join(',')})` : '0';
  const pauses = await q<any>(`SELECT user_id, t, payload FROM events WHERE type = 'pause' AND ${inUsers}`, ...ids);
  const overrides = await q<any>(`SELECT user_id, t FROM events WHERE type = 'override' AND ${inUsers}`, ...ids);
  // Held: skip or timeout, then no rule-breaking entry (placed anyway or outside violation) for 30 minutes.
  const held = pauses.filter((p) => {
    const d = JSON.parse(p.payload).decision;
    if (d !== 'skip' && d !== 'timeout') return false;
    return !overrides.some((o) => o.user_id === p.user_id && o.t > p.t && o.t <= p.t + 30 * 60_000);
  }).length;
  const outsideViolations = await one(`SELECT COUNT(*) FROM events WHERE type = 'override' AND json_extract(payload, '$.from') = 'outside' AND ${inUsers}`, ...ids);
  const unprotected = await one(`SELECT COUNT(*) FROM events WHERE type = 'entry' AND json_extract(payload, '$.unprotected') = 1 AND ${inUsers}`, ...ids);
  const unclassified = await one(`SELECT COUNT(*) FROM events WHERE type = 'unclassified' AND ${inUsers}`, ...ids);
  const rulePauses = pauses.filter((p) => (JSON.parse(p.payload).rules ?? []).length > 0).length;
  const skips = pauses.filter((p) => JSON.parse(p.payload).decision === 'skip').length;
  const guardedExits = await one(`SELECT COUNT(*) FROM events WHERE type = 'exit' AND ${inUsers}`, ...ids);
  const panelEntries = await one(`SELECT COUNT(*) FROM events WHERE type = 'entry' AND json_extract(payload, '$.source') = 'panel' AND ${inUsers}`, ...ids);
  const delayed = await one(`SELECT COUNT(*) FROM events WHERE type = 'delayed_click' AND ${inUsers}`, ...ids);
  const safetyReports = await one("SELECT COUNT(*) FROM problem_reports WHERE type = 'should_not_pause'");

  // Reactance: protection off within 24 h after a pause.
  const offs = await q<any>(`SELECT user_id, t FROM events WHERE type = 'protection_off' AND ${inUsers}`, ...ids);
  const reactUsers = new Set(offs.filter((o) => pauses.some((p) => p.user_id === o.user_id && o.t > p.t && o.t - p.t <= DAY)).map((o) => o.user_id));

  // Payments.
  const paidUsers = await one("SELECT COUNT(DISTINCT user_id) FROM payments WHERE type IN ('subscription_created', 'order_created') AND user_id IS NOT NULL");
  const paidEarly = await one("SELECT COUNT(DISTINCT user_id) FROM payments WHERE plan_kind = 'earlybird_yearly' AND type IN ('subscription_created', 'order_created')");
  const paidList = await one("SELECT COUNT(DISTINCT user_id) FROM payments WHERE plan_kind IN ('yearly', 'monthly') AND type IN ('subscription_created', 'order_created')");
  const byCountry = await q("SELECT COALESCE(country, '?') AS country, COUNT(DISTINCT user_id) AS n FROM payments WHERE type IN ('subscription_created', 'order_created') GROUP BY country ORDER BY n DESC LIMIT 20");

  const reports = await q("SELECT type, COUNT(*) AS n FROM problem_reports GROUP BY type ORDER BY n DESC");
  const active7 = await one(`SELECT COUNT(DISTINCT user_id) FROM connections WHERE last_seen >= ?`, t - 7 * DAY);
  const setupFails = await q<any>("SELECT payload FROM events WHERE type = 'setup' AND t >= ?", t - 30 * DAY);
  const failCount: Record<string, number> = {};
  for (const s of setupFails) for (const f of JSON.parse(s.payload).failed ?? []) failCount[f] = (failCount[f] ?? 0) + 1;
  const tellMe = await q("SELECT platform, COUNT(*) AS n FROM tell_me GROUP BY platform ORDER BY n DESC");

  return json({
    at: t,
    platform: platform ?? 'all',
    funnel: { signups: users.length, connected: users.filter((u) => u.first_on_at).length, activated: activated.length },
    safety: { guardedExits, safetyReports },
    behavior: {
      pauses: pauses.length,
      held,
      heldRate: pct(held, pauses.length),
      skipRate: pct(skips, pauses.length),
      bypassRate: pct(outsideViolations + unprotected + unclassified, pauses.length + outsideViolations + unprotected + unclassified),
      displacement: pct(outsideViolations, outsideViolations + rulePauses),
      reactanceUsers: reactUsers.size,
    },
    retention: { eligible: eligibleForRetention, retained, rate: pct(retained, eligibleForRetention), keptOnNotWorking },
    payment: {
      paidUsers, paidEarlyBird: paidEarly, paidList,
      activatedToPaid: pct(paidUsers, activated.length), byCountry,
    },
    speed: { panelEntries, delayedClicks: delayed, delayedShare: pct(delayed, panelEntries) },
    support: { reports, activeUsers7d: active7, per100: active7 ? Math.round((reports.reduce((a: number, b: any) => a + b.n, 0) / active7) * 1000) / 10 : null },
    setupFailures: Object.entries(failCount).sort((a, b) => b[1] - a[1]).slice(0, 10),
    tellMe,
  });
}
