<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";

  // Local state — populated from main window events
  let system = $state<Record<string, unknown> | null>(null);
  let bio = $state<Record<string, unknown> | null>(null);
  let trip = $state<Record<string, unknown> | null>(null);
  let route = $state<Record<string, unknown> | null>(null);
  let status = $state<Record<string, unknown> | null>(null);

  const SCOOPABLE = new Set(["K", "G", "B", "F", "O", "A", "M"]);
  const CLONAL: Record<string, number> = {
    Aleoida: 150, Bacterium: 500, Cactoida: 300, Clypeus: 150, Concha: 150,
    Electricae: 1000, Fonticulua: 500, Frutexa: 150, Fumerola: 100,
    Fungoida: 300, Osseus: 800, Recepta: 150, Stratum: 500, Tubus: 800, Tussock: 200,
  };

  // Derived values
  const totalValue = $derived(
    ((trip as any)?.cartoFSSValue ?? 0) + ((trip as any)?.cartoDSSValue ?? 0) +
    ((trip as any)?.bioValueBase ?? 0) + ((trip as any)?.bioValueBonus ?? 0)
  );

  const bodies = $derived(((system as any)?.bodies ?? []) as any[]);
  const bioBodies = $derived(bodies.filter((b: any) => b.bioSignals > 0));
  const routeSystems = $derived(((route as any)?.systems ?? []) as any[]);
  const bioSpecies = $derived(((bio as any)?.species ?? []) as any[]);
  const bodyRadius = $derived((bio as any)?.bodyRadius ?? null);
  const lat = $derived((status as any)?.latitude ?? null);
  const lon = $derived((status as any)?.longitude ?? null);

  function fmt(v: number): string {
    if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + "B";
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
    if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
    return v.toString();
  }

  function fmtDist(m: number): string {
    if (m >= 1000) return (m / 1000).toFixed(1) + "km";
    return Math.round(m) + "m";
  }

  function haversine(lat1: number, lon1: number, lat2: number, lon2: number, radiusKm: number): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * radiusKm * Math.asin(Math.sqrt(a)) * 1000;
  }

  const STATUS_ICON: Record<string, string> = {
    bio_complete: "✓", landed: "▼", dss: "◉", visited: "◎", fss: "○", unvisited: "○"
  };
  const STATUS_COLOR: Record<string, string> = {
    bio_complete: "text-ed-green", landed: "text-ed-amber", dss: "text-ed-blue",
    visited: "text-ed-cyan", fss: "text-ed-dim", unvisited: "text-ed-dim"
  };

  async function close() {
    try { await invoke("toggle_overlay"); } catch { /* ignore */ }
  }

  onMount(() => {
    listen("system-state", (e) => { system = e.payload as any; });
    listen("bio-state", (e) => { bio = e.payload as any; });
    listen("trip-state", (e) => { trip = e.payload as any; });
    listen("route-state", (e) => { route = e.payload as any; });
    listen("status-state", (e) => { status = e.payload as any; });
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="p-2 text-xs font-mono select-none cursor-default min-w-[280px] bg-black/80 rounded-lg border border-ed-border/50"
     style="-webkit-app-region: drag">

  <!-- Header: trip total + close -->
  <div class="flex items-center gap-2 mb-1 text-[10px]">
    <span class="text-ed-orange font-bold">{fmt(totalValue)} Cr</span>
    <span class="text-ed-text-muted">{(trip as any)?.systemsVisited ?? 0} sys</span>
    <span class="text-ed-text-muted">{(trip as any)?.bioSpeciesAnalysed ?? 0} bio</span>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <span class="ml-auto text-ed-text-muted hover:text-white cursor-pointer text-sm"
          style="-webkit-app-region: no-drag"
          onclick={close}>✕</span>
  </div>

  <!-- Bio tracker when on planet -->
  {#if bioSpecies.length > 0}
    <div class="border-t border-ed-border/30 pt-1 mt-1">
      <div class="text-ed-green font-bold text-[10px] mb-0.5">{(bio as any)?.bodyName}</div>
      {#each bioSpecies as species (species.name)}
        {@const done = species.analysed}
        {@const active = species.samples > 0 && !done}
        {@const genus = species.genus || species.localName?.split(" ")[0] || ""}
        {@const range = species.clonalRange ?? CLONAL[genus] ?? 200}
        <div class="flex items-center gap-1 py-0.5 {done ? 'opacity-30' : ''}">
          <span class="flex-1 truncate {done ? 'line-through text-ed-dim' : active ? 'text-ed-green' : ''}">{species.localName}</span>
          <span class="flex gap-px">
            {#each [0, 1, 2] as j}
              <span class="w-2 h-2 rounded-full inline-block {j < species.samples ? 'bg-ed-green' : 'bg-ed-dim'}"></span>
            {/each}
          </span>
        </div>
        {#if active && species.scanPositions?.length > 0 && lat != null && bodyRadius}
          {@const dists = species.scanPositions.map((p: any) => haversine(p.latitude, p.longitude, lat, lon, bodyRadius))}
          {@const allFar = dists.every((d: number) => d >= range)}
          <div class="flex gap-1 text-[9px] ml-2 mb-0.5">
            {#each dists as d}
              <span class="{d >= range ? 'text-ed-green' : 'text-red-400'} font-bold">{fmtDist(d)}</span>
            {/each}
            <span class="ml-auto {allFar ? 'text-ed-green' : 'text-red-400'}">{allFar ? "Scan!" : "Move"}</span>
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- System bodies with bio signals -->
  {#if system && bioSpecies.length === 0}
    <div class="border-t border-ed-border/30 pt-1 mt-1">
      <div class="text-ed-amber font-bold text-[10px]">{(system as any)?.name}</div>
      <div class="text-[9px] text-ed-text-muted">{bodies.length}/{(system as any)?.bodyCount ?? "?"} bodies</div>
      {#each bioBodies.slice(0, 5) as body}
        <div class="flex items-center gap-1 py-0.5 text-[10px]">
          <span class="{STATUS_COLOR[body.personalStatus] ?? 'text-ed-dim'}">{STATUS_ICON[body.personalStatus] ?? "○"}</span>
          <span class="truncate flex-1">{body.shortName}</span>
          <span class="text-ed-green">{body.bioSignals} bio</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Route -->
  {#if routeSystems.length > 1}
    <div class="border-t border-ed-border/30 pt-1 mt-1">
      <div class="text-[9px] text-ed-text-muted">{(route as any)?.remainingJumps} jumps → {(route as any)?.destination}</div>
      {#each routeSystems.slice(0, 3) as sys}
        <div class="flex items-center justify-between py-0.5 text-[10px]">
          <span class="truncate flex-1 {SCOOPABLE.has(sys.starClass) ? 'text-ed-amber' : 'text-ed-text-muted'}">{sys.name}</span>
          <span class="{sys.starClass === 'N' ? 'text-ed-cyan' : SCOOPABLE.has(sys.starClass) ? 'text-ed-amber' : 'text-ed-text-muted'}">{sys.starClass}</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if !system && bioSpecies.length === 0 && routeSystems.length === 0}
    <div class="text-ed-text-muted text-center py-2">Waiting for data...</div>
  {/if}
</div>
