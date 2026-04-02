<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { configStore } from "$lib/stores/config.svelte";

  let overlayOpen = $state(false);

  const config = $derived(configStore.current);

  function save() {
    configStore.patch(() => {}); // trigger debounced save
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
      configStore.patch((c) => { c.window.panel_always_on_top = result; });
    } catch (e) {
      console.warn("Always on top:", e);
    }
  }

  // Check initial overlay state once
  invoke<boolean>("is_overlay_open").then((v) => { overlayOpen = v; }).catch(() => {});
</script>

{#if config}
  <div class="flex flex-col gap-4">
    <div class="ed-card">
      <h3 class="text-ed-amber font-bold mb-3">General</h3>
      <div class="flex flex-col gap-2 text-sm">
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Journal directory</span>
          <input type="text" class="bg-ed-bg border border-ed-border rounded px-2 py-1 text-ed-text w-48 text-xs"
                 bind:value={config.paths.journal_dir} onchange={save}
                 placeholder="Auto-detected" />
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">EDSM API key</span>
          <input type="text" class="bg-ed-bg border border-ed-border rounded px-2 py-1 text-ed-text w-48 text-xs"
                 bind:value={config.edsm.api_key} onchange={save}
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
                 bind:value={config.window.overlay_opacity} onchange={save}
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
                   bind:value={config.bio.value_threshold} onchange={save} />
            <span class="text-ed-text-muted text-xs">Cr</span>
          </div>
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Dim below threshold</span>
          <input type="checkbox" bind:checked={config.bio.dim_below_threshold}
                 onchange={save} />
        </label>
      </div>
    </div>

    <div class="ed-card">
      <h3 class="text-ed-amber font-bold mb-3">Discovery / POI</h3>
      <div class="flex flex-col gap-2 text-sm">
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Min carto value</span>
          <div class="flex items-center gap-1">
            <input type="number" class="bg-ed-bg border border-ed-border rounded px-2 py-1 text-ed-text w-24 text-xs text-right"
                   bind:value={config.poi.min_carto_value} onchange={save} step="100000" />
            <span class="text-ed-text-muted text-xs">Cr</span>
          </div>
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Highlight ringed bodies</span>
          <input type="checkbox" bind:checked={config.poi.show_rings}
                 onchange={save} />
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Highlight terraformable</span>
          <input type="checkbox" bind:checked={config.poi.show_terraformable}
                 onchange={save} />
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Highlight landable</span>
          <input type="checkbox" bind:checked={config.poi.show_landable}
                 onchange={save} />
        </label>
        {#if config.poi.show_landable}
          <label class="flex items-center justify-between">
            <span class="text-ed-text-muted">Max gravity (g)</span>
            <input type="number" class="bg-ed-bg border border-ed-border rounded px-2 py-1 text-ed-text w-20 text-xs text-right"
                   bind:value={config.poi.max_gravity} onchange={save} step="0.1" />
          </label>
        {/if}
      </div>
    </div>

    <div class="ed-card">
      <h3 class="text-ed-amber font-bold mb-3">Remote Access</h3>
      <div class="flex flex-col gap-2 text-sm">
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Enable remote server</span>
          <input type="checkbox" bind:checked={config.remote.enabled}
                 onchange={save} />
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Port</span>
          <input type="number" class="bg-ed-bg border border-ed-border rounded px-2 py-1 text-ed-text w-20 text-xs text-right"
                 bind:value={config.remote.port} onchange={save} />
        </label>
        {#if config.remote.enabled}
          <p class="text-xs text-ed-green mt-1">
            Server: http://localhost:{config.remote.port}/
          </p>
        {/if}
      </div>
    </div>
  </div>
{:else}
  <div class="ed-card text-ed-text-muted text-center">Loading settings...</div>
{/if}
