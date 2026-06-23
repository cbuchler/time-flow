use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub fn install_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &settings, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(tray_icon())
        .icon_as_template(true)
        .tooltip("Time & Flow")
        .menu(&menu)
        // Left-click toggles the popover; the menu (Settings…/Quit) is shown on
        // right-click only — standard macOS menubar behaviour.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => toggle_popover(app),
            "settings" => {
                let _ = crate::menu::open_settings(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_popover(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

/// Work out what the menu-bar title should read, given current app state:
/// - a running (un-paused) session → its elapsed time, e.g. `1:23:45` — never
///   the task name, just the clock;
/// - otherwise, once the machine has been idle past the configured threshold →
///   the idle time, prefixed `Idle`, e.g. `Idle 6:12`;
/// - otherwise `None` — show the icon alone.
///
/// Pure read of shared state (locks `conn`/`config` briefly); does no UI work,
/// so it is safe to call from the background timer thread.
pub fn compute_title(state: &crate::app::AppState) -> Option<String> {
    let running_elapsed = {
        let conn = state.conn.lock();
        crate::session::active_session(&conn)
            .ok()
            .flatten()
            .filter(|s| s.paused_at.is_none())
            .map(|s| s.elapsed_seconds)
    };

    if let Some(elapsed) = running_elapsed {
        return Some(format_clock(elapsed));
    }

    let threshold_secs = state.config.lock().general.idle_threshold_minutes as f64 * 60.0;
    let idle = crate::idle::system_idle_seconds();
    if threshold_secs > 0.0 && idle >= threshold_secs {
        Some(format!("Idle {}", format_clock(idle as i64)))
    } else {
        None
    }
}

/// Apply a menu-bar title. NSStatusItem updates must happen on the main thread,
/// so the actual mutation is marshalled there — calling this from the timer
/// thread directly would be the same class of bug as the folder-picker crash.
pub fn update_title(app: &AppHandle, title: Option<String>) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(tray) = handle.tray_by_id("main") {
            let _ = tray.set_title(title);
        }
    });
}

fn format_clock(total_seconds: i64) -> String {
    let s = total_seconds.max(0);
    let (h, m, sec) = (s / 3600, (s % 3600) / 60, s % 60);
    if h > 0 {
        format!("{h}:{m:02}:{sec:02}")
    } else {
        format!("{m}:{sec:02}")
    }
}

fn tray_icon() -> Image<'static> {
    const SIZE: u32 = 32;
    let mut rgba = vec![0; (SIZE * SIZE * 4) as usize];
    let center = (SIZE as f32 - 1.0) / 2.0;

    for y in 0..SIZE {
        for x in 0..SIZE {
            let dx = x as f32 - center;
            let dy = y as f32 - center;
            let distance = (dx * dx + dy * dy).sqrt();
            let ring = (10.0..=12.0).contains(&distance);
            let top_stem = x >= 15 && x <= 17 && y >= 3 && y <= 8;
            let hand_vertical = x >= 15 && x <= 17 && y >= 10 && y <= 17;
            let hand_diagonal =
                (x as i32 - y as i32).abs() <= 1 && x >= 16 && x <= 23 && y >= 16 && y <= 23;

            if ring || top_stem || hand_vertical || hand_diagonal {
                let index = ((y * SIZE + x) * 4) as usize;
                rgba[index] = 0;
                rgba[index + 1] = 0;
                rgba[index + 2] = 0;
                rgba[index + 3] = 255;
            }
        }
    }

    Image::new_owned(rgba, SIZE, SIZE)
}

fn toggle_popover(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            // If the popover was auto-hidden by the blur this very click caused,
            // the user's intent was to dismiss it — don't bounce it back open.
            if let Some(state) = app.try_state::<std::sync::Arc<crate::app::AppState>>() {
                let mut last = state.last_popover_hide.lock();
                if last
                    .map(|t| t.elapsed() < std::time::Duration::from_millis(250))
                    .unwrap_or(false)
                {
                    *last = None;
                    return;
                }
            }
            position_under_tray(app, &window);
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn position_under_tray(app: &AppHandle, window: &tauri::WebviewWindow) {
    let Some(tray) = app.tray_by_id("main") else {
        return;
    };
    let Ok(Some(rect)) = tray.rect() else {
        return;
    };
    // Normalise everything to logical pixels using the window's scale factor
    let scale = window.scale_factor().unwrap_or(1.0);
    let tray_x = match &rect.position {
        tauri::Position::Physical(p) => p.x as f64 / scale,
        tauri::Position::Logical(p) => p.x,
    };
    let tray_y = match &rect.position {
        tauri::Position::Physical(p) => p.y as f64 / scale,
        tauri::Position::Logical(p) => p.y,
    };
    let tray_w = match &rect.size {
        tauri::Size::Physical(s) => s.width as f64 / scale,
        tauri::Size::Logical(s) => s.width,
    };
    let tray_h = match &rect.size {
        tauri::Size::Physical(s) => s.height as f64 / scale,
        tauri::Size::Logical(s) => s.height,
    };
    let win_w = window.outer_size().map(|s| s.width as f64 / scale).unwrap_or(360.0);
    let x = (tray_x + tray_w / 2.0 - win_w / 2.0).max(0.0);
    let y = tray_y + tray_h;
    let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
}
