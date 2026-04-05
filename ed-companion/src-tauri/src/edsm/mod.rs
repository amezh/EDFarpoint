use std::sync::Arc;
use std::num::NonZeroUsize;
use std::time::{Duration, Instant};

use lru::LruCache;
use parking_lot::Mutex;
use reqwest::Client;
use serde::{Deserialize, Serialize};

const EDSM_BASE_URL: &str = "https://www.edsm.net/api-v1";
const CACHE_SIZE: usize = 500;
const CACHE_TTL: Duration = Duration::from_secs(30 * 60); // 30 minutes

/// Wrapper that tracks when a cache entry was inserted
struct CacheEntry<T> {
    value: T,
    inserted_at: Instant,
}

impl<T> CacheEntry<T> {
    fn new(value: T) -> Self {
        Self { value, inserted_at: Instant::now() }
    }
    fn is_expired(&self) -> bool {
        self.inserted_at.elapsed() > CACHE_TTL
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdsmSystemInfo {
    pub name: String,
    pub id: Option<u64>,
    pub id64: Option<u64>,
    pub coords: Option<EdsmCoords>,
    #[serde(rename = "coordsLocked")]
    pub coords_locked: Option<bool>,
    #[serde(rename = "requirePermit")]
    pub require_permit: Option<bool>,
    #[serde(rename = "permitName")]
    pub permit_name: Option<String>,
    pub information: Option<serde_json::Value>,
    #[serde(rename = "primaryStar")]
    pub primary_star: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdsmCoords {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdsmDiscovery {
    pub commander: Option<String>,
    pub date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdsmBodyInfo {
    pub id: Option<u64>,
    pub id64: Option<u64>,
    pub name: Option<String>,
    #[serde(rename = "bodyId")]
    pub body_id: Option<u32>,
    #[serde(rename = "type")]
    pub body_type: Option<String>,
    #[serde(rename = "subType")]
    pub sub_type: Option<String>,
    #[serde(rename = "distanceToArrival")]
    pub distance_to_arrival: Option<f64>,
    #[serde(rename = "isMainStar")]
    pub is_main_star: Option<bool>,
    #[serde(rename = "isLandable")]
    pub is_landable: Option<bool>,
    pub gravity: Option<f64>,
    #[serde(rename = "earthMasses")]
    pub earth_masses: Option<f64>,
    pub radius: Option<f64>,
    #[serde(rename = "surfaceTemperature")]
    pub surface_temperature: Option<f64>,
    pub volcanism: Option<String>,
    #[serde(rename = "atmosphereType")]
    pub atmosphere_type: Option<String>,
    #[serde(rename = "terraformingState")]
    pub terraforming_state: Option<String>,
    pub discovery: Option<EdsmDiscovery>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdsmBodiesResponse {
    pub id: Option<u64>,
    pub id64: Option<u64>,
    pub name: Option<String>,
    pub bodies: Option<Vec<EdsmBodyInfo>>,
}

pub struct EdsmClient {
    client: Client,
    api_key: Option<String>,
    system_cache: Arc<Mutex<LruCache<String, CacheEntry<Option<EdsmSystemInfo>>>>>,
    bodies_cache: Arc<Mutex<LruCache<String, CacheEntry<Option<Vec<EdsmBodyInfo>>>>>>,
}

impl EdsmClient {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap_or_default(),
            api_key,
            system_cache: Arc::new(Mutex::new(LruCache::new(
                NonZeroUsize::new(CACHE_SIZE).unwrap(),
            ))),
            bodies_cache: Arc::new(Mutex::new(LruCache::new(
                NonZeroUsize::new(CACHE_SIZE).unwrap(),
            ))),
        }
    }

    pub fn set_api_key(&mut self, key: Option<String>) {
        self.api_key = key;
    }

    /// Fetch system info from EDSM (cached)
    pub async fn get_system(&self, system_name: &str) -> Option<EdsmSystemInfo> {
        // Check cache (honor TTL)
        {
            let mut cache = self.system_cache.lock();
            if let Some(entry) = cache.get(system_name) {
                if !entry.is_expired() {
                    return entry.value.clone();
                }
                // Expired — remove and re-fetch
                cache.pop(system_name);
            }
        }

        let mut url = format!("{}/system?systemName={}&showInformation=1&showPrimaryStar=1",
            EDSM_BASE_URL,
            urlencoding::encode(system_name)
        );
        if let Some(ref key) = self.api_key {
            url.push_str(&format!("&apiKey={}", urlencoding::encode(key)));
        }

        let result = match self.client.get(&url).send().await {
            Ok(resp) => {
                if !resp.status().is_success() {
                    log::debug!("EDSM system fetch returned {}", resp.status());
                    return None; // Don't cache HTTP errors (rate limits, server errors)
                }
                resp.json::<EdsmSystemInfo>().await.ok()
            }
            Err(e) => {
                log::debug!("EDSM system fetch failed: {}", e);
                return None;
            }
        };

        // Cache result (including None for "system not found" — valid API response with 200 OK)
        {
            let mut cache = self.system_cache.lock();
            cache.put(system_name.to_string(), CacheEntry::new(result.clone()));
        }

        result
    }

    /// Fetch bodies for a system from EDSM (cached)
    pub async fn get_bodies(&self, system_name: &str) -> Option<Vec<EdsmBodyInfo>> {
        // Check cache (honor TTL)
        {
            let mut cache = self.bodies_cache.lock();
            if let Some(entry) = cache.get(system_name) {
                if !entry.is_expired() {
                    return entry.value.clone();
                }
                cache.pop(system_name);
            }
        }

        let mut url = format!(
            "{}/bodies?systemName={}",
            EDSM_BASE_URL.replace("api-v1", "api-system-v1"),
            urlencoding::encode(system_name)
        );
        if let Some(ref key) = self.api_key {
            url.push_str(&format!("&apiKey={}", urlencoding::encode(key)));
        }

        let result = match self.client.get(&url).send().await {
            Ok(resp) => {
                if !resp.status().is_success() {
                    log::debug!("EDSM bodies fetch returned {}", resp.status());
                    return None;
                }
                resp.json::<EdsmBodiesResponse>()
                    .await
                    .ok()
                    .and_then(|r| r.bodies)
            }
            Err(e) => {
                log::debug!("EDSM bodies fetch failed: {}", e);
                return None;
            }
        };

        // Cache result (including None for valid 200 responses with no bodies)
        {
            let mut cache = self.bodies_cache.lock();
            cache.put(system_name.to_string(), CacheEntry::new(result.clone()));
        }

        result
    }

    /// Check if a system exists in EDSM (i.e., has been visited before)
    pub async fn is_system_known(&self, system_name: &str) -> bool {
        self.get_system(system_name).await.is_some()
    }
}

