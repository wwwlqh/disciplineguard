// Protected settings storage (SPEC §6). Pending values become active on any read at or after effective_at.
import { DEFAULT_POPUP, emptyRules, RESET_PRESETS, type PopupSettings, type ResetSpec, type Rules, type SettingRow } from '@dg/core';
import type { D1Like } from './env.ts';

export interface StoredSetting {
  key: string;
  active: any;
  pending?: { value: any; effectiveAt: number; requestedAt: number };
  setAt: number;
}

interface Row {
  key: string;
  active_json: string | null;
  pending_json: string | null;
  effective_at: number | null;
  requested_at: number | null;
  set_at: number;
}

const parse = (s: string | null) => (s === null ? null : JSON.parse(s));

/** Loads every setting of a user, activating due pending values (and storing them as active). */
export async function loadSettings(db: D1Like, userId: string, now: number): Promise<Map<string, StoredSetting>> {
  const { results } = await db.prepare('SELECT key, active_json, pending_json, effective_at, requested_at, set_at FROM settings WHERE user_id = ?').bind(userId).all<Row>();
  const out = new Map<string, StoredSetting>();
  const writes = [];
  for (const r of results) {
    let s: StoredSetting = { key: r.key, active: parse(r.active_json), setAt: r.set_at };
    if (r.pending_json !== null && r.effective_at !== null) {
      if (now >= r.effective_at) {
        const value = parse(r.pending_json);
        writes.push(
          db.prepare('UPDATE settings SET active_json = ?, pending_json = NULL, effective_at = NULL, requested_at = NULL, set_at = ? WHERE user_id = ? AND key = ? AND effective_at = ?')
            .bind(r.pending_json, r.effective_at, userId, r.key, r.effective_at),
          db.prepare("INSERT INTO setting_changes (user_id, key, from_json, to_json, direction, applies_at, created_at, actor) VALUES (?, ?, ?, ?, 'activated', ?, ?, 'server')")
            .bind(userId, r.key, r.active_json, r.pending_json, r.effective_at, now),
        );
        s = { key: r.key, active: value, setAt: r.effective_at };
      } else {
        s.pending = { value: parse(r.pending_json), effectiveAt: r.effective_at, requestedAt: r.requested_at ?? r.set_at };
      }
    }
    out.set(r.key, s);
  }
  if (writes.length) await db.batch(writes);
  return out;
}

export function toRow(s: StoredSetting | undefined): SettingRow<any> {
  return s ? { active: s.active, pending: s.pending } : { active: undefined };
}

export async function saveSetting(
  db: D1Like,
  userId: string,
  key: string,
  row: SettingRow<any>,
  prev: any,
  direction: string,
  appliesAt: number | 'now',
  now: number,
  actor = 'user',
): Promise<void> {
  await db.batch([
    db.prepare(
      `INSERT INTO settings (user_id, key, active_json, pending_json, effective_at, requested_at, set_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, key) DO UPDATE SET active_json = excluded.active_json, pending_json = excluded.pending_json,
       effective_at = excluded.effective_at, requested_at = excluded.requested_at, set_at = excluded.set_at`,
    ).bind(
      userId,
      key,
      row.active === undefined ? null : JSON.stringify(row.active),
      row.pending ? JSON.stringify(row.pending.value) : null,
      row.pending?.effectiveAt ?? null,
      row.pending?.requestedAt ?? null,
      now,
    ),
    db.prepare('INSERT INTO setting_changes (user_id, key, from_json, to_json, direction, applies_at, created_at, actor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(userId, key, prev === undefined ? null : JSON.stringify(prev), JSON.stringify(row.pending ? row.pending.value : row.active), direction, appliesAt === 'now' ? now : appliesAt, now, actor),
  ]);
}

export interface Assembled {
  rules: Rules;
  popup: PopupSettings;
  tz: string;
  reset: ResetSpec;
  accountResets: Record<string, ResetSpec>;
  removedAccounts: Set<string>;
  removedConnections: Set<string>;
  pending: { key: string; value: any; effectiveAt: number }[];
  lockedValues: Record<string, number>;
  /** r5 is in lots; r5bet, the same in dollars, is for Polymarket and Kalshi accounts. */
  defaults: { r5?: any; r5bet?: any; r6?: any; r8?: any; r7ignore?: number };
}

export function resetSpec(v: any, tz: string): ResetSpec {
  if (!v || v.preset === 'midnight' || v.preset === undefined) return { at: v?.at ?? '00:00', tz: v?.tz ?? tz };
  if (v.preset in RESET_PRESETS) return RESET_PRESETS[v.preset];
  return { at: v.at ?? '00:00', tz: v.tz ?? tz };
}

/** Builds the active rule set and friends from stored settings. */
export function assemble(settings: Map<string, StoredSetting>): Assembled {
  const rules = emptyRules();
  let popup: PopupSettings = { ...DEFAULT_POPUP };
  let tz = 'UTC';
  let resetRaw: any;
  const accountResetRaw: Record<string, any> = {};
  const removedAccounts = new Set<string>();
  const removedConnections = new Set<string>();
  const pending: Assembled['pending'] = [];
  const lockedValues: Record<string, number> = {};
  const defaults: Assembled['defaults'] = {};

  for (const s of settings.values()) {
    lockedValues[s.key] = s.setAt;
    if (s.pending) pending.push({ key: s.key, value: s.pending.value, effectiveAt: s.pending.effectiveAt });
    const v = s.active;
    if (v === null || v === undefined) continue;
    const [kind, id, sub] = s.key.split(':');
    if (kind === 'rule' && id in rules) (rules as any)[id] = { ...(rules as any)[id], ...v };
    else if (kind === 'acct') {
      const a = (rules.accounts[id] ??= {});
      if (sub === 'r5') {
        a.r5Max = v.r5Max;
        a.r5Overrides = v.r5Overrides ?? [];
      } else if (sub === 'r6') a.r6 = v;
      else if (sub === 'r8') a.r8 = v;
      else if (sub === 'r7ignore') a.r7IgnoreBelow = v;
      else if (sub === 'copies') a.copiesMagic = v;
      else if (sub === 'reset') accountResetRaw[id] = v;
      else if (sub === 'removed' && v === true) removedAccounts.add(id);
    } else if (kind === 'default') (defaults as any)[id] = v;
    else if (kind === 'conn' && sub === 'removed' && v === true) removedConnections.add(id);
    else if (kind === 'popup') popup = { ...DEFAULT_POPUP, ...v };
    else if (kind === 'countOnce') rules.countOnce = !!v;
    else if (kind === 'closeOutside') rules.closeOutside = !!v;
    else if (kind === 'tz') tz = v;
    else if (kind === 'reset') resetRaw = v;
  }
  const accountResets: Record<string, ResetSpec> = {};
  for (const [id, v] of Object.entries(accountResetRaw)) accountResets[id] = resetSpec(v, tz);
  return { rules, popup, tz, reset: resetSpec(resetRaw, tz), accountResets, removedAccounts, removedConnections, pending, lockedValues, defaults };
}

/** The extension files Polymarket and Kalshi accounts under 'tv', with the site as the server. */
export function isBetAccount(a: { platform: string; server_name?: string | null }): boolean {
  return a.platform === 'tv' && (a.server_name === 'Polymarket' || a.server_name === 'Kalshi');
}

/** Fills per-account values from the user's defaults where an account has none of its own. */
export function applyDefaults(asm: Assembled, accounts: { id: string; platform: string; server_name?: string | null }[]): void {
  const d = asm.defaults;
  for (const a of accounts) {
    const r = (asm.rules.accounts[a.id] ??= {});
    // Polymarket and Kalshi sizes are dollars: a size in lots never applies to them.
    const r5 = isBetAccount(a) ? d.r5bet : d.r5;
    if (r.r5Max === undefined && r5) {
      r.r5Max = r5.r5Max;
      r.r5Overrides = r5.r5Overrides ?? [];
    }
    if (r.r6 === undefined && d.r6 && a.platform !== 'tv') r.r6 = d.r6;
    // A % daily loss limit needs MT's day-start balance; TradingView accounts need their own amount.
    if (r.r8 === undefined && d.r8 && (a.platform !== 'tv' || d.r8.unit === 'amount')) r.r8 = d.r8;
    if (r.r7IgnoreBelow === undefined && typeof d.r7ignore === 'number') r.r7IgnoreBelow = d.r7ignore;
  }
}
