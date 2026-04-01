#![allow(non_snake_case, dead_code, unused_variables)]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// A single ruleset defining conditions under which a species can appear
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ruleset {
    pub atmosphere: Option<Vec<String>>,
    pub body_type: Option<Vec<String>>,
    pub min_gravity: Option<f64>,
    pub max_gravity: Option<f64>,
    pub min_temperature: Option<f64>,
    pub max_temperature: Option<f64>,
    pub min_pressure: Option<f64>,
    pub max_pressure: Option<f64>,
    pub volcanism: Option<serde_json::Value>, // "None", "Any", or list of strings
    pub star: Option<Vec<String>>,
    pub parent_star: Option<Vec<String>>,
    pub main_star: Option<Vec<String>>,
    pub regions: Option<Vec<String>>,
    pub nebula: Option<String>,
    pub min_distance: Option<f64>,
    pub max_distance: Option<f64>,
}

/// A species entry with curated prediction rules
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BioRuleEntry {
    pub name: String,
    pub value: u64,
    pub genus: String,
    pub clonal_range: u32,
    pub rulesets: Vec<Ruleset>,
}

/// Species prediction result for a planet
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PredictedSpecies {
    pub name: String,
    pub codex_name: Option<String>,
    pub value: u64,
    pub clonal_range: u32,
    pub confidence: String,
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

pub struct BioPredictor {
    rules: Vec<BioRuleEntry>,
}

/// Normalize atmosphere input to base type matching bio rules (e.g. "Argon", "CarbonDioxide").
/// Handles both journal AtmosphereType enum ("ThinArgon") and descriptive Atmosphere field
/// ("thin argon atmosphere").
fn normalize_atmosphere_type(atmo: &str) -> String {
    let s = atmo.trim();
    if s.is_empty() {
        return String::new();
    }

    // First try: journal AtmosphereType enum format (PascalCase, no spaces)
    // e.g. "ThinArgon" -> "Argon", "ThickCarbonDioxide" -> "CarbonDioxide"
    let base = if let Some(rest) = s.strip_prefix("Thin") {
        rest.to_string()
    } else if let Some(rest) = s.strip_prefix("Thick") {
        rest.to_string()
    } else if let Some(rest) = s.strip_prefix("SemiHot") {
        rest.to_string()
    } else if let Some(rest) = s.strip_prefix("Hot") {
        rest.to_string()
    } else if s.contains(' ') {
        // Fallback: descriptive Atmosphere field ("thin argon atmosphere")
        // Strip "thin ", "thick ", "hot " prefix and " atmosphere" suffix
        let lower = s.to_lowercase();
        let stripped = lower
            .trim_end_matches(" atmosphere")
            .trim_start_matches("thin ")
            .trim_start_matches("thick ")
            .trim_start_matches("semi-hot ")
            .trim_start_matches("hot ")
            .to_string();
        // Convert to PascalCase: "carbon dioxide" -> "CarbonDioxide"
        // Also handle hyphens: "argon-rich" -> "ArgonRich", "neon-rich" -> "NeonRich"
        stripped
            .split(|c: char| c == ' ' || c == '-')
            .filter(|w| !w.is_empty())
            .map(|word| {
                let mut chars = word.chars();
                match chars.next() {
                    Some(c) => c.to_uppercase().to_string() + chars.as_str(),
                    None => String::new(),
                }
            })
            .collect::<String>()
    } else {
        // Already in base format (e.g. "Argon", "CarbonDioxide", "None")
        s.to_string()
    };

    base
}

impl BioPredictor {
    /// Load the curated bio rules from bio_rules.json
    pub fn load(data_dir: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let rules_path = data_dir.join("bio_rules.json");

        let rules = if rules_path.exists() {
            let content = fs::read_to_string(&rules_path)?;
            let parsed: Vec<BioRuleEntry> = serde_json::from_str(&content)?;
            log::info!("Bio predictor: loaded {} species rules", parsed.len());
            parsed
        } else {
            log::warn!("Bio predictor: rules file not found at {:?}", rules_path);
            Vec::new()
        };

        Ok(Self { rules })
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
        let atmo_normalized = normalize_atmosphere_type(atmosphere_type);
        log::info!(
            "Bio predict: body={}, class={}, atmo='{}' -> '{}', grav={}, temp={}, volc='{}', star={}, dist={}, rules={}",
            body_name, planet_class, atmosphere_type, atmo_normalized, gravity_g, temperature_k, volcanism, star_type, distance_ls, self.rules.len()
        );
        let volc_lower = volcanism.to_lowercase();
        let has_no_volcanism = volc_lower.is_empty()
            || volc_lower == "no volcanism"
            || volc_lower.contains("none");

        let mut candidates: Vec<PredictedSpecies> = Vec::new();

        for entry in &self.rules {
            // A species matches if ANY of its rulesets pass
            let matches = entry.rulesets.iter().any(|rs| {
                self.ruleset_matches(
                    rs,
                    planet_class,
                    &atmo_normalized,
                    gravity_g,
                    temperature_k,
                    &volc_lower,
                    has_no_volcanism,
                    star_type,
                    distance_ls,
                )
            });

            if matches {
                candidates.push(PredictedSpecies {
                    name: entry.name.clone(),
                    codex_name: None,
                    value: entry.value,
                    clonal_range: entry.clonal_range,
                    confidence: "predicted".to_string(),
                });
            }
        }

        log::info!(
            "Bio predict: {} candidates: {:?}",
            candidates.len(),
            candidates.iter().map(|c| format!("{}={}", c.name, c.value)).collect::<Vec<_>>()
        );

        // Sort by value descending
        candidates.sort_by(|a, b| b.value.cmp(&a.value));

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

    /// Check if a single ruleset matches the given body conditions
    fn ruleset_matches(
        &self,
        rs: &Ruleset,
        planet_class: &str,
        atmo_normalized: &str,
        gravity_g: f64,
        temperature_k: f64,
        volc_lower: &str,
        has_no_volcanism: bool,
        star_type: &str,
        distance_ls: f64,
    ) -> bool {
        // Atmosphere check
        if let Some(ref atmo_list) = rs.atmosphere {
            let atmo_matches = if atmo_list.iter().any(|a| a == "Any") {
                !atmo_normalized.is_empty() && atmo_normalized.to_lowercase() != "none"
            } else {
                atmo_list.iter().any(|a| a.eq_ignore_ascii_case(atmo_normalized))
            };
            if !atmo_matches {
                return false;
            }
        }

        // Body type check
        if let Some(ref body_types) = rs.body_type {
            let pc_lower = planet_class.to_lowercase();
            // Also handle "Rocky ice body" vs "Rocky Ice world" - ED journal uses different names
            let body_matches = body_types.iter().any(|bt| {
                let bt_lower = bt.to_lowercase();
                bt_lower == pc_lower
                    || (bt_lower == "rocky ice body" && pc_lower == "rocky ice world")
                    || (bt_lower == "rocky ice world" && pc_lower == "rocky ice body")
                    || (bt_lower == "high metal content body" && pc_lower == "high metal content world")
                    || (bt_lower == "high metal content world" && pc_lower == "high metal content body")
            });
            if !body_matches {
                return false;
            }
        }

        // Gravity check
        if let Some(ming) = rs.min_gravity {
            if gravity_g < ming {
                return false;
            }
        }
        if let Some(maxg) = rs.max_gravity {
            if gravity_g > maxg {
                return false;
            }
        }

        // Temperature check
        if let Some(mint) = rs.min_temperature {
            if temperature_k < mint {
                return false;
            }
        }
        if let Some(maxt) = rs.max_temperature {
            if temperature_k > maxt {
                return false;
            }
        }

        // Volcanism check
        if let Some(ref volc_rule) = rs.volcanism {
            match volc_rule {
                serde_json::Value::String(s) => {
                    if s == "None" {
                        // Must have no volcanism
                        if !has_no_volcanism {
                            return false;
                        }
                    } else if s == "Any" {
                        // Must have some volcanism
                        if has_no_volcanism {
                            return false;
                        }
                    }
                }
                serde_json::Value::Array(arr) => {
                    // List of volcanism substring matches
                    if has_no_volcanism {
                        return false; // List implies volcanism is required
                    }
                    // Check exclusions first (prefixed with "!")
                    for item in arr {
                        if let serde_json::Value::String(v) = item {
                            if let Some(excluded) = v.strip_prefix('!') {
                                if volc_lower.contains(&excluded.to_lowercase()) {
                                    return false;
                                }
                            }
                        }
                    }
                    // Check at least one positive match
                    let has_positive = arr.iter().any(|item| {
                        if let serde_json::Value::String(v) = item {
                            if v.starts_with('!') {
                                return false;
                            }
                            if let Some(exact) = v.strip_prefix('=') {
                                volc_lower == exact.to_lowercase()
                            } else {
                                volc_lower.contains(&v.to_lowercase())
                            }
                        } else {
                            false
                        }
                    });
                    if !has_positive {
                        return false;
                    }
                }
                serde_json::Value::Null => {
                    // null means no volcanism requirement — any volcanism state OK
                }
                _ => {}
            }
        }
        // If volcanism field is None (absent), no volcanism requirement

        // Star type check (system-wide)
        if let Some(ref stars) = rs.star {
            let st_lower = star_type.to_lowercase();
            let star_matches = stars.iter().any(|s| {
                if s.contains(':') {
                    // Tuple format "B:V" — check type and luminosity
                    let parts: Vec<&str> = s.splitn(2, ':').collect();
                    st_lower == parts[0].to_lowercase()
                } else {
                    let s_lower = s.to_lowercase();
                    st_lower == s_lower
                        || st_lower.starts_with(&format!("{}_", s_lower))
                        || st_lower.starts_with(&format!("{} ", s_lower))
                }
            });
            if !star_matches {
                return false;
            }
        }

        // Parent star check
        if let Some(ref pstars) = rs.parent_star {
            let st_lower = star_type.to_lowercase();
            let star_matches = pstars.iter().any(|s| {
                if s.contains(':') {
                    let parts: Vec<&str> = s.splitn(2, ':').collect();
                    st_lower == parts[0].to_lowercase()
                } else {
                    let s_lower = s.to_lowercase();
                    st_lower == s_lower
                        || st_lower.starts_with(&format!("{}_", s_lower))
                        || st_lower.starts_with(&format!("{} ", s_lower))
                        // "D" matches white dwarf types
                        || (s_lower == "d" && st_lower.starts_with("d"))
                        // "N" matches neutron star
                        || (s_lower == "n" && (st_lower == "n" || st_lower.starts_with("neutron")))
                        // "H" matches black hole
                        || (s_lower == "h" && (st_lower == "h" || st_lower.starts_with("supermassive")))
                }
            });
            if !star_matches {
                return false;
            }
        }

        // Main star check
        if let Some(ref mstars) = rs.main_star {
            let st_lower = star_type.to_lowercase();
            let star_matches = mstars.iter().any(|s| {
                let s_lower = s.to_lowercase();
                st_lower == s_lower
                    || st_lower.starts_with(&format!("{}_", s_lower))
                    || st_lower.starts_with(&format!("{} ", s_lower))
            });
            if !star_matches {
                return false;
            }
        }

        // Distance check
        if let Some(min_dist) = rs.min_distance {
            if distance_ls < min_dist {
                return false;
            }
        }
        if let Some(max_dist) = rs.max_distance {
            if distance_ls > max_dist {
                return false;
            }
        }

        // Note: nebula, regions, atmosphere_component, and pressure checks are not yet
        // implemented — they require additional data (system coordinates, atmosphere
        // composition, surface pressure) that we don't have in the current API.
        // These will cause some false positives for species that require nebula proximity
        // or specific regions, but those are relatively rare cases.

        true
    }

    /// Get the clonal range for a genus
    pub fn clonal_range(&self, genus: &str) -> u32 {
        self.rules
            .iter()
            .find(|r| r.genus == genus)
            .map(|r| r.clonal_range)
            .unwrap_or(150)
    }

    /// Get the value for a species by name
    pub fn species_value(&self, name: &str) -> u64 {
        self.rules
            .iter()
            .find(|r| r.name == name)
            .map(|r| r.value)
            .unwrap_or(0)
    }
}
