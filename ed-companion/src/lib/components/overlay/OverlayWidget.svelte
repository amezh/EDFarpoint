<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { emit, listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";

  let system = $state<any>(null);
  let bio = $state<any>(null);
  let trip = $state<any>(null);
  let route = $state<any>(null);
  let status = $state<any>(null);

  const SCOOPABLE = new Set(["K", "G", "B", "F", "O", "A", "M"]);

  const totalValue = $derived(
    (trip?.cartoFSSValue ?? 0) + (trip?.cartoDSSValue ?? 0) +
    (trip?.bioValueBase ?? 0) + (trip?.bioValueBonus ?? 0)
  );
  const crPerHour = $derived(
    (trip?.playTimeSeconds ?? 0) > 60 ? totalValue / ((trip?.playTimeSeconds ?? 1) / 3600) : 0
  );
  const bodies = $derived((system?.bodies ?? []) as any[]);
  const bioBodies = $derived(bodies.filter((b: any) => b.bioSignals > 0));
  const routeSystems = $derived((route?.systems ?? []) as any[]);
  const bioSpecies = $derived((bio?.species ?? []) as any[]);
  const bodyRadius = $derived(bio?.bodyRadius ?? null);
  const lat = $derived(status?.latitude ?? null);
  const lon = $derived(status?.longitude ?? null);

  // Find the matching body from system store to get predictions
  const currentBody = $derived(
    bio?.bodyId ? bodies.find((b: any) => b.bodyId === bio.bodyId) : null
  );

  // Merge actual scans with predicted species (same logic as BioTracker)
  const mergedSpecies = $derived((() => {
    const result: any[] = [];
    const seen = new Set<string>();
    const confirmedGenera = new Set<string>();

    // 1. Actual scans from bio store
    for (const s of bioSpecies) {
      const genus = s.genus || s.localName?.split(" ")[0] || "";
      result.push({ ...s, predicted: false, genus });
      seen.add((s.localName || "").toLowerCase().split(" - ")[0].trim());
      confirmedGenera.add(genus.toLowerCase());
    }

    // 2. Predicted species not yet scanned (skip genera already confirmed)
    if (currentBody?.bioSpeciesPredicted) {
      for (const pred of currentBody.bioSpeciesPredicted) {
        const key = pred.name.toLowerCase();
        if (seen.has(key)) continue;
        const genus = pred.name.split(" ")[0];
        if (confirmedGenera.has(genus.toLowerCase())) continue;
        seen.add(key);
        result.push({
          name: pred.codex_name ?? pred.name,
          localName: pred.name,
          genus,
          value: pred.value,
          clonalRange: pred.clonal_range,
          samples: 0,
          analysed: false,
          scanPositions: [],
          predicted: true,
        });
      }
    }

    // Sort: active first, then unscanned by value desc, analysed last
    return result.sort((a: any, b: any) => {
      if (a.analysed !== b.analysed) return a.analysed ? 1 : -1;
      if ((a.samples > 0) !== (b.samples > 0)) return a.samples > 0 ? -1 : 1;
      return (b.value ?? 0) - (a.value ?? 0);
    });
  })());

  const onPlanet = $derived(
    !!(status?.parsed?.landed || status?.parsed?.onFoot || status?.parsed?.onFootOnPlanet) &&
    lat != null && lon != null &&
    mergedSpecies.length > 0
  );

  const CLONAL: Record<string, number> = {
    Aleoida: 150, Bacterium: 500, Cactoida: 300, Clypeus: 150, Concha: 150,
    Electricae: 1000, Fonticulua: 500, Frutexa: 150, Fumerola: 100,
    Fungoida: 300, Osseus: 800, Recepta: 150, Stratum: 500, Tubus: 800, Tussock: 200,
  };

  const STATUS_ICON: Record<string, string> = {
    bio_complete: "✓", landed: "▼", dss: "◉", visited: "◎", fss: "○", unvisited: "○"
  };
  const STATUS_COLOR: Record<string, string> = {
    bio_complete: "text-green-400", landed: "text-amber-400", dss: "text-blue-400",
    visited: "text-cyan-400", fss: "text-gray-500", unvisited: "text-gray-500"
  };

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

  function haversine(lat1: number, lon1: number, lat2: number, lon2: number, rKm: number): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * rKm * Math.asin(Math.sqrt(a)) * 1000;
  }

  let opacity = $state(1);

  onMount(() => {
    Promise.all([
      listen("system-state", (e) => { system = e.payload; }),
      listen("bio-state",    (e) => { bio    = e.payload; }),
      listen("trip-state",   (e) => { trip   = e.payload; }),
      listen("route-state",  (e) => { route  = e.payload; }),
      listen("status-state", (e) => { status = e.payload; }),
      listen<number>("overlay-opacity", (e) => { opacity = e.payload; }),
    ]).then(() => {
      emit("overlay-ready", true).catch(() => {});
    }).catch(() => {});

    // Also hydrate from the backend cache as a fallback (handles
    // system/route/bio/status which are stored as raw JSON).
    invoke("get_overlay_state").then((v: any) => {
      if (v.system) system = v.system;
      if (v.bio)    bio    = v.bio;
      if (v.route)  route  = v.route;
      if (v.status) status = v.status;
      // Note: v.trip uses Rust snake_case fields that don't match the
      // frontend TripState interface — rely on events for trip data instead.
    }).catch(() => {});
  });
</script>

<div class="fixed inset-0 p-2 text-xs font-mono text-gray-200 select-none"
     style="background: transparent; -webkit-app-region: drag; opacity: {opacity}">

  <!-- Resize handle: bottom-right corner, visible on hover only -->
  <div class="fixed bottom-0 right-0 w-4 h-4 opacity-0 hover:opacity-60 transition-opacity cursor-se-resize z-50"
       style="-webkit-app-region: no-drag">
    <svg viewBox="0 0 16 16" class="w-full h-full text-gray-400">
      <path d="M14 14H10M14 14V10M14 10L10 14M14 6L6 14" stroke="currentColor" stroke-width="1.5" fill="none"/>
    </svg>
  </div>

  <!-- Header -->
  <div class="flex items-center gap-2 mb-1.5">
    <span class="text-orange-400 font-bold">{fmt(totalValue)} Cr</span>
    {#if crPerHour > 0}
      <span class="text-cyan-400">{fmt(crPerHour)}/h</span>
    {/if}
    <span class="text-gray-500">{trip?.systemsVisited ?? 0} sys</span>
    <span class="text-gray-500">{trip?.bioSpeciesAnalysed ?? 0} bio</span>
  </div>

  <!-- Bio tracker — only when on planet surface -->
  {#if onPlanet}
    <div class="border-t border-gray-700/50 pt-1 mt-1">
      <div class="text-green-400 font-bold text-[10px] mb-0.5">{bio?.bodyName}</div>
      {#each mergedSpecies as sp (sp.localName)}
        {@const done = sp.analysed}
        {@const active = sp.samples > 0 && !done}
        {@const predicted = sp.predicted}
        {@const genus = sp.genus || sp.localName?.split(" ")[0] || ""}
        {@const range = sp.clonalRange ?? CLONAL[genus] ?? 200}
        <div class="flex items-center gap-1 py-0.5 {done ? 'opacity-30' : ''}">
          {#if predicted}
            <span class="text-amber-400 shrink-0">?</span>
          {/if}
          <span class="flex-1 truncate {done ? 'line-through text-gray-600' : active ? 'text-green-400' : predicted ? 'text-amber-300' : 'text-gray-300'}">
            {sp.localName}
          </span>
          {#if !predicted}
            <span class="flex gap-px">
              {#each [0, 1, 2] as j}
                <span class="w-2 h-2 rounded-full inline-block {j < sp.samples ? 'bg-green-500' : 'bg-gray-700'}"></span>
              {/each}
            </span>
          {:else}
            <span class="text-[9px] text-amber-400/60 font-mono">{fmt(sp.value ?? 0)}</span>
          {/if}
        </div>
        {#if active && sp.scanPositions?.length > 0 && lat != null && bodyRadius}
          {@const dists = sp.scanPositions.map((p: any) => haversine(p.latitude, p.longitude, lat, lon, bodyRadius))}
          {@const allFar = dists.every((d: number) => d >= range)}
          <div class="flex gap-1 text-[9px] ml-2 mb-0.5">
            {#each dists as d}
              <span class="font-bold {d >= range ? 'text-green-400' : 'text-red-400'}">{fmtDist(d)}</span>
            {/each}
            <span class="ml-auto font-bold {allFar ? 'text-green-400' : 'text-red-400'}">{allFar ? "Scan!" : "Move"}</span>
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- Expedition stats — when NOT on planet surface -->
  {#if !onPlanet}
    <div class="border-t border-gray-700/50 pt-1 mt-1">
      <div class="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Expedition</div>
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Carto (FSS)</span>
        <span class="text-ed-amber font-mono">{fmt(trip?.cartoFSSValue ?? 0)} Cr</span>
      </div>
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Carto (DSS)</span>
        <span class="text-ed-amber font-mono">{fmt(trip?.cartoDSSValue ?? 0)} Cr</span>
      </div>
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Bio scans</span>
        <span class="text-green-400 font-mono">{fmt((trip?.bioValueBase ?? 0) + (trip?.bioValueBonus ?? 0))} Cr</span>
      </div>
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Species</span>
        <span class="text-gray-300">{trip?.bioSpeciesAnalysed ?? 0} analysed</span>
      </div>
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Systems</span>
        <span class="text-gray-300">{trip?.systemsVisited ?? 0} visited</span>
      </div>
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Jumps</span>
        <span class="text-gray-300">{trip?.jumps ?? 0}</span>
      </div>
    </div>
  {/if}

  <!-- System bodies -->
  {#if !onPlanet && system}
    <div class="border-t border-gray-700/50 pt-1 mt-1">
      <div class="text-amber-400 font-bold text-[10px]">{system?.name}</div>
      <div class="text-[9px] text-gray-500">{bodies.filter((b: any) => !b.starType && b.planetClass).length}/{system?.bodyCount ?? "?"} bodies</div>
      {#each bioBodies.slice(0, 6) as body}
        <div class="flex items-center gap-1 py-0.5 text-[10px]">
          <span class="{STATUS_COLOR[body.personalStatus] ?? 'text-gray-500'}">{STATUS_ICON[body.personalStatus] ?? "○"}</span>
          <span class="truncate flex-1">{body.shortName}</span>
          <span class="text-green-400">{body.bioSignals} bio</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Route -->
  {#if routeSystems.length > 1}
    <div class="border-t border-gray-700/50 pt-1 mt-1">
      <div class="text-[9px] text-gray-500">{route?.remainingJumps} jumps → {route?.destination}</div>
      {#each routeSystems.slice(0, 3) as sys}
        <div class="flex items-center justify-between py-0.5 text-[10px]">
          <span class="truncate flex-1 {SCOOPABLE.has(sys.starClass) ? 'text-amber-400' : 'text-gray-400'}">{sys.name}</span>
          <span class="{sys.starClass === 'N' ? 'text-cyan-400' : SCOOPABLE.has(sys.starClass) ? 'text-amber-400' : 'text-gray-500'}">{sys.starClass}</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if !onPlanet && !system && routeSystems.length === 0}
    <div class="text-gray-500 text-center py-4">Waiting for data from main window...</div>
  {/if}
</div>
