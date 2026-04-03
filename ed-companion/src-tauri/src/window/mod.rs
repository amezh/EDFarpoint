use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri::window::Color;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use crate::AppState;

/// Helper: persist current config to disk
fn save_config(app: &AppHandle) {
    if let Some(state) = app.try_state::<Arc<AppState>>() {
        let config = state.config.read().clone();
        if let Some(config_dir) = dirs::config_dir() {
            let path = config_dir.join("ed-farpoint").join("config.json");
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if let Ok(json) = serde_json::to_string_pretty(&config) {
                let _ = std::fs::write(&path, json);
            }
        }
    }
}

/// Update overlay_enabled in config and persist
fn set_overlay_enabled(app: &AppHandle, enabled: bool) {
    if let Some(state) = app.try_state::<Arc<AppState>>() {
        state.config.write().window.overlay_enabled = enabled;
        save_config(app);
    }
}

/// Create the overlay window (compact HUD)
pub fn create_overlay_window(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    log::info!("[overlay] create_overlay_window called");

    // Check if already open
    if let Some(existing) = app.get_webview_window("overlay") {
        log::info!("[overlay] window already exists, focusing");
        let _ = existing.set_focus();
        return Ok(());
    }

    // Read saved geometry from config
    let (width, height, pos_x, pos_y) = {
        if let Some(state) = app.try_state::<Arc<AppState>>() {
            let cfg = state.config.read();
            (cfg.window.overlay_width, cfg.window.overlay_height,
             cfg.window.overlay_x, cfg.window.overlay_y)
        } else {
            (350.0, 750.0, None, None)
        }
    };

    let url = WebviewUrl::App("index.html".into());

    let mut builder = WebviewWindowBuilder::new(app, "overlay", url)
        .title("ED Farpoint Overlay")
        .inner_size(width, height)
        .always_on_top(true)
        .decorations(false)
        .shadow(false)
        .resizable(true)
        .skip_taskbar(true)
        .transparent(true)
        .background_color(Color(0, 0, 0, 0));

    // Restore position if saved
    if let (Some(x), Some(y)) = (pos_x, pos_y) {
        builder = builder.position(x, y);
    }

    let window = builder.build().map_err(|e| {
        log::error!("[overlay] WebviewWindowBuilder::build FAILED: {}", e);
        e
    })?;

    log::info!("[overlay] window built OK, label={}", window.label());

    // Mark overlay as enabled
    set_overlay_enabled(app, true);

    // Track move/resize with 1s debounce to save geometry
    let app_handle = app.clone();
    let save_pending = Arc::new(AtomicBool::new(false));
    window.on_window_event(move |event| {
        match event {
            tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                // Debounce: only spawn timer if not already pending
                if !save_pending.swap(true, Ordering::SeqCst) {
                    let app2 = app_handle.clone();
                    let pending2 = save_pending.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_secs(1));
                        pending2.store(false, Ordering::SeqCst);
                        if let Some(win) = app2.get_webview_window("overlay") {
                            if let Some(state) = app2.try_state::<Arc<AppState>>() {
                                let mut cfg = state.config.write();
                                let scale = win.scale_factor().unwrap_or(1.0);
                                if let Ok(pos) = win.outer_position() {
                                    cfg.window.overlay_x = Some(pos.x as f64 / scale);
                                    cfg.window.overlay_y = Some(pos.y as f64 / scale);
                                }
                                if let Ok(size) = win.inner_size() {
                                    cfg.window.overlay_width = size.width as f64 / scale;
                                    cfg.window.overlay_height = size.height as f64 / scale;
                                }
                                drop(cfg);
                                save_config(&app2);
                                log::info!("[overlay] geometry saved");
                            }
                        }
                    });
                }
            }
            tauri::WindowEvent::Destroyed => {
                log::info!("[overlay] window destroyed");
                let _ = app_handle.emit("overlay-state", false);
            }
            _ => {}
        }
    });

    Ok(())
}

/// Close the overlay window
pub fn close_overlay_window(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    log::info!("[overlay] close_overlay_window called");
    if let Some(window) = app.get_webview_window("overlay") {
        log::info!("[overlay] found overlay window, calling destroy()");
        window.destroy()?;
        log::info!("[overlay] destroy() returned OK");
    } else {
        log::warn!("[overlay] close requested but no overlay window found");
    }
    set_overlay_enabled(app, false);
    Ok(())
}

/// Check if the overlay window exists
pub fn is_overlay_open(app: &AppHandle) -> bool {
    app.get_webview_window("overlay").is_some()
}

/// Toggle the overlay window — open if closed, close if open
pub fn toggle_overlay(app: &AppHandle) -> Result<bool, Box<dyn std::error::Error>> {
    let currently_open = is_overlay_open(app);
    log::info!("[overlay] toggle_overlay called, currently_open={}", currently_open);
    if currently_open {
        close_overlay_window(app)?;
        Ok(false)
    } else {
        create_overlay_window(app)?;
        Ok(true)
    }
}

/// Toggle the always-on-top state of the main window
pub fn toggle_always_on_top(app: &AppHandle) -> Result<bool, Box<dyn std::error::Error>> {
    if let Some(window) = app.get_webview_window("main") {
        let is_on_top = window.is_always_on_top()?;
        window.set_always_on_top(!is_on_top)?;
        Ok(!is_on_top)
    } else {
        Err("Main window not found".into())
    }
}
