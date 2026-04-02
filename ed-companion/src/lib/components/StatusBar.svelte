<script lang="ts">
  import { tripStore } from "$lib/stores/trip.svelte";

  const trip = $derived(tripStore.current);
  const totalCarto = $derived(trip.cartoFSSValue + trip.cartoDSSValue);
  const totalBio = $derived(trip.bioValueBase + trip.bioValueBonus);
  const totalValue = $derived(totalCarto + totalBio);
  const crPerHour = $derived(
    trip.playTimeSeconds > 60 ? totalValue / (trip.playTimeSeconds / 3600) : 0
  );

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
    <span class="text-ed-amber ml-1">{formatCredits(totalCarto)}</span>
  </span>
  <span title="Exobiology value">
    <span class="text-ed-text-muted">BIO</span>
    <span class="text-ed-green ml-1">{formatCredits(totalBio)}</span>
  </span>
  <span title="Total trip value">
    <span class="text-ed-text-muted">TOTAL</span>
    <span class="text-ed-orange ml-1 font-bold">{formatCredits(totalValue)}</span>
  </span>
  {#if crPerHour > 0}
    <span title="Credits per hour of active play">
      <span class="text-ed-text-muted">Cr/h</span>
      <span class="text-ed-cyan ml-1">{formatCredits(crPerHour)}</span>
    </span>
  {/if}
  <span class="text-ed-text-muted ml-auto">
    {trip.systemsVisited} sys | {trip.bodiesScanned} scn | {trip.bioSpeciesAnalysed} bio
  </span>
</div>
