use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Bump this when changing what data is cached or how events are processed.
/// A mismatch forces a full re-read of all journal files.
const CACHE_VERSION: u32 = 4;

/// Cached journal processing state — allows incremental startup.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalCache {
    pub version: u32,

    /// Timestamp of the last event we processed (ISO 8601)
    pub last_event_timestamp: String,

    /// Filename of the last journal file we read from
    pub last_file_name: String,

    /// Byte offset in that file — resume point for reading
    pub last_file_offset: u64,

    /// Last dock info (trip boundary)
    pub last_dock_timestamp: Option<String>,
    pub last_dock_station: Option<String>,
    #[serde(default)]
    pub last_dock_system: Option<String>,
    #[serde(default)]
    pub last_dock_system_address: Option<u64>,

    // -- Cached frontend stats (mirrors the Svelte store shapes) --

    /// Lifetime stats snapshot
    pub lifetime: CachedLifetimeStats,

    /// Trip stats snapshot (since last dock; None if just docked with no activity)
    pub trip: Option<CachedTripStats>,

    /// Commander name
    #[serde(default)]
    pub commander: Option<String>,

    /// Ship name
    #[serde(default)]
    pub ship_name: Option<String>,

    /// Ship type
    #[serde(default)]
    pub ship_type: Option<String>,

    /// Current system state — opaque JSON blob from frontend systemStore
    #[serde(default)]
    pub system_state: Option<serde_json::Value>,

    /// Expedition visited systems — opaque JSON blob from frontend expeditionStore
    #[serde(default)]
    pub expedition: Option<serde_json::Value>,

    /// Bio tracker state — opaque JSON blob from frontend bioStore
    #[serde(default)]
    pub bio: Option<serde_json::Value>,

    /// Carrier state — opaque JSON blob from frontend carrierStore
    #[serde(default)]
    pub carrier: Option<serde_json::Value>,
}

/// Mirrors frontend LifetimeState
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CachedLifetimeStats {
    pub total_carto_fss: f64,
    pub total_carto_dss: f64,
    pub total_bio_base: f64,
    pub total_bio_bonus: f64,
    pub total_systems: f64,
    pub total_bodies_scanned: f64,
    pub total_stars_scanned: f64,
    pub total_bodies_mapped: f64,
    pub total_bio_species: f64,
    pub total_distance_ly: f64,
    pub rarest_species: Option<String>,
    pub rarest_species_value: f64,
}

/// Mirrors frontend TripState
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CachedTripStats {
    pub systems_visited: f64,
    pub bodies_scanned: f64,
    pub stars_scanned: f64,
    pub bodies_mapped: f64,
    pub first_discoveries: f64,
    pub carto_fss_value: f64,
    pub carto_dss_value: f64,
    pub bio_value_base: f64,
    pub bio_value_bonus: f64,
    pub bio_species_found: f64,
    pub bio_species_analysed: f64,
    pub distance_travelled: f64,
    pub play_time_seconds: f64,
    pub jumps: f64,
}

impl JournalCache {
    /// Load cache from disk; returns None if file missing, corrupt, or version mismatch.
    pub fn load(cache_dir: &Path) -> Option<Self> {
        let path = cache_path(cache_dir);
        let data = fs::read_to_string(&path).ok()?;
        let cache: Self = serde_json::from_str(&data).ok()?;
        if cache.version != CACHE_VERSION {
            log::info!("Journal cache version mismatch (got {}, want {}), discarding",
                cache.version, CACHE_VERSION);
            return None;
        }
        log::info!("Loaded journal cache: last event {}, file {}@{}",
            cache.last_event_timestamp, cache.last_file_name, cache.last_file_offset);
        Some(cache)
    }

    /// Save cache to disk (atomic write-to-temp-then-rename to avoid corruption on crash).
    pub fn save(&self, cache_dir: &Path) {
        let path = cache_path(cache_dir);
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        match serde_json::to_string_pretty(self) {
            Ok(json) => {
                let tmp_path = path.with_extension("json.tmp");
                if let Err(e) = fs::write(&tmp_path, &json) {
                    log::warn!("Failed to write journal cache tmp: {}", e);
                    return;
                }
                if let Err(e) = fs::rename(&tmp_path, &path) {
                    log::warn!("Failed to rename journal cache tmp: {}", e);
                    // Fallback: try direct write
                    let _ = fs::write(&path, json);
                }
            }
            Err(e) => log::warn!("Failed to serialize journal cache: {}", e),
        }
    }

    /// Create a new empty cache.
    pub fn new_empty() -> Self {
        Self {
            version: CACHE_VERSION,
            last_event_timestamp: String::new(),
            last_file_name: String::new(),
            last_file_offset: 0,
            last_dock_timestamp: None,
            last_dock_station: None,
            last_dock_system: None,
            last_dock_system_address: None,
            lifetime: CachedLifetimeStats::default(),
            trip: None,
            commander: None,
            ship_name: None,
            ship_type: None,
            system_state: None,
            expedition: None,
            bio: None,
            carrier: None,
        }
    }
}

fn cache_path(cache_dir: &Path) -> PathBuf {
    cache_dir.join("journal_cache.json")
}
