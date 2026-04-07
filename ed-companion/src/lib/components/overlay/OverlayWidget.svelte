<script lang="ts">
  import type { OverlayViewModel } from "$lib/types/overlay";
  import { haversineDistance } from "$lib/stores/bio.svelte";
  import { formatCredits, formatDistance, SCOOPABLE_STARS } from "$lib/utils/overlayCalc";
  import { invoke } from "@tauri-apps/api/core";
  import { emit, listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";

  let vm = $state<OverlayViewModel | null>(null);
  let opacity = $state(1);

  const fmt = formatCredits;
  const fmtDist = formatDistance;

  // Live haversine distances — computed locally at 1Hz from position updates
  const speciesDistances = $derived((() => {
    if (!vm?.onPlanet || !vm.position || !vm.bodyRadius) return new Map<string, number[]>();
    const result = new Map<string, number[]>();
    for (const sp of vm.mergedSpecies) {
      if (sp.samples <= 0 || sp.analysed || sp.scanPositions.length === 0) continue;
      const dists = sp.scanPositions.map(p =>
        haversineDistance(p.latitude, p.longitude, vm!.position!.lat, vm!.position!.lon, vm!.bodyRadius!),
      );
      result.set(sp.localName, dists);
    }
    return result;
  })());

  onMount(() => {
    Promise.all([
      listen<OverlayViewModel>("overlay-viewmodel", (e) => { vm = e.payload; }),
      listen<number>("overlay-opacity", (e) => { opacity = e.payload; }),
    ]).then(() => {
      emit("overlay-ready", true).catch(() => {});
    }).catch(() => {});

    // Hydrate from backend cache as fallback
    invoke("get_overlay_state").then((v: any) => {
      if (v.overlay) vm = v.overlay;
    }).catch(() => {});
  });
</script>

<div class="fixed inset-0 text-xs font-mono text-gray-200 select-none"
     style="background: transparent; opacity: {opacity}">

  <!-- Edge resize zones (no-drag so OS handles resize) -->
  <div class="fixed top-0 left-0 right-0 h-1" style="-webkit-app-region: no-drag; cursor: n-resize"></div>
  <div class="fixed bottom-0 left-0 right-0 h-1" style="-webkit-app-region: no-drag; cursor: s-resize"></div>
  <div class="fixed top-0 left-0 bottom-0 w-1" style="-webkit-app-region: no-drag; cursor: w-resize"></div>
  <div class="fixed top-0 right-0 bottom-0 w-1" style="-webkit-app-region: no-drag; cursor: e-resize"></div>

  <!-- Main content area: draggable for window move -->
  <div class="absolute inset-1 p-1 overflow-hidden" style="-webkit-app-region: drag">

  <!-- Resize handle: bottom-right corner -->
  <div class="fixed bottom-0 right-0 w-5 h-5 opacity-25 hover:opacity-100 transition-opacity cursor-se-resize z-50"
       style="-webkit-app-region: no-drag">
    <svg viewBox="0 0 16 16" class="w-full h-full text-gray-400">
      <path d="M14 14H10M14 14V10M14 10L10 14M14 6L6 14" stroke="currentColor" stroke-width="1.5" fill="none"/>
    </svg>
  </div>

  {#if vm}
  <!-- Header -->
  <div class="flex items-center gap-2 mb-1.5">
    <span class="text-orange-400 font-bold">{fmt(vm.totalValue)} Cr</span>
    {#if vm.crPerHour > 0}
      <span class="text-cyan-400">{fmt(vm.crPerHour)}/h</span>
    {/if}
    <span class="text-gray-500">{vm.systemsVisited} sys</span>
    <span class="text-gray-500">{vm.bioSpeciesAnalysed} bio</span>
  </div>

  <!-- Bio tracker — only when on planet surface -->
  {#if vm.onPlanet}
    <div class="border-t border-gray-700/50 pt-1 mt-1">
      <div class="text-green-400 font-bold text-[10px] mb-0.5">{vm.bioBodyName}</div>
      {#each vm.mergedSpecies as sp (sp.localName)}
        {@const done = sp.analysed}
        {@const active = sp.samples > 0 && !done}
        {@const predicted = sp.predicted}
        {@const range = sp.clonalRange}
        {@const dists = speciesDistances.get(sp.localName) ?? []}
        {@const allFar = dists.length > 0 && dists.every((d) => d >= range)}
        <div class="flex items-center gap-1 py-0.5 {done ? 'opacity-30' : ''}">
          {#if predicted}
            <span class="text-amber-400 shrink-0">?</span>
          {/if}
          <span class="flex-1 truncate {done ? 'line-through text-gray-600' : active ? 'text-green-400' : predicted ? 'text-amber-300' : 'text-gray-300'}">
            {sp.localName}
          </span>
          <span class="text-[9px] text-amber-400/60 font-mono shrink-0">{fmt((sp.value ?? 0) * vm.bioMultiplier)}</span>
          <span class="text-[9px] text-gray-500 shrink-0">{fmtDist(range)}</span>
          {#if !predicted}
            <span class="flex gap-px">
              {#each [0, 1, 2] as j}
                <span class="w-2 h-2 rounded-full inline-block {j < sp.samples ? 'bg-green-500' : 'bg-gray-700'}"></span>
              {/each}
            </span>
          {/if}
        </div>
        {#if active && dists.length > 0}
          <div class="flex gap-1 text-[9px] ml-2 mb-0.5">
            {#each dists as d}
              <span class="font-bold {d >= range ? 'text-green-400' : 'text-red-400'}">{fmtDist(d)}/{fmtDist(range)}</span>
            {/each}
            <span class="ml-auto font-bold {allFar ? 'text-green-400' : 'text-red-400'}">{allFar ? "Scan!" : "Move"}</span>
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- Carrier stats — when docked at own carrier -->
  {#if vm.carrier}
    {@const c = vm.carrier}
    {@const daysLeft = c.balanceRunsOutDays}
    <div class="border-t border-gray-700/50 pt-1 mt-1">
      <div class="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
        Carrier — <span class="text-amber-400 normal-case">{c.name}</span>
        <span class="text-gray-600 ml-1">{c.callsign}</span>
      </div>
      <!-- Finances -->
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Balance</span>
        <span class="text-amber-400 font-mono">{fmt(c.carrierBalance)} Cr</span>
      </div>
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Available</span>
        <span class="text-amber-300 font-mono">{fmt(c.availableBalance)} Cr</span>
      </div>
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Reserve</span>
        <span class="text-gray-300 font-mono">{fmt(c.reserveBalance)} Cr</span>
      </div>
      {#if c.taxRate > 0}
        <div class="flex items-center justify-between py-0.5 text-[10px]">
          <span class="text-gray-400">Tax rate</span>
          <span class="text-gray-300">{(c.taxRate * 100).toFixed(0)}%</span>
        </div>
      {/if}
      <!-- Upkeep -->
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Upkeep/week</span>
        <span class="text-red-400 font-mono">{fmt(c.upkeepPerWeek)} Cr</span>
      </div>
      {#if daysLeft != null}
        {@const years = Math.floor(daysLeft / 365)}
        {@const months = Math.floor((daysLeft % 365) / 30)}
        {@const days = Math.floor(daysLeft % 30)}
        {@const hours = Math.floor((daysLeft % 1) * 24)}
        {@const isLow = daysLeft < 30}
        <div class="flex items-center justify-between py-0.5 text-[10px]">
          <span class="text-gray-400">Funds last</span>
          <span class="font-mono {isLow ? 'text-red-400' : 'text-green-400'}">
            {#if years > 0}{years}y {/if}{#if months > 0}{months}m {/if}{days}d {hours}h
          </span>
        </div>
      {/if}
      <!-- Session income -->
      {#if c.incomeThisSession !== 0}
        <div class="flex items-center justify-between py-0.5 text-[10px]">
          <span class="text-gray-400">Session P/L</span>
          <span class="font-mono {c.incomeThisSession >= 0 ? 'text-green-400' : 'text-red-400'}">
            {c.incomeThisSession >= 0 ? '+' : ''}{fmt(c.incomeThisSession)} Cr
          </span>
        </div>
      {/if}
      <!-- Cargo & trade orders -->
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Cargo</span>
        <span class="text-gray-300">{c.cargo} / {c.totalCapacity} t</span>
      </div>
      {#if c.buyOrderCount > 0 || c.sellOrderCount > 0}
        <div class="flex items-center justify-between py-0.5 text-[10px]">
          <span class="text-gray-400">Buy orders</span>
          <span class="text-cyan-400">{c.buyOrderCount} ({c.buyOrderTonnage} t)</span>
        </div>
        <div class="flex items-center justify-between py-0.5 text-[10px]">
          <span class="text-gray-400">Sell orders</span>
          <span class="text-amber-400">{c.sellOrderCount} ({c.sellOrderTonnage} t)</span>
        </div>
      {/if}
      <!-- Fuel & services -->
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Fuel</span>
        <span class="text-gray-300">{c.fuelLevel} t — {c.jumpRangeCurr.toFixed(1)} LY</span>
      </div>
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Services</span>
        <span class="text-gray-300">{c.activeServiceCount} active</span>
      </div>
      <!-- Pending jump -->
      {#if c.pendingJump}
        <div class="flex items-center justify-between py-0.5 text-[10px]">
          <span class="text-cyan-400">Jump to</span>
          <span class="text-cyan-300 truncate ml-1">{c.pendingJump.system}</span>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Expedition stats — when NOT on planet surface and not showing carrier -->
  {#if !vm.onPlanet && !vm.carrier}
    <div class="border-t border-gray-700/50 pt-1 mt-1">
      <div class="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Expedition</div>
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Carto (FSS)</span>
        <span class="text-ed-amber font-mono">{fmt(vm.trip.cartoFSSValue)} Cr</span>
      </div>
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Carto (DSS)</span>
        <span class="text-ed-amber font-mono">{fmt(vm.trip.cartoDSSValue)} Cr</span>
      </div>
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Bio scans</span>
        <span class="text-green-400 font-mono">{fmt(vm.trip.bioValue)} Cr</span>
      </div>
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Species</span>
        <span class="text-gray-300">{vm.trip.bioSpeciesAnalysed} analysed</span>
      </div>
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Systems</span>
        <span class="text-gray-300">{vm.trip.systemsVisited} visited</span>
      </div>
      <div class="flex items-center justify-between py-0.5 text-[10px]">
        <span class="text-gray-400">Jumps</span>
        <span class="text-gray-300">{vm.trip.jumps}</span>
      </div>
    </div>
  {/if}

  <!-- System bodies -->
  {#if !vm.onPlanet && vm.systemName}
    <div class="border-t border-gray-700/50 pt-1 mt-1">
      <div class="text-amber-400 font-bold text-[10px]">
        {vm.systemName}
        {#if vm.systemFirstDiscovery}<span class="text-cyan-400 ml-1">1st!</span>{/if}
      </div>
      <div class="text-[9px] text-gray-500">{vm.scannedBodyCount}/{vm.bodyCount ?? "?"} bodies</div>

      <!-- Bio targets -->
      {#if vm.bioTargets.length > 0}
        <div class="text-green-400 font-bold text-[9px] uppercase tracking-wider mt-1 mb-0.5">Bio targets</div>
        {#each vm.bioTargets as target (target.bodyId)}
          <div class="flex items-center gap-1 py-0.5 text-[10px] {target.done ? 'opacity-50' : ''}">
            <svg class="w-2.5 h-2.5 shrink-0" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke={target.dot.ring} stroke-width="1.5"/>{#if target.dot.fill !== 'none'}<circle cx="5" cy="5" r="2.5" fill={target.dot.fill}/>{/if}</svg>
            <span class="truncate flex-1 {target.done ? 'line-through' : ''}">{target.shortName}</span>
            {#if !target.wasDiscovered}<span class="text-cyan-400 shrink-0 text-[9px]">1st</span>{/if}
            <span class="text-green-400 shrink-0">{target.bioSignals}bio</span>
            {#if !target.mapped}<span class="text-blue-400 shrink-0 text-[9px]">DSS</span>{/if}
            {#if target.landable}<span class="text-amber-400 shrink-0 text-[9px]">L</span>{/if}
            {#if target.displayValue > 0}
              <span class="text-green-400/60 font-mono shrink-0">{fmt(target.displayValue)}</span>
            {/if}
          </div>
          {#each target.species as sp}
            <div class="flex items-center gap-1 text-[9px] ml-3 leading-tight
              {target.done ? 'opacity-50' : ''} {sp.confidence === 'scanned' ? 'text-green-400' : ''}">
              <span class="truncate flex-1 {target.done ? 'line-through' : ''}">{sp.name}</span>
              <span class="font-mono shrink-0 text-green-400/50">{fmt(sp.value)}</span>
            </div>
          {/each}
        {/each}
      {/if}

      <!-- Carto targets (DSS) -->
      {#if vm.cartoTargets.length > 0}
        <div class="text-amber-400 font-bold text-[9px] uppercase tracking-wider mt-1 mb-0.5">Map these</div>
        {#each vm.cartoTargets as target}
          <div class="flex items-center gap-1 py-0.5 text-[10px]">
            <svg class="w-2.5 h-2.5 shrink-0" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke={target.dot.ring} stroke-width="1.5"/>{#if target.dot.fill !== 'none'}<circle cx="5" cy="5" r="2.5" fill={target.dot.fill}/>{/if}</svg>
            <span class="truncate flex-1">{target.shortName}</span>
            {#if !target.wasDiscovered}<span class="text-cyan-400 shrink-0 text-[9px]">1st</span>{/if}
            {#if target.typeTag}
              <span class="text-amber-400 shrink-0 text-[9px]">{target.typeTag}</span>
            {/if}
            {#if !target.mapped}<span class="text-blue-400 shrink-0 text-[9px]">DSS</span>{/if}
            <span class="text-amber-400/60 font-mono shrink-0">{fmt(target.displayValue)}</span>
          </div>
        {/each}
      {/if}
    </div>
  {/if}

  <!-- Route -->
  {#if vm.route.nextSystems.length > 1}
    <div class="border-t border-gray-700/50 pt-1 mt-1">
      <div class="text-[9px] text-gray-500">{vm.route.remainingJumps} jumps → {vm.route.destination}</div>
      {#each vm.route.nextSystems as sys}
        <div class="flex items-center justify-between py-0.5 text-[10px]">
          <span class="truncate flex-1 {SCOOPABLE_STARS.has(sys.starClass) ? 'text-amber-400' : 'text-gray-400'}">{sys.name}</span>
          <span class="truncate max-w-16 ml-1 {sys.discoverer && sys.discoverer !== '???' ? 'text-gray-500 italic' : 'text-cyan-400'}">{sys.discoverer ?? '???'}</span>
          <span class="ml-1 {sys.starClass === 'N' ? 'text-cyan-400' : SCOOPABLE_STARS.has(sys.starClass) ? 'text-amber-400' : 'text-gray-500'}">{sys.starClass}</span>
        </div>
      {/each}
    </div>
  {/if}

  {:else}
    <div class="text-gray-500 text-center py-4">Waiting for data from main window...</div>
  {/if}

  </div><!-- end content area -->
</div>
