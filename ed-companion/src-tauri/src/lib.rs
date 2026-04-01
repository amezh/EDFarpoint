#![allow(non_snake_case, unused_imports, dead_code)]

mod bio;
mod config;
mod edsm;
mod journal;
mod remote;
mod stats;
mod status;
mod window;

use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::RwLock;
use serde_json::Value;
use tauri::{Emitter, Manager};

use bio::BioPredictor;
use config::AppConfig;
use edsm::EdsmClient;
use journal::JournalWatcher;
use remote::RemoteState;
use stats::{LifetimeStats, TripStats};
use status::StatusPoller;

/// Shared application state accessible from Tauri commands
pub struct AppState {
    pub config: RwLock<AppConfig>,
    pub trip: RwLock<TripStats>,
    pub lifetime: RwLock<LifetimeStats>,
    pub bio_predictor: Option<BioPredictor>,
    pub edsm: EdsmClient,
    pub remote: Arc<RemoteState>,
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
    *state.config.write() = config;
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

#[tauri::command]
fn toggle_always_on_top(app: tauri::AppHandle) -> Result<bool, String> {
    window::toggle_always_on_top(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_overlay(app: tauri::AppHandle) -> Result<(), String> {
    window::create_overlay_window(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_overlay(app: tauri::AppHandle) -> Result<bool, String> {
    window::toggle_overlay(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn is_overlay_open(app: tauri::AppHandle) -> bool {
    window::is_overlay_open(&app)
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

/// Frontend calls this once on mount to get structured historical data
#[tauri::command]
fn get_journal_history() -> Value {
    // This blocks until watcher finishes reading (up to 30s timeout).
    // Tauri runs sync commands on a thread pool, so blocking is safe here.
    match journal::watcher::take_historical_data() {
        Some(data) => {
            serde_json::json!({
                "allEvents": data.all_events,
                "tripStartIdx": data.trip_start_idx,
                "lastDockTimestamp": data.last_dock_timestamp,
                "lastDockStation": data.last_dock_station,
            })
        }
        None => Value::Null,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = AppConfig::default();

    // Determine journal directory
    let journal_dir = if config.paths.journal_dir.is_empty() {
        JournalWatcher::default_journal_dir().unwrap_or_else(|| PathBuf::from("."))
    } else {
        PathBuf::from(&config.paths.journal_dir)
    };

    log::info!("Journal directory: {}", journal_dir.display());

    // Determine data directory (where Canonn bio data lives)
    // Look for: assets/ next to Cargo.toml, data/ next to exe, data/ in project root
    let data_dir = {
        // Dev: assets/ inside src-tauri
        let assets = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets");
        if assets.exists() {
            assets
        } else {
            std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.join("data")))
                .filter(|p| p.exists())
                .or_else(|| {
                    // Fallback: data/ in project root
                    let dev_data = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                        .parent()
                        .map(|p| p.parent().unwrap_or(p).join("data"));
                    dev_data.filter(|p| p.exists())
                })
                .unwrap_or_else(|| PathBuf::from("data"))
        }
    };

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

    let remote_enabled = config.remote.enabled;
    let remote_port = config.remote.port;

    let app_state = Arc::new(AppState {
        config: RwLock::new(config),
        trip: RwLock::new(TripStats::new()),
        lifetime: RwLock::new(LifetimeStats::default()),
        bio_predictor,
        edsm,
        remote: remote_state.clone(),
    });

    let journal_dir_clone = journal_dir.clone();
    let state_for_setup = app_state.clone();
    let remote_for_setup = remote_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_trip_stats,
            reset_trip_stats,
            get_lifetime_stats,
            get_config,
            update_config,
            predict_bio,
            toggle_always_on_top,
            create_overlay,
            toggle_overlay,
            is_overlay_open,
            fetch_edsm_system,
            push_remote_state,
            get_journal_history,
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();

            // Start journal watcher
            let watcher = JournalWatcher::new(journal_dir_clone.clone());
            let app_for_journal = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                watcher.start(app_for_journal).await;
            });

            // Start status poller
            let poller = StatusPoller::new(journal_dir_clone);
            let app_for_status = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                poller.start(app_for_status).await;
            });

            // Start remote server if enabled
            if remote_enabled {
                let remote = remote_for_setup;
                tauri::async_runtime::spawn(async move {
                    remote::start_server(remote, remote_port).await;
                });
            }

            // Emit initial state to frontend
            let _ = app_handle.emit("trip-stats", serde_json::to_value(&*state_for_setup.trip.read()).unwrap_or(Value::Null));
            let _ = app_handle.emit("lifetime-stats", serde_json::to_value(&*state_for_setup.lifetime.read()).unwrap_or(Value::Null));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
