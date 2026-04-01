<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import Header from "$lib/components/Header.svelte";
  import StatusBar from "$lib/components/StatusBar.svelte";
  import SystemView from "$lib/components/SystemView.svelte";
  import RouteView from "$lib/components/RouteView/RouteView.svelte";
  import BioTracker from "$lib/components/BioTracker/BioTracker.svelte";
  import TripStats from "$lib/components/TripStats/TripStats.svelte";
  import LifetimeStats from "$lib/components/LifetimeStats/LifetimeStats.svelte";
  import Settings from "$lib/components/Settings/Settings.svelte";
  import { journalStore } from "$lib/stores/journal.svelte";
  import { statusStore } from "$lib/stores/status.svelte";
  import { systemStore } from "$lib/stores/system.svelte";
  import { routeStore } from "$lib/stores/route.svelte";
  import { bioStore } from "$lib/stores/bio.svelte";
  import { tripStore } from "$lib/stores/trip.svelte";

  type TabId = "system" | "route" | "bio" | "stats" | "settings";
  let activeTab: TabId = $state("system");
  let ready = $state(false);

  const tabs: { id: TabId; label: string }[] = [
    { id: "system", label: "System" },
    { id: "route", label: "Route" },
    { id: "bio", label: "Bio" },
    { id: "stats", label: "Stats" },
    { id: "settings", label: "Settings" },
  ];

  function handleJournalEvent(data: Record<string, unknown>) {
    const event = data.event as string;
    if (!event) return;

    journalStore.handleEvent(data);

    switch (event) {
      case "FSDJump":
      case "Location":
        systemStore.setSystem(data);
        if (event === "FSDJump") {
          tripStore.addSystem(
            data.StarSystem as string,
            (data.JumpDist as number) ?? 0,
          );
          routeStore.advanceRoute(data.StarSystem as string);
        }
        break;

      case "Scan": {
        const isStar = !!(data.StarType);
        if (!isStar) {
          systemStore.addOrUpdateBody(data);
          tripStore.addBodyScan(!(data.WasDiscovered as boolean));
        }
        break;
      }

      case "FSSDiscoveryScan":
        systemStore.updateFSSProgress(data);
        break;

      case "FSSBodySignals":
      case "SAASignalsFound":
        systemStore.updateBodySignals(data);
        if (event === "SAASignalsFound") {
          systemStore.markBodyMapped(data.BodyID as number);
          tripStore.addBodyMapped();
        }
        break;

      case "ScanOrganic":
        bioStore.handleScanOrganic(data);
        if ((data.ScanType as string) === "Analyse") {
          tripStore.addBioAnalysis(0);
        } else if ((data.ScanType as string) === "Log") {
          tripStore.addBioScan();
        }
        break;

      case "ApproachBody":
        bioStore.setPlanet(
          data.Body as string,
          data.BodyID as number,
          data.SystemAddress as number,
        );
        break;

      case "LeaveBody":
        bioStore.leavePlanet();
        break;

      case "Docked":
        tripStore.reset();
        break;
    }
  }

  onMount(() => {
    // Pull historical events from Rust backend (frontend-initiated, no race condition)
    invoke<Record<string, unknown>[]>("get_journal_history").then((events) => {
      for (const ev of events) {
        handleJournalEvent(ev);
      }
      ready = true;
    }).catch(() => {
      ready = true; // Show UI even if history pull fails
    });

    // Live events (after startup)
    const unlistenJournal = listen<unknown>("journal-event", (event) => {
      handleJournalEvent(event.payload as Record<string, unknown>);
    });

    const unlistenStatus = listen<unknown>("status-update", (event) => {
      statusStore.update(event.payload);
    });

    const unlistenNavRoute = listen<unknown>("navroute-update", (event) => {
      routeStore.setRoute(event.payload as Record<string, unknown>);
    });

    return () => {
      unlistenJournal.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
      unlistenNavRoute.then((fn) => fn());
    };
  });
</script>

{#if !ready}
  <div class="h-screen flex flex-col items-center justify-center bg-ed-bg text-ed-text gap-4">
    <div class="text-ed-orange text-2xl font-bold tracking-wider">ED Companion</div>
    <div class="text-ed-text-muted text-sm">Reading journal...</div>
    <div class="w-48 h-1 bg-ed-surface rounded overflow-hidden">
      <div class="h-full bg-ed-orange rounded animate-pulse" style="width: 60%"></div>
    </div>
  </div>
{:else}
  <div class="h-screen flex flex-col bg-ed-bg text-ed-text overflow-hidden select-none">
    <Header />
    <StatusBar />

    <nav class="flex border-b border-ed-border bg-ed-panel px-2">
      {#each tabs as tab}
        <button
          class="px-4 py-2 text-sm transition-colors border-b-2"
          class:border-ed-orange={activeTab === tab.id}
          class:text-ed-orange={activeTab === tab.id}
          class:border-transparent={activeTab !== tab.id}
          class:text-ed-text-muted={activeTab !== tab.id}
          class:hover:text-ed-text={activeTab !== tab.id}
          onclick={() => (activeTab = tab.id)}
        >
          {tab.label}
        </button>
      {/each}
    </nav>

    <main class="flex-1 overflow-y-auto p-3">
      {#if activeTab === "system"}
        <SystemView />
      {:else if activeTab === "route"}
        <RouteView />
      {:else if activeTab === "bio"}
        <BioTracker />
      {:else if activeTab === "stats"}
        <div class="flex flex-col gap-4">
          <TripStats />
          <LifetimeStats />
        </div>
      {:else if activeTab === "settings"}
        <Settings />
      {/if}
    </main>
  </div>
{/if}
