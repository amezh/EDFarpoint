<script lang="ts">
  import type { OverlayCarrier } from "$lib/types/overlay";
  import { formatCredits } from "$lib/utils/overlayCalc";

  interface Props {
    carrier: OverlayCarrier;
    /** compact = overlay widget sizing (text-[10px]); default = main window sizing (text-sm) */
    compact?: boolean;
  }

  const { carrier: c, compact = false }: Props = $props();
  const fmt = formatCredits;

  const daysLeft = $derived(c.balanceRunsOutDays);
  const years = $derived(daysLeft != null ? Math.floor(daysLeft / 365) : 0);
  const months = $derived(daysLeft != null ? Math.floor((daysLeft % 365) / 30) : 0);
  const days = $derived(daysLeft != null ? Math.floor(daysLeft % 30) : 0);
  const hours = $derived(daysLeft != null ? Math.floor((daysLeft % 1) * 24) : 0);
  const isLow = $derived(daysLeft != null && daysLeft < 30);

  // Size-dependent classes
  const rowCls = $derived(compact ? "flex items-center justify-between py-0.5 text-[10px]" : "flex items-center justify-between text-sm");
  const labelCls = $derived(compact ? "text-gray-400" : "text-ed-text-muted");
  const mutedCls = $derived(compact ? "text-gray-300" : "text-ed-text");
  const amberCls = $derived(compact ? "text-amber-400" : "text-ed-amber");
  const amberDimCls = $derived(compact ? "text-amber-300" : "text-ed-amber");
  const redCls = $derived(compact ? "text-red-400" : "text-red-400");
  const greenCls = $derived(compact ? "text-green-400" : "text-green-400");
  const cyanCls = $derived(compact ? "text-cyan-400" : "text-cyan-400");
  const cyanDimCls = $derived(compact ? "text-cyan-300" : "text-cyan-300");
  const headerCls = $derived(compact
    ? "text-[10px] text-gray-500 uppercase tracking-wider mb-0.5"
    : "text-ed-text-muted text-xs uppercase tracking-wide mb-2");
  const headerNameCls = $derived(compact ? "text-amber-400 normal-case" : "text-ed-amber normal-case font-bold");
  const headerCallsignCls = $derived(compact ? "text-gray-600 ml-1" : "text-ed-text-muted ml-1");
</script>

<div class={headerCls}>
  Carrier — <span class={headerNameCls}>{c.name}</span>
  <span class={headerCallsignCls}>{c.callsign}</span>
</div>

<!-- Finances -->
<div class={rowCls}>
  <span class={labelCls}>Balance</span>
  <span class="{amberCls} font-mono">{fmt(c.carrierBalance)} Cr</span>
</div>
<div class={rowCls}>
  <span class={labelCls}>Available</span>
  <span class="{amberDimCls} font-mono">{fmt(c.availableBalance)} Cr</span>
</div>
<div class={rowCls}>
  <span class={labelCls}>Reserve</span>
  <span class="{mutedCls} font-mono">{fmt(c.reserveBalance)} Cr</span>
</div>
{#if c.taxRate > 0}
  <div class={rowCls}>
    <span class={labelCls}>Tax rate</span>
    <span class={mutedCls}>{(c.taxRate * 100).toFixed(0)}%</span>
  </div>
{/if}

<!-- Upkeep -->
<div class={rowCls}>
  <span class={labelCls}>Upkeep/week</span>
  <span class="{redCls} font-mono">{fmt(c.upkeepPerWeek)} Cr</span>
</div>
{#if daysLeft != null}
  <div class={rowCls}>
    <span class={labelCls}>Funds last</span>
    <span class="font-mono {isLow ? redCls : greenCls}">
      {#if years > 0}{years}y {/if}{#if months > 0}{months}m {/if}{days}d {hours}h
    </span>
  </div>
{/if}

<!-- Session income -->
{#if c.incomeThisSession !== 0}
  <div class={rowCls}>
    <span class={labelCls}>Session P/L</span>
    <span class="font-mono {c.incomeThisSession >= 0 ? greenCls : redCls}">
      {c.incomeThisSession >= 0 ? '+' : ''}{fmt(c.incomeThisSession)} Cr
    </span>
  </div>
{/if}

<!-- Cargo & trade orders -->
<div class={rowCls}>
  <span class={labelCls}>Cargo</span>
  <span class="{mutedCls} font-mono">{c.cargo} / {c.totalCapacity} t</span>
</div>
{#if c.buyOrderCount > 0 || c.sellOrderCount > 0}
  <div class={rowCls}>
    <span class={labelCls}>Buy orders</span>
    <span class={cyanCls}>{c.buyOrderCount} ({c.buyOrderTonnage} t)</span>
  </div>
  <div class={rowCls}>
    <span class={labelCls}>Sell orders</span>
    <span class={amberCls}>{c.sellOrderCount} ({c.sellOrderTonnage} t)</span>
  </div>
{/if}

<!-- Fuel & services -->
<div class={rowCls}>
  <span class={labelCls}>Fuel</span>
  <span class="{mutedCls} font-mono">{c.fuelLevel} t — {c.jumpRangeCurr.toFixed(1)} LY</span>
</div>
<div class={rowCls}>
  <span class={labelCls}>Services</span>
  <span class={mutedCls}>{c.activeServiceCount} active</span>
</div>

<!-- Pending jump -->
{#if c.pendingJump}
  <div class={rowCls}>
    <span class={cyanCls}>Jump to</span>
    <span class="{cyanDimCls} truncate ml-1">{c.pendingJump.system}</span>
  </div>
{/if}
