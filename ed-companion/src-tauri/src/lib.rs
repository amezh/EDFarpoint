#![allow(non_snake_case, unused_imports, dead_code)]

mod bio;
mod config;
mod edsm;
#[cfg(not(target_os = "android"))]
mod journal;
mod remote;
mod stats;
#[cfg(not(target_os = "android"))]
mod status;
#[cfg(not(target_os = "android"))]
mod window;

use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::RwLock;
use serde_json::Value;
use tauri::{Emitter, Manager};

use bio::BioPredictor;
use config::AppConfig;
use edsm::EdsmClient;
use journal::expedition_history::ExpeditionHistory;
use remote::RemoteState;
use stats::{LifetimeStats, TripStats};

/// Shared application state accessible from Tauri commands
pub struct AppState {
    pub config: RwLock<AppConfig>,
    pub trip: RwLock<TripStats>,
    pub lifetime: RwLock<LifetimeStats>,
    pub bio_predictor: Option<BioPredictor>,
    pub edsm: EdsmClient,
    pub remote: Arc<RemoteState>,
    pub expedition_history: RwLock<ExpeditionHistory>,
    pub journal_dir: PathBuf,
}

#[tauri::command]
fn get_trip_stats(state: tauri::State<'_, Arc<AppState>>) -> Value {
    serde_json::to_value(&*state.trip.read()).unwrap_or(Value::Null)
}

#[tauri::command]
fn reset_trip_stats(state: tauri::State<'_, Arc<AppState>>) {
    state.trip.write().reset();
}

#[tauri::command]
fn get_lifetime_stats(state: tauri::State<'_, Arc<AppState>>) -> Value {
    serde_json::to_value(&*state.lifetime.read()).unwrap_or(Value::Null)
}

#[tauri::command]
fn get_config(state: tauri::State<'_, Arc<AppState>>) -> Value {
    serde_json::to_value(&*state.config.read()).unwrap_or(Value::Null)
}

#[tauri::command]
fn update_config(state: tauri::State<'_, Arc<AppState>>, config: AppConfig) {
    *state.config.write() = config.clone();
    // Persist to disk
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

#[tauri::command]
fn predict_bio(
    state: tauri::State<'_, Arc<AppState>>,
    body_name: String,
    body_id: u32,
    signal_count: u32,
    planet_class: String,
    atmosphere_type: String,
    gravity_g: f64,
    temperature_k: f64,
    volcanism: String,
    star_type: String,
    distance_ls: f64,
) -> Value {
    if let Some(ref predictor) = state.bio_predictor {
        let prediction = predictor.predict(
            &body_name,
            body_id,
            signal_count,
            &planet_class,
            &atmosphere_type,
            gravity_g,
            temperature_k,
            &volcanism,
            &star_type,
            distance_ls,
        );
        serde_json::to_value(&prediction).unwrap_or(Value::Null)
    } else {
        Value::Null
    }
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn toggle_always_on_top(app: tauri::AppHandle) -> Result<bool, String> {
    window::toggle_always_on_top(&app).map_err(|e| e.to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn create_overlay(app: tauri::AppHandle) -> Result<(), String> {
    window::create_overlay_window(&app).map_err(|e| e.to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn close_overlay(app: tauri::AppHandle) -> Result<(), String> {
    window::close_overlay_window(&app).map_err(|e| e.to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn toggle_overlay(app: tauri::AppHandle) -> Result<bool, String> {
    let result = window::toggle_overlay(&app).map_err(|e| e.to_string())?;
    // Emit event so other windows (Settings) can sync state
    let _ = app.emit("overlay-state", result);
    Ok(result)
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn is_overlay_open(app: tauri::AppHandle) -> bool {
    window::is_overlay_open(&app)
}

/// Return cached overlay view model so the overlay can hydrate on open
#[tauri::command]
fn get_overlay_state(state: tauri::State<'_, Arc<AppState>>) -> Value {
    serde_json::json!({
        "overlay": *state.remote.overlay_viewmodel.read(),
    })
}

/// Frontend pushes state updates to the remote WebSocket server
#[tauri::command]
fn push_remote_state(
    state: tauri::State<'_, Arc<AppState>>,
    key: String,
    value: Value,
) {
    match key.as_str() {
        "status" => *state.remote.current_status.write() = value.clone(),
        "system" => *state.remote.current_system.write() = value.clone(),
        "route" => *state.remote.current_route.write() = value.clone(),
        "bio" => *state.remote.current_bio.write() = value.clone(),
        "expedition" => *state.remote.current_expedition.write() = value.clone(),
        "overlay" => *state.remote.overlay_viewmodel.write() = value.clone(),
        "trip" => {
            if let Ok(trip) = serde_json::from_value::<TripStats>(value.clone()) {
                *state.remote.trip_stats.write() = trip;
            }
        }
        _ => {}
    }
    // Broadcast the update to all WebSocket clients
    state.remote.broadcast(&key, &value);
}

#[tauri::command]
async fn fetch_edsm_system(
    state: tauri::State<'_, Arc<AppState>>,
    system_name: String,
) -> Result<Value, String> {
    let info = state.edsm.get_system(&system_name).await;
    Ok(serde_json::to_value(&info).unwrap_or(Value::Null))
}

#[tauri::command]
async fn fetch_edsm_bodies(
    state: tauri::State<'_, Arc<AppState>>,
    system_name: String,
) -> Result<Value, String> {
    let bodies = state.edsm.get_bodies(&system_name).await;
    Ok(serde_json::to_value(&bodies).unwrap_or(Value::Null))
}

#[tauri::command]
fn get_expedition_history(state: tauri::State<'_, Arc<AppState>>) -> Value {
    serde_json::to_value(&state.expedition_history.read().records).unwrap_or(Value::Null)
}

#[tauri::command]
fn save_expedition_record(
    state: tauri::State<'_, Arc<AppState>>,
    record: Value,
) -> Result<(), String> {
    let record: journal::expedition_history::ExpeditionRecord =
        serde_json::from_value(record).map_err(|e| e.to_string())?;
    let mut history = state.expedition_history.write();
    history.add_record(record);
    history.save(&state.journal_dir);
    Ok(())
}

/// Clear journal cache and restart the app (full re-read on next launch)
#[tauri::command]
fn clear_cache_and_restart(
    state: tauri::State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let journal_dir = &state.config.read().paths.journal_dir;
    let dir = if journal_dir.is_empty() {
        journal::JournalWatcher::default_journal_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
    } else {
        std::path::PathBuf::from(journal_dir)
    };
    // Delete cache file
    let cache_path = dir.join("journal_cache.json");
    let _ = std::fs::remove_file(&cache_path);
    log::info!("Journal cache cleared, restarting app");

    // Restart: use tauri's restart, falling back to exit
    app.restart();
}

/// Frontend calls this to save journal cache after processing
#[tauri::command]
fn save_journal_cache(
    state: tauri::State<'_, Arc<AppState>>,
    cache: Value,
) -> Result<(), String> {
    let cache: journal::cache::JournalCache =
        serde_json::from_value(cache).map_err(|e| e.to_string())?;
    let journal_dir = &state.config.read().paths.journal_dir;
    let dir = if journal_dir.is_empty() {
        journal::JournalWatcher::default_journal_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
    } else {
        std::path::PathBuf::from(journal_dir)
    };
    cache.save(&dir);
    Ok(())
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Frontend calls this once on mount to get structured historical data
#[tauri::command]
fn get_journal_history() -> Value {
    #[cfg(not(target_os = "android"))]
    {
        match journal::watcher::take_historical_data() {
            Some(data) => {
                let cached = &data.cached;
                let cached_lifetime = cached.as_ref().map(|c| &c.lifetime);
                let cached_trip = cached.as_ref().and_then(|c| c.trip.as_ref());
                let cached_commander = cached.as_ref().and_then(|c| c.commander.as_deref());
                let cached_ship_name = cached.as_ref().and_then(|c| c.ship_name.as_deref());
                let cached_system_state = cached.as_ref().and_then(|c| c.system_state.as_ref());
                let cached_expedition = cached.as_ref().and_then(|c| c.expedition.as_ref());
                let cached_bio = cached.as_ref().and_then(|c| c.bio.as_ref());
                serde_json::json!({
                    "allEvents": data.all_events,
                    "tripStartIdx": data.trip_start_idx,
                    "lastDockTimestamp": data.last_dock_timestamp,
                    "lastDockStation": data.last_dock_station,
                    "cachedLifetime": cached_lifetime,
                    "cachedTrip": cached_trip,
                    "cachedCommander": cached_commander,
                    "cachedShipName": cached_ship_name,
                    "cachedSystemState": cached_system_state,
                    "cachedExpedition": cached_expedition,
                    "cachedBio": cached_bio,
                    "latestFileName": data.latest_file_name,
                    "latestFileOffset": data.latest_file_offset,
                    "recent24hEvents": data.recent_24h_events,
                    "dockBoundaries": data.dock_boundaries.iter().map(|d| {
                        serde_json::json!({
                            "eventIdx": d.event_idx,
                            "timestamp": d.timestamp,
                            "station": d.station,
                            "system": d.system,
                        })
                    }).collect::<Vec<_>>(),
                })
            }
            None => Value::Null,
        }
    }
    #[cfg(target_os = "android")]
    { Value::Null }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load config from disk, falling back to defaults
    let config = dirs::config_dir()
        .map(|d| d.join("ed-farpoint").join("config.json"))
        .and_then(|p| std::fs::read_to_string(&p).ok())
        .and_then(|s| serde_json::from_str::<AppConfig>(&s).ok())
        .unwrap_or_default();

    // Determine journal directory (desktop only)
    #[cfg(not(target_os = "android"))]
    let journal_dir = if config.paths.journal_dir.is_empty() {
        journal::watcher::JournalWatcher::default_journal_dir().unwrap_or_else(|| PathBuf::from("."))
    } else {
        PathBuf::from(&config.paths.journal_dir)
    };

    #[cfg(not(target_os = "android"))]
    log::info!("Journal directory: {}", journal_dir.display());

    // Determine data directory (where bio rules data lives)
    // Dev: assets/ next to Cargo.toml. Release: assets/ next to exe (bundled via tauri.conf.json resources).
    let data_dir = {
        let dev_assets = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets");
        if dev_assets.exists() {
            dev_assets
        } else if let Some(exe_assets) = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.join("assets")))
            .filter(|p| p.exists())
        {
            exe_assets
        } else {
            // Last resort: try data/ next to exe, or cwd
            std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.join("data")))
                .filter(|p| p.exists())
                .unwrap_or_else(|| PathBuf::from("assets"))
        }
    };
    log::info!("Data directory: {}", data_dir.display());

    // Load bio predictor
    let bio_predictor = match BioPredictor::load(&data_dir) {
        Ok(p) => {
            log::info!("Bio predictor loaded from {}", data_dir.display());
            Some(p)
        }
        Err(e) => {
            log::warn!("Failed to load bio predictor: {}", e);
            None
        }
    };

    // Create EDSM client
    let edsm_key = if config.edsm.api_key.is_empty() {
        None
    } else {
        Some(config.edsm.api_key.clone())
    };
    let edsm = EdsmClient::new(edsm_key);

    // Create remote state
    let (remote_state, _remote_rx) = RemoteState::new();

    // Load expedition history
    #[cfg(not(target_os = "android"))]
    let expedition_history = ExpeditionHistory::load(&journal_dir).unwrap_or_else(ExpeditionHistory::new);
    #[cfg(target_os = "android")]
    let expedition_history = ExpeditionHistory::new();

    let remote_enabled = config.remote.enabled;
    let remote_port = config.remote.port;
    let overlay_enabled = config.window.overlay_enabled;

    let app_state = Arc::new(AppState {
        config: RwLock::new(config),
        trip: RwLock::new(TripStats::new()),
        lifetime: RwLock::new(LifetimeStats::default()),
        bio_predictor,
        edsm,
        remote: remote_state.clone(),
        expedition_history: RwLock::new(expedition_history),
        #[cfg(not(target_os = "android"))]
        journal_dir: journal_dir.clone(),
        #[cfg(target_os = "android")]
        journal_dir: PathBuf::from("."),
    });

    #[cfg(not(target_os = "android"))]
    let journal_dir_clone = journal_dir.clone();
    let state_for_setup = app_state.clone();
    let remote_for_setup = remote_state.clone();
    let _remote_enabled = remote_enabled;
    let _remote_port = remote_port;

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(app_state)
        .invoke_handler({
            #[cfg(not(target_os = "android"))]
            {
                tauri::generate_handler![
                    get_trip_stats,
                    reset_trip_stats,
                    get_lifetime_stats,
                    get_config,
                    update_config,
                    predict_bio,
                    toggle_always_on_top,
                    create_overlay,
                    close_overlay,
                    toggle_overlay,
                    is_overlay_open,
                    get_overlay_state,
                    fetch_edsm_system,
                    fetch_edsm_bodies,
                    push_remote_state,
                    get_journal_history,
                    save_journal_cache,
                    get_app_version,
                    clear_cache_and_restart,
                    get_expedition_history,
                    save_expedition_record,
                ]
            }
            #[cfg(target_os = "android")]
            {
                tauri::generate_handler![
                    get_trip_stats,
                    reset_trip_stats,
                    get_lifetime_stats,
                    get_config,
                    update_config,
                    predict_bio,
                    fetch_edsm_system,
                    fetch_edsm_bodies,
                    push_remote_state,
                    get_journal_history,
                    save_journal_cache,
                    get_app_version,
                    clear_cache_and_restart,
                    get_expedition_history,
                    save_expedition_record,
                ]
            }
        })
        .on_window_event(|window, event| {
            // Exit process when main window is closed
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" {
                    std::process::exit(0);
                }
            }
        })
        .setup(move |app| {
            let app_handle = app.handle().clone();

            #[cfg(not(target_os = "android"))]
            {
                // Start journal watcher
                let watcher = journal::watcher::JournalWatcher::new(journal_dir_clone.clone());
                let app_for_journal = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    watcher.start(app_for_journal).await;
                });

                // Start status poller
                let poller = status::StatusPoller::new(journal_dir_clone);
                let app_for_status = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    poller.start(app_for_status).await;
                });
            }

            // Start remote server if enabled
            if _remote_enabled {
                let remote = remote_for_setup;
                let port = _remote_port;
                tauri::async_runtime::spawn(async move {
                    remote::start_server(remote, port).await;
                });
            }

            // Emit initial state to frontend
            let _ = app_handle.emit("trip-stats", serde_json::to_value(&*state_for_setup.trip.read()).unwrap_or(Value::Null));
            let _ = app_handle.emit("lifetime-stats", serde_json::to_value(&*state_for_setup.lifetime.read()).unwrap_or(Value::Null));

            // Auto-open overlay if it was enabled when the app last closed
            #[cfg(not(target_os = "android"))]
            if overlay_enabled {
                log::info!("[setup] Restoring overlay window (was enabled)");
                if let Err(e) = window::create_overlay_window(&app_handle) {
                    log::warn!("[setup] Failed to restore overlay: {}", e);
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
