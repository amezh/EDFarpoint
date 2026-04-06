use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const HISTORY_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpeditionRecord {
    pub id: String,
    pub start_timestamp: String,
    pub end_timestamp: String,
    pub start_system: String,
    pub end_station: String,
    pub end_system: String,
    pub systems_visited: u32,
    pub bodies_scanned: u32,
    pub stars_scanned: u32,
    pub bodies_mapped: u32,
    pub first_discoveries: u32,
    pub carto_fss_value: f64,
    pub carto_dss_value: f64,
    pub bio_value_base: f64,
    pub bio_value_bonus: f64,
    pub bio_species_found: u32,
    pub bio_species_analysed: u32,
    pub distance_travelled: f64,
    pub play_time_seconds: f64,
    pub jumps: u32,
    pub reconstructed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpeditionHistory {
    pub version: u32,
    pub records: Vec<ExpeditionRecord>,
}

impl ExpeditionHistory {
    pub fn new() -> Self {
        Self {
            version: HISTORY_VERSION,
            records: Vec::new(),
        }
    }

    pub fn load(dir: &Path) -> Option<Self> {
        let path = history_path(dir);
        let data = fs::read_to_string(&path).ok()?;
        let history: Self = serde_json::from_str(&data).ok()?;
        if history.version != HISTORY_VERSION {
            log::info!(
                "Expedition history version mismatch (got {}, want {}), discarding",
                history.version,
                HISTORY_VERSION
            );
            return None;
        }
        log::info!(
            "Loaded expedition history: {} records",
            history.records.len()
        );
        Some(history)
    }

    /// Save to disk (atomic write-to-temp-then-rename).
    pub fn save(&self, dir: &Path) {
        let path = history_path(dir);
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        match serde_json::to_string_pretty(self) {
            Ok(json) => {
                let tmp_path = path.with_extension("json.tmp");
                if let Err(e) = fs::write(&tmp_path, &json) {
                    log::warn!("Failed to write expedition history tmp: {}", e);
                    return;
                }
                if let Err(e) = fs::rename(&tmp_path, &path) {
                    log::warn!("Failed to rename expedition history tmp: {}", e);
                    let _ = fs::write(&path, json);
                }
            }
            Err(e) => log::warn!("Failed to serialize expedition history: {}", e),
        }
    }

    /// Add a record if it doesn't already exist (by id).
    pub fn add_record(&mut self, record: ExpeditionRecord) {
        if !self.records.iter().any(|r| r.id == record.id) {
            self.records.push(record);
        }
    }
}

fn history_path(dir: &Path) -> PathBuf {
    dir.join("expedition_history.json")
}
