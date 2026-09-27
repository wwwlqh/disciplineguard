//! DisciplineGuard for Windows (SPEC §9.5, EXPERIENCE §7.1): a tray app with a small first-run window.
//! It signs in with Allow, protects MT5 terminals, serves the EA's file bridge and keeps itself and the EA updated.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod core;

use crate::core::{Core, Paths, Status};
use std::sync::Arc;
use std::time::Duration;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

const WEB: &str = "https://disciplineguard.com";
const TRAY: &[u8] = include_bytes!("../icons/tray.png");

/// The server and web app. A debug build can point at a local server (`DG_API=http://127.0.0.1:8787`).
fn urls() -> (String, String) {
    #[cfg(debug_assertions)]
    if let Ok(api) = std::env::var("DG_API") {
        let web = std::env::var("DG_WEB").unwrap_or_else(|_| api.clone());
        return (api, web);
    }
    (WEB.into(), WEB.into())
}

type Shared = Arc<Core>;

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> T {
    tauri::async_runtime::spawn_blocking(f).await.expect("worker thread")
}

#[tauri::command]
async fn view(core: State<'_, Shared>) -> Result<core::View, ()> {
    let c = core.inner().clone();
    Ok(blocking(move || c.view()).await)
}

#[tauri::command]
async fn sign_in(app: AppHandle, core: State<'_, Shared>) -> Result<(), String> {
    let c = core.inner().clone();
    blocking(move || {
        let open = |url: &str| {
            let _ = app.opener().open_url(url, None::<&str>);
        };
        c.sign_in(&open).map_err(|e| {
            match e {
                dg_core::signin::SignInError::Timeout => "Nobody pressed Allow in time. Try again.",
                dg_core::signin::SignInError::Refused => "That sign-in didn't work. Try again.",
                dg_core::signin::SignInError::Offline => "Can't reach DisciplineGuard. Check your internet and try again.",
                dg_core::signin::SignInError::SwitchNeedsInternet => {
                    "Signing in as someone else needs the internet first, so the old account's protection can be turned off properly."
                }
            }
            .to_string()
        })
    })
    .await
}

#[tauri::command]
async fn protect(core: State<'_, Shared>, ticked: Vec<String>, baseline: bool) -> Result<(), String> {
    let c = core.inner().clone();
    blocking(move || c.protect(&ticked, baseline)).await
}

/// Only ever called from the "Restart MetaTrader" button.
#[tauri::command]
async fn restart(core: State<'_, Shared>) -> Result<Vec<String>, ()> {
    let c = core.inner().clone();
    Ok(blocking(move || c.restart()).await)
}

#[tauri::command]
async fn browse(app: AppHandle, core: State<'_, Shared>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let c = core.inner().clone();
    blocking(move || {
        let Some(folder) = app.dialog().file().set_title("Pick your MetaTrader 5 folder").blocking_pick_folder() else {
            return Ok(None);
        };
        let path = folder.into_path().map_err(|e| e.to_string())?;
        c.add_browsed(&path).map(Some).ok_or_else(|| "That folder doesn't hold an MT5 terminal. Pick the folder with terminal64.exe.".to_string())
    })
    .await
}

/// Opens a page of the web app, e.g. "today?practice" or "devices".
#[tauri::command]
fn open_web(app: AppHandle, core: State<'_, Shared>, page: String) {
    let _ = app.opener().open_url(format!("{}/{page}", core.web), None::<&str>);
}

#[tauri::command]
fn hide(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

fn show(app: &AppHandle, screen: &str) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.emit("screen", screen);
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// The tray icon: the mark with a status dot (EXPERIENCE §8). Red is never a status color.
fn tray_icon(status: Option<Status>) -> Image<'static> {
    let img = Image::from_bytes(TRAY).expect("tray icon");
    let (w, h) = (img.width() as i32, img.height() as i32);
    let mut rgba = img.rgba().to_vec();
    let color = match status {
        Some(Status::On) => [0x2d, 0xd4, 0xbf],
        Some(Status::SettingUp) | None => [0x25, 0x63, 0xeb],
        Some(Status::NeedsAttention) => [0xf5, 0x9e, 0x0b],
        Some(Status::Off) | Some(Status::NotRunning) => [0x9c, 0xa3, 0xaf],
    };
    let (cx, cy, r) = (w - 8, h - 8, 7);
    for y in 0..h {
        for x in 0..w {
            let d2 = (x - cx).pow(2) + (y - cy).pow(2);
            let px = ((y * w + x) * 4) as usize;
            if d2 <= r * r {
                let c = if d2 > (r - 2) * (r - 2) { [255, 255, 255] } else { color };
                rgba[px..px + 4].copy_from_slice(&[c[0], c[1], c[2], 255]);
            }
        }
    }
    Image::new_owned(rgba, w as u32, h as u32)
}

/// The tray menu as (id, text, enabled) rows; None is a separator.
type TrayRows = Vec<Option<(String, String, bool)>>;

fn tray_rows(core: &Core) -> (TrayRows, Option<Status>) {
    let v = core.view();
    let protected: Vec<_> = v.rows.iter().filter(|r| r.protected).collect();
    let worst = if v.signed_in { protected.iter().map(|r| r.status).max() } else { Some(Status::Off) };
    let mut rows: TrayRows = Vec::new();
    let mut add = |id: &str, text: String, enabled: bool| rows.push(Some((id.to_string(), text, enabled)));
    if !v.signed_in {
        add("signin", "Signed out · Sign in".into(), true);
    }
    for r in &protected {
        add(&format!("t:{}", r.id), format!("{} · {}", r.name, r.reason), false);
    }
    if v.signed_in && protected.is_empty() {
        add("protect", "Tick your MetaTrader to protect it".into(), true);
    }
    if !protected.is_empty() {
        for r in v.rows.iter().filter(|r| !r.protected && !r.dismissed) {
            add("protect", format!("New MetaTrader found: {}. Protect it", r.name), true);
        }
    }
    if protected.iter().any(|r| r.restart_needed) {
        add("restart", "Finish setup: restart MetaTrader…".into(), true);
    }
    rows.push(None);
    for (id, text) in [
        ("dashboard", "Open dashboard"),
        ("practice", "Practice pause"),
        ("protect", "Protect another MetaTrader"),
        ("help", "Help"),
        ("report", "Report a problem"),
    ] {
        rows.push(Some((id.into(), text.into(), true)));
    }
    (rows, worst)
}

/// Rebuilds the tray only when something changed, so an open menu isn't closed under the trader.
fn refresh_tray(app: &AppHandle, tray: &TrayIcon, core: &Core, last: &mut Option<(TrayRows, Option<Status>)>) -> tauri::Result<()> {
    let now = tray_rows(core);
    if last.as_ref() == Some(&now) {
        return Ok(());
    }
    let (rows, worst) = &now;
    let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = Vec::new();
    for row in rows {
        match row {
            Some((id, text, enabled)) => items.push(Box::new(MenuItem::with_id(app, id, text, *enabled, None::<&str>)?)),
            None => items.push(Box::new(PredefinedMenuItem::separator(app)?)),
        }
    }
    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = items.iter().map(|b| b.as_ref()).collect();
    tray.set_menu(Some(Menu::with_items(app, &refs)?))?;
    tray.set_icon(Some(tray_icon(*worst)))?;
    tray.set_tooltip(Some(match worst {
        Some(Status::On) => "DisciplineGuard · On",
        Some(Status::NeedsAttention) => "DisciplineGuard · Needs attention",
        Some(Status::NotRunning) => "DisciplineGuard · MetaTrader is closed",
        Some(Status::Off) => "DisciplineGuard · Signed out",
        _ => "DisciplineGuard · Setting up",
    }))?;
    *last = Some(now);
    Ok(())
}

fn on_menu(app: &AppHandle, id: &str) {
    let core = app.state::<Shared>().inner().clone();
    let page = match id {
        "dashboard" => "today",
        "practice" => "today?practice",
        // Devices carries the setup help until the help articles ship.
        "help" => "devices",
        "report" => "account#report",
        "signin" => return show(app, "signin"),
        "protect" => return show(app, "found"),
        "restart" => return show(app, "restart"),
        _ => return,
    };
    let _ = app.opener().open_url(format!("{}/{page}", core.web), None::<&str>);
}

/// Checks the signed update manifest now and every 6 hours; an update installs quietly and the app restarts.
async fn updates(app: AppHandle) {
    loop {
        if let Ok(u) = app.updater() {
            if let Ok(Some(update)) = u.check().await {
                if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
                    app.restart();
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(6 * 3600)).await;
    }
}

fn main() {
    let (api, web) = urls();
    let core: Shared = Arc::new(Core::new(Paths::from_env(), &api, &web));

    // Run by the uninstaller (installer hooks): exit code 0 when protection-off was acknowledged.
    if std::env::args().any(|a| a == "--uninstall") {
        std::process::exit(if core.uninstall() { 0 } else { 2 });
    }
    let autostarted = std::env::args().any(|a| a == "--autostart");

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show(app, "")))
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--autostart"])))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(core.clone())
        .invoke_handler(tauri::generate_handler![view, sign_in, protect, restart, browse, open_web, hide])
        .setup(move |app| {
            use tauri_plugin_autostart::ManagerExt;
            // Starts with Windows (SPEC §9.5).
            let _ = app.autolaunch().enable();
            let handle = app.handle().clone();
            let tray = TrayIconBuilder::with_id("main")
                .icon(tray_icon(None))
                .tooltip("DisciplineGuard")
                .show_menu_on_left_click(true)
                .on_menu_event(|app, e| on_menu(app, e.id().as_ref()))
                .build(app)?;

            // The bridge every second; setup upkeep and the tray every 5 seconds.
            let c = core.clone();
            std::thread::spawn(move || loop {
                c.bridge.tick(&c.state, &|s| c.save(s));
                std::thread::sleep(Duration::from_secs(1));
            });
            let c = core.clone();
            let h = handle.clone();
            std::thread::spawn(move || {
                let mut last = None;
                loop {
                    c.maintain();
                    let _ = refresh_tray(&h, &tray, &c, &mut last);
                    std::thread::sleep(Duration::from_secs(5));
                }
            });
            tauri::async_runtime::spawn(updates(handle.clone()));

            let first_run = {
                let s = core.state.lock().unwrap();
                !s.signed_in() || s.protected.is_empty()
            };
            if first_run || !autostarted {
                show(&handle, "");
            }
            Ok(())
        })
        .on_window_event(|w, e| {
            // Closing the window keeps the app in the tray.
            if let WindowEvent::CloseRequested { api, .. } = e {
                api.prevent_close();
                let _ = w.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("DisciplineGuard failed to start");
}
