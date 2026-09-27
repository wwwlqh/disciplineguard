// The Windows app's side of the EA bridge (SPEC §9.5). The EA never touches the network: it writes one request
// at a time to out.txt in the Common Files folder, and this module sends it to the server and writes the reply to
// in.txt. It also writes app.txt, the heartbeat the EA reads to know the app is running and which connection it has.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Paths the EA may ask for. Anything else is refused, so a bad file can't reach other endpoints. */
const ALLOWED = new Set(['/v1/sync', '/v1/baseline']);

export interface TerminalLink {
  token: string;
  connectionId: string;
}

export interface AppState {
  api: string;
  /** The app's own token from "Allow" (SPEC §9.5). Undefined when signed out. */
  appToken?: string;
  email?: string;
  /** Terminal ids the trader ticked "Protect" for. */
  protected: string[];
  /** Device tokens, one per terminal. The real app stores this with Windows DPAPI. */
  links: Record<string, TerminalLink>;
  /** The trader agreed to upload the last 90 days for their own before/after comparison (SPEC §14). */
  baseline: boolean;
}

export interface BridgeDeps {
  commonFiles: string;
  fetch?: typeof fetch;
  now?: () => number;
  save(state: AppState): void;
}

type Reply = { status: number; body: string };

export function bridgeRoot(commonFiles: string): string {
  return join(commonFiles, 'DisciplineGuard');
}

/** Writes a temp file and renames it, so the EA never reads half a file. */
function writeAtomic(path: string, text: string): void {
  writeFileSync(`${path}.tmp`, text, 'utf8');
  renameSync(`${path}.tmp`, path);
}

export class Bridge {
  state: AppState;
  private deps: BridgeDeps;
  private fetchFn: typeof fetch;
  private now: () => number;

  constructor(state: AppState, deps: BridgeDeps) {
    this.state = state;
    this.deps = deps;
    this.fetchFn = deps.fetch ?? fetch;
    this.now = deps.now ?? Date.now;
  }

  /** Terminal ids whose EA has made a bridge folder, ticked or not. */
  seenTerminals(): string[] {
    const root = bridgeRoot(this.deps.commonFiles);
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  }

  /** One pass: heartbeat for every terminal, then at most one request per protected terminal. */
  async tick(): Promise<void> {
    const ids = new Set([...this.seenTerminals(), ...this.state.protected]);
    for (const id of ids) {
      const dir = join(bridgeRoot(this.deps.commonFiles), id);
      mkdirSync(dir, { recursive: true });
      this.writeHeartbeat(id, dir);
      if (this.state.protected.includes(id) && this.state.appToken) await this.serve(id, dir);
    }
  }

  private writeHeartbeat(id: string, dir: string): void {
    const s = this.state;
    const status = !s.appToken ? 'signed_out' : s.protected.includes(id) ? 'on' : 'not_protected';
    const conn = status === 'on' ? (s.links[id]?.connectionId ?? '') : '';
    const lines = [String(Math.floor(this.now() / 1000)), status, conn, s.email ?? '', s.baseline ? 'baseline' : ''];
    writeAtomic(join(dir, 'app.txt'), lines.join('\n'));
  }

  private async serve(id: string, dir: string): Promise<void> {
    const out = join(dir, 'out.txt');
    if (!existsSync(out)) return;
    const text = readFileSync(out, 'utf8');
    rmSync(out, { force: true });
    const nl = text.indexOf('\n');
    const [seq, path] = (nl >= 0 ? text.slice(0, nl) : text).trim().split(' ');
    const body = nl >= 0 ? text.slice(nl + 1) : '';
    const reply = await this.forward(id, path ?? '', body);
    // Heartbeat first: the EA reads the connection id before it checks the signed rules in the reply.
    this.writeHeartbeat(id, dir);
    writeAtomic(join(dir, 'in.txt'), `${seq} ${reply.status}\n${reply.body}`);
  }

  private async forward(id: string, path: string, body: string): Promise<Reply> {
    if (!ALLOWED.has(path)) return { status: 400, body: '{"error":"not_allowed"}' };
    let parsed: any;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { status: 400, body: '{"error":"bad_json"}' };
    }
    try {
      let link: TerminalLink | undefined = this.state.links[id] ?? (await this.register(id, parsed));
      if (!link) return { status: 400, body: '{"error":"no_account"}' };
      let r = await this.post(path, body, link.token);
      // The token was rotated or the connection re-created: register once more and retry.
      if (r.status === 401) {
        delete this.state.links[id];
        link = await this.register(id, parsed);
        if (link) r = await this.post(path, body, link.token);
      }
      // Removed on the website (a loosening that has taken effect): stop protecting this terminal, never re-register it.
      if (r.status === 410) {
        delete this.state.links[id];
        this.state.protected = this.state.protected.filter((t) => t !== id);
        this.deps.save(this.state);
      }
      return r;
    } catch (e) {
      if (e instanceof SignedOut) return { status: 401, body: '{"error":"signed_out"}' };
      return { status: -1, body: '' };
    }
  }

  private async register(id: string, req: any): Promise<TerminalLink | undefined> {
    const a = Array.isArray(req.accounts) ? req.accounts[0] : req.account;
    if (!a || !a.login) return undefined;
    const r = await this.fetchFn(`${this.state.api}/v1/desktop/terminals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.state.appToken}` },
      body: JSON.stringify({
        terminalId: id, kind: a.platform ?? 'mt5', server: a.server, login: a.login, broker: a.broker, currency: a.currency,
        netting: a.netting, demo: a.demo, version: req.version,
      }),
    });
    if (r.status === 401) {
      this.state.appToken = undefined;
      this.deps.save(this.state);
      throw new SignedOut();
    }
    if (r.status !== 200) return undefined;
    const d = (await r.json()) as { token: string; connectionId: string };
    const link = { token: d.token, connectionId: d.connectionId };
    this.state.links[id] = link;
    this.deps.save(this.state);
    return link;
  }

  private async post(path: string, body: string, token: string): Promise<Reply> {
    const r = await this.fetchFn(`${this.state.api}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body,
    });
    return { status: r.status, body: await r.text() };
  }
}

class SignedOut extends Error {}
