<script lang="ts">
  import { systemStore } from "$lib/stores/system.svelte";
  import { bioStore } from "$lib/stores/bio.svelte";
  import { tripStore } from "$lib/stores/trip.svelte";
  import { routeStore } from "$lib/stores/route.svelte";

  const system = $derived(systemStore.current);
  const bio = $derived(bioStore.currentPlanet);
  const trip = $derived(tripStore.current);
  const route = $derived(routeStore.current);

  type OverlayMode = "system" | "bio" | "route";
  let mode: OverlayMode = $state("system");

  // Auto-switch logic based on game state
  $effect(() => {
    if (bio) {
      mode = "bio";
    } else if (route && route.systems.length > 0) {
      mode = "route";
    } else {
      mode = "system";
    }
  });

  const totalCarto = $derived(trip.cartoFSSValue + trip.cartoDSSValue);
  const totalBio = $derived(trip.bioValueBase + trip.bioValueBonus);

  function fmt(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
    if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
    return v.toString();
  }

  const SCOOPABLE = new Set(["K", "G", "B", "F", "O", "A", "M"]);
</script>

<div class="p-2 text-xs font-mono bg-black/70 rounded-lg border border-ed-border/50 min-w-[300px]">
  <!-- Compact status bar -->
  <div class="flex items-center gap-3 mb-1.5 text-ed-text-muted">
    <span class="text-ed-amber">{fmt(totalCarto)}</span>
    <span class="text-ed-green">{fmt(totalBio)}</span>
    <span class="text-ed-orange font-bold">{fmt(totalCarto + totalBio)}</span>
  </div>

  {#if mode === "bio" && bio}
    <!-- Bio tracker compact -->
    <div class="text-ed-green font-bold mb-1">{bio.bodyName}</div>
    {#each bio.species as species (species.name)}
      <div class="flex items-center justify-between py-0.5">
        <span class:text-ed-green={species.analysed} class:text-ed-text={!species.analysed}>
          {species.localName}
        </span>
        <div class="flex gap-0.5">
          {#each [0, 1, 2] as i}
            <span class:text-ed-green={i < species.samples} class:text-ed-dim={i >= species.samples}>●</span>
          {/each}
        </div>
      </div>
    {/each}
  {:else if mode === "route" && route && route.systems.length > 0}
    <!-- Route compact -->
    <div class="text-ed-amber mb-1">
      {route.remainingJumps} jumps · {route.remainingLy.toFixed(0)} LY → {route.destination}
    </div>
    {#each route.systems.slice(0, 3) as sys}
      <div class="flex justify-between py-0.5">
        <span>{sys.name}</span>
        <span class:text-ed-amber={SCOOPABLE.has(sys.starClass)}
              class:text-ed-cyan={sys.starClass === "N"}>
          {sys.starClass}
        </span>
      </div>
    {/each}
  {:else if system}
    <!-- System compact -->
    <div class="text-ed-amber font-bold mb-1">{system.name}</div>
    <div class="text-ed-text-muted">{system.bodyCount ?? "?"} bodies · {system.fssProgress ? (system.fssProgress * 100).toFixed(0) + "%" : ""}</div>
    {#each system.bodies.filter(b => b.bioSignals > 0).slice(0, 4) as body}
      <div class="flex justify-between py-0.5">
        <span>{body.shortName}</span>
        <span class="text-ed-green">{body.bioSignals} bio</span>
      </div>
    {/each}
  {:else}
    <div class="text-ed-text-muted">Waiting for data...</div>
  {/if}
</div>
