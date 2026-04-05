<script lang="ts">
  import { bioStore, haversineDistance } from "$lib/stores/bio.svelte";
  import { configStore } from "$lib/stores/config.svelte";
  import { statusStore } from "$lib/stores/status.svelte";
  import { systemStore } from "$lib/stores/system.svelte";
  import { buildMergedSpecies, formatCredits, formatDistance, getClonalRange } from "$lib/utils/overlayCalc";
  import { playReady } from "$lib/utils/sounds";

  let readySounded = $state(new Set<string>());

  const tracker = $derived(bioStore.currentPlanet);
  const status = $derived(statusStore.current);
  const bioThreshold = $derived(configStore.current?.bio.value_threshold ?? 0);

  // Find the body data for the current planet (for predictions)
  const currentBody = $derived(
    tracker ? systemStore.current?.bodies.find(b => b.bodyId === tracker.bodyId) ?? null : null
  );

  const mergedSpecies = $derived(buildMergedSpecies(tracker, currentBody, bioThreshold));

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

  const fmt = formatCredits;
  const fmtDist = formatDistance;

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
      {@const farEnough = dists.length > 0 && dists.every(d => d >= (species.clonalRange ?? 200))}
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
