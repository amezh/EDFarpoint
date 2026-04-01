<script lang="ts">
  import type { Body } from "$lib/stores/system.svelte";

  let { bodies = [] }: { bodies: Body[] } = $props();
</script>

{#if bodies.length > 0}
  <div class="overflow-x-auto">
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="text-ed-text-muted text-xs uppercase border-b border-ed-border">
          <th class="text-left py-2 px-2">Name</th>
          <th class="text-left py-2 px-2">Type</th>
          <th class="text-right py-2 px-2">Dist (LS)</th>
          <th class="text-right py-2 px-2">Gravity</th>
          <th class="text-left py-2 px-2">Atmosphere</th>
          <th class="text-center py-2 px-2">Land</th>
          <th class="text-right py-2 px-2">Bio</th>
          <th class="text-right py-2 px-2">Value</th>
          <th class="text-center py-2 px-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {#each bodies as body (body.bodyId)}
          <tr class="border-b border-ed-border/50 hover:bg-ed-panel/50 transition-colors"
              class:text-ed-dim={body.bioSignals === 0 && !body.landable}>
            <td class="py-1.5 px-2 font-mono">{body.shortName || body.name}</td>
            <td class="py-1.5 px-2">{body.type}</td>
            <td class="py-1.5 px-2 text-right font-mono">{body.distanceLs?.toFixed(0) ?? "—"}</td>
            <td class="py-1.5 px-2 text-right font-mono">{body.gravity ? body.gravity.toFixed(2) + "g" : "—"}</td>
            <td class="py-1.5 px-2 text-xs">{body.atmosphere || "None"}</td>
            <td class="py-1.5 px-2 text-center">{body.landable ? "✓" : "—"}</td>
            <td class="py-1.5 px-2 text-right font-mono"
                class:text-ed-green={body.bioSignals > 0}>
              {body.bioSignals > 0 ? body.bioSignals : "—"}
            </td>
            <td class="py-1.5 px-2 text-right font-mono text-ed-amber">
              {body.estimatedValue ? (body.estimatedValue / 1_000_000).toFixed(1) + "M" : "—"}
            </td>
            <td class="py-1.5 px-2 text-center text-xs">
              {#if body.personalStatus === "bio_complete"}
                <span class="text-ed-green">Done</span>
              {:else if body.personalStatus === "dss"}
                <span class="text-ed-blue">DSS</span>
              {:else if body.personalStatus === "fss"}
                <span class="text-ed-text-muted">FSS</span>
              {:else}
                <span class="text-ed-dim">—</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <div class="ed-card text-ed-text-muted text-center py-4">
    No bodies scanned yet
  </div>
{/if}
