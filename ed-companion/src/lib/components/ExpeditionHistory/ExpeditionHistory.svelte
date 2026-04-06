<script lang="ts">
  import { expeditionHistoryStore } from "$lib/stores/expeditionHistory.svelte";

  const expeditions = $derived(
    [...expeditionHistoryStore.expeditions].sort(
      (a, b) => b.endTimestamp.localeCompare(a.endTimestamp),
    ),
  );

  function fmt(v: number): string {
    if (!Number.isFinite(v)) return "0";
    if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + "B";
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
    if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
    return v.toString();
  }

  function fmtDist(ly: number): string {
    if (!Number.isFinite(ly)) return "0";
    if (ly >= 1000) return (ly / 1000).toFixed(1) + "K";
    return ly.toFixed(0);
  }

  function fmtTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return "-";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function fmtDate(iso: string): string {
    if (!iso) return "-";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
    } catch { return iso.slice(0, 10); }
  }

  const totals = $derived({
    systemsVisited: expeditions.reduce((s, e) => s + e.systemsVisited, 0),
    bodiesScanned: expeditions.reduce((s, e) => s + e.bodiesScanned, 0),
    bodiesMapped: expeditions.reduce((s, e) => s + e.bodiesMapped, 0),
    bioSpeciesAnalysed: expeditions.reduce((s, e) => s + e.bioSpeciesAnalysed, 0),
    cartoValue: expeditions.reduce((s, e) => s + e.cartoFSSValue + e.cartoDSSValue, 0),
    bioValue: expeditions.reduce((s, e) => s + e.bioValueBase + e.bioValueBonus, 0),
    distanceTravelled: expeditions.reduce((s, e) => s + e.distanceTravelled, 0),
    jumps: expeditions.reduce((s, e) => s + e.jumps, 0),
    playTimeSeconds: expeditions.reduce((s, e) => s + e.playTimeSeconds, 0),
  });
</script>

{#if expeditions.length === 0}
  <div class="text-ed-text-muted text-xs text-center py-4">
    No completed expeditions yet. Dock at a station to record your trip.
  </div>
{:else}
  <div class="overflow-x-auto">
    <table class="w-full text-xs font-mono">
      <thead>
        <tr class="text-ed-text-muted text-[10px] uppercase tracking-wider border-b border-ed-border">
          <th class="text-left py-1 px-1">Date</th>
          <th class="text-left py-1 px-1">Station</th>
          <th class="text-right py-1 px-1">Time</th>
          <th class="text-right py-1 px-1">Sys</th>
          <th class="text-right py-1 px-1">Scan</th>
          <th class="text-right py-1 px-1">Map</th>
          <th class="text-right py-1 px-1">Bio</th>
          <th class="text-right py-1 px-1">Carto Cr</th>
          <th class="text-right py-1 px-1">Bio Cr</th>
          <th class="text-right py-1 px-1">Total</th>
          <th class="text-right py-1 px-1">Dist</th>
          <th class="text-right py-1 px-1">Jumps</th>
        </tr>
      </thead>
      <tbody>
        <!-- Totals row -->
        <tr class="text-ed-amber border-b border-ed-border font-bold">
          <td class="py-1 px-1" colspan="2">Total ({expeditions.length} expeditions)</td>
          <td class="text-right py-1 px-1">{fmtTime(totals.playTimeSeconds)}</td>
          <td class="text-right py-1 px-1">{totals.systemsVisited}</td>
          <td class="text-right py-1 px-1">{totals.bodiesScanned}</td>
          <td class="text-right py-1 px-1">{totals.bodiesMapped}</td>
          <td class="text-right py-1 px-1">{totals.bioSpeciesAnalysed}</td>
          <td class="text-right py-1 px-1 text-ed-amber">{fmt(totals.cartoValue)}</td>
          <td class="text-right py-1 px-1 text-ed-green">{fmt(totals.bioValue)}</td>
          <td class="text-right py-1 px-1 text-ed-orange">{fmt(totals.cartoValue + totals.bioValue)}</td>
          <td class="text-right py-1 px-1">{fmtDist(totals.distanceTravelled)} LY</td>
          <td class="text-right py-1 px-1">{totals.jumps}</td>
        </tr>

        {#each expeditions as exp (exp.id)}
          {@const cartoTotal = exp.cartoFSSValue + exp.cartoDSSValue}
          {@const bioTotal = exp.bioValueBase + exp.bioValueBonus}
          <tr class="border-b border-ed-border/30 hover:bg-ed-surface/30 {exp.reconstructed ? 'opacity-70' : ''}">
            <td class="py-1 px-1 text-ed-text-muted whitespace-nowrap">{fmtDate(exp.endTimestamp)}</td>
            <td class="py-1 px-1 truncate max-w-28" title="{exp.endStation} ({exp.endSystem})">{exp.endStation}</td>
            <td class="text-right py-1 px-1">{fmtTime(exp.playTimeSeconds)}</td>
            <td class="text-right py-1 px-1">{exp.systemsVisited}</td>
            <td class="text-right py-1 px-1">{exp.bodiesScanned}</td>
            <td class="text-right py-1 px-1">{exp.bodiesMapped}</td>
            <td class="text-right py-1 px-1">{exp.bioSpeciesAnalysed}</td>
            <td class="text-right py-1 px-1 text-ed-amber">{fmt(cartoTotal)}</td>
            <td class="text-right py-1 px-1 text-ed-green">{fmt(bioTotal)}</td>
            <td class="text-right py-1 px-1 text-ed-orange">{fmt(cartoTotal + bioTotal)}</td>
            <td class="text-right py-1 px-1">{fmtDist(exp.distanceTravelled)} LY</td>
            <td class="text-right py-1 px-1">{exp.jumps}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
