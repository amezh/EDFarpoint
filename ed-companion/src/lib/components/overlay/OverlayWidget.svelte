<script lang="ts">
  import { estimateCartoValue } from "$lib/utils/valueCalc";
  import { invoke } from "@tauri-apps/api/core";
  import { emit, listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";

  let system = $state<any>(null);
  let bio = $state<any>(null);
  let trip = $state<any>(null);
  let route = $state<any>(null);
  let status = $state<any>(null);
  let config = $state<any>(null);

  const SCOOPABLE = new Set(["K", "G", "B", "F", "O", "A", "M"]);

  const totalValue = $derived(
    (trip?.cartoFSSValue ?? 0) + (trip?.cartoDSSValue ?? 0) +
    (trip?.bioValueBase ?? 0) + (trip?.bioValueBonus ?? 0)
  );
  const crPerHour = $derived(
    (trip?.playTimeSeconds ?? 0) > 60 ? totalValue / ((trip?.playTimeSeconds ?? 1) / 3600) : 0
  );
  const bodies = $derived((system?.bodies ?? []) as any[]);
  const bioThreshold = $derived(config?.bio?.value_threshold ?? 0);
  const cartoThreshold = $derived(config?.poi?.min_carto_value ?? 2_000_000);

  function allBioAnalysed(body: any): boolean {
    if (body.bioSignals <= 0) return false;
    // Consider complete when no remaining unresolved species
    return remainingSpecies(body).length === 0;
  }

  // Bio targets: planets with bio signals, not completed, value above threshold
  const bioTargets = $derived(
    bodies.filter((b: any) => {
      if (!b.planetClass || b.bioSignals <= 0) return false;
      if (b.personalStatus === "bio_complete" || allBioAnalysed(b)) return false;
      if (bioThreshold > 0 && b.bioValueMax != null) {
        const eff = b.bioValueMax * (!b.wasDiscovered ? 5 : 1);
        if (eff < bioThreshold) return false;
      }
      return true;
    }).sort((a: any, b: any) => (b.bioValueMax ?? 0) - (a.bioValueMax ?? 0))
  );

  function cartoVal(b: any): number {
    return estimateCartoValue({
      bodyType: b.type ?? b.planetClass ?? "",
      terraformable: !!b.terraformable,
      wasDiscovered: !!b.wasDiscovered,
      wasMapped: !!b.wasMapped,
      isFirstDiscoverer: !b.wasDiscovered,
      isFirstMapper: !!b.mappedByUs || !b.wasMapped,
      withDSS: true,
      efficiencyBonus: true,
    });
  }

  // Carto targets: high-value DSS planets (no bio), need mapping
  const POI_TYPES = new Set(["Earthlike body", "Earth-like world", "Water world", "Ammonia world"]);
  const cartoTargets = $derived(
    bodies.filter((b: any) => {
      if (b.starType || !b.planetClass || b.bioSignals > 0) return false;
      if (b.personalStatus === "bio_complete") return false;
      if (POI_TYPES.has(b.type)) return true;
      if (b.terraformable) return true;
      return cartoVal(b) >= cartoThreshold;
    }).sort((a: any, b: any) => cartoVal(b) - cartoVal(a))
  );
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
    !!(bio?.bodyId) || (currentBody != null && currentBody.bioSpeciesPredicted?.length > 0)
  );

  const CLONAL: Record<string, number> = {
    Aleoida: 150, Bacterium: 500, Cactoida: 300, Clypeus: 150, Concha: 150,
    Electricae: 1000, Fonticulua: 500, Frutexa: 150, Fumerola: 100,
    Fungoida: 300, Osseus: 800, Recepta: 150, Stratum: 500, Tubus: 800, Tussock: 200,
  };

  // Status dot: ring = blue if DSS done, fill depends on bio progress
  function statusDot(body: any): { ring: string; fill: string } {
    const dssed = body.mapped || body.personalStatus === "dss";
    const ring = dssed ? "#60a5fa" : "#6b7280"; // blue-400 / gray-500
    let fill = "none";
    if (body.bioSignals > 0) {
      if (body.personalStatus === "bio_complete" || allBioAnalysed(body)) fill = "#4ade80"; // green-400
      else if (body.personalStatus === "landed"
        || body.bioSpeciesPredicted?.some((s: any) => s.confidence === 'scanned' || s.confidence === 'analysed')
      ) fill = "#fbbf24"; // amber-400
    } else {
      if (dssed) fill = "#4ade80"; // green-400
    }
    return { ring, fill };
  }

  /** Get remaining (un-picked) species for a body, filtering out analysed
   *  species AND other species from the same genus as an analysed one. */
  function remainingSpecies(body: any): any[] {
    const preds = body.bioSpeciesPredicted ?? [];
    const doneGenera = new Set<string>();
    for (const s of preds) {
      if (s.confidence === 'analysed') doneGenera.add(s.name.split(" ")[0].toLowerCase());
    }
    return preds.filter((s: any) => {
      const g = s.name.split(" ")[0].toLowerCase();
      return !doneGenera.has(g);
    });
  }

  /** Sum remaining species value (max per genus). */
  function remainingValue(body: any): number {
    const rem = remainingSpecies(body);
    const byGenus = new Map<string, number>();
    for (const s of rem) {
      const g = s.name.split(" ")[0].toLowerCase();
      byGenus.set(g, Math.max(byGenus.get(g) ?? 0, s.value ?? 0));
    }
    let total = 0;
    for (const v of byGenus.values()) total += v;
    return total;
  }

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
      listen("config-state", (e) => { config = e.payload; }),
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

<div class="fixed inset-0 text-xs font-mono text-gray-200 select-none"
     style="background: transparent; opacity: {opacity}">

  <!-- Edge resize zones (no-drag so OS handles resize) -->
  <div class="fixed top-0 left-0 right-0 h-1" style="-webkit-app-region: no-drag; cursor: n-resize"></div>
  <div class="fixed bottom-0 left-0 right-0 h-1" style="-webkit-app-region: no-drag; cursor: s-resize"></div>
  <div class="fixed top-0 left-0 bottom-0 w-1" style="-webkit-app-region: no-drag; cursor: w-resize"></div>
  <div class="fixed top-0 right-0 bottom-0 w-1" style="-webkit-app-region: no-drag; cursor: e-resize"></div>

  <!-- Main content area: draggable for window move -->
  <div class="absolute inset-1 p-1 overflow-hidden" style="-webkit-app-region: drag">

  <!-- Resize handle: bottom-right corner -->
  <div class="fixed bottom-0 right-0 w-5 h-5 opacity-25 hover:opacity-100 transition-opacity cursor-se-resize z-50"
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
    {@const bioMult = currentBody && !currentBody.wasDiscovered ? 5 : 1}
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
          <span class="text-[9px] text-gray-500 shrink-0">{fmtDist(range)}</span>
          {#if !predicted}
            <span class="flex gap-px">
              {#each [0, 1, 2] as j}
                <span class="w-2 h-2 rounded-full inline-block {j < sp.samples ? 'bg-green-500' : 'bg-gray-700'}"></span>
              {/each}
            </span>
          {:else}
            <span class="text-[9px] text-amber-400/60 font-mono">{fmt((sp.value ?? 0) * bioMult)}</span>
          {/if}
        </div>
        {#if active && sp.scanPositions?.length > 0 && lat != null && bodyRadius}
          {@const dists = sp.scanPositions.map((p: any) => haversine(p.latitude, p.longitude, lat, lon, bodyRadius))}
          {@const allFar = dists.every((d: number) => d >= range)}
          <div class="flex gap-1 text-[9px] ml-2 mb-0.5">
            {#each dists as d}
              <span class="font-bold {d >= range ? 'text-green-400' : 'text-red-400'}">{fmtDist(d)}/{fmtDist(range)}</span>
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
      <div class="text-[9px] text-gray-500">{bodies.filter((b: any) => b.starType || b.planetClass).length}/{system?.bodyCount ?? "?"} bodies</div>

      <!-- Bio targets -->
      {#if bioTargets.length > 0}
        <div class="text-green-400 font-bold text-[9px] uppercase tracking-wider mt-1 mb-0.5">Bio targets</div>
        {#each bioTargets.slice(0, 5) as body}
          {@const mult = !body.wasDiscovered ? 5 : 1}
          {@const dot = statusDot(body)}
          {@const remVal = remainingValue(body)}
          {@const remSpecies = remainingSpecies(body)}
          <div class="flex items-center gap-1 py-0.5 text-[10px]">
            <svg class="w-2.5 h-2.5 shrink-0" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke={dot.ring} stroke-width="1.5"/>{#if dot.fill !== 'none'}<circle cx="5" cy="5" r="2.5" fill={dot.fill}/>{/if}</svg>
            <span class="truncate flex-1">{body.shortName}</span>
            <span class="text-green-400 shrink-0">{body.bioSignals}bio</span>
            {#if !body.mapped}<span class="text-blue-400 shrink-0 text-[9px]">DSS</span>{/if}
            {#if body.landable}<span class="text-amber-400 shrink-0 text-[9px]">L</span>{/if}
            {#if remVal > 0}
              <span class="text-green-400/60 font-mono shrink-0">{fmt(remVal * mult)}</span>
            {/if}
          </div>
          <!-- Species list (only remaining, not picked genera) -->
          {#if remSpecies.length > 0}
            {#each remSpecies as sp}
              <div class="flex items-center gap-1 text-[9px] ml-3 leading-tight
                {sp.confidence === 'scanned' ? 'text-green-400' : ''}">
                <span class="truncate flex-1">{sp.name}</span>
                <span class="font-mono shrink-0 text-green-400/50">{fmt(sp.value * mult)}</span>
              </div>
            {/each}
          {/if}
        {/each}
      {/if}

      <!-- Carto targets (DSS) -->
      {#if cartoTargets.length > 0}
        <div class="text-amber-400 font-bold text-[9px] uppercase tracking-wider mt-1 mb-0.5">Map these</div>
        {#each cartoTargets.slice(0, 5) as body}
          {@const val = cartoVal(body)}
          {@const dot = statusDot(body)}
          {@const dssed = body.mapped || body.personalStatus === "dss"}
          <div class="flex items-center gap-1 py-0.5 text-[10px]">
            <svg class="w-2.5 h-2.5 shrink-0" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke={dot.ring} stroke-width="1.5"/>{#if dot.fill !== 'none'}<circle cx="5" cy="5" r="2.5" fill={dot.fill}/>{/if}</svg>
            <span class="truncate flex-1">{body.shortName}</span>
            {#if body.type === "Water world" || body.type === "Ammonia world" || body.type === "Earthlike body" || body.type === "Earth-like world"}
              <span class="text-amber-400 shrink-0 text-[9px]">{body.type === "Water world" ? "WW" : body.type === "Ammonia world" ? "AW" : "ELW"}</span>
            {/if}
            {#if !dssed}<span class="text-blue-400 shrink-0 text-[9px]">DSS</span>{/if}
            <span class="text-amber-400/60 font-mono shrink-0">{fmt(val)}</span>
          </div>
        {/each}
      {/if}
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

  </div><!-- end content area -->
</div>
