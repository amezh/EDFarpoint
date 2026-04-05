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
      const update = await check({
        headers: {
          Authorization: `Bearer ${config?.github?.token ?? ""}`,
        },
      });
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

  // Svelte action: imperative checkbox — checked = open window, unchecked = close window.
  function overlayToggle(node: HTMLInputElement) {
    // Set initial state from backend
    invoke<boolean>("is_overlay_open")
      .then((v) => { node.checked = v; })
      .catch(() => {});

    // External state changes (overlay closed via its own ✕ button, etc.)
    const unlistenPromise = listen<boolean>("overlay-state", (e) => {
      node.checked = e.payload;
    });

    // Checkbox changed → read its value → open or close accordingly.
    function handleChange() {
      console.log("[overlay] checkbox changed, checked=", node.checked);
      if (node.checked) {
        console.log("[overlay] calling create_overlay");
        invoke("create_overlay").then(() => {
          console.log("[overlay] create_overlay succeeded");
        }).catch((e) => { console.error("[overlay] create_overlay failed:", e); node.checked = false; });
      } else {
        console.log("[overlay] calling toggle_overlay to close");
        invoke("toggle_overlay").then((r) => {
          console.log("[overlay] toggle_overlay returned:", r);
        }).catch((e) => { console.error("[overlay] toggle_overlay failed:", e); });
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
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">GitHub token (for updates)</span>
          <input type="password" class="bg-ed-bg border border-ed-border rounded px-2 py-1 text-ed-text w-48 text-xs"
                 bind:value={config.github.token} onchange={save}
                 placeholder="ghp_..." />
        </label>
      </div>
    </div>

    <div class="ed-card">
      <h3 class="text-ed-amber font-bold mb-3">About</h3>
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

    <div class="ed-card">
      <h3 class="text-ed-amber font-bold mb-3">Window</h3>
      <div class="flex flex-col gap-2 text-sm">
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Always on top</span>
          <input type="checkbox" checked={config.window.panel_always_on_top}
                 onchange={toggleAlwaysOnTop} />
        </label>
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Overlay window</span>
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
      <h3 class="text-ed-amber font-bold mb-3">Data</h3>
      <div class="flex flex-col gap-2 text-sm">
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Clear journal cache and reload</span>
          <button class="ed-btn text-xs" onclick={() => {
            invoke("clear_cache_and_restart").catch(() => {});
          }}>Clear cache & restart</button>
        </label>
      </div>
    </div>

    <div class="ed-card">
      <h3 class="text-ed-amber font-bold mb-3">Fleet Carrier</h3>
      <div class="flex flex-col gap-2 text-sm">
        <label class="flex items-center justify-between">
          <span class="text-ed-text-muted">Show carrier values</span>
          <input type="checkbox" bind:checked={config.carrier.enabled}
                 onchange={save} />
        </label>
        {#if config.carrier.enabled}
          <p class="text-xs text-ed-text-muted">
            Carrier payout: 75% base value, minus 12.5% transfer tax (65.6% net)
          </p>
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
