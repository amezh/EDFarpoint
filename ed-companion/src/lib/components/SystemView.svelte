<script lang="ts">
  import { systemStore } from "$lib/stores/system";
  import BodyTable from "$lib/components/BodyTable/BodyTable.svelte";

  const system = $derived(systemStore.current);
</script>

{#if system}
  <div class="flex flex-col gap-3">
    <div class="ed-card">
      <div class="flex items-center justify-between">
        <h2 class="text-ed-amber font-bold text-lg">{system.name}</h2>
        <div class="flex items-center gap-3 text-sm text-ed-text-muted">
          {#if system.starClass}
            <span>Class {system.starClass}</span>
          {/if}
          <span>{system.bodyCount ?? "?"} bodies</span>
        </div>
      </div>
      {#if system.distanceFromSol != null}
        <p class="text-xs text-ed-text-muted mt-1">
          {system.distanceFromSol.toFixed(1)} LY from Sol
        </p>
      {/if}
    </div>

    <BodyTable bodies={system.bodies} />
  </div>
{:else}
  <div class="ed-card text-ed-text-muted text-center py-8">
    <p>Waiting for system data...</p>
    <p class="text-xs mt-2">Jump to a system or start the game to begin</p>
  </div>
{/if}
