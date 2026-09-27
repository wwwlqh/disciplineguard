import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { acceptPage, STAGE_MS, validPage } from '../src/pageconfig.ts';
import { PAGE } from '../src/tv.ts';
import { diffPositions, MARKET_MATCH_MS, unexplained, type Expected } from '../src/watch.ts';

describe('diffPositions', () => {
  it('sees opened, added, reduced and reversed positions', () => {
    const d = diffPositions(
      [{ symbol: 'BTCUSD', side: 'buy', size: 1 }, { symbol: 'EURUSD', side: 'buy', size: 2 }, { symbol: 'XAUUSD', side: 'buy', size: 1 }],
      [{ symbol: 'BITSTAMP:BTCUSD', side: 'buy', size: 3 }, { symbol: 'EURUSD', side: 'buy', size: 0.5 }, { symbol: 'XAUUSD', side: 'sell', size: 1 }, { symbol: 'ETHUSD', side: 'sell', size: 2 }],
    );
    expect(d.opened).toEqual([
      { symbol: 'BTCUSD', side: 'buy', size: 2 },
      { symbol: 'XAUUSD', side: 'sell', size: 1 },
      { symbol: 'ETHUSD', side: 'sell', size: 2 },
    ]);
    expect(d.closed).toEqual([
      { symbol: 'EURUSD', side: 'buy', size: 1.5 },
      { symbol: 'XAUUSD', side: 'buy', size: 1 },
    ]);
  });
});

describe('unexplained', () => {
  const opened = { symbol: 'BTCUSD', side: 'buy' as const, size: 2 };
  it('a guarded market entry explains its fill once', () => {
    const ex: Expected[] = [{ t: 0, symbol: 'BTCUSD', side: 'buy', size: 2, pending: false }];
    expect(unexplained(opened, ex, 1000)).toBe(0);
    expect(ex).toEqual([]);
    expect(unexplained(opened, ex, 2000)).toBe(2);
  });
  it('an outside add on top of a guarded one counts the rest', () => {
    const ex: Expected[] = [{ t: 0, symbol: 'BTCUSD', side: 'buy', size: 0.5, pending: false }];
    expect(unexplained(opened, ex, 1000)).toBe(1.5);
  });
  it('a market entry stops explaining fills after 15 s; a pending one waits', () => {
    const ex: Expected[] = [
      { t: 0, symbol: 'BTCUSD', side: 'buy', size: 2, pending: false },
      { t: 0, symbol: 'ETHUSD', side: 'sell', size: 1, pending: true },
    ];
    expect(unexplained(opened, ex, MARKET_MATCH_MS + 1)).toBe(2);
    expect(unexplained({ symbol: 'ETHUSD', side: 'sell', size: 1 }, ex, 3_600_000)).toBe(0);
  });
  it('the other side is never matched', () => {
    const ex: Expected[] = [{ t: 0, symbol: 'BTCUSD', side: 'sell', size: 2, pending: false }];
    expect(unexplained(opened, ex, 1000)).toBe(2);
  });
});

describe('page config', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
  const signed = (page: unknown, rolloutAt = 0) => {
    const payload = JSON.stringify({ page, rolloutAt });
    return { payload, sig: sign(null, Buffer.from(payload), privateKey).toString('hex') };
  };
  const v2 = { ...PAGE, version: 2, symbol: '#symbol-v2' };

  it('accepts a newer signed config and ignores unknown keys', async () => {
    const p = await acceptPage(signed({ ...v2, script: 'alert(1)' }), 0, 50, STAGE_MS + 1, pub);
    expect(p?.symbol).toBe('#symbol-v2');
    expect(p && 'script' in p).toBe(false);
  });
  it('rejects a bad signature, an old version, a missing field and the staged window', async () => {
    const s = signed(v2);
    expect(await acceptPage({ ...s, sig: s.sig.replace(/^./, s.sig[0] === 'a' ? 'b' : 'a') }, 0, 50, STAGE_MS + 1, pub)).toBeUndefined();
    expect(await acceptPage(s, 2, 50, STAGE_MS + 1, pub)).toBeUndefined();
    expect(await acceptPage(signed({ ...v2, symbol: 42 }), 0, 50, STAGE_MS + 1, pub)).toBeUndefined();
    expect(await acceptPage(s, 0, 50, 1000, pub)).toBeUndefined();
    expect(await acceptPage(s, 0, 3, 1000, pub)).toBeDefined();
  });
  it('the bundled config fits its own schema', () => {
    expect(validPage(PAGE)).toEqual(PAGE);
  });
});
