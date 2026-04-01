<script lang="ts">
  import { bioStore } from "$lib/stores/bio.svelte";
  import { systemStore } from "$lib/stores/system.svelte";

  const tracker = $derived(bioStore.currentPlanet);

  // Show all bodies with bio across the system when not on a planet
  const systemBioBodies = $derived(
    systemStore.current?.bodies.filter((b) => b.bioSignals > 0) ?? []
  );

  function fmt(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
    if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
    return v.toString();
  }

  function sampleLabel(samples: number): string {
    if (samples === 0) return "Not started";
    if (samples === 1) return "1st sample — move away";
    if (samples === 2) return "2nd sample — one more";
    return "Complete";
  }
</script>

{#if tracker && tracker.species.length > 0}
  <!-- Active planet bio tracking -->
  <div class="flex flex-col gap-2">
    <div class="ed-card">
      <div class="flex items-center justify-between">
        <h2 class="text-ed-green font-bold">{tracker.bodyName}</h2>
        <span class="text-xs text-ed-text-muted">{tracker.species.length} species</span>
      </div>
    </div>

    {#each tracker.species as species (species.name)}
      {@const done = species.analysed}
      {@const active = species.samples > 0 && !done}
      <div
        class="rounded-lg p-3 border-l-3 {done ? 'bg-ed-surface/40 border-ed-dim' : active ? 'bg-ed-surface border-ed-green' : 'bg-ed-surface border-ed-border'}"
      >
        <div class="flex items-center justify-between">
          <div>
            <p class="font-semibold text-sm {done ? 'text-ed-dim line-through' : active ? 'text-ed-green' : 'text-ed-text'}">
              {species.localName}
            </p>
            {#if species.value}
              <p class="text-xs {done ? 'text-ed-dim' : 'text-ed-amber'}">
                {fmt(species.value)} Cr
              </p>
            {/if}
          </div>

          <!-- Sample dots -->
          <div class="flex items-center gap-1.5">
            {#each [0, 1, 2] as i}
              <div
                class="w-4 h-4 rounded-full border-2 flex items-center justify-center text-[9px] font-bold
                  {i < species.samples ? 'bg-ed-green border-ed-green text-black' : 'border-ed-dim'}"
              >
                {#if i < species.samples}{i + 1}{/if}
              </div>
            {/each}
          </div>
        </div>

        <!-- Action hint -->
        {#if !done}
          <div class="mt-2 flex items-center justify-between text-xs">
            <span class="{active ? 'text-ed-green' : 'text-ed-text-muted'}">
              {sampleLabel(species.samples)}
            </span>
            {#if species.clonalRange && active}
              <span class="font-mono text-ed-amber font-bold">
                ≥ {species.clonalRange}m apart
              </span>
            {/if}
          </div>
        {/if}
      </div>
    {/each}

    <!-- Summary -->
    {#if tracker.species.every((s) => s.analysed) && tracker.species.length > 0}
      <div class="text-center text-ed-green font-bold text-sm py-2">
        All species complete — safe to leave
      </div>
    {:else}
      <div class="text-center text-xs text-ed-text-muted py-1">
        {tracker.species.filter((s) => s.analysed).length}/{tracker.species.length} species analysed
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
