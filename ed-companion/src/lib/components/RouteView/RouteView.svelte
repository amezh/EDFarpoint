<script lang="ts">
  import { routeStore } from "$lib/stores/route";

  const route = $derived(routeStore.current);

  const SCOOPABLE = new Set(["K", "G", "B", "F", "O", "A", "M"]);
</script>

{#if route && route.systems.length > 0}
  <div class="flex flex-col gap-3">
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

    {#each route.systems.slice(0, 5) as sys, i (i)}
      <div class="ed-card flex items-center justify-between py-2">
        <div class="flex items-center gap-2">
          <span class="text-xs text-ed-text-muted w-4 text-right">{i + 1}</span>
          <span class="font-mono text-sm">{sys.name}</span>
        </div>
        <div class="flex items-center gap-3 text-xs">
          <span class:text-ed-cyan={sys.starClass === "N"}
                class:text-ed-amber={SCOOPABLE.has(sys.starClass)}
                class:text-ed-red={sys.starClass === "DC" || sys.starClass === "DA"}>
            {sys.starClass}
          </span>
          <span class="text-ed-text-muted font-mono">{sys.distanceLy?.toFixed(1)} LY</span>
        </div>
      </div>
    {/each}
  </div>
{:else}
  <div class="ed-card text-ed-text-muted text-center py-8">
    No route plotted
  </div>
{/if}
