<script lang="ts">
  import { systemStore, type Body } from "$lib/stores/system.svelte";
  import { estimateCartoValue } from "$lib/utils/valueCalc";

  const system = $derived(systemStore.current);

  // Split bodies into action categories
  const valuableBio = $derived(
    system?.bodies
      .filter((b) => b.bioSignals > 0 && b.personalStatus !== "bio_complete")
      .sort((a, b) => (b.bioSignals) - (a.bioSignals)) ?? []
  );

  const valuableCarto = $derived(
    system?.bodies
      .filter(
        (b) =>
          !b.starType &&
          (b.terraformable ||
            b.type === "Earthlike body" ||
            b.type === "Earth-like world" ||
            b.type === "Water world" ||
            b.type === "Ammonia world"),
      )
      .sort((a, b) => {
        const va = estimateCartoValue({ bodyType: a.type, terraformable: a.terraformable, wasDiscovered: a.wasDiscovered, wasMapped: a.wasMapped, withDSS: true });
        const vb = estimateCartoValue({ bodyType: b.type, terraformable: b.terraformable, wasDiscovered: b.wasDiscovered, wasMapped: b.wasMapped, withDSS: true });
        return vb - va;
      }) ?? []
  );

  const completedBio = $derived(
    system?.bodies.filter((b) => b.personalStatus === "bio_complete") ?? []
  );

  const otherBodies = $derived(
    system?.bodies.filter(
      (b) =>
        !b.starType &&
        b.bioSignals === 0 &&
        !b.terraformable &&
        b.type !== "Earthlike body" &&
        b.type !== "Earth-like world" &&
        b.type !== "Water world" &&
        b.type !== "Ammonia world",
    ) ?? []
  );

  const fssScanned = $derived(system?.bodies.filter((b) => !b.starType).length ?? 0);

  function fmt(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
    if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
    return v.toString();
  }

  function bodyValue(b: Body): number {
    return estimateCartoValue({
      bodyType: b.type,
      terraformable: b.terraformable,
      wasDiscovered: b.wasDiscovered,
      wasMapped: b.wasMapped,
      withDSS: !b.mapped,
    });
  }

  function statusIcon(b: Body): string {
    if (b.personalStatus === "bio_complete") return "✓";
    if (b.personalStatus === "dss") return "◉";
    if (b.personalStatus === "landed") return "▼";
    return "○";
  }

  function statusColor(b: Body): string {
    if (b.personalStatus === "bio_complete") return "text-ed-green";
    if (b.personalStatus === "dss") return "text-ed-blue";
    if (b.personalStatus === "landed") return "text-ed-amber";
    return "text-ed-dim";
  }

  function typeShort(t: string): string {
    const map: Record<string, string> = {
      "Earthlike body": "ELW",
      "Earth-like world": "ELW",
      "Water world": "WW",
      "Ammonia world": "AW",
      "High metal content body": "HMC",
      "Metal rich body": "MR",
      "Rocky body": "Rocky",
      "Rocky ice body": "R-Ice",
      "Icy body": "Icy",
    };
    return map[t] ?? t.replace(/ body$/i, "").replace(/Sudarsky class /i, "");
  }
</script>

{#if system}
  <div class="flex flex-col gap-2">
    <!-- System header -->
    <div class="ed-card">
      <div class="flex items-center justify-between">
        <h2 class="text-ed-amber font-bold text-base">{system.name}</h2>
        <span class="text-xs text-ed-text-muted">
          {system.distanceFromSol?.toFixed(0)} LY
        </span>
      </div>
      <div class="flex items-center gap-3 mt-1 text-xs text-ed-text-muted">
        <span>FSS {fssScanned}/{system.bodyCount ?? "?"}</span>
        {#if system.fssProgress > 0 && system.fssProgress < 1}
          <span>{(system.fssProgress * 100).toFixed(0)}%</span>
        {/if}
        {#if !system.firstDiscovery}
          <span class="text-ed-amber">UNDISCOVERED</span>
        {/if}
      </div>
    </div>

    <!-- ACTION: Bio targets (most important) -->
    {#if valuableBio.length > 0}
      <div class="mt-1">
        <div class="text-xs text-ed-green font-bold uppercase tracking-wider px-1 mb-1">
          Bio targets — scan these
        </div>
        {#each valuableBio as body (body.bodyId)}
          <div
            class="flex items-center gap-2 px-3 py-1.5 rounded mb-0.5 bg-ed-surface/80 border-l-2 border-ed-green"
          >
            <span class="text-xs w-3 {statusColor(body)}">{statusIcon(body)}</span>
            <span class="font-mono text-sm flex-1 truncate">{body.shortName}</span>
            <span class="text-xs text-ed-text-muted">{typeShort(body.type)}</span>
            <span class="text-xs text-ed-text-muted">{body.gravity?.toFixed(1)}g</span>
            <span class="text-xs font-mono text-ed-green font-bold">{body.bioSignals} bio</span>
            {#if !body.mapped}
              <span class="text-[10px] bg-ed-green/20 text-ed-green px-1 rounded">DSS</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <!-- ACTION: Valuable carto targets -->
    {#if valuableCarto.length > 0}
      <div class="mt-1">
        <div class="text-xs text-ed-amber font-bold uppercase tracking-wider px-1 mb-1">
          Map these — high value
        </div>
        {#each valuableCarto as body (body.bodyId)}
          <div
            class="flex items-center gap-2 px-3 py-1.5 rounded mb-0.5 bg-ed-surface/80 border-l-2 border-ed-amber"
          >
            <span class="text-xs w-3 {statusColor(body)}">{statusIcon(body)}</span>
            <span class="font-mono text-sm flex-1 truncate">{body.shortName}</span>
            <span class="text-xs text-ed-amber">{typeShort(body.type)}</span>
            <span class="text-xs text-ed-text-muted">{body.distanceLs?.toFixed(0)} LS</span>
            <span class="text-xs font-mono text-ed-amber">~{fmt(bodyValue(body))} Cr</span>
            {#if !body.mapped}
              <span class="text-[10px] bg-ed-amber/20 text-ed-amber px-1 rounded">DSS</span>
            {:else}
              <span class="text-[10px] text-ed-dim">mapped</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <!-- DONE: Completed bio -->
    {#if completedBio.length > 0}
      <div class="mt-1">
        <div class="text-xs text-ed-dim font-bold uppercase tracking-wider px-1 mb-1">
          Completed
        </div>
        {#each completedBio as body (body.bodyId)}
          <div class="flex items-center gap-2 px-3 py-1 rounded mb-0.5 text-ed-dim">
            <span class="text-xs w-3">✓</span>
            <span class="font-mono text-sm flex-1 truncate">{body.shortName}</span>
            <span class="text-xs">{body.bioSignals} bio</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Other bodies (collapsed by default) -->
    {#if otherBodies.length > 0}
      <details class="mt-1">
        <summary class="text-xs text-ed-text-muted cursor-pointer px-1 py-1 hover:text-ed-text">
          {otherBodies.length} other bodies
        </summary>
        {#each otherBodies as body (body.bodyId)}
          <div class="flex items-center gap-2 px-3 py-1 rounded mb-0.5 text-ed-text-muted text-xs">
            <span class="font-mono flex-1 truncate">{body.shortName}</span>
            <span>{typeShort(body.type)}</span>
            <span>{body.distanceLs?.toFixed(0)} LS</span>
            {#if body.landable}
              <span class="text-ed-dim">land</span>
            {/if}
          </div>
        {/each}
      </details>
    {/if}
  </div>
{:else}
  <div class="ed-card text-ed-text-muted text-center py-8">
    <p>Waiting for system data...</p>
    <p class="text-xs mt-2">Jump to a system or start the game</p>
  </div>
{/if}
