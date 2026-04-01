use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Create the overlay window (compact HUD)
pub fn create_overlay_window(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let _window = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("/overlay".into()))
        .title("ED Farpoint Overlay")
        .inner_size(350.0, 200.0)
        .always_on_top(true)
        .decorations(false)
        .transparent(true)
        .resizable(true)
        .skip_taskbar(true)
        .build()?;

    log::info!("Overlay window created");
    Ok(())
}

/// Close the overlay window
pub fn close_overlay_window(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.close()?;
        log::info!("Overlay window closed");
    }
    Ok(())
}

/// Check if the overlay window exists
pub fn is_overlay_open(app: &AppHandle) -> bool {
    app.get_webview_window("overlay").is_some()
}

/// Toggle the overlay window — open if closed, close if open
pub fn toggle_overlay(app: &AppHandle) -> Result<bool, Box<dyn std::error::Error>> {
    if is_overlay_open(app) {
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
