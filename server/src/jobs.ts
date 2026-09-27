// Cron every 5 minutes: due jobs, trial emails and retention purges (SPEC §10.2, §13.3).
import { DAY, HOUR } from '@dg/core';
import { audit, scheduleJob, sendEmail, type Ctx } from './common.ts';
import { userCtx } from './context.ts';
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
      await env.DB.prepare('UPDATE users SET lock_notice_sent = 1 WHERE id = ?').bind(p.userId).run();
      return;
    }
    case 'auto_lock': {
      const r = await env.DB.prepare("UPDATE users SET setup_mode = 0, locked_at = ?, locked_by = 'auto' WHERE id = ? AND setup_mode = 1").bind(t, p.userId).run();
      if (r.meta.changes) await audit(env, p.userId, 'server', 'auto_locked');
      return;
    }
    case 'trial_3days':
    case 'trial_ended': {
      const uc = await userCtx(env, p.userId, t);
      if (uc.license.state !== 'trial' && job.kind === 'trial_3days') return;
      if (uc.user.plan_state === 'active') return;
      const end = uc.license.trialEndsAt ?? uc.license.validUntil;
      const subject = job.kind === 'trial_3days' ? 'DisciplineGuard: your trial ends in 3 days' : 'DisciplineGuard: your trial ended';
      const text =
        job.kind === 'trial_3days'
          ? `Your trial ends at ${fmtUtc(end)}. Protection stops then. Plans: ${env.APP_URL}/account\n\nDisciplineGuard`
          : `Your trial ended at ${fmtUtc(end)}. Trades are no longer paused. Your rules are saved for 90 days. Plans: ${env.APP_URL}/account\n\nDisciplineGuard`;
      await sendEmail(env, uc.user.email, subject, text, ctx);
      return;
    }
  }
}

/** Schedules the trial emails once the trial end is known (the first connection reached On). */
export async function scheduleTrialEmails(env: Env): Promise<void> {
  const t = clock(env);
  const { results } = await env.DB.prepare("SELECT id FROM users WHERE plan_state = 'trial' AND first_on_at IS NOT NULL AND deleted_at IS NULL AND first_on_at > ?").bind(t - 20 * DAY).all<{ id: string }>();
  for (const u of results) {
    const uc = await userCtx(env, u.id, t);
    const end = uc.license.trialEndsAt;
    if (!end) continue;
    await scheduleJob(env, 'trial_3days', `trial_3days:${u.id}`, end - 3 * DAY, { userId: u.id });
    await scheduleJob(env, 'trial_ended', `trial_ended:${u.id}`, end, { userId: u.id });
  }
}

export async function runScheduled(env: Env, ctx: Ctx): Promise<{ ran: number }> {
  const t = clock(env);
  await scheduleTrialEmails(env);
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
    env.DB.prepare("DELETE FROM events WHERE t < ? AND type NOT IN ('pause', 'override', 'entry', 'close')").bind(t - 90 * DAY),
    env.DB.prepare('DELETE FROM coverage WHERE to_utc < ?').bind(t - 30 * DAY),
    env.DB.prepare('DELETE FROM login_codes WHERE created_at < ?').bind(t - DAY),
    env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(t - 2 * HOUR),
    env.DB.prepare('DELETE FROM desktop_codes WHERE expires_at < ?').bind(t - DAY),
    env.DB.prepare('DELETE FROM jobs WHERE done_at IS NOT NULL AND done_at < ?').bind(t - 30 * DAY),
  ]);
  return { ran: results.length };
}
