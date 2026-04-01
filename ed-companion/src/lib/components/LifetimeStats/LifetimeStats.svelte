<script lang="ts">
  import { lifetimeStore } from "$lib/stores/lifetime";

  const stats = $derived(lifetimeStore.current);

  function fmt(v: number): string {
    if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + " B";
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + " M";
    if (v >= 1_000) return (v / 1_000).toFixed(1) + " K";
    return v.toString();
  }
</script>

<div class="ed-card">
  <h2 class="text-ed-amber font-bold mb-3">Lifetime Stats</h2>

  <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
    <div class="flex justify-between">
      <span class="text-ed-text-muted">Carto earned</span>
      <span class="font-mono text-ed-amber">{fmt(stats.totalCartoEarned)} Cr</span>
    </div>
    <div class="flex justify-between">
      <span class="text-ed-text-muted">Bio earned</span>
      <span class="font-mono text-ed-green">{fmt(stats.totalBioEarned)} Cr</span>
    </div>
    <div class="flex justify-between">
      <span class="text-ed-text-muted">Systems visited</span>
      <span class="font-mono">{stats.totalSystems}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-ed-text-muted">Bodies scanned</span>
      <span class="font-mono">{stats.totalBodiesScanned}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-ed-text-muted">Bio species</span>
      <span class="font-mono">{stats.totalBioSpecies}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-ed-text-muted">Distance (LY)</span>
      <span class="font-mono">{fmt(stats.totalDistanceLy)}</span>
    </div>
  </div>
</div>
