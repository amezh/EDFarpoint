<script lang="ts">
  import { systemStore } from "$lib/stores/system.svelte";
  import { journalStore } from "$lib/stores/journal.svelte";

  const system = $derived(systemStore.current);
  const commander = $derived(journalStore.commander);
</script>

<header class="flex items-center justify-between px-4 py-2 bg-ed-panel border-b border-ed-border">
  <div class="flex items-center gap-3">
    <span class="text-ed-orange font-bold text-lg tracking-wide">ED Companion</span>
    {#if commander}
      <span class="text-ed-text-muted text-sm">CMDR {commander}</span>
    {/if}
  </div>
  <div class="flex items-center gap-3 text-sm">
    {#if system}
      <span class="text-ed-amber">{system.name}</span>
    {:else}
      <span class="text-ed-text-muted">No system</span>
    {/if}
  </div>
</header>
