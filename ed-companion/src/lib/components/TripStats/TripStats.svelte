<script lang="ts">
  import { configStore } from "$lib/stores/config.svelte";
  import { tripStore } from "$lib/stores/trip.svelte";

  const trip = $derived(tripStore.current);
  const carrierEnabled = $derived(configStore.current?.carrier?.enabled ?? false);

  function fmt(v: number): string {
    if (!Number.isFinite(v)) return "0";
    if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + " B";
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + " M";
    if (v >= 1_000) return (v / 1_000).toFixed(1) + " K";
    return v.toString();
  }

  const totalCarto = $derived(trip.cartoFSSValue + trip.cartoDSSValue);
  const totalBio = $derived(trip.bioValueBase + trip.bioValueBonus);
  const totalValue = $derived(totalCarto + totalBio);
</script>

<div class="ed-card">
  <div class="mb-3">
    <h2 class="text-ed-amber font-bold">Current Exploration Trip</h2>
  </div>

  <div class="flex flex-col gap-3 text-sm">
    <!-- Discovery -->
    <div>
      <div class="text-ed-text-muted text-xs uppercase tracking-wide mb-1">Discovery</div>
      <div class="grid grid-cols-2 gap-x-6 gap-y-1">
        <div class="flex justify-between">
          <span class="text-ed-text-muted">Systems visited</span>
          <span class="font-mono">{trip.systemsVisited}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-ed-text-muted">Stars scanned</span>
          <span class="font-mono">{trip.starsScanned}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-ed-text-muted">Bodies scanned</span>
          <span class="font-mono">{trip.bodiesScanned}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-ed-text-muted">First discoveries</span>
          <span class="font-mono">{trip.firstDiscoveries}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-ed-text-muted">Bodies mapped</span>
          <span class="font-mono">{trip.bodiesMapped}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-ed-text-muted">Distance</span>
          <span class="font-mono">{fmt(trip.distanceTravelled)} LY</span>
        </div>
      </div>
    </div>

    <!-- Cartographic -->
    <div>
      <div class="text-ed-text-muted text-xs uppercase tracking-wide mb-1">Cartographic Data</div>
      <div class="grid grid-cols-1 gap-y-1">
        <div class="flex justify-between">
          <span class="text-ed-text-muted">FSS scan value</span>
          <span class="font-mono text-ed-amber">{fmt(trip.cartoFSSValue)} Cr</span>
        </div>
        <div class="flex justify-between">
          <span class="text-ed-text-muted">DSS mapping bonus</span>
          <span class="font-mono text-ed-amber">{fmt(trip.cartoDSSValue)} Cr</span>
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
          <span class="font-mono">{trip.bioSpeciesAnalysed}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-ed-text-muted">Vista Genomics base</span>
          <span class="font-mono text-ed-green">{fmt(trip.bioValueBase)} Cr</span>
        </div>
        <div class="flex justify-between">
          <span class="text-ed-text-muted">First discovery bonus</span>
          <span class="font-mono text-ed-green">{fmt(trip.bioValueBonus)} Cr</span>
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
      {#if carrierEnabled}
        <div class="flex justify-between mt-1">
          <span class="text-ed-text-muted">Carrier payout</span>
          <span class="font-mono text-ed-dim">{fmt(totalValue * 0.65625)} Cr</span>
        </div>
      {/if}
    </div>
  </div>
</div>
