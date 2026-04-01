<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";

  interface Config {
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

  let config: Config | null = $state(null);
  let saving = $state(false);
  let overlayOpen = $state(false);

  async function loadConfig() {
    config = (await invoke("get_config")) as Config;
    overlayOpen = await invoke<boolean>("is_overlay_open");
  }

  async function saveConfig() {
    if (!config) return;
    saving = true;
    await invoke("update_config", { config });
    saving = false;
  }

  async function toggleOverlay() {
    try {
      overlayOpen = await invoke<boolean>("toggle_overlay");
    } catch (e) {
      console.warn("Overlay:", e);
    }
  }

  async function toggleAlwaysOnTop() {
    try {
      const result = await invoke<boolean>("toggle_always_on_top");
      if (config) config.window.panel_always_on_top = result;
    } catch (e) {
      console.warn("Always on top:", e);
    }
  }

  $effect(() => {
    loadConfig();
  });
</script>

{#if config}
  <div class="flex flex-col gap-4">
    <div class="ed-card">
      <h3 class="text-ed-amber font-bold mb-3">General</h3>
      <div class="flex flex-col gap-2 text-sm">
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Journal directory</span>
          <input type="text" class="bg-ed-bg border border-ed-border rounded px-2 py-1 text-ed-text w-48 text-xs"
                 bind:value={config.paths.journal_dir}
                 placeholder="Auto-detected" />
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">EDSM API key</span>
          <input type="text" class="bg-ed-bg border border-ed-border rounded px-2 py-1 text-ed-text w-48 text-xs"
                 bind:value={config.edsm.api_key}
                 placeholder="Optional" />
        </label>
      </div>
    </div>

    <div class="ed-card">
      <h3 class="text-ed-amber font-bold mb-3">Window</h3>
      <div class="flex flex-col gap-2 text-sm">
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Always on top</span>
          <button class="ed-btn text-xs" onclick={toggleAlwaysOnTop}>
            {config.window.panel_always_on_top ? "On" : "Off"}
          </button>
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Overlay window</span>
          <button class="ed-btn text-xs" onclick={toggleOverlay}>
            {overlayOpen ? "Close" : "Open"}
          </button>
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Overlay opacity</span>
          <input type="range" min="0.3" max="1" step="0.05"
                 bind:value={config.window.overlay_opacity}
                 class="w-32" />
        </label>
      </div>
    </div>

    <div class="ed-card">
      <h3 class="text-ed-amber font-bold mb-3">Exobiology</h3>
      <div class="flex flex-col gap-2 text-sm">
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Value threshold</span>
          <div class="flex items-center gap-1">
            <input type="number" class="bg-ed-bg border border-ed-border rounded px-2 py-1 text-ed-text w-24 text-xs text-right"
                   bind:value={config.bio.value_threshold} />
            <span class="text-ed-text-muted text-xs">Cr</span>
          </div>
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Dim below threshold</span>
          <input type="checkbox" bind:checked={config.bio.dim_below_threshold} />
        </label>
      </div>
    </div>

    <div class="ed-card">
      <h3 class="text-ed-amber font-bold mb-3">Remote Access</h3>
      <div class="flex flex-col gap-2 text-sm">
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Enable remote server</span>
          <input type="checkbox" bind:checked={config.remote.enabled} />
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Port</span>
          <input type="number" class="bg-ed-bg border border-ed-border rounded px-2 py-1 text-ed-text w-20 text-xs text-right"
                 bind:value={config.remote.port} />
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Auth token</span>
          <input type="text" class="bg-ed-bg border border-ed-border rounded px-2 py-1 text-ed-text w-32 text-xs"
                 bind:value={config.remote.auth_token}
                 placeholder="Optional" />
        </label>
        {#if config.remote.enabled}
          <p class="text-xs text-ed-green mt-1">
            Server: http://localhost:{config.remote.port}/
          </p>
        {/if}
      </div>
    </div>

    <div class="ed-card">
      <h3 class="text-ed-amber font-bold mb-3">Auto-Switch</h3>
      <div class="flex flex-col gap-2 text-sm">
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Enable auto-switch</span>
          <input type="checkbox" bind:checked={config.autoswitch.enabled} />
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Panel auto-switch</span>
          <input type="checkbox" bind:checked={config.autoswitch.panel_autoswitch} />
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Overlay auto-switch</span>
          <input type="checkbox" bind:checked={config.autoswitch.overlay_autoswitch} />
        </label>
      </div>
    </div>

    <button class="ed-btn-primary w-full" onclick={saveConfig} disabled={saving}>
      {saving ? "Saving..." : "Save Settings"}
    </button>
  </div>
{:else}
  <div class="ed-card text-ed-text-muted text-center">Loading settings...</div>
{/if}
