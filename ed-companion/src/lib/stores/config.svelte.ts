// Config store — loads app config from Rust, auto-saves on change
import { invoke } from "@tauri-apps/api/core";

export interface AppConfig {
  paths: { journal_dir: string };
  window: {
    panel_enabled: boolean;
    overlay_enabled: boolean;
    panel_width: number;
    panel_always_on_top: boolean;
    overlay_opacity: number;
    overlay_click_through: boolean;
    overlay_x: number | null;
    overlay_y: number | null;
    overlay_width: number;
    overlay_height: number;
  };
  remote: { enabled: boolean; port: number; auth_token: string };
  bio: { value_threshold: number; highlight_color: string; dim_below_threshold: boolean };
  poi: { min_carto_value: number; show_rings: boolean; show_landable: boolean; max_gravity: number; show_terraformable: boolean };
  autoswitch: { enabled: boolean; panel_autoswitch: boolean; overlay_autoswitch: boolean };
  ui: { body_columns: string[] };
  edsm: { api_key: string };
  carrier: { enabled: boolean };
  github: { token: string };
}

let config = $state<AppConfig | null>(null);
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (config) {
      invoke("update_config", { config }).catch(() => {});
    }
  }, 300);
}

export const configStore = {
  get current() {
    return config;
  },

  async load() {
    config = (await invoke("get_config")) as AppConfig;
  },

  /** Update a config section and auto-save */
  patch(fn: (c: AppConfig) => void) {
    if (!config) return;
    fn(config);
    debouncedSave();
  },
};
