# DisciplineGuard for Windows

The tray app that sets up MetaTrader 5 for the trader (SPEC §9.5, EXPERIENCE §7.1). The trader signs in with **Allow** in the browser, ticks their MetaTrader and presses **Protect**. Nothing is typed or clicked inside MetaTrader.

| Folder | What it is |
|---|---|
| `core` | Everything but the window: sign-in, finding terminals, Protect (MT's own files), the EA file bridge, the signed EA manifest, DPAPI storage. Builds and tests on any OS. |
| `app` | The Tauri 2 shell: tray, first-run window (`ui/`), updater, installer (NSIS). Builds on Windows only. |

**Why Tauri.** A ~5 MB installer, low memory (Rust in the background, the system WebView2 only while the window is open), a signed updater built in, and NSIS installers that code-sign in CI.

## Tests

```
npm test --workspace clients/windows       # starts server/dev.ts on an empty database, runs the Rust tests against it
npm run typecheck --workspace clients/windows
```

The `Windows app` GitHub workflow runs both on Windows and builds the app.

## Running it against a local server

On Windows, with the server running (`node server/dev.ts`):

```
set DG_API=http://127.0.0.1:8787
set DG_WEB=http://localhost:5173
cd clients\windows && cargo run -p disciplineguard
```

`DG_API` works in debug builds only. To Protect, a debug build also needs a signed EA in `app/ea/`: make a dev key with `node scripts/sign-ea-manifest.ts --new-key`, sign a compiled EA with it, and set `DG_RELEASE_PUB` before `cargo run`. A portable MT5 (`clients/mt5/tests/smoke.ps1`) keeps your own terminals untouched.

## How Protect works

1. The EA build is checked against the signed manifest, then copied to `MQL5\Experts\DisciplineGuard\`.
2. `MQL5\Profiles\Templates\default.tpl` gets the EA, so every new chart has the panel.
3. With MetaTrader closed, the last-used profile's first free chart gets the EA and `config\common.ini` turns on Algo Trading. If MetaTrader is open, the app asks: "Restart MetaTrader" or "Next time I open it". It never closes MetaTrader without that click, and a chart running another EA is left alone.
4. The EA's first sync reaches the app through the bridge, and the app registers the terminal (`POST /v1/desktop/terminals`).

## Releasing

1. Bump `version` in `clients/windows/Cargo.toml`.
2. Run the `Windows app` workflow with **release** ticked. It compiles the EA with MetaEditor on the runner (`clients/mt5/compile.ps1`), signs the EA manifest, builds and code-signs the installer, and publishes `DisciplineGuard-Setup.exe` and `latest.json` to the releases of `wwwlqh/disciplineguard-clients`. `disciplineguard.com/downloads/…` redirects there (`web/public/_redirects`), so the web app's download button and the updater always get the latest release. Installed apps update themselves within 6 hours.

Repository secrets for the release:

| Secret | What |
|---|---|
| `DG_RELEASE_KEY`, `DG_RELEASE_PUB` | EA release key pair, from `node scripts/sign-ea-manifest.ts --new-key` |
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `TAURI_UPDATER_PUBKEY` | Updater key pair, from `npx @tauri-apps/cli signer generate` |
| `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `AZURE_SIGNING_ENDPOINT`, `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE` | Code signing with Azure Trusted Signing, so Windows shows no warning |
| `PUBLIC_REPO_TOKEN` | A fine-grained token with Contents write on `wwwlqh/disciplineguard-clients` |

Keep the private keys offline as well: losing the updater key means installed apps can't update.
