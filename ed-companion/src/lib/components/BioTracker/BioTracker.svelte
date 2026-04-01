<script lang="ts">
  import { bioStore } from "$lib/stores/bio.svelte";

  const tracker = $derived(bioStore.currentPlanet);
</script>

{#if tracker}
  <div class="flex flex-col gap-3">
    <div class="ed-card">
      <h2 class="text-ed-green font-bold mb-2">{tracker.bodyName}</h2>
      <p class="text-sm text-ed-text-muted">{tracker.species.length} species detected</p>
    </div>

    {#each tracker.species as species (species.name)}
      <div class="ed-card flex items-center justify-between">
        <div>
          <p class="font-semibold" class:text-ed-green={species.analysed}>{species.localName}</p>
          <p class="text-xs text-ed-text-muted">
            {species.value ? (species.value / 1_000_000).toFixed(1) + "M Cr" : ""}
            {#if species.clonalRange}
              · {species.clonalRange}m range
            {/if}
          </p>
        </div>
        <div class="flex items-center gap-1">
          {#each [0, 1, 2] as i}
            <div
              class="w-3 h-3 rounded-full border"
              class:bg-ed-green={i < species.samples}
              class:border-ed-green={i < species.samples}
              class:border-ed-dim={i >= species.samples}
            ></div>
          {/each}
          {#if species.analysed}
            <span class="ml-2 text-ed-green text-xs font-bold">✓</span>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{:else}
  <div class="ed-card text-ed-text-muted text-center py-8">
    <p>No bio data for current planet</p>
    <p class="text-xs mt-2">Approach a planet with bio signals to begin tracking</p>
  </div>
{/if}
