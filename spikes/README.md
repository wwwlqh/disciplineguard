# Spikes

Throwaway tests for the open questions in SPEC §16. Not product code. Test on free accounts only: TradingView Paper Trading and an MT5 demo.

## TradingView (Q1a)

Tested with the product extension (`clients/extension`), driven by `tv-runner/live.js`. Left: one real broker account in TradingView, with the smallest size.

## MT5 (Q3)

Answered with the product itself: on a demo account protected by DisciplineGuard, place one trade each from MT5's own order window, the phone app and the web terminal. Today should say each was placed "in MetaTrader's order window", "on your phone" and "on the web terminal".

## Results

| Spike | Result | Date |
|---|---|---|
| Q1a hold on Paper Trading | Pass with the product extension (`clients/extension`, `tv-runner/live.js`): held Buy in the order panel, skip, Place anyway then the trader's own click, closes never paused. BTCUSD | 27 Sep 2026 |
| Q1a hold on a real broker | | |
| Q3 DEAL_REASON labels | MetaTrader's order window labelled right on MetaQuotes-Demo (Close outside trades live test). Left: phone app and web terminal | 2 Oct 2026 |
| Q10 Ed25519 verify in MQL5 | Pass. 8/8 checks against Node's Ed25519, 1.8 ms per 3 KB verification (build 6230) | 27 Sep 2026 |
| MT5 pause flow | Pass. Early click at 1.6 s ignored, Place anyway after 5 s reached `OrderSend` | 27 Sep 2026 |
| Q11 Windows app sets up MT5 | Mostly pass: SPEC §16 | 27 Sep 2026 |
