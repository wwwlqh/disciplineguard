# Spikes

Throwaway tests for the open questions in SPEC §16. Not product code. Test on free accounts only: TradingView Paper Trading and an MT5 demo.

## TradingView (Q1a)

Can the extension catch a Buy/Sell click, show the pause, and then let the trader's next click send the order? The extension never clicks for the trader (SPEC §7.5).

1. Chrome → `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick `spikes/tradingview-extension`.
2. Open a TradingView chart and connect **Paper Trading**. Turn on one-click trading and open the order panel.
3. Click the extension icon → Mode **2. Pick**. Click each control to guard: floating Buy, floating Sell, the order panel's Buy/Sell submit button, Reverse. Each one shows "Guarded: …".
4. Mode **3. Hold**. Place trades each way below. For each one: pause → wait → **Place anyway** → click Buy/Sell once more → answer "Did the order go through?".
   - Floating Buy and Sell
   - Order panel submit button
   - Enter key inside the order panel's quantity field
   - Reverse on an open position
   - Closing a position: this must **not** show the pause
5. Repeat step 4 on one real broker account in TradingView, with the smallest size.
6. Extension icon → **Copy log** → paste it to Claude.

If a control can't be picked ("No data-name"), use Mode **1. Log**, click it, and send the log.

## MT5 (Q3, Q4)

1. Install MT5 and log in to a demo or free-trial account.
2. Copy `mt5/DG_Spike.mq5` into `MQL5/Experts`, compile it, and turn on **Algo Trading**.
3. Drag **DG_Spike** onto a chart, then:
   - **Q3**: place one trade each from the panel, the chart's one-click buttons, the phone app and the web terminal.
   - **Q4**: set your MetaQuotes ID (Tools → Options → Notifications), then press **Push test**.
4. Claude reads `MQL5/Files/DG_spike_log.txt`.

## Results

| Spike | Result | Date |
|---|---|---|
| Q1a hold on Paper Trading | | |
| Q1a hold on a real broker | | |
| Q3 DEAL_REASON labels | | |
| Q4 push on prop build | | |
| Q10 Ed25519 verify in MQL5 (`q10-ed25519/`) | Pass. 8/8 checks against Node's Ed25519, 1.8 ms per 3 KB verification (build 6230) | 27 Sep 2026 |
| MT5 pause flow | Pass. Early click at 1.6 s ignored, Place anyway after 5 s reached `OrderSend` | 27 Sep 2026 |
| Q11 Windows app sets up MT5 | Mostly pass: SPEC §16 | 27 Sep 2026 |
