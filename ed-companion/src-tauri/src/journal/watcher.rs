use std::fs::{self, File};
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use super::events::JournalEvent;

/// Global store for historical events — frontend pulls these via a command
static HISTORICAL_EVENTS: std::sync::LazyLock<Mutex<Option<Vec<Value>>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));

/// Take the historical events (returns them once, then None)
pub fn take_historical_events() -> Option<Vec<Value>> {
    HISTORICAL_EVENTS.lock().take()
}

pub struct JournalWatcher {
    journal_dir: PathBuf,
    current_file: Arc<Mutex<Option<PathBuf>>>,
    file_position: Arc<Mutex<u64>>,
}

impl JournalWatcher {
    pub fn new(journal_dir: PathBuf) -> Self {
        Self {
            journal_dir,
            current_file: Arc::new(Mutex::new(None)),
            file_position: Arc::new(Mutex::new(0)),
        }
    }

    /// Find the default ED journal directory on Windows
    pub fn default_journal_dir() -> Option<PathBuf> {
        if let Some(home) = dirs::home_dir() {
            let path = home
                .join("Saved Games")
                .join("Frontier Developments")
                .join("Elite Dangerous");
            if path.exists() {
                return Some(path);
            }
        }
        None
    }

    /// Find the most recent .log file in the journal directory
    fn find_latest_journal(&self) -> Option<PathBuf> {
        let entries = fs::read_dir(&self.journal_dir).ok()?;
        entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path()
                    .extension()
                    .map(|ext| ext == "log")
                    .unwrap_or(false)
                    && e.file_name()
                        .to_string_lossy()
                        .starts_with("Journal.")
            })
            .max_by_key(|e| e.metadata().ok().and_then(|m| m.modified().ok()))
            .map(|e| e.path())
    }

    /// Read new lines from the current journal file starting at our saved position
    fn read_new_lines(path: &Path, position: &mut u64) -> Vec<Value> {
        let mut results = Vec::new();
        let file = match File::open(path) {
            Ok(f) => f,
            Err(_) => return results,
        };

        let metadata = match file.metadata() {
            Ok(m) => m,
            Err(_) => return results,
        };

        // If file is smaller than our position, it's a new file
        if metadata.len() < *position {
            *position = 0;
        }

        let mut reader = BufReader::new(file);
        if reader.seek(SeekFrom::Start(*position)).is_err() {
            return results;
        }

        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(n) => {
                    *position += n as u64;
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
                        results.push(value);
                    }
                }
                Err(_) => break,
            }
        }

        results
    }

    /// Process the current journal file and read all historical events
    /// (used on startup to catch up with the current session)
    pub fn read_current_session(&self) -> Vec<Value> {
        let latest = match self.find_latest_journal() {
            Some(p) => p,
            None => return Vec::new(),
        };

        let mut position = 0u64;
        let events = Self::read_new_lines(&latest, &mut position);

        *self.current_file.lock() = Some(latest);
        *self.file_position.lock() = position;

        events
    }

    /// Start watching for file changes and emit events via Tauri IPC
    pub async fn start(self, app: AppHandle) {
        let (tx, mut rx) = mpsc::channel::<()>(100);

        // Read current session — store for pull via command, don't push
        let events = self.read_current_session();
        log::info!(
            "Journal watcher: read {} historical events, waiting for frontend to pull",
            events.len()
        );
        // Store in managed state so the frontend can request it via command
        {
            let mut store = HISTORICAL_EVENTS.lock();
            *store = Some(events);
        }

        let journal_dir = self.journal_dir.clone();
        let current_file = self.current_file.clone();
        let file_position = self.file_position.clone();

        // File system watcher thread
        let tx_clone = tx.clone();
        std::thread::spawn(move || {
            let rt_tx = tx_clone;
            let mut watcher = RecommendedWatcher::new(
                move |res: Result<Event, notify::Error>| {
                    if let Ok(_event) = res {
                        let _ = rt_tx.blocking_send(());
                    }
                },
                Config::default().with_poll_interval(Duration::from_secs(1)),
            )
            .expect("Failed to create file watcher");

            watcher
                .watch(&journal_dir, RecursiveMode::NonRecursive)
                .expect("Failed to watch journal directory");

            // Keep watcher alive
            loop {
                std::thread::sleep(Duration::from_secs(3600));
            }
        });

        // Also poll periodically as a fallback (some events may be missed by fs watcher)
        let tx_poll = tx.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(500)).await;
                let _ = tx_poll.send(()).await;
            }
        });

        // Event processing loop
        let journal_dir = self.journal_dir.clone();
        loop {
            if rx.recv().await.is_none() {
                break;
            }

            // Drain any queued notifications
            while rx.try_recv().is_ok() {}

            // Check if there's a newer journal file
            let latest = find_latest_in(&journal_dir);
            if let Some(ref latest_path) = latest {
                let mut current = current_file.lock();
                if current.as_ref() != Some(latest_path) {
                    log::info!("Journal watcher: switched to {}", latest_path.display());
                    *current = Some(latest_path.clone());
                    *file_position.lock() = 0;
                }
            }

            // Read new lines
            let current = current_file.lock().clone();
            if let Some(ref path) = current {
                let mut pos = file_position.lock();
                let new_events = Self::read_new_lines(path, &mut pos);
                for event in new_events {
                    let _ = app.emit("journal-event", &event);
                }
            }
        }
    }
}

fn find_latest_in(dir: &Path) -> Option<PathBuf> {
    fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext == "log")
                .unwrap_or(false)
                && e.file_name()
                    .to_string_lossy()
                    .starts_with("Journal.")
        })
        .max_by_key(|e| e.metadata().ok().and_then(|m| m.modified().ok()))
        .map(|e| e.path())
}
