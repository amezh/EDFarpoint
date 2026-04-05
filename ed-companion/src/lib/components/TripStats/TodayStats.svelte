<script lang="ts">
  import { configStore } from "$lib/stores/config.svelte";
  import { last24hStore } from "$lib/stores/session.svelte";

  const today = $derived(last24hStore.current);
  const carrierEnabled = $derived(configStore.current?.carrier?.enabled ?? false);

  function fmt(v: number): string {
    if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + " B";
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + " M";
    if (v >= 1_000) return (v / 1_000).toFixed(1) + " K";
    return v.toString();
  }

  function fmtTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  const totalCarto = $derived(today.cartoFSSValue + today.cartoDSSValue);
  const totalBio = $derived(today.bioValueBase + today.bioValueBonus);
  const totalValue = $derived(totalCarto + totalBio);
  const crPerHour = $derived(
    today.playTimeSeconds > 60 ? totalValue / (today.playTimeSeconds / 3600) : 0
  );
</script>

<div class="ed-card">
  <div class="flex items-center justify-between mb-2">
    <h2 class="text-ed-cyan font-bold">Last 24h</h2>
    {#if today.playTimeSeconds > 0}
      <span class="text-xs text-ed-text-muted font-mono">{fmtTime(today.playTimeSeconds)} played</span>
    {/if}
  </div>

  <div class="flex flex-col gap-1 text-sm">
    <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
      <div class="flex justify-between">
        <span class="text-ed-text-muted">Systems</span>
        <span class="font-mono">{today.systemsVisited}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-ed-text-muted">Jumps</span>
        <span class="font-mono">{today.jumps}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-ed-text-muted">Scanned</span>
        <span class="font-mono">{today.bodiesScanned}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-ed-text-muted">Mapped</span>
        <span class="font-mono">{today.bodiesMapped}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-ed-text-muted">1st disc.</span>
        <span class="font-mono">{today.firstDiscoveries}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-ed-text-muted">Bio</span>
        <span class="font-mono">{today.bioSpeciesAnalysed}</span>
      </div>
    </div>

    <div class="flex justify-between text-xs">
      <span class="text-ed-text-muted">Distance</span>
      <span class="font-mono">{fmt(today.distanceTravelled)} LY</span>
    </div>

    <div class="pt-1 border-t border-ed-border/30 flex flex-col gap-0.5 text-xs">
      <div class="flex justify-between">
        <span class="text-ed-text-muted">Carto</span>
        <span class="font-mono text-ed-amber">{fmt(totalCarto)} Cr</span>
      </div>
      <div class="flex justify-between">
        <span class="text-ed-text-muted">Bio</span>
        <span class="font-mono text-ed-green">{fmt(totalBio)} Cr</span>
      </div>
      <div class="flex justify-between font-semibold">
        <span class="text-ed-orange">Total</span>
        <span class="font-mono text-ed-orange">{fmt(totalValue)} Cr</span>
      </div>
      {#if carrierEnabled}
        <div class="flex justify-between">
          <span class="text-ed-text-muted">Carrier</span>
          <span class="font-mono text-ed-dim">{fmt(totalValue * 0.65625)}</span>
        </div>
      {/if}
      {#if crPerHour > 0}
        <div class="flex justify-between">
          <span class="text-ed-text-muted">Cr/h</span>
          <span class="font-mono text-ed-cyan">{fmt(crPerHour)}</span>
        </div>
      {/if}
    </div>
  </div>
</div>
