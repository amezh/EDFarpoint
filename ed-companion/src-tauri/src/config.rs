use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub paths: PathsConfig,
    pub window: WindowConfig,
    pub remote: RemoteConfig,
    pub bio: BioConfig,
    pub poi: PoiConfig,
    pub autoswitch: AutoswitchConfig,
    pub ui: UiConfig,
    pub edsm: EdsmConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathsConfig {
    pub journal_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowConfig {
    pub panel_enabled: bool,
    pub overlay_enabled: bool,
    pub panel_width: u32,
    pub panel_always_on_top: bool,
    pub overlay_opacity: f64,
    pub overlay_click_through: bool,
    #[serde(default)]
    pub overlay_x: Option<f64>,
    #[serde(default)]
    pub overlay_y: Option<f64>,
    #[serde(default = "default_overlay_width")]
    pub overlay_width: f64,
    #[serde(default = "default_overlay_height")]
    pub overlay_height: f64,
}

fn default_overlay_width() -> f64 { 350.0 }
fn default_overlay_height() -> f64 { 750.0 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteConfig {
    pub enabled: bool,
    pub port: u16,
    pub auth_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BioConfig {
    pub value_threshold: u64,
    pub highlight_color: String,
    pub dim_below_threshold: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoiConfig {
    pub min_carto_value: u64,    // highlight bodies worth at least this much (Cr)
    pub show_rings: bool,        // highlight bodies with rings
    pub show_landable: bool,     // highlight landable bodies
    pub max_gravity: f64,        // only show landable bodies below this gravity (g)
    pub show_terraformable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoswitchConfig {
    pub enabled: bool,
    pub panel_autoswitch: bool,
    pub overlay_autoswitch: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiConfig {
    pub body_columns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdsmConfig {
    pub api_key: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            paths: PathsConfig {
                journal_dir: String::new(),
            },
            window: WindowConfig {
                panel_enabled: true,
                overlay_enabled: false,
                panel_width: 420,
                panel_always_on_top: true,
                overlay_opacity: 0.75,
                overlay_click_through: true,
                overlay_x: None,
                overlay_y: None,
                overlay_width: 350.0,
                overlay_height: 750.0,
            },
            remote: RemoteConfig {
                enabled: false,
                port: 7821,
                auth_token: String::new(),
            },
            bio: BioConfig {
                value_threshold: 8_000_000,
                highlight_color: "#e88c00".to_string(),
                dim_below_threshold: true,
            },
            poi: PoiConfig {
                min_carto_value: 2_000_000,
                show_rings: true,
                show_landable: false,
                max_gravity: 3.0,
                show_terraformable: true,
            },
            autoswitch: AutoswitchConfig {
                enabled: true,
                panel_autoswitch: false,
                overlay_autoswitch: true,
            },
            ui: UiConfig {
                body_columns: vec![
                    "name".into(),
                    "type".into(),
                    "distance_ls".into(),
                    "gravity".into(),
                    "atmosphere".into(),
                    "landable".into(),
                    "bio_signals".into(),
                    "bio_value_max".into(),
                    "est_carto_value".into(),
                    "personal_status".into(),
                ],
            },
            edsm: EdsmConfig {
                api_key: String::new(),
            },
        }
    }
}
