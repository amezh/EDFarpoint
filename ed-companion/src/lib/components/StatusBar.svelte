<script lang="ts">
  import { tripStore } from "$lib/stores/trip.svelte";

  const trip = $derived(tripStore.current);

  function formatCredits(value: number): string {
    if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1) + "B";
    if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
    if (value >= 1_000) return (value / 1_000).toFixed(1) + "K";
    return value.toString();
  }
</script>

<div class="flex items-center gap-4 px-4 py-1.5 bg-ed-surface border-b border-ed-border text-sm font-mono">
  <span title="Cartographic value">
    <span class="text-ed-text-muted">CARTO</span>
    <span class="text-ed-amber ml-1">{formatCredits(trip.cartoValue)}</span>
  </span>
  <span title="Exobiology value">
    <span class="text-ed-text-muted">BIO</span>
    <span class="text-ed-green ml-1">{formatCredits(trip.bioValue)}</span>
  </span>
  <span title="Total trip value">
    <span class="text-ed-text-muted">TOTAL</span>
    <span class="text-ed-orange ml-1 font-bold">{formatCredits(trip.cartoValue + trip.bioValue)}</span>
  </span>
  <span class="text-ed-text-muted ml-auto">
    {trip.systemsVisited} sys | {trip.bodiesScanned} scn | {trip.bioSpeciesAnalysed} bio
  </span>
</div>
