// A D1-compatible wrapper over node:sqlite, for tests and local development. Not used on Workers.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { D1Like, D1Result, D1Stmt } from './env.ts';

function norm(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

class Stmt implements D1Stmt {
  private db: DatabaseSync;
  private sql: string;
  private params: unknown[];
  constructor(db: DatabaseSync, sql: string, params: unknown[] = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...values: unknown[]): D1Stmt {
    if (values.length > 100) throw new Error('D1 allows at most 100 bound parameters per statement');
    return new Stmt(this.db, this.sql, values.map(norm));
  }
  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.params as never[]));
    return (row ? { ...row } : null) as T | null;
  }
  async all<T>(): Promise<D1Result<T>> {
    const rows = this.db.prepare(this.sql).all(...(this.params as never[]));
    return { results: rows.map((r) => ({ ...r })) as T[], meta: { changes: 0 } };
  }
  async run(): Promise<D1Result> {
    const r = this.db.prepare(this.sql).run(...(this.params as never[]));
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  runSync(): D1Result {
    const r = this.db.prepare(this.sql).run(...(this.params as never[]));
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export class NodeD1 implements D1Like {
  readonly db: DatabaseSync;
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
  }
  prepare(sql: string): D1Stmt {
    return new Stmt(this.db, sql);
  }
  async batch(stmts: D1Stmt[]): Promise<D1Result[]> {
    // D1 runs a batch as one transaction.
    this.db.exec('BEGIN');
    try {
      const out = stmts.map((s) => (s as Stmt).runSync());
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  migrate(dir: string): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      const done = this.db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(f);
      if (done) continue;
      this.db.exec(readFileSync(join(dir, f), 'utf8'));
      this.db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(f);
    }
  }
}
