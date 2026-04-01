<script lang="ts">
  import { lifetimeStore } from "$lib/stores/lifetime.svelte";

  const stats = $derived(lifetimeStore.current);

  function fmt(v: number): string {
    if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + " B";
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + " M";
    if (v >= 1_000) return (v / 1_000).toFixed(1) + " K";
    return v.toString();
  }

  const totalCarto = $derived(stats.totalCartoFSS + stats.totalCartoDSS);
  const totalBio = $derived(stats.totalBioBase + stats.totalBioBonus);
  const totalValue = $derived(totalCarto + totalBio);
</script>

<div class="ed-card">
  <h2 class="text-ed-amber font-bold mb-3">Entire Exploration History</h2>

  <div class="flex flex-col gap-3 text-sm">
    <!-- Discovery -->
    <div>
      <div class="text-ed-text-muted text-xs uppercase tracking-wide mb-1">Discovery</div>
      <div class="grid grid-cols-2 gap-x-6 gap-y-1">
        <div class="flex justify-between">
          <span class="text-ed-text-muted">Systems visited</span>
          <span class="font-mono">{stats.totalSystems}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-ed-text-muted">Stars scanned</span>
          <span class="font-mono">{stats.totalStarsScanned}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-ed-text-muted">Bodies scanned</span>
          <span class="font-mono">{stats.totalBodiesScanned}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-ed-text-muted">Bodies mapped</span>
          <span class="font-mono">{stats.totalBodiesMapped}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-ed-text-muted">Distance</span>
          <span class="font-mono">{fmt(stats.totalDistanceLy)} LY</span>
        </div>
      </div>
    </div>

    <!-- Cartographic -->
    <div>
      <div class="text-ed-text-muted text-xs uppercase tracking-wide mb-1">Cartographic Data</div>
      <div class="grid grid-cols-1 gap-y-1">
        <div class="flex justify-between">
          <span class="text-ed-text-muted">FSS scan value</span>
          <span class="font-mono text-ed-amber">{fmt(stats.totalCartoFSS)} Cr</span>
        </div>
        <div class="flex justify-between">
          <span class="text-ed-text-muted">DSS mapping bonus</span>
          <span class="font-mono text-ed-amber">{fmt(stats.totalCartoDSS)} Cr</span>
        </div>
        <div class="flex justify-between font-semibold">
          <span class="text-ed-text-muted">Carto total</span>
          <span class="font-mono text-ed-amber">{fmt(totalCarto)} Cr</span>
        </div>
      </div>
    </div>

    <!-- Exobiology -->
    <div>
      <div class="text-ed-text-muted text-xs uppercase tracking-wide mb-1">Exobiology</div>
      <div class="grid grid-cols-1 gap-y-1">
        <div class="flex justify-between">
          <span class="text-ed-text-muted">Species analysed</span>
          <span class="font-mono">{stats.totalBioSpecies}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-ed-text-muted">Vista Genomics base</span>
          <span class="font-mono text-ed-green">{fmt(stats.totalBioBase)} Cr</span>
        </div>
        <div class="flex justify-between">
          <span class="text-ed-text-muted">First discovery bonus</span>
          <span class="font-mono text-ed-green">{fmt(stats.totalBioBonus)} Cr</span>
        </div>
        <div class="flex justify-between font-semibold">
          <span class="text-ed-text-muted">Bio total</span>
          <span class="font-mono text-ed-green">{fmt(totalBio)} Cr</span>
        </div>
      </div>
    </div>

    <!-- Total -->
    <div class="pt-2 border-t border-ed-border">
      <div class="flex justify-between">
        <span class="text-ed-orange font-bold">Estimated Total Value</span>
        <span class="font-mono text-ed-orange font-bold text-base">{fmt(totalValue)} Cr</span>
      </div>
      {#if stats.rarestSpecies}
        <div class="flex justify-between mt-1 text-xs">
          <span class="text-ed-text-muted">Rarest species</span>
          <span class="font-mono text-ed-green">{stats.rarestSpecies} ({fmt(stats.rarestSpeciesValue)} Cr)</span>
        </div>
      {/if}
    </div>
  </div>
</div>
