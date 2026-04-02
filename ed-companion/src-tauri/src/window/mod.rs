use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri::window::Color;

/// Create the overlay window (compact HUD)
pub fn create_overlay_window(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    log::info!("[overlay] create_overlay_window called");

    // Check if already open
    if let Some(existing) = app.get_webview_window("overlay") {
        log::info!("[overlay] window already exists, focusing");
        let _ = existing.set_focus();
        return Ok(());
    }

    // Load the same index.html that works for the main window.
    // main.ts detects the window label "overlay" and mounts OverlayWidget instead of App.
    let url = WebviewUrl::App("index.html".into());
    log::info!("[overlay] using WebviewUrl::App(index.html) — JS will detect label");

    log::info!("[overlay] building window…");
    let window = WebviewWindowBuilder::new(app, "overlay", url)
        .title("ED Farpoint Overlay")
        .inner_size(350.0, 250.0)
        .always_on_top(true)
        .decorations(false)
        .resizable(true)
        .skip_taskbar(true)
        .transparent(true)
        .background_color(Color(0, 0, 0, 0))
        .build()
        .map_err(|e| {
            log::error!("[overlay] WebviewWindowBuilder::build FAILED: {}", e);
            e
        })?;

    log::info!("[overlay] window built OK, label={}", window.label());

    // Log window lifecycle events
    let app_handle = app.clone();
    window.on_window_event(move |event| {
        match event {
            tauri::WindowEvent::Focused(focused) => {
                log::info!("[overlay] window focused={}", focused);
            }
            tauri::WindowEvent::Destroyed => {
                log::info!("[overlay] window destroyed");
                let _ = app_handle.emit("overlay-state", false);
            }
            tauri::WindowEvent::CloseRequested { .. } => {
                log::info!("[overlay] window close requested");
            }
            _ => {}
        }
    });

    log::info!("[overlay] create_overlay_window done");
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
