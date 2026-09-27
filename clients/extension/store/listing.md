# Chrome Web Store listing

Phase 1 is **Unlisted**. Phase 2 makes the same item public (SPEC §9.1). Edge Add-ons takes the same zip and text.

## Upload

1. `npm run build --workspace clients/extension`, then zip the contents of `clients/extension/dist` (the zip's root holds `manifest.json`):
   `Compress-Archive -Path clients\extension\dist\* -DestinationPath disciplineguard-extension.zip -Force`
2. [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) → New item → upload the zip.
3. Fill in the fields below, add `1-pause.png` and `2-pill.png` (1280×800), and pick **Unlisted**.

## Store listing

**Name**: DisciplineGuard

**Summary** (132 characters max):
Pauses TradingView trades that break your own rules: too many trades, a daily loss limit, a cooldown. Closing is never paused.

**Description**:

DisciplineGuard holds a new TradingView order that breaks one of your rules and shows a short pause first.

- Max trades a day, daily loss limit, cooldown after a loss, trading hours, max size.
- Skip the trade, or place it anyway after the wait. Your call, every time.
- Closing, reducing, moving SL/TP and cancelling are never paused.
- Works on TradingView's order panel with your broker or Paper Trading.
- The same rules protect MetaTrader 5 through DisciplineGuard for Windows.

Set your rules at disciplineguard.com. Then click Sign in in the extension and press Allow. Nothing to type.

**Category**: Productivity (Tools)

**Language**: English

## Privacy practices

**Single purpose**: Pause new TradingView orders that break rules the trader set for themselves.

**Permission justifications**:

| Permission | Why |
|---|---|
| `storage` | Keeps the trader's signed rules and the pill position, so a pause never waits for the network. |
| `alarms` | Syncs rules and trades every minute. |
| `notifications` | Shows the trader's own alerts, such as daily loss limit reached. |
| Host `tradingview.com` | Reads the order panel and Account Manager on chart pages to pause orders that break the trader's rules. |
| Host `disciplineguard.com` | Signs in and syncs rules and trades with the trader's account. |

**Remote code**: No. All code is in the package. The page config it downloads is signed data (selectors only), not code.

**Data usage**, check:
- Personally identifiable information (email address, for sign-in).
- Financial and payment information (the trader's own trades: time, symbol, side, size, close net).

Certify all three: not sold to third parties, not used for unrelated purposes, not used for creditworthiness or lending.

**Privacy policy URL**: https://disciplineguard.com/help/data
