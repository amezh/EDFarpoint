use std::fs::{self, File};
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

#[cfg(not(target_os = "android"))]
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use super::cache::JournalCache;
use super::events::JournalEvent;

/// A dock boundary: index in the all_events array + metadata
pub struct DockBoundary {
    pub event_idx: usize,
    pub timestamp: String,
    pub station: String,
    pub system: String,
}

/// Historical data split into lifetime (all) and trip (since last dock)
pub struct HistoricalData {
    /// All events across all journal files (for lifetime stats + current system state).
    /// When a cache is used, this only contains NEW events since the cache.
    pub all_events: Vec<Value>,
    /// Index into all_events where the current trip starts (after last Docked)
    pub trip_start_idx: usize,
    /// Timestamp of last dock, if any
    pub last_dock_timestamp: Option<String>,
    /// Last dock station name, if any
    pub last_dock_station: Option<String>,
    /// Cached stats from prior runs (None = full read, no cache)
    pub cached: Option<JournalCache>,
    /// Latest file name + offset for cache saving
    pub latest_file_name: String,
    pub latest_file_offset: u64,
    /// Events from the last 24 hours (for "Last 24h" stats panel).
    /// When cached, these are read separately from recent journal files.
    pub recent_24h_events: Vec<Value>,
    /// All dock boundaries found during history reading (for expedition reconstruction)
    pub dock_boundaries: Vec<DockBoundary>,
}

/// Global store for historical data
static HISTORICAL_DATA: std::sync::LazyLock<Mutex<Option<HistoricalData>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));

/// Signal that historical data is ready
static HISTORICAL_READY: std::sync::LazyLock<std::sync::atomic::AtomicBool> =
    std::sync::LazyLock::new(|| std::sync::atomic::AtomicBool::new(false));

/// Take the historical data, blocking until it's ready (returns once, then None)
pub fn take_historical_data() -> Option<HistoricalData> {
    // Wait until the watcher has stored the data (with 30s timeout)
    let start = std::time::Instant::now();
    while !HISTORICAL_READY.load(std::sync::atomic::Ordering::Acquire) {
        if start.elapsed() > Duration::from_secs(30) {
            log::warn!("Timed out waiting for journal history");
            return None;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    HISTORICAL_DATA.lock().take()
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

    /// Get all journal files sorted chronologically by modification time.
    /// ED uses two naming formats: `Journal.YYMMDDHHMMSS` (old) and
    /// `Journal.YYYY-MM-DDTHHMMSS` (new). Sorting by mtime handles both.
    fn all_journal_files(&self) -> Vec<PathBuf> {
        let mut files: Vec<(PathBuf, std::time::SystemTime)> = fs::read_dir(&self.journal_dir)
            .ok()
            .into_iter()
            .flatten()
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
            .filter_map(|e| {
                let mtime = e.metadata().ok()?.modified().ok()?;
                Some((e.path(), mtime))
            })
            .collect();
        files.sort_by_key(|(_, mtime)| *mtime);
        let files: Vec<PathBuf> = files.into_iter().map(|(p, _)| p).collect();
        files
    }

    fn find_latest_journal(&self) -> Option<PathBuf> {
        self.all_journal_files().into_iter().last()
    }

    /// Read all lines from a journal file as parsed JSON
    fn read_all_lines(path: &Path) -> Vec<Value> {
        let file = match File::open(path) {
            Ok(f) => f,
            Err(_) => return Vec::new(),
        };
        let reader = BufReader::new(file);
        reader
            .lines()
            .filter_map(|l| l.ok())
            .filter(|l| !l.trim().is_empty())
            .filter_map(|l| serde_json::from_str::<Value>(l.trim()).ok())
            .collect()
    }

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

    /// Read events from the last 24 hours across all journal files.
    /// Only reads files modified within the last ~25 hours (with margin).
    fn read_recent_24h(&self) -> Vec<Value> {
        let cutoff = chrono::Utc::now() - chrono::Duration::hours(25); // small margin
        let cutoff_str = cutoff.format("%Y-%m-%dT%H:%M:%S").to_string();

        let files = self.all_journal_files();
        let mut events = Vec::new();

        // Only check files modified in last ~25h
        for path in files.iter().rev() {
            let mtime = std::fs::metadata(path)
                .and_then(|m| m.modified())
                .ok();
            let too_old = mtime.map(|t| {
                t.elapsed().unwrap_or_default() > std::time::Duration::from_secs(25 * 3600)
            }).unwrap_or(true);
            if too_old { break; } // files are mtime-sorted, so older files come first

            let file_events = Self::read_all_lines(path);
            for ev in file_events {
                if let Some(ts) = ev.get("timestamp").and_then(|t| t.as_str()) {
                    if ts >= cutoff_str.as_str() {
                        events.push(ev);
                    }
                }
            }
        }

        events
    }

    /// Read journal history, optionally resuming from a cache.
    /// When cached, only reads new events since the cache point.
    pub fn read_history(&self, cache: Option<JournalCache>) -> HistoricalData {
        let files = self.all_journal_files(); // sorted by mtime
        let start = std::time::Instant::now();

        let mut all_events = Vec::new();
        let mut last_dock_idx: Option<usize> = None;
        let mut last_dock_timestamp: Option<String> = None;
        let mut last_dock_station: Option<String> = None;
        let mut dock_boundaries: Vec<DockBoundary> = Vec::new();
        let mut skipped_files = 0usize;

        let has_cache = cache.is_some();

        // Find the index of the cached file in the mtime-sorted list
        let resume_idx = if let Some(ref c) = cache {
            if c.last_file_name.is_empty() {
                None
            } else {
                files.iter().position(|p| {
                    p.file_name()
                        .map(|n| n.to_string_lossy() == c.last_file_name)
                        .unwrap_or(false)
                })
            }
        } else {
            None
        };

        let resume_offset = cache.as_ref().map(|c| c.last_file_offset).unwrap_or(0);

        for (i, path) in files.iter().enumerate() {
            if let Some(ri) = resume_idx {
                if i < ri {
                    // File is older than our resume point — skip entirely
                    skipped_files += 1;
                    continue;
                }

                if i == ri {
                    // Resume file — read from saved offset
                    let mut offset = resume_offset;
                    let events = Self::read_new_lines(path, &mut offset);
                    for ev in events {
                        let idx = all_events.len();
                        if ev.get("event").and_then(|e| e.as_str()) == Some("Docked") {
                            last_dock_idx = Some(idx);
                            last_dock_timestamp = ev.get("timestamp").and_then(|t| t.as_str()).map(|s| s.to_string());
                            last_dock_station = ev.get("StationName").and_then(|s| s.as_str()).map(|s| s.to_string());
                            dock_boundaries.push(DockBoundary {
                                event_idx: idx,
                                timestamp: last_dock_timestamp.clone().unwrap_or_default(),
                                station: last_dock_station.clone().unwrap_or_default(),
                                system: ev.get("StarSystem").and_then(|s| s.as_str()).unwrap_or("").to_string(),
                            });
                        }
                        all_events.push(ev);
                    }
                    continue;
                }
            }

            // Full read of this file (newer than cache, or no cache)
            let events = Self::read_all_lines(path);
            for ev in events {
                let idx = all_events.len();
                if ev.get("event").and_then(|e| e.as_str()) == Some("Docked") {
                    last_dock_idx = Some(idx);
                    last_dock_timestamp = ev.get("timestamp").and_then(|t| t.as_str()).map(|s| s.to_string());
                    last_dock_station = ev.get("StationName").and_then(|s| s.as_str()).map(|s| s.to_string());
                    dock_boundaries.push(DockBoundary {
                        event_idx: idx,
                        timestamp: last_dock_timestamp.clone().unwrap_or_default(),
                        station: last_dock_station.clone().unwrap_or_default(),
                        system: ev.get("StarSystem").and_then(|s| s.as_str()).unwrap_or("").to_string(),
                    });
                }
                all_events.push(ev);
            }
        }

        // If we have a cache and no new Docked event was found, inherit dock info from cache
        if has_cache && last_dock_idx.is_none() {
            last_dock_timestamp = cache.as_ref().and_then(|c| c.last_dock_timestamp.clone());
            last_dock_station = cache.as_ref().and_then(|c| c.last_dock_station.clone());
        }

        let trip_start_idx = last_dock_idx.map(|i| i + 1).unwrap_or(0);

        let elapsed = start.elapsed();
        if has_cache {
            log::info!(
                "Journal history (incremental): {} new events from {} files in {:.1}s ({} skipped). Trip starts at event {} (last dock: {})",
                all_events.len(),
                files.len(),
                elapsed.as_secs_f64(),
                skipped_files,
                trip_start_idx,
                last_dock_timestamp.as_deref().unwrap_or("never"),
            );
        } else {
            log::info!(
                "Journal history (full): {} events from {} files in {:.1}s. Trip starts at event {} (last dock: {})",
                all_events.len(),
                files.len(),
                elapsed.as_secs_f64(),
                trip_start_idx,
                last_dock_timestamp.as_deref().unwrap_or("never"),
            );
        }

        // Record latest file info for cache saving
        let latest_file = files.last()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let latest_offset = files.last()
            .and_then(|p| fs::metadata(p).ok())
            .map(|m| m.len())
            .unwrap_or(0);

        // For cached startup, read last 24h events separately for the "Last 24h" panel
        let recent_24h_events = if has_cache {
            self.read_recent_24h()
        } else {
            Vec::new() // full read path — frontend handles 24h filtering itself
        };

        HistoricalData {
            all_events,
            trip_start_idx,
            last_dock_timestamp,
            last_dock_station,
            cached: cache,
            latest_file_name: latest_file,
            latest_file_offset: latest_offset,
            recent_24h_events,
            dock_boundaries,
        }
    }

    pub async fn start(self, app: AppHandle) {
        let (tx, mut rx) = mpsc::channel::<()>(100);

        // Load cache if available
        let cache = JournalCache::load(&self.journal_dir);

        // Read history (incremental if cached)
        let data = self.read_history(cache);

        // Set position to end of latest journal for live tailing
        if let Some(latest) = self.find_latest_journal() {
            let file_len = fs::metadata(&latest).map(|m| m.len()).unwrap_or(0);
            *self.current_file.lock() = Some(latest);
            *self.file_position.lock() = file_len;
        }

        // Store for frontend pull
        {
            let mut store = HISTORICAL_DATA.lock();
            *store = Some(data);
        }
        HISTORICAL_READY.store(true, std::sync::atomic::Ordering::Release);

        let journal_dir = self.journal_dir.clone();
        let current_file = self.current_file.clone();
        let file_position = self.file_position.clone();

        // File system watcher
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

            loop {
                std::thread::sleep(Duration::from_secs(3600));
            }
        });

        // Periodic poll fallback
        let tx_poll = tx.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(500)).await;
                let _ = tx_poll.send(()).await;
            }
        });

        // Live event loop
        let journal_dir = self.journal_dir.clone();
        loop {
            if rx.recv().await.is_none() {
                break;
            }

            while rx.try_recv().is_ok() {}

            let latest = find_latest_in(&journal_dir);
            if let Some(ref latest_path) = latest {
                let mut current = current_file.lock();
                if current.as_ref() != Some(latest_path) {
                    log::info!("Journal watcher: switched to {}", latest_path.display());
                    *current = Some(latest_path.clone());
                    *file_position.lock() = 0;
                }
            }

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
