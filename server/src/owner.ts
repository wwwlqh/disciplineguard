// Owner dashboard: how many people use DisciplineGuard, and totals. Never anyone's settings.
import { DAY } from '@dg/core';
import { now as clock, type Env } from './env.ts';
import { json } from './http.ts';

export async function ownerMetrics(_req: Request, env: Env): Promise<Response> {
  const t = clock(env);
  const one = async (sql: string, ...b: unknown[]) => Number(Object.values((await env.DB.prepare(sql).bind(...b).first<any>()) ?? { n: 0 })[0] ?? 0);
  const rows = async (sql: string, ...b: unknown[]) => (await env.DB.prepare(sql).bind(...b).all<{ k: string; n: number }>()).results;
  return json({
    users: {
      total: await one('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL'),
      new7d: await one('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND created_at >= ?', t - 7 * DAY),
      connected: await one('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND first_on_at IS NOT NULL'),
      active7d: await one('SELECT COUNT(DISTINCT user_id) FROM connections WHERE removed_at IS NULL AND last_seen >= ?', t - 7 * DAY),
    },
    // The extension files Polymarket and Kalshi accounts under 'tv', with the site as the server.
    accounts: await rows(
      "SELECT CASE WHEN platform = 'tv' AND server_name IN ('Polymarket', 'Kalshi') THEN server_name WHEN platform = 'tv' THEN 'TradingView' ELSE UPPER(platform) END AS k, COUNT(*) AS n FROM trading_accounts WHERE removed_at IS NULL GROUP BY k ORDER BY n DESC",
    ),
    week: {
      pauses: await one("SELECT COUNT(*) FROM events WHERE type = 'pause' AND t >= ?", t - 7 * DAY),
      trades: await one("SELECT COUNT(*) FROM events WHERE type = 'entry' AND void_at IS NULL AND t >= ?", t - 7 * DAY),
    },
    tellMe: await rows('SELECT platform AS k, COUNT(*) AS n FROM tell_me GROUP BY platform ORDER BY n DESC'),
    reports: await rows('SELECT type AS k, COUNT(*) AS n FROM problem_reports GROUP BY type ORDER BY n DESC'),
  });
}
