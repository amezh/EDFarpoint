// Config store — loads app config from Rust and exposes it reactively
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
  };
  remote: { enabled: boolean; port: number; auth_token: string };
  bio: { value_threshold: number; highlight_color: string; dim_below_threshold: boolean };
  autoswitch: { enabled: boolean; panel_autoswitch: boolean; overlay_autoswitch: boolean };
  ui: { body_columns: string[] };
  edsm: { api_key: string };
}

let config = $state<AppConfig | null>(null);

export const configStore = {
  get current() {
    return config;
  },

  async load() {
    config = (await invoke("get_config")) as AppConfig;
  },

  async save() {
    if (!config) return;
    await invoke("save_config", { config });
  },

  update(newConfig: AppConfig) {
    config = newConfig;
  },
};
