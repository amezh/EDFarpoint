#![allow(non_snake_case, dead_code, unused_variables)]

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// A single species entry from the Canonn biostats dataset
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BioStatsEntry {
    pub name: Option<String>,
    pub hud_category: Option<String>,
    pub fdevname: Option<String>,
    pub id: Option<Value>,
    pub count: Option<u64>,
    pub ming: Option<f64>,
    pub maxg: Option<f64>,
    pub mint: Option<f64>,
    pub maxt: Option<f64>,
    pub minp: Option<f64>,
    pub maxp: Option<f64>,
    pub mind: Option<f64>,
    pub maxd: Option<f64>,
    #[serde(default)]
    pub atmosphereType: Vec<String>,
    #[serde(default)]
    pub primaryStars: Vec<String>,
    #[serde(default)]
    pub localStars: Vec<String>,
    #[serde(default)]
    pub volcanism: Vec<String>,
    #[serde(default)]
    pub bodies: Vec<String>,
    pub reward: Option<u64>,
}

/// Species prediction result for a planet
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PredictedSpecies {
    pub name: String,
    pub codex_name: Option<String>,
    pub value: u64,
    pub clonal_range: u32,
    pub confidence: String, // "confirmed" or "predicted"
}

/// Prediction summary for a planet
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BioPrediction {
    pub body_name: String,
    pub body_id: u32,
    pub signal_count: u32,
    pub species: Vec<PredictedSpecies>,
    pub min_value: u64,
    pub max_value: u64,
}

/// Clonal colony minimum distances by genus
fn default_clonal_ranges() -> HashMap<String, u32> {
    let mut m = HashMap::new();
    m.insert("Aleoida".into(), 150);
    m.insert("Bacterium".into(), 500);
    m.insert("Cactoida".into(), 300);
    m.insert("Clypeus".into(), 150);
    m.insert("Concha".into(), 150);
    m.insert("Electricae".into(), 1000);
    m.insert("Fonticulua".into(), 500);
    m.insert("Frutexa".into(), 150);
    m.insert("Fumerola".into(), 100);
    m.insert("Fungoida".into(), 300);
    m.insert("Osseus".into(), 800);
    m.insert("Recepta".into(), 150);
    m.insert("Stratum".into(), 500);
    m.insert("Tubus".into(), 800);
    m.insert("Tussock".into(), 200);
    m.insert("Brain Tree".into(), 100);
    m.insert("Bark Mound".into(), 100);
    m.insert("Anemone".into(), 100);
    m.insert("Sinuous Tuber".into(), 100);
    m.insert("Amphora Plant".into(), 100);
    m
}

pub struct BioPredictor {
    entries: Vec<BioStatsEntry>,
    clonal_ranges: HashMap<String, u32>,
    prices: HashMap<String, u64>,
}

impl BioPredictor {
    /// Load the Canonn biostats dataset from a JSON file
    pub fn load(data_dir: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let biostats_path = data_dir.join("canonn_biostats.json");
        let prices_path = data_dir.join("canonn_codex_prices.json");
        let clonal_path = data_dir.join("clonal_colony_ranges.json");

        let mut entries = Vec::new();
        if biostats_path.exists() {
            let content = fs::read_to_string(&biostats_path)?;
            let parsed: Value = serde_json::from_str(&content)?;
            // The biostats file is a JSON object keyed by entryid
            if let Value::Object(map) = parsed {
                for (_key, value) in map {
                    if let Ok(entry) = serde_json::from_value::<BioStatsEntry>(value) {
                        if entry.hud_category.as_deref() == Some("Biology") {
                            entries.push(entry);
                        }
                    }
                }
            }
            log::info!("Bio predictor: loaded {} species entries", entries.len());
        } else {
            log::warn!("Bio predictor: biostats file not found at {:?}", biostats_path);
        }

        let mut prices = HashMap::new();
        if prices_path.exists() {
            let content = fs::read_to_string(&prices_path)?;
            let parsed: Value = serde_json::from_str(&content)?;
            if let Value::Object(map) = parsed {
                for (_key, value) in map {
                    if let Value::Object(ref entry) = value {
                        if let (Some(Value::String(name)), Some(reward)) =
                            (entry.get("name"), entry.get("reward"))
                        {
                            if let Some(r) = reward.as_u64() {
                                prices.insert(name.clone(), r);
                            }
                        }
                    }
                }
            }
            log::info!("Bio predictor: loaded {} price entries", prices.len());
        }

        let mut clonal_ranges = default_clonal_ranges();
        if clonal_path.exists() {
            let content = fs::read_to_string(&clonal_path)?;
            if let Ok(parsed) = serde_json::from_str::<HashMap<String, u32>>(&content) {
                clonal_ranges.extend(parsed);
            }
        }

        Ok(Self {
            entries,
            clonal_ranges,
            prices,
        })
    }

    /// Predict possible bio species for a planet based on its properties
    pub fn predict(
        &self,
        body_name: &str,
        body_id: u32,
        signal_count: u32,
        planet_class: &str,
        atmosphere_type: &str,
        gravity_g: f64,
        temperature_k: f64,
        volcanism: &str,
        star_type: &str,
        distance_ls: f64,
    ) -> BioPrediction {
        let mut candidates: Vec<PredictedSpecies> = Vec::new();

        for entry in &self.entries {
            // Filter by body type
            if !entry.bodies.is_empty() {
                let matches_body = entry.bodies.iter().any(|b| {
                    planet_class.to_lowercase().contains(&b.to_lowercase())
                });
                if !matches_body {
                    continue;
                }
            }

            // Filter by atmosphere
            if !entry.atmosphereType.is_empty() {
                let atmo_lower = atmosphere_type.to_lowercase();
                let matches_atmo = entry.atmosphereType.iter().any(|a| {
                    atmo_lower.contains(&a.to_lowercase()) || a.to_lowercase().contains(&atmo_lower)
                });
                if !matches_atmo && !atmosphere_type.is_empty() {
                    continue;
                }
                // If planet has no atmosphere and entry requires one, skip
                if atmosphere_type.is_empty() || atmosphere_type == "None" {
                    continue;
                }
            }

            // Filter by gravity
            if let (Some(ming), Some(maxg)) = (entry.ming, entry.maxg) {
                if gravity_g < ming * 0.95 || gravity_g > maxg * 1.05 {
                    continue;
                }
            }

            // Filter by temperature
            if let (Some(mint), Some(maxt)) = (entry.mint, entry.maxt) {
                if temperature_k < mint * 0.95 || temperature_k > maxt * 1.05 {
                    continue;
                }
            }

            // Filter by volcanism
            if !entry.volcanism.is_empty() && !volcanism.is_empty() {
                let volc_lower = volcanism.to_lowercase();
                let matches_volc = entry.volcanism.iter().any(|v| {
                    volc_lower.contains(&v.to_lowercase())
                });
                // Some species require volcanism, some don't
                // If the entry has volcanism list and the planet has volcanism,
                // check if it matches
                if !matches_volc && !volc_lower.contains("none") {
                    // Entry requires specific volcanism that doesn't match
                    continue;
                }
            }

            // Filter by star type
            if !entry.primaryStars.is_empty() {
                let matches_star = entry.primaryStars.iter().any(|s| {
                    s.to_lowercase() == star_type.to_lowercase()
                        || star_type.to_lowercase().starts_with(&s.to_lowercase())
                });
                if !matches_star {
                    continue;
                }
            }

            let name = entry
                .name
                .clone()
                .unwrap_or_else(|| "Unknown Species".to_string());

            let value = entry.reward.unwrap_or_else(|| {
                self.prices.get(&name).copied().unwrap_or(0)
            });

            // Extract genus from name for clonal range
            let genus = name.split_whitespace().next().unwrap_or("").to_string();
            let clonal_range = self.clonal_ranges.get(&genus).copied().unwrap_or(150);

            candidates.push(PredictedSpecies {
                name: name.clone(),
                codex_name: entry.fdevname.clone(),
                value,
                clonal_range,
                confidence: "predicted".to_string(),
            });
        }

        // Sort by value descending
        candidates.sort_by(|a, b| b.value.cmp(&a.value));

        // Deduplicate by base species name (keep highest value variant)
        let mut seen_base = std::collections::HashSet::new();
        candidates.retain(|c| {
            // Base species = first two words
            let base: String = c.name.split_whitespace().take(2).collect::<Vec<_>>().join(" ");
            seen_base.insert(base)
        });

        // Calculate min/max values
        let min_value = if signal_count > 0 && !candidates.is_empty() {
            candidates
                .iter()
                .rev()
                .take(signal_count as usize)
                .map(|s| s.value)
                .sum()
        } else {
            0
        };

        let max_value = if signal_count > 0 && !candidates.is_empty() {
            candidates
                .iter()
                .take(signal_count as usize)
                .map(|s| s.value)
                .sum()
        } else {
            0
        };

        BioPrediction {
            body_name: body_name.to_string(),
            body_id,
            signal_count,
            species: candidates,
            min_value,
            max_value,
        }
    }

    /// Get the clonal range for a genus
    pub fn clonal_range(&self, genus: &str) -> u32 {
        self.clonal_ranges.get(genus).copied().unwrap_or(150)
    }

    /// Get the value for a species by name
    pub fn species_value(&self, name: &str) -> u64 {
        self.prices.get(name).copied().unwrap_or(0)
    }
}
