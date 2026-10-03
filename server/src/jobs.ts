// Cron every 5 minutes: due jobs and retention purges (SPEC §10.2, §13.3).
import { DAY, HOUR } from '@dg/core';
import { offCheck, rollup, sendSummary, type AlertKind } from './alerts.ts';
import { renewalReminder } from './billing.ts';
import { runDeletion } from './data.ts';
import { audit, sendEmail, type Ctx } from './common.ts';
import { now as clock, type Env } from './env.ts';

function fmtUtc(t: number): string {
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

async function runJob(env: Env, job: { id: number; kind: string; payload: string | null }, ctx: Ctx): Promise<void> {
  const p = job.payload ? JSON.parse(job.payload) : {};
  const t = clock(env);
  switch (job.kind) {
    case 'lock_notice': {
      const u = await env.DB.prepare('SELECT email, setup_mode FROM users WHERE id = ? AND deleted_at IS NULL').bind(p.userId).first<any>();
      if (!u || !u.setup_mode) return;
      await sendEmail(env, u.email, 'DisciplineGuard: your rules lock tomorrow', `Your rules lock at ${fmtUtc(p.lockAt)}. Review them now: ${env.APP_URL}/rules\n\nAfter that, tightening a rule applies at once and loosening waits until your next day reset.\n\nDisciplineGuard`, ctx);
      return;
    }
    case 'auto_lock': {
      const r = await env.DB.prepare("UPDATE users SET setup_mode = 0, locked_at = ?, locked_by = 'auto' WHERE id = ? AND setup_mode = 1").bind(t, p.userId).run();
      if (r.meta.changes) await audit(env, p.userId, 'server', 'auto_locked');
      return;
    }
    case 'alert_rollup':
      return rollup(env, p.userId, p.kind as AlertKind);
    case 'off_check':
      return offCheck(env, p);
    case 'summary':
      return sendSummary(env, p);
    case 'renewal_reminder':
      return renewalReminder(env, p, ctx);
    case 'delete_account':
      return runDeletion(env, p, ctx);
  }
}

export async function runScheduled(env: Env, ctx: Ctx): Promise<{ ran: number }> {
  const t = clock(env);
  const { results } = await env.DB.prepare('SELECT id, kind, payload FROM jobs WHERE done_at IS NULL AND run_at <= ? ORDER BY run_at LIMIT 50').bind(t).all<any>();
  for (const job of results) {
    try {
      await runJob(env, job, ctx);
      await env.DB.prepare('UPDATE jobs SET done_at = ? WHERE id = ?').bind(t, job.id).run();
    } catch (e) {
      console.log(JSON.stringify({ job: job.kind, error: String(e).slice(0, 200) }));
    }
  }
  // Retention (SPEC §13.3).
  await env.DB.batch([
    // 'pause': kept from before DisciplineGuard became count-only.
    env.DB.prepare("DELETE FROM events WHERE t < ? AND type NOT IN ('pause', 'override', 'entry', 'close')").bind(t - 90 * DAY),
    env.DB.prepare('DELETE FROM coverage WHERE to_utc < ?').bind(t - 30 * DAY),
    env.DB.prepare('DELETE FROM alerts WHERE created_at < ?').bind(t - 7 * DAY),
    env.DB.prepare('DELETE FROM login_codes WHERE created_at < ?').bind(t - DAY),
    env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(t - 2 * HOUR),
    env.DB.prepare('DELETE FROM desktop_codes WHERE expires_at < ?').bind(t - DAY),
    env.DB.prepare('DELETE FROM jobs WHERE done_at IS NOT NULL AND done_at < ?').bind(t - 30 * DAY),
    env.DB.prepare('DELETE FROM problem_reports WHERE created_at < ?').bind(t - 365 * DAY),
  ]);
  return { ran: results.length };
}
