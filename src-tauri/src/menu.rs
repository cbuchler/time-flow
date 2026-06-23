//! Application menu and the separate Settings window.
//!
//! Time & Flow runs as a menubar (Accessory) app with no Dock icon. Settings,
//! however, must be its own standard macOS window opened from the app menu
//! (⌘,), the tray menu, or the popover gear — never embedded in the popover.
//! While the Settings window is open we switch the activation policy to Regular
//! so the window gets focus, a Dock icon, and a working menu bar; when it closes
//! we revert to Accessory.

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    window::{Effect, EffectState, EffectsBuilder},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

pub const SETTINGS_LABEL: &str = "settings";

/// Build the global app menu. On macOS the menu bar only becomes visible while
/// the app is a Regular activation policy (i.e. while Settings is open), but the
/// menu must exist so ⌘, and the standard Edit shortcuts work in that window.
pub fn build_app_menu(app: &AppHandle) -> tauri::Result<()> {
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;

    let app_submenu = Submenu::with_items(
        app,
        "Time & Flow",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    // Edit menu so cut/copy/paste/select-all keyboard shortcuts work inside the
    // Settings text fields (HIG: full keyboard access).
    let edit_submenu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let menu = Menu::with_items(app, &[&app_submenu, &edit_submenu])?;
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        if event.id.as_ref() == "settings" {
            let _ = open_settings(app);
        }
    });
    Ok(())
}

/// Open (or focus) the Settings window. Safe to call from any thread — window
/// creation is dispatched to the main thread, which AppKit requires.
pub fn open_settings(app: &AppHandle) -> tauri::Result<()> {
    let handle = app.clone();
    app.run_on_main_thread(move || {
        if let Err(err) = open_settings_on_main(&handle) {
            eprintln!("failed to open settings window: {err}");
        }
    })
}

fn open_settings_on_main(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);

    // macOS Tahoe / Liquid Glass: a translucent NSVisualEffectView sidebar
    // material behind the webview. The webview paints a transparent sidebar so
    // the glass shows, and an opaque content pane so the settings body stays
    // readable (matching System Settings).
    let window = WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("index.html".into()))
        .title("Settings")
        .inner_size(820.0, 620.0)
        .min_inner_size(720.0, 520.0)
        .resizable(true)
        .transparent(true)
        .effects(EffectsBuilder::new().effect(Effect::Sidebar).state(EffectState::Active).build())
        .focused(true)
        .build()?;

    let handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            revert_activation_policy(&handle);
        }
    });
    Ok(())
}

/// Once the Settings window is gone, return to the menubar-only (Accessory)
/// activation policy so the Dock icon disappears again.
#[cfg(target_os = "macos")]
fn revert_activation_policy(app: &AppHandle) {
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
}

#[cfg(not(target_os = "macos"))]
fn revert_activation_policy(_app: &AppHandle) {}
