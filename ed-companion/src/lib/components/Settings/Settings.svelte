<script lang="ts">
  import { configStore } from "$lib/stores/config.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { emit, listen } from "@tauri-apps/api/event";
  import { check } from "@tauri-apps/plugin-updater";

  const config = $derived(configStore.current);

  let updateStatus = $state<string | null>(null);
  let appVersion = $state("...");

  invoke<string>("get_app_version").then(v => {
    appVersion = v === "0.0.0" ? "dev" : `v${v}`;
  }).catch(() => {});

  async function checkForUpdate() {
    updateStatus = "Checking...";
    try {
      const update = await check();
      if (update) {
        updateStatus = `Update available: v${update.version}`;
        if (confirm(`Update to v${update.version}?\n\n${update.body ?? ""}`)) {
          updateStatus = "Downloading...";
          await update.downloadAndInstall();
          updateStatus = "Restarting...";
          await invoke("clear_cache_and_restart");
        }
      } else {
        updateStatus = "You're on the latest version";
      }
    } catch (e) {
      updateStatus = `Update check failed: ${e}`;
    }
  }

  function save() {
    configStore.patch(() => {}); // trigger debounced save
  }

  function overlayToggle(node: HTMLInputElement) {
    invoke<boolean>("is_overlay_open")
      .then((v) => { node.checked = v; })
      .catch(() => {});

    const unlistenPromise = listen<boolean>("overlay-state", (e) => {
      node.checked = e.payload;
    });

    function handleChange() {
      if (node.checked) {
        invoke("create_overlay").catch((e) => { console.error("[overlay] create_overlay failed:", e); node.checked = false; });
      } else {
        invoke("toggle_overlay").catch((e) => { console.error("[overlay] toggle_overlay failed:", e); });
      }
    }

    node.addEventListener("change", handleChange);
    return {
      destroy() {
        node.removeEventListener("change", handleChange);
        unlistenPromise.then((f) => f());
      },
    };
  }

  async function toggleAlwaysOnTop() {
    try {
      const result = await invoke<boolean>("toggle_always_on_top");
      configStore.patch((c) => { c.window.panel_always_on_top = result; });
    } catch (e) {
      console.warn("Always on top:", e);
    }
  }
</script>

{#if config}
  <div class="flex flex-col gap-4">
    <!-- Updates -->
    <div class="ed-card">
      <h3 class="text-ed-amber font-bold mb-3">Updates</h3>
      <div class="flex flex-col gap-2 text-sm">
        <div class="flex items-center justify-between">
          <span class="text-ed-text-muted">Version</span>
          <span class="text-ed-text font-mono">{appVersion}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-ed-text-muted">Check for updates</span>
          <button class="ed-btn text-xs" onclick={checkForUpdate}>
            {updateStatus ?? "Check now"}
          </button>
        </div>
      </div>
    </div>

    <!-- Window & Overlay -->
    <div class="ed-card">
      <h3 class="text-ed-amber font-bold mb-3">Window</h3>
      <div class="flex flex-col gap-2 text-sm">
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Always on top</span>
          <input type="checkbox" checked={config.window.panel_always_on_top}
                 onchange={toggleAlwaysOnTop} />
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Overlay</span>
          <input type="checkbox" use:overlayToggle />
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Overlay opacity</span>
          <input type="range" min="0.3" max="1" step="0.05"
                 bind:value={config.window.overlay_opacity}
                 oninput={() => emit("overlay-opacity", config.window.overlay_opacity)}
                 onchange={save}
                 class="w-32" />
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Carrier values in header</span>
          <input type="checkbox" bind:checked={config.carrier.enabled}
                 onchange={save} />
        </label>
      </div>
    </div>

    <!-- Discovery & Bio -->
    <div class="ed-card">
      <h3 class="text-ed-amber font-bold mb-3">Exploration</h3>
      <div class="flex flex-col gap-2 text-sm">
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Bio value threshold</span>
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
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Min carto value</span>
          <div class="flex items-center gap-1">
            <input type="number" class="bg-ed-bg border border-ed-border rounded px-2 py-1 text-ed-text w-24 text-xs text-right"
                   bind:value={config.poi.min_carto_value} onchange={save} step="100000" />
            <span class="text-ed-text-muted text-xs">Cr</span>
          </div>
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Highlight ringed</span>
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

    <!-- Advanced -->
    <div class="ed-card">
      <h3 class="text-ed-amber font-bold mb-3">Advanced</h3>
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
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Remote server</span>
          <div class="flex items-center gap-2">
            <input type="checkbox" bind:checked={config.remote.enabled}
                   onchange={save} />
            {#if config.remote.enabled}
              <input type="number" class="bg-ed-bg border border-ed-border rounded px-2 py-1 text-ed-text w-20 text-xs text-right"
                     bind:value={config.remote.port} onchange={save} />
            {/if}
          </div>
        </label>
        {#if config.remote.enabled}
          <p class="text-xs text-ed-green">http://localhost:{config.remote.port}/</p>
        {/if}
        <div class="flex items-center justify-between">
          <span class="text-ed-text-muted">Reset current expedition</span>
          <button class="ed-btn text-xs" onclick={() => {
            emit("reset-expedition");
          }}>Reset</button>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-ed-text-muted">Clear cache</span>
          <button class="ed-btn text-xs" onclick={() => {
            invoke("clear_cache_and_restart").catch(() => {});
          }}>Clear & restart</button>
        </div>
      </div>
    </div>
  </div>
{:else}
  <div class="ed-card text-ed-text-muted text-center">Loading settings...</div>
{/if}
