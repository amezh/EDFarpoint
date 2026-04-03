<script lang="ts">
  import { configStore } from "$lib/stores/config.svelte";
  import { systemStore, type Body } from "$lib/stores/system.svelte";
  import { formatCredits } from "$lib/utils/bioPredict";
  import { estimateCartoValue } from "$lib/utils/valueCalc";
  import SystemMap from "./SystemMap.svelte";

  let viewMode: "cards" | "map" = $state("cards");

  const CLONAL: Record<string, number> = {
    Aleoida: 150, Bacterium: 500, Cactoida: 300, Clypeus: 150, Concha: 150,
    Electricae: 1000, Fonticulua: 500, Frutexa: 150, Fumerola: 100,
    Fungoida: 300, Osseus: 800, Recepta: 150, Stratum: 500, Tubus: 800, Tussock: 200,
  };

  const system = $derived(systemStore.current);
  const bioThreshold = $derived(configStore.current?.bio.value_threshold ?? 0);
  const dimBelowThreshold = $derived(configStore.current?.bio.dim_below_threshold ?? false);

  const allBio = $derived(
    system?.bodies
      .filter((b) => b.bioSignals > 0)
      .sort((a, b) => {
        // completed bodies go to end
        const ac = a.personalStatus === "bio_complete" ? 1 : 0;
        const bc = b.personalStatus === "bio_complete" ? 1 : 0;
        if (ac !== bc) return ac - bc;
        const va = b.bioValueMax ?? 0;
        const vb = a.bioValueMax ?? 0;
        if (va !== vb) return va - vb;
        return b.bioSignals - a.bioSignals;
      }) ?? []
  );

  function effectiveMax(b: Body): number | null {
    if (b.bioValueMax == null) return null;
    return b.bioValueMax * (!b.wasDiscovered ? 5 : 1);
  }
  const valuableBio = $derived(
    bioThreshold > 0
      ? allBio.filter((b) => effectiveMax(b) == null || effectiveMax(b)! >= bioThreshold)
      : allBio
  );
  const lowValueBio = $derived(
    bioThreshold > 0
      ? allBio.filter((b) => effectiveMax(b) != null && effectiveMax(b)! < bioThreshold)
      : []
  );

  const poi = $derived(configStore.current?.poi);

  function isPoiBody(b: Body): boolean {
    if (b.starType) return false;
    if (["Earthlike body", "Earth-like world", "Water world", "Ammonia world"].includes(b.type)) return true;
    if (b.terraformable && (poi?.show_terraformable ?? true)) return true;
    if (b.rings.length > 0 && (poi?.show_rings ?? true)) return true;
    const val = estimateCartoValue({ bodyType: b.type, terraformable: b.terraformable, wasDiscovered: b.wasDiscovered, wasMapped: b.wasMapped, withDSS: true });
    if (val >= (poi?.min_carto_value ?? 2000000)) return true;
    return false;
  }

  const valuableCarto = $derived(
    system?.bodies
      .filter((b) => isPoiBody(b) && b.bioSignals === 0)
      .sort((a, b) => {
        const va = estimateCartoValue({ bodyType: a.type, terraformable: a.terraformable, wasDiscovered: a.wasDiscovered, wasMapped: a.wasMapped, withDSS: true });
        const vb = estimateCartoValue({ bodyType: b.type, terraformable: b.terraformable, wasDiscovered: b.wasDiscovered, wasMapped: b.wasMapped, withDSS: true });
        return vb - va;
      }) ?? []
  );

  const otherBodies = $derived(
    system?.bodies.filter(
      (b) => !b.starType && b.bioSignals === 0 && b.personalStatus !== "bio_complete" && !isPoiBody(b),
    ) ?? []
  );

  const fssScanned = $derived(system?.bodies.filter((b) => b.starType || b.planetClass).length ?? 0);
  const totalBodies = $derived(system?.bodyCount ?? 0);
  const explorationPct = $derived(totalBodies > 0 ? Math.round((fssScanned / totalBodies) * 100) : 0);

  function fmt(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
    if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
    return v.toString();
  }

  function bodyValue(b: Body): number {
    return estimateCartoValue({ bodyType: b.type, terraformable: b.terraformable, wasDiscovered: b.wasDiscovered, wasMapped: b.wasMapped, withDSS: !b.mapped });
  }

  /** Compute bio value range including confirmed (analysed) species.
   *  Analysed species contribute their exact value to both min and max.
   *  Remaining genera contribute min/max of their candidates. */
  function liveBioRange(b: Body): { min: number; max: number } | null {
    const preds = b.bioSpeciesPredicted;
    if (!preds || preds.length === 0) return null;
    let min = 0, max = 0;
    // Add confirmed (analysed) species values
    const doneGenera = new Set<string>();
    for (const s of preds) {
      if (s.confidence === 'analysed') {
        doneGenera.add(s.name.split(" ")[0].toLowerCase());
        min += s.value;
        max += s.value;
      }
    }
    // Add remaining (unresolved) genera min/max
    const remaining = preds.filter((s: any) => {
      const g = s.name.split(" ")[0].toLowerCase();
      return !doneGenera.has(g);
    });
    const byGenus = new Map<string, number[]>();
    for (const s of remaining) {
      const g = s.name.split(" ")[0].toLowerCase();
      if (!byGenus.has(g)) byGenus.set(g, []);
      byGenus.get(g)!.push(s.value);
    }
    for (const vals of byGenus.values()) {
      min += Math.min(...vals);
      max += Math.max(...vals);
    }
    return { min, max };
  }

  function statusIcon(b: Body): string {
    if (b.personalStatus === "bio_complete") return "●";
    if (b.personalStatus === "landed") return "▼";
    if (b.personalStatus === "dss") return "◉";
    if (b.personalStatus === "visited") return "◎";
    return "○";
  }

  function statusColor(b: Body): string {
    if (b.personalStatus === "bio_complete") return "text-ed-green";
    if (b.personalStatus === "landed") return "text-ed-amber";
    if (b.personalStatus === "dss") return "text-ed-blue";
    if (b.personalStatus === "visited") return "text-ed-cyan";
    return "text-ed-dim";
  }

  function mapColor(b: Body): string {
    if (b.mappedByUs) return "text-ed-green";
    if (b.mapped) return "text-ed-blue";
    if (b.wasMapped) return "text-ed-text-muted";
    return "";
  }

  function mapLabel(b: Body): string {
    if (b.mappedByUs) return "1st map";
    if (b.mapped) return "mapped";
    if (b.wasMapped) return "prev mapped";
    return "";
  }

  function typeShort(t: string): string {
    const map: Record<string, string> = {
      "Earthlike body": "ELW", "Earth-like world": "ELW", "Water world": "WW",
      "Ammonia world": "AW", "High metal content body": "HMC", "High metal content world": "HMC",
      "Metal rich body": "MR", "Rocky body": "Rocky", "Rocky ice body": "R-Ice",
      "Rocky Ice world": "R-Ice", "Icy body": "Icy",
    };
    return map[t] ?? t.replace(/ body$/i, "").replace(/Sudarsky class /i, "");
  }
</script>

{#if system}
  <div class="flex flex-col h-full">
  <!-- System header with view toggle -->
  <div class="flex items-center gap-3 mb-2 px-1 shrink-0">
    <h2 class="text-ed-amber font-bold">{system.name}</h2>
    <span class="text-[10px] text-ed-text-muted">{system.distanceFromSol?.toFixed(0)} LY</span>
    <span class="text-[10px] text-ed-text-muted">FSS {fssScanned}/{system.bodyCount ?? "?"}</span>
    {#if totalBodies > 0}
      <span class="text-[10px] text-ed-text-muted">{explorationPct}%</span>
    {/if}
    {#if !system.firstDiscovery}
      <span class="text-[10px] text-ed-amber font-bold">UNDISCOVERED</span>
    {/if}
    <div class="ml-auto flex gap-0.5">
      <button class="text-[10px] px-1.5 py-0.5 rounded transition-colors"
              class:bg-ed-amber={viewMode === "cards"} class:text-black={viewMode === "cards"}
              class:text-ed-text-muted={viewMode !== "cards"}
              onclick={() => viewMode = "cards"}>Cards</button>
      <button class="text-[10px] px-1.5 py-0.5 rounded transition-colors"
              class:bg-ed-amber={viewMode === "map"} class:text-black={viewMode === "map"}
              class:text-ed-text-muted={viewMode !== "map"}
              onclick={() => viewMode = "map"}>Map</button>
    </div>
  </div>

  {#if viewMode === "map"}
    <div class="flex-1 min-h-0">
      <SystemMap />
    </div>
  {:else}
  <div class="flex-1 min-h-0 overflow-y-auto">

  <!-- BIO TARGETS — card grid -->
  {#if valuableBio.length > 0 || lowValueBio.length > 0}
    <div class="text-[10px] text-ed-green font-bold uppercase tracking-wider px-1 mb-1">
      Bio targets — land &amp; scan
    </div>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-1.5 mb-3">
      {#each [...valuableBio, ...lowValueBio] as body (body.bodyId)}
        {@const mult = !body.wasDiscovered ? 5 : 1}
        {@const isLow = lowValueBio.includes(body)}
        {@const allAnalysed = body.bioSpeciesPredicted.length > 0 && body.bioSpeciesPredicted.every((s: any) => s.confidence === 'analysed')}
        {@const liveRange = liveBioRange(body)}
        {@const doneGenera = new Set(body.bioSpeciesPredicted.filter((s: any) => s.confidence === 'analysed').map((s: any) => s.name.split(" ")[0].toLowerCase()))}
        <div class="rounded border border-ed-green/30 bg-ed-bg/80 p-2"
             class:opacity-40={isLow && dimBelowThreshold}>
          <!-- Name + type -->
          <div class="flex items-center gap-1 mb-0.5">
            <span class="{statusColor(body)} text-[10px]">{statusIcon(body)}</span>
            <span class="font-mono font-bold text-xs">{body.shortName}</span>
            <span class="text-[10px] text-ed-text-muted ml-auto">{typeShort(body.type)} {body.gravity?.toFixed(1)}g</span>
          </div>
          <!-- Tags -->
          <div class="flex items-center gap-1 flex-wrap mb-0.5 text-[10px]">
            <span class="text-ed-green font-bold">{body.bioSignals} bio</span>
            {#if !body.wasDiscovered}<span class="text-ed-amber font-bold">1st</span>{/if}
            <span class="text-ed-text-muted">{body.distanceLs?.toFixed(0)} Ls</span>
            {#if !body.mapped}
              <span class="bg-ed-green/20 text-ed-green px-0.5 rounded">DSS</span>
            {:else if mapLabel(body)}
              <span class="{mapColor(body)}">{mapLabel(body)}</span>
            {/if}
            {#if body.personalStatus !== "landed" && body.personalStatus !== "dss"}
              <span class="bg-ed-amber/20 text-ed-amber px-0.5 rounded">LAND</span>
            {/if}
            {#if body.rings.length > 0}
              <span class="text-ed-cyan">{body.rings.length}R</span>
            {/if}
          </div>
          <!-- Value -->
          {#if liveRange}
            <div class="text-[10px] font-mono mb-0.5 {allAnalysed ? 'text-ed-amber' : 'text-ed-green/70'}">
              {#if liveRange.min === liveRange.max}
                {formatCredits(liveRange.min * mult)} Cr
              {:else}
                ~{formatCredits(liveRange.min * mult)} – {formatCredits(liveRange.max * mult)} Cr
              {/if}
              {#if !body.wasDiscovered}<span class="text-ed-amber">(5x)</span>{/if}
              {#if allAnalysed}<span class="text-ed-amber"> ✓</span>{/if}
            </div>
          {:else}
            <div class="text-[10px] text-ed-text-muted italic mb-0.5">predicting...</div>
          {/if}
          <!-- Species -->
          {#if body.bioSpeciesPredicted.length > 0}
            {#each body.bioSpeciesPredicted.filter((s: any) => { const g = s.name.split(" ")[0].toLowerCase(); return s.confidence === 'analysed' || !doneGenera.has(g); }) as species}
              <div class="flex items-center gap-1 text-[10px] leading-tight
                {species.confidence === 'analysed' ? 'opacity-30 line-through' : species.confidence === 'scanned' ? 'text-ed-green' : species.confidence === 'low' ? 'opacity-40' : ''}">
                {#if species.confidence === "analysed"}
                  <span class="shrink-0">✓</span>
                {:else if species.confidence === "scanned"}
                  <span class="shrink-0 text-ed-green">●</span>
                {/if}
                <span class="truncate flex-1">{species.name}</span>
                <span class="font-mono shrink-0 {species.confidence === 'analysed' ? 'text-ed-amber' : 'text-ed-green/50'}">{formatCredits(species.value * mult)}</span>
                <span class="text-ed-text-muted shrink-0">{CLONAL[species.name.split(' ')[0]] ?? species.clonal_range}m</span>
              </div>
            {/each}
          {/if}
          <!-- Discoverer -->
          {#if body.edsmDiscoverer}
            <div class="text-[9px] text-ed-text-muted mt-0.5 truncate">{body.edsmDiscoverer}</div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- CARTO TARGETS — card grid -->
  {#if valuableCarto.length > 0}
    <div class="text-[10px] text-ed-amber font-bold uppercase tracking-wider px-1 mb-1">
      Map these — high value
    </div>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-1.5 mb-3">
      {#each valuableCarto as body (body.bodyId)}
        <div class="rounded border border-ed-amber/30 bg-ed-bg/80 p-2">
          <div class="flex items-center gap-1 mb-0.5">
            <span class="{statusColor(body)} text-[10px]">{statusIcon(body)}</span>
            <span class="font-mono font-bold text-xs">{body.shortName}</span>
            <span class="text-[10px] text-ed-amber ml-auto">{typeShort(body.type)}</span>
          </div>
          <div class="flex items-center gap-1 flex-wrap text-[10px]">
            <span class="font-mono text-ed-amber font-bold">~{fmt(bodyValue(body))} Cr</span>
            <span class="text-ed-text-muted">{body.distanceLs?.toFixed(0)} Ls</span>
            {#if !body.wasDiscovered}<span class="text-ed-amber">1st</span>{/if}
            {#if body.terraformable}<span class="text-ed-green">terra</span>{/if}
            {#if body.rings.length > 0}<span class="text-ed-cyan">{body.rings.length}R</span>{/if}
            {#if !body.mapped}
              <span class="bg-ed-amber/20 text-ed-amber px-0.5 rounded">DSS</span>
            {:else if mapLabel(body)}
              <span class="{mapColor(body)}">{mapLabel(body)}</span>
            {/if}
          </div>
          {#if body.edsmDiscoverer}
            <div class="text-[9px] text-ed-text-muted mt-0.5 truncate">{body.edsmDiscoverer}</div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}



  <!-- OTHER BODIES — always open, compact card grid -->
  {#if otherBodies.length > 0}
    <div class="text-[10px] text-ed-text-muted font-bold uppercase tracking-wider px-1 mb-1">
      {otherBodies.length} other bodies
    </div>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1">
      {#each otherBodies as body (body.bodyId)}
        <div class="text-[10px] text-ed-text-muted bg-ed-bg/40 rounded px-2 py-1 flex items-center gap-1">
          <span class="font-mono truncate flex-1">{body.shortName}</span>
          <span>{typeShort(body.type)}</span>
          {#if !body.wasDiscovered}<span class="text-ed-amber">1st</span>{/if}
          {#if body.rings.length > 0}<span class="text-ed-cyan">{body.rings.length}R</span>{/if}
          {#if bodyValue(body) > 0}<span class="font-mono">~{fmt(bodyValue(body))}</span>{/if}
        </div>
      {/each}
    </div>
  {/if}

  </div><!-- end cards scroll container -->
  {/if}<!-- end cards/map toggle -->
  </div><!-- end flex column -->
{:else}
  <div class="text-ed-text-muted text-center py-8">
    <p>Waiting for system data...</p>
    <p class="text-xs mt-2">Jump to a system or load into the game</p>
  </div>
{/if}
