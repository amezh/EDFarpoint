<script lang="ts">
  import { routeStore } from "$lib/stores/route.svelte";
  import { expeditionStore } from "$lib/stores/expedition.svelte";

  const route = $derived(routeStore.current);
  const visited = $derived(expeditionStore.visited);
  const currentName = $derived(expeditionStore.currentSystemName);

  const SCOOPABLE = new Set(["K", "G", "B", "F", "O", "A", "M"]);

  function fmt(v: number): string {
    if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + "B";
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
    if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
    if (v === 0) return "0";
    return v.toString();
  }

  function starColor(starClass: string | null): string {
    if (!starClass) return "text-ed-text-muted";
    if (starClass === "N") return "text-ed-cyan";
    if (starClass.startsWith("D")) return "text-red-400";
    if (SCOOPABLE.has(starClass)) return "text-ed-amber";
    return "text-ed-text-muted";
  }

  function isScoopable(starClass: string | null): boolean {
    return starClass != null && SCOOPABLE.has(starClass);
  }

  // Visited systems in reverse chronological (most recent first), excluding current
  const pastSystems = $derived(
    visited.filter(s => s.name !== currentName).reverse()
  );

  // Current system
  const currentSystem = $derived(expeditionStore.currentSystem);

  // Route ahead (skip first entry if it's the current system)
  const routeAhead = $derived(() => {
    const systems = route?.systems ?? [];
    if (systems.length > 0 && systems[0].name === currentName) {
      return systems.slice(1);
    }
    return systems;
  });
</script>

<div class="flex flex-col gap-1">
  <!-- Route summary header -->
  {#if route && route.systems.length > 0}
    <div class="ed-card">
      <div class="flex items-center justify-between">
        <h2 class="text-ed-amber font-bold">Route</h2>
        <span class="text-sm text-ed-text-muted">
          {route.remainingJumps} jumps · {route.remainingLy.toFixed(1)} LY
        </span>
      </div>
      {#if route.destination}
        <p class="text-xs text-ed-text-muted mt-1">→ {route.destination}</p>
      {/if}
    </div>
  {/if}

  <!-- NEXT: Route ahead -->
  {#if routeAhead().length > 0}
    <div class="text-[10px] text-ed-text-muted uppercase tracking-wider px-1 mt-1">Next</div>
    {#each routeAhead().slice(0, 5) as sys, i (sys.name + i)}
      <div class="flex items-center gap-2 px-3 py-1 text-xs {isScoopable(sys.starClass) ? 'bg-ed-amber/5' : ''}">
        <span class="w-3 text-right text-ed-text-muted">{i + 1}</span>
        <span class="w-1.5 h-1.5 rounded-full shrink-0 {isScoopable(sys.starClass) ? 'bg-ed-amber' : ''}"></span>
        <span class="{starColor(sys.starClass)} w-4">{sys.starClass}</span>
        <span class="font-mono flex-1 truncate text-ed-text-muted">{sys.name}</span>
        <span class="text-[10px] truncate max-w-20 {sys.discoverer && sys.discoverer !== '???' ? 'text-ed-text-muted italic' : 'text-ed-cyan'}">
          {#if sys.discovererLoading}...{:else}{sys.discoverer ?? '???'}{/if}
        </span>
        <span class="text-ed-text-muted font-mono">{sys.distanceLy?.toFixed(1)} LY</span>
      </div>
    {/each}
  {/if}

  <!-- CURRENT SYSTEM -->
  {#if currentSystem}
    <div class="text-[10px] text-ed-green uppercase tracking-wider px-1 mt-2">Current</div>
    <div class="rounded bg-ed-surface/80 border-l-2 border-ed-green px-3 py-2">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          {#if currentSystem.starClass}
            <span class="{starColor(currentSystem.starClass)} text-xs font-bold">{currentSystem.starClass}</span>
          {/if}
          <span class="font-mono text-sm text-ed-green font-bold">{currentSystem.name}</span>
        </div>
        <span class="text-xs text-ed-text-muted">{currentSystem.distFromSol?.toFixed(0)} LY</span>
      </div>
      <div class="flex items-center gap-3 mt-1 text-xs text-ed-text-muted">
        {#if currentSystem.bodiesScanned > 0}
          <span>{currentSystem.bodiesScanned} scanned</span>
        {/if}
        {#if currentSystem.bodiesMapped > 0}
          <span>{currentSystem.bodiesMapped} mapped</span>
        {/if}
        {#if currentSystem.bioSpecies > 0}
          <span class="text-ed-green">{currentSystem.bioSpecies} bio</span>
        {/if}
      </div>
      {#if currentSystem.cartoValue > 0 || currentSystem.bioValue > 0}
        <div class="flex items-center gap-3 mt-1 text-xs font-mono">
          {#if currentSystem.cartoValue > 0}
            <span class="text-ed-amber">{fmt(currentSystem.cartoValue)} Cr carto</span>
          {/if}
          {#if currentSystem.bioValue > 0}
            <span class="text-ed-green">{fmt(currentSystem.bioValue)} Cr bio</span>
          {/if}
        </div>
      {/if}
      <!-- Discovery + EDSM info -->
      <div class="mt-1 text-xs flex flex-wrap items-center gap-2">
        {#if currentSystem.firstDiscoveryStar}
          <span class="text-ed-green font-bold">1st system</span>
        {/if}
        {#if currentSystem.firstDiscoveryBodies > 0}
          <span class="text-ed-amber">{currentSystem.firstDiscoveryBodies} 1st bodies</span>
        {/if}
        {#if currentSystem.edsmLoading}
          <span class="text-ed-text-muted italic">EDSM...</span>
        {:else if currentSystem.edsmKnown === false}
          <span class="text-ed-green">new to EDSM</span>
        {:else if currentSystem.edsmKnown === true}
          <span class="text-ed-text-muted">known to EDSM</span>
        {/if}
      </div>
    </div>
  {/if}

  <!-- VISITED: Past systems -->
  {#if pastSystems.length > 0}
    <div class="text-[10px] text-ed-text-muted uppercase tracking-wider px-1 mt-2">
      Visited ({pastSystems.length})
    </div>
    {#each pastSystems.slice(0, 20) as sys (sys.name)}
      {@const totalValue = sys.cartoValue + sys.bioValue}
      <div class="flex items-center gap-2 px-3 py-1 text-xs">
        <span class="w-1.5 h-1.5 rounded-full shrink-0 {isScoopable(sys.starClass) ? 'bg-ed-amber' : ''}"></span>
        {#if sys.starClass}
          <span class="{starColor(sys.starClass)} w-4">{sys.starClass}</span>
        {:else}
          <span class="w-4"></span>
        {/if}
        <span class="font-mono flex-1 truncate {sys.firstDiscoveryStar ? 'text-ed-amber' : 'text-ed-text-muted'}">
          {sys.name}
        </span>
        {#if sys.firstDiscoveryStar}
          <span class="text-ed-green">1st</span>
        {:else if sys.edsmKnown === false}
          <span class="text-ed-green">new</span>
        {/if}
        {#if sys.firstDiscoveryBodies > 0}
          <span class="text-ed-amber text-[10px]">{sys.firstDiscoveryBodies}b</span>
        {/if}
        {#if totalValue > 0}
          <span class="font-mono text-ed-green/70">{fmt(totalValue)}</span>
        {/if}
      </div>
    {/each}
  {/if}

  <!-- Empty state -->
  {#if !currentSystem && pastSystems.length === 0 && (!route || route.systems.length === 0)}
    <div class="ed-card text-ed-text-muted text-center py-8">
      <p>No route plotted</p>
      <p class="text-xs mt-2">Jump to a system or plot a route in-game</p>
    </div>
  {/if}
</div>
