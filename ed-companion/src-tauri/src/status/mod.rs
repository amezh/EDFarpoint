use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Emitter};

/// Polls Status.json and NavRoute.json, emitting events on change
pub struct StatusPoller {
    journal_dir: PathBuf,
    last_status: Option<String>,
    last_navroute: Option<String>,
}

impl StatusPoller {
    pub fn new(journal_dir: PathBuf) -> Self {
        Self {
            journal_dir,
            last_status: None,
            last_navroute: None,
        }
    }

    fn status_path(&self) -> PathBuf {
        self.journal_dir.join("Status.json")
    }

    fn navroute_path(&self) -> PathBuf {
        self.journal_dir.join("NavRoute.json")
    }

    fn read_json_file(path: &Path) -> Option<String> {
        fs::read_to_string(path).ok().filter(|s| !s.trim().is_empty())
    }

    /// Start the polling loop
    pub async fn start(mut self, app: AppHandle) {
        log::info!("Status poller: watching {}", self.journal_dir.display());

        // Read initial NavRoute
        if let Some(content) = Self::read_json_file(&self.navroute_path()) {
            self.last_navroute = Some(content.clone());
            if let Ok(val) = serde_json::from_str::<Value>(&content) {
                let _ = app.emit("navroute-update", &val);
            }
        }

        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;

            // Poll Status.json
            if let Some(content) = Self::read_json_file(&self.status_path()) {
                let changed = self
                    .last_status
                    .as_ref()
                    .map(|prev| prev != &content)
                    .unwrap_or(true);

                if changed {
                    self.last_status = Some(content.clone());
                    if let Ok(val) = serde_json::from_str::<Value>(&content) {
                        let _ = app.emit("status-update", &val);
                    }
                }
            }

            // Poll NavRoute.json (less frequently, check every cycle but only emit on change)
            if let Some(content) = Self::read_json_file(&self.navroute_path()) {
                let changed = self
                    .last_navroute
                    .as_ref()
                    .map(|prev| prev != &content)
                    .unwrap_or(true);

                if changed {
                    self.last_navroute = Some(content.clone());
                    if let Ok(val) = serde_json::from_str::<Value>(&content) {
                        let _ = app.emit("navroute-update", &val);
                    }
                }
            }
        }
    }
}
