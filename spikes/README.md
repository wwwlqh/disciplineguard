# Phase 0 spikes

Throwaway tests (SPEC §17). Not product code. Test on free accounts only: TradingView Paper Trading and an MT5 demo.

## TradingView (Q1a)

Can the extension catch a Buy/Sell click, show the popup, and then let the trader's next click send the order? The extension never clicks for the trader (SPEC §7.5).

1. Chrome → `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick `spikes/tradingview-extension`.
2. Open a TradingView chart and connect **Paper Trading**. Turn on one-click trading and open the order panel.
3. Click the extension icon → Mode **2. Pick**. Click each control to guard: floating Buy, floating Sell, the order panel's Buy/Sell submit button, Reverse. Each one shows "Guarded: …".
4. Mode **3. Hold**. Place trades each way below. For each one: popup → wait → **Place anyway** → click Buy/Sell once more → answer "Did the order go through?".
   - Floating Buy and Sell
   - Order panel submit button
   - Enter key inside the order panel's quantity field
   - Reverse on an open position
   - Closing a position: this must **not** show the popup
5. Repeat step 4 on one real broker account in TradingView, with the smallest size.
6. Extension icon → **Copy log** → paste it to Claude.

If a control can't be picked ("No data-name"), use Mode **1. Log**, click it, and send the log.

## MT5 (Q3, Q4)

1. Install MT5 (FTMO's or any broker's) and log in to a demo or free-trial account.
2. Tell Claude. Claude copies `mt5/DG_Spike.mq5` into the terminal and compiles it. (Or: File → Open Data Folder → `MQL5/Experts`, paste it, open it in MetaEditor, press F7.) Turn on **Algo Trading** in the toolbar.
3. Drag **DG_Spike** onto a chart, then:
   - **Popup**: Buy or Sell on the panel → wait → Place anyway. Also try Skip, and clicking Place anyway early.
   - **Q3**: place one trade each from the panel, the chart's one-click buttons, the phone app and the web terminal.
   - **Q4**: set your MetaQuotes ID (Tools → Options → Notifications), then press **Push test**.
   - Ignore **Net tests**: Q7 and Q8 were dropped, because the EA makes no web requests (SPEC §9.5).
4. Tell Claude you're done. Claude reads `MQL5/Files/DG_spike_log.txt` directly.

## Q11: the Windows app sets up MT5

Runs on the isolated portable MT5 copy, so your own terminals are never touched:

1. `npm run dev -w server` (the local API).
2. `node clients/windows/src/dev.ts <email> dg-mt5-portable` (the Windows app's sign-in and bridge, with no browser).
3. `clients/mt5/tests/smoke.ps1 -Fresh` starts the portable MT5 with a start-up file that attaches the EA and asks for Algo Trading on, then takes a screenshot.

## Not covered here

| Spike | Status |
|---|---|
| Q2 (read TradingView positions and P/L) | Next spike, once Q1a passes |
| Q5 (prop firms allow a panel EA) | Checked from firms' public rules pages |
| Q6 (payment provider) | One email to the provider |
| Q9 (MT5 for Mac) | Deferred: Mac isn't supported, because the Windows app doesn't run there |
| Q10 (Ed25519 in the EA) | Done: `q10-ed25519/`. Attach `DG_Q10_Ed25519` to any chart to rerun it |

## Results

Gate decisions and the non-technical checks (name, TradingView terms, competitors, prop firms, payment) are in `../PHASE0.md`.

| Spike | Result | Date |
|---|---|---|
| Q1a hold on Paper Trading | | |
| Q1a hold on a real broker | | |
| MT5 popup flow (open, early click ignored, Place anyway after wait) | Pass. Order reached OrderSend; rejected only for no account | 26 Sep 2026 |
| Q3 DEAL_REASON labels | | |
| Q4 push on prop build | | |
| Q7, Q8 WebRequest | Dropped: the EA makes no web requests | 27 Sep 2026 |
| Q11 Windows app sets up MT5 | Partial. EA attached by the start-up file and connected through the bridge with no code typed. Algo Trading stayed off after the portable terminal logged in (details in PHASE0.md §1) | 27 Sep 2026 |
| Q10 Ed25519 verify in MQL5 | Pass. 8/8 checks against Node's Ed25519, 1.8 ms per 3 KB verification (build 6230) | 27 Sep 2026 |
| MT5 popup flow on a MetaQuotes demo | Pass again. Early click at 1.6 s ignored, Place anyway after 5 s reached `OrderSend` | 27 Sep 2026 |
