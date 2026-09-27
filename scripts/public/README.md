# DisciplineGuard: client source

DisciplineGuard shows a pause, in your own words, before a trade that breaks rules you set yourself. The choice stays yours.

This repository is the code that runs on your computer, published so anyone can check what it does:

| Folder | What it is |
|---|---|
| `clients/mt5` | The MetaTrader 5 EA: the trading panel and the pause |
| `clients/windows` | The Windows app: sign-in, finding MetaTrader, Protect, and the EA bridge. Its releases are built from this folder |
| `packages/core` | The rules engine: what counts as a rule break, and what the pause says |

What you can check here:

- **Closing a trade is never paused.** Only new entries are checked (`packages/core/src/classify.ts`).
- **We never open, change or close a trade unless you click to do it.** The EA only sends the order you placed from its panel (`clients/mt5/DG/AppPanel.mqh`, `AppPause.mqh`).
- **No order waits on the network.** The EA makes no web requests at all. It swaps files with the Windows app on a timer, never in a click (`clients/mt5/DG/Bridge.mqh`).
- **Your rules can't be loosened by editing a file.** Rules arrive signed with Ed25519 and are verified in the EA (`clients/mt5/DG/Ed25519.mqh`).
- **The EA you get is the EA published here.** The app copies an EA build only after checking it against a signed release manifest (`clients/windows/core/src/release.rs`).
- **The app never closes MetaTrader on its own.** It asks only after you press Restart MetaTrader (`clients/windows/core/src/process.rs`).
- **We never see your broker password.** Nothing here asks for it.

The server, billing and website are not in this repository.

This code is published for review. All rights reserved: it is not licensed for reuse or redistribution.
