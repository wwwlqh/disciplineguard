import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { World } from '../../../server/test/harness.ts';
import { Bridge, type AppState } from '../src/bridge.ts';

async function setup() {
  const w = new World();
  const web = await w.signIn('a@b.co');
  await web.onboard();
  const appToken = await web.allowDesktop();
  const common = mkdtempSync(join(tmpdir(), 'dg-common-'));
  const state: AppState = { api: 'https://app.test', appToken, email: 'a***@b.co', protected: ['TERMA'], links: {}, baseline: false };
  const bridge = new Bridge(state, { commonFiles: common, fetch: w.fetch, now: () => w.t, save: () => {} });
  const dir = join(common, 'DisciplineGuard', 'TERMA');
  mkdirSync(dir, { recursive: true });
  return { w, web, bridge, state, dir, common };
}

const account = { key: '1234567@FTMO-Demo', platform: 'mt5', server: 'FTMO-Demo', login: '1234567', currency: 'USD', netting: false, balance: 10000, equity: 10000 };
const syncBody = JSON.stringify({ role: 'primary', version: '0.1.0', signedHash: '', accounts: [account], events: [] });

describe('bridge (SPEC §9.5)', () => {
  it('connects the terminal on its first request and relays the reply, with no pairing step', async () => {
    const { bridge, dir, web } = await setup();
    writeFileSync(join(dir, 'out.txt'), `7 /v1/sync\n${syncBody}`);
    await bridge.tick();
    expect(existsSync(join(dir, 'out.txt'))).toBe(false);
    const reply = readFileSync(join(dir, 'in.txt'), 'utf8');
    expect(reply.split('\n')[0]).toBe('7 200');
    expect(JSON.parse(reply.slice(reply.indexOf('\n') + 1)).signed.payload).toBeTruthy();
    const hb = readFileSync(join(dir, 'app.txt'), 'utf8').split('\n');
    expect(hb[1]).toBe('on');
    expect(hb[2]).toMatch(/^c_/);
    expect((await web.get('/api/me')).data.connections).toHaveLength(1);
  });

  it('tells an unticked terminal to be ticked, and never forwards for it', async () => {
    const { bridge, common } = await setup();
    const other = join(common, 'DisciplineGuard', 'TERMB');
    mkdirSync(other, { recursive: true });
    writeFileSync(join(other, 'out.txt'), `1 /v1/sync\n${syncBody}`);
    await bridge.tick();
    expect(readFileSync(join(other, 'app.txt'), 'utf8').split('\n')[1]).toBe('not_protected');
    expect(existsSync(join(other, 'in.txt'))).toBe(false);
  });

  it('refuses paths other than sync and baseline', async () => {
    const { bridge, dir } = await setup();
    writeFileSync(join(dir, 'out.txt'), `3 /api/me\n{}`);
    await bridge.tick();
    expect(readFileSync(join(dir, 'in.txt'), 'utf8').split('\n')[0]).toBe('3 400');
  });

  it('re-registers once when the device token was rotated', async () => {
    const { bridge, dir, state } = await setup();
    writeFileSync(join(dir, 'out.txt'), `1 /v1/sync\n${syncBody}`);
    await bridge.tick();
    state.links.TERMA.token = 'x'.repeat(43);
    writeFileSync(join(dir, 'out.txt'), `2 /v1/sync\n${syncBody}`);
    await bridge.tick();
    expect(readFileSync(join(dir, 'in.txt'), 'utf8').split('\n')[0]).toBe('2 200');
  });

  it('reports signed out when the app token is revoked', async () => {
    const { bridge, dir, state } = await setup();
    state.appToken = 'y'.repeat(43);
    writeFileSync(join(dir, 'out.txt'), `1 /v1/sync\n${syncBody}`);
    await bridge.tick();
    expect(readFileSync(join(dir, 'in.txt'), 'utf8').split('\n')[0]).toBe('1 401');
    expect(state.appToken).toBeUndefined();
    await bridge.tick();
    expect(readFileSync(join(dir, 'app.txt'), 'utf8').split('\n')[1]).toBe('signed_out');
  });

  it('stops protecting a terminal removed on the website instead of reconnecting it', async () => {
    const { bridge, dir, state, web, w } = await setup();
    writeFileSync(join(dir, 'out.txt'), `1 /v1/sync\n${syncBody}`);
    await bridge.tick();
    const conn = (await web.get('/api/me')).data.connections[0];
    await web.send('DELETE', `/api/connections/${conn.id}`);
    w.t += 2 * 24 * 3600_000;
    writeFileSync(join(dir, 'out.txt'), `2 /v1/sync\n${syncBody}`);
    await bridge.tick();
    expect(readFileSync(join(dir, 'in.txt'), 'utf8').split('\n')[0]).toBe('2 410');
    expect(state.protected).not.toContain('TERMA');
    expect(readFileSync(join(dir, 'app.txt'), 'utf8').split('\n')[1]).toBe('not_protected');
  });
});
