<script lang="ts">
  import { tripStore } from "$lib/stores/trip.svelte";

  const trip = $derived(tripStore.current);

  function fmt(v: number): string {
    if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + " B";
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + " M";
    if (v >= 1_000) return (v / 1_000).toFixed(1) + " K";
    return v.toString();
  }
</script>

<div class="ed-card">
  <div class="flex items-center justify-between mb-3">
    <h2 class="text-ed-amber font-bold">Trip Stats</h2>
    <button class="ed-btn text-xs" onclick={() => tripStore.reset()}>Reset</button>
  </div>

  <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
    <div class="flex justify-between">
      <span class="text-ed-text-muted">Systems</span>
      <span class="font-mono">{trip.systemsVisited}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-ed-text-muted">Bodies scanned</span>
      <span class="font-mono">{trip.bodiesScanned}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-ed-text-muted">Bodies mapped</span>
      <span class="font-mono">{trip.bodiesMapped}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-ed-text-muted">First discoveries</span>
      <span class="font-mono">{trip.firstDiscoveries}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-ed-text-muted">Carto value</span>
      <span class="font-mono text-ed-amber">{fmt(trip.cartoValue)} Cr</span>
    </div>
    <div class="flex justify-between">
      <span class="text-ed-text-muted">Bio value</span>
      <span class="font-mono text-ed-green">{fmt(trip.bioValue)} Cr</span>
    </div>
    <div class="flex justify-between">
      <span class="text-ed-text-muted">Bio species</span>
      <span class="font-mono">{trip.bioSpeciesAnalysed}</span>
    </div>
    <div class="flex justify-between col-span-2 pt-2 border-t border-ed-border">
      <span class="text-ed-text-muted font-semibold">Total</span>
      <span class="font-mono text-ed-orange font-bold">{fmt(trip.cartoValue + trip.bioValue)} Cr</span>
    </div>
  </div>
</div>
