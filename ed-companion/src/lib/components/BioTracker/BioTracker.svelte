<script lang="ts">
  import { bioStore, haversineDistance, type BioSpecies } from "$lib/stores/bio.svelte";
  import { configStore } from "$lib/stores/config.svelte";
  import { statusStore } from "$lib/stores/status.svelte";
  import { systemStore } from "$lib/stores/system.svelte";
  import { playReady } from "$lib/utils/sounds";

  let readySounded = $state(new Set<string>());

  const tracker = $derived(bioStore.currentPlanet);
  const status = $derived(statusStore.current);
  const bioThreshold = $derived(configStore.current?.bio.value_threshold ?? 0);

  // Find the body data for the current planet (for predictions)
  const currentBody = $derived(
    tracker ? systemStore.current?.bodies.find(b => b.bodyId === tracker.bodyId) ?? null : null
  );

  // Merge predictions with actual scans:
  // - Show all predicted species (even unscanned)
  // - If we've scanned one, update its status from the tracker
  // - If analysed, mark as done
  interface MergedSpecies {
    name: string;
    localName: string;
    genus: string;
    value: number;
    clonalRange: number;
    samples: number; // 0 = predicted only, 1-3 = scanning/done
    analysed: boolean;
    scanPositions: { latitude: number; longitude: number }[];
    predicted: boolean; // true = from predictions, false = only from scan
    aboveThreshold: boolean;
  }

  const mergedSpecies = $derived(buildMerged());

  function buildMerged(): MergedSpecies[] {
    const result: MergedSpecies[] = [];
    const seen = new Set<string>();
    const mult = currentBody && !currentBody.wasDiscovered ? 5 : 1;

    // Start with actual scans from the tracker
    if (tracker) {
      for (const s of tracker.species) {
        const genus = s.genus || s.localName.split(" ")[0];
        const range = s.clonalRange ?? CLONAL_RANGES[genus] ?? 200;
        const value = s.value ?? 0;
        result.push({
          name: s.name,
          localName: s.localName,
          genus,
          value,
          clonalRange: range,
          samples: s.samples,
          analysed: s.analysed,
          scanPositions: s.scanPositions,
          predicted: false,
          aboveThreshold: (value * mult) >= bioThreshold,
        });
        // Use localName for matching since predictions use English names
        seen.add(s.localName.toLowerCase());
        // Also match by genus+species pattern
        const baseName = s.localName.split(" - ")[0].trim();
        seen.add(baseName.toLowerCase());
      }
    }

    // Collect genera already identified by scanning — only one species per genus on a planet
    const confirmedGenera = new Set<string>();
    for (const r of result) {
      if (!r.predicted) confirmedGenera.add(r.genus.toLowerCase());
    }

    // Add predicted species that haven't been scanned yet
    // Skip predictions from genera we've already identified (one per genus rule)
    if (currentBody) {
      for (const pred of currentBody.bioSpeciesPredicted) {
        const key = pred.name.toLowerCase();
        if (seen.has(key)) continue;
        const genus = pred.name.split(" ")[0];
        if (confirmedGenera.has(genus.toLowerCase())) continue; // genus already identified
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
          aboveThreshold: (pred.value * mult) >= bioThreshold,
        });
      }
    }

    // Sort: active scans first, then unscanned predictions by value desc, then completed
    return result.sort((a, b) => {
      if (a.analysed !== b.analysed) return a.analysed ? 1 : -1;
      if ((a.samples > 0) !== (b.samples > 0)) return a.samples > 0 ? -1 : 1;
      return b.value - a.value;
    });
  }

  // Count what matters for "safe to leave"
  const speciesAboveThreshold = $derived(mergedSpecies.filter(s => s.aboveThreshold));
  const allValueableScanned = $derived(speciesAboveThreshold.every(s => s.analysed));
  const scannedCount = $derived(mergedSpecies.filter(s => s.analysed).length);
  const totalCount = $derived(currentBody?.bioSignals ?? mergedSpecies.length);

  // Show all bodies with bio across the system when not on a planet
  const systemBioBodies = $derived(
    systemStore.current?.bodies.filter((b) => b.bioSignals > 0) ?? []
  );

  // Sound effect when distance threshold crossed
  $effect(() => {
    if (!tracker) return;
    for (const species of tracker.species) {
      if (species.analysed || species.samples === 0) continue;
      const dists = distancesToScans(species);
      if (dists.length === 0) continue;
      const range = getClonalRange(species);
      const allFar = dists.every(d => d >= range);
      if (allFar && !readySounded.has(species.name)) {
        readySounded.add(species.name);
        readySounded = new Set(readySounded);
        playReady();
      } else if (!allFar && readySounded.has(species.name)) {
        readySounded.delete(species.name);
        readySounded = new Set(readySounded);
      }
    }
  });

  function fmt(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
    if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
    return v.toString();
  }

  // Fallback clonal ranges by genus when species.clonalRange is null
  const CLONAL_RANGES: Record<string, number> = {
    Aleoida: 150, Bacterium: 500, Cactoida: 300, Clypeus: 150, Concha: 150,
    Electricae: 1000, Fonticulua: 500, Frutexa: 150, Fumerola: 100,
    Fungoida: 300, Osseus: 800, Recepta: 150, Stratum: 500, Tubus: 800, Tussock: 200,
  };

  function getClonalRange(species: BioSpecies): number {
    if (species.clonalRange) return species.clonalRange;
    // Look up by genus name
    const genus = species.genus || species.localName.split(" ")[0];
    return CLONAL_RANGES[genus] ?? 200;
  }

  function sampleLabel(samples: number): string {
    if (samples === 0) return "Not started";
    if (samples === 1) return "1st sample — move away";
    if (samples === 2) return "2nd sample — one more";
    return "Complete";
  }

  /** Distance from current position to each previous scan, in meters */
  function distancesToScans(species: { scanPositions: { latitude: number; longitude: number }[] }): number[] {
    if (species.scanPositions.length === 0) return [];
    if (status.latitude == null || status.longitude == null) return [];
    if (!tracker?.bodyRadius) return [];

    return species.scanPositions.map(pos =>
      haversineDistance(pos.latitude, pos.longitude, status.latitude!, status.longitude!, tracker!.bodyRadius!),
    );
  }


  function fmtDist(meters: number): string {
    if (meters >= 1000) return (meters / 1000).toFixed(1) + " km";
    return Math.round(meters) + " m";
  }
</script>

{#if tracker || (currentBody && currentBody.bioSpeciesPredicted.length > 0)}
  <!-- Active planet bio tracking -->
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between px-1">
      <h2 class="text-ed-green font-bold text-sm">{tracker?.bodyName ?? currentBody?.shortName}</h2>
      <span class="text-[10px] text-ed-text-muted">{scannedCount}/{totalCount} scanned</span>
    </div>

    {#each mergedSpecies as species (species.name)}
      {@const done = species.analysed}
      {@const active = species.samples > 0 && !done}
      {@const predicted = species.predicted && species.samples === 0}
      {@const dists = active ? distancesToScans(species) : []}
      {@const farEnough = dists.length > 0 && dists.every(d => d >= species.clonalRange)}
      {@const mult = currentBody && !currentBody.wasDiscovered ? 5 : 1}

      {#if done}
        <!-- Completed: compact crossed-out row -->
        <div class="flex items-center gap-2 px-2 py-1 rounded bg-ed-surface/20 opacity-35">
          <span class="text-ed-dim text-[10px]">✓</span>
          <span class="text-ed-dim text-xs line-through flex-1">{species.localName}</span>
          <span class="text-ed-dim text-[10px] font-mono">{fmt(species.value * mult)} Cr</span>
        </div>
      {:else if predicted}
        <!-- Predicted but not scanned yet -->
        <div class="flex items-center gap-2 px-2 py-1.5 rounded bg-ed-surface/40 border-l-2 {species.aboveThreshold ? 'border-ed-amber' : 'border-ed-border'}">
          <span class="text-[10px] text-ed-text-muted">?</span>
          <span class="text-xs flex-1 {species.aboveThreshold ? 'text-ed-amber' : 'text-ed-text-muted'}">{species.localName}</span>
          <span class="text-[10px] font-mono {species.aboveThreshold ? 'text-ed-amber' : 'text-ed-text-muted'}">{fmt(species.value * mult)} Cr</span>
          <span class="text-[10px] text-ed-text-muted">{species.clonalRange}m</span>
        </div>
      {:else}
        <!-- Active scan in progress -->
        <div class="rounded p-2 border-l-3 bg-ed-surface border-ed-green">
          <div class="flex items-center justify-between">
            <div>
              <p class="font-semibold text-sm text-ed-green">{species.localName}</p>
              <p class="text-[10px] text-ed-amber">
                {fmt(species.value * mult)} Cr · {species.clonalRange}m range
              </p>
            </div>
            <div class="flex items-center gap-1">
              {#each [0, 1, 2] as i}
                <div class="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center text-[8px] font-bold
                  {i < species.samples ? 'bg-ed-green border-ed-green text-black' : 'border-ed-dim'}">
                  {#if i < species.samples}{i + 1}{/if}
                </div>
              {/each}
            </div>
          </div>

          {#if dists.length > 0}
            <div class="mt-1.5 flex items-center gap-1.5 text-[10px]">
              {#each dists as d}
                <span class="font-mono font-bold px-1 py-0.5 rounded {d >= species.clonalRange ? 'bg-ed-green/20 text-ed-green' : 'bg-red-900/30 text-red-400'}">
                  {fmtDist(d)}
                </span>
              {/each}
              <span class="ml-auto font-bold {farEnough ? 'text-ed-green' : 'text-red-400'}">
                {farEnough ? "Scan!" : "Move away"}
              </span>
            </div>
          {:else}
            <div class="mt-1.5 text-[10px] text-ed-amber">{sampleLabel(species.samples)}</div>
          {/if}
        </div>
      {/if}
    {/each}

    <!-- Summary -->
    {#if allValueableScanned && scannedCount >= totalCount}
      <div class="text-center text-ed-green font-bold text-xs py-1">
        All complete — safe to leave
      </div>
    {:else if allValueableScanned}
      <div class="text-center text-ed-amber text-xs py-1">
        Valuable species done — {totalCount - scannedCount} low-value remaining
      </div>
    {:else}
      <div class="text-center text-[10px] text-ed-text-muted py-1">
        {scannedCount}/{totalCount} · {speciesAboveThreshold.filter(s => !s.analysed).length} valuable unscanned
      </div>
    {/if}
  </div>
{:else}
  <!-- System bio overview when not on a planet -->
  <div class="flex flex-col gap-2">
    {#if systemBioBodies.length > 0}
      <div class="text-xs text-ed-green font-bold uppercase tracking-wider px-1">
        Bio signals in system
      </div>
      {#each systemBioBodies as body (body.bodyId)}
        <div class="ed-card flex items-center justify-between py-2">
          <div>
            <p class="font-mono text-sm">{body.shortName}</p>
            <p class="text-xs text-ed-text-muted">
              {body.type} · {body.gravity?.toFixed(1)}g · {body.atmosphere || "No atmo"}
            </p>
          </div>
          <div class="text-right">
            <p class="text-sm font-mono text-ed-green font-bold">{body.bioSignals} bio</p>
            <p class="text-xs text-ed-text-muted">
              {body.distanceLs?.toFixed(0)} LS
            </p>
          </div>
        </div>
      {/each}
    {:else}
      <div class="ed-card text-ed-text-muted text-center py-8">
        <p>No bio signals in this system</p>
        <p class="text-xs mt-2">Approach a planet with bio signals to begin tracking</p>
      </div>
    {/if}
  </div>
{/if}
