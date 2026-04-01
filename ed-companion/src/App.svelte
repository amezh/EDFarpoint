<script lang="ts">
  import BioTracker from "$lib/components/BioTracker/BioTracker.svelte";
  import Header from "$lib/components/Header.svelte";
  import LifetimeStats from "$lib/components/LifetimeStats/LifetimeStats.svelte";
  import RouteView from "$lib/components/RouteView/RouteView.svelte";
  import Settings from "$lib/components/Settings/Settings.svelte";
  import StatusBar from "$lib/components/StatusBar.svelte";
  import SystemView from "$lib/components/SystemView.svelte";
  import TripStats from "$lib/components/TripStats/TripStats.svelte";
  import { bioStore } from "$lib/stores/bio.svelte";
  import { journalStore } from "$lib/stores/journal.svelte";
  import { lifetimeStore } from "$lib/stores/lifetime.svelte";
  import { routeStore } from "$lib/stores/route.svelte";
  import { statusStore } from "$lib/stores/status.svelte";
  import { systemStore } from "$lib/stores/system.svelte";
  import { tripStore } from "$lib/stores/trip.svelte";
  import { getSpeciesValue } from "$lib/utils/bioValues";
  import { estimateCartoValue, estimateStarValue } from "$lib/utils/valueCalc";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";

  type TabId = "system" | "route" | "bio" | "stats" | "settings";
  let activeTab: TabId = $state("system");
  let ready = $state(false);
  let statsLoading = $state(true);
  let statsProgress = $state("");
  let lastDockInfo = $state<{ timestamp: string; station: string } | null>(null);

  const tabs: { id: TabId; label: string }[] = [
    { id: "route", label: "Route" },
    { id: "system", label: "Discovery" },
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
        tripStore.addSystem(
          data.StarSystem as string,
          (data.JumpDist as number) ?? 0,
        );
        if (event === "FSDJump") {
          routeStore.advanceRoute(data.StarSystem as string);
        }
        break;

      case "Scan": {
        const isStar = !!(data.StarType);
        if (isStar) {
          // Star scan — still has carto value
          const starValue = estimateStarValue(
            data.StarType as string,
            data.WasDiscovered as boolean,
          );
          tripStore.addCartoValue(starValue);
        } else {
          // Body scan
          systemStore.addOrUpdateBody(data);
          const isFirst = !(data.WasDiscovered as boolean);
          tripStore.addBodyScan(isFirst);

          // Estimate carto value for this body
          const bodyType = (data.PlanetClass as string) ?? "";
          const terraformable = (data.TerraformState as string) === "Terraformable";
          const value = estimateCartoValue({
            bodyType,
            terraformable,
            wasDiscovered: (data.WasDiscovered as boolean) ?? false,
            wasMapped: (data.WasMapped as boolean) ?? false,
            withDSS: false,
          });
          tripStore.addCartoValue(value);
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
          const bodyId = data.BodyID as number;
          systemStore.markBodyMapped(bodyId);
          tripStore.addBodyMapped();

          // Add DSS mapping bonus to carto value
          const body = systemStore.current?.bodies.find((b) => b.bodyId === bodyId);
          if (body) {
            const dssValue = estimateCartoValue({
              bodyType: body.type,
              terraformable: body.terraformable,
              wasDiscovered: body.wasDiscovered,
              wasMapped: body.wasMapped,
              withDSS: true,
            });
            // DSS value is the full mapped value minus the FSS-only value already counted
            const fssValue = estimateCartoValue({
              bodyType: body.type,
              terraformable: body.terraformable,
              wasDiscovered: body.wasDiscovered,
              wasMapped: body.wasMapped,
              withDSS: false,
            });
            tripStore.addCartoValue(dssValue - fssValue);
          }
        }
        break;

      case "ScanOrganic":
        bioStore.handleScanOrganic(data);
        if ((data.ScanType as string) === "Analyse") {
          const speciesName = (data.Species_Localised as string) ?? (data.Species as string) ?? "";
          tripStore.addBioAnalysis(getSpeciesValue(speciesName));
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

  /** Process a journal event for lifetime stats only (no system/bio state) */
  function handleLifetimeEvent(data: Record<string, unknown>) {
    const event = data.event as string;
    if (!event) return;

    switch (event) {
      case "FSDJump":
        lifetimeStore.addSystem();
        lifetimeStore.addDistance((data.JumpDist as number) ?? 0);
        break;
      case "Scan": {
        const isStar = !!(data.StarType);
        if (isStar) {
          lifetimeStore.addCartoEarned(estimateStarValue(data.StarType as string, data.WasDiscovered as boolean));
        } else {
          lifetimeStore.addBodyScan();
          const value = estimateCartoValue({
            bodyType: (data.PlanetClass as string) ?? "",
            terraformable: (data.TerraformState as string) === "Terraformable",
            wasDiscovered: (data.WasDiscovered as boolean) ?? false,
            wasMapped: (data.WasMapped as boolean) ?? false,
            withDSS: false,
          });
          lifetimeStore.addCartoEarned(value);
        }
        break;
      }
      case "SAASignalsFound":
        lifetimeStore.addBodyMap();
        break;
      case "ScanOrganic":
        if ((data.ScanType as string) === "Analyse") {
          const lsName = (data.Species_Localised as string) ?? (data.Species as string) ?? "";
          lifetimeStore.addBioSpecies(
            lsName,
            getSpeciesValue(lsName),
          );
        }
        break;
    }
  }

  onMount(() => {
    // Pull structured history from Rust backend
    invoke<Record<string, unknown> | null>("get_journal_history").then((result) => {
      if (!result) {
        ready = true;
        statsLoading = false;
        return;
      }

      const allEvents = result.allEvents as Record<string, unknown>[];
      const tripStartIdx = result.tripStartIdx as number;
      lastDockInfo = result.lastDockTimestamp
        ? { timestamp: result.lastDockTimestamp as string, station: (result.lastDockStation as string) ?? "" }
        : null;

      // Phase 1: Process trip events immediately (post-dock → end)
      // This is fast since it's typically just the recent sessions
      for (let i = tripStartIdx; i < allEvents.length; i++) {
        handleJournalEvent(allEvents[i]);
      }
      ready = true; // Show UI now with trip data

      // Phase 2: Process ALL events for lifetime stats in background chunks
      statsProgress = `Processing lifetime stats (${allEvents.length} events)...`;
      let li = 0;
      const CHUNK = 5000;

      function processLifetimeChunk() {
        const end = Math.min(li + CHUNK, allEvents.length);
        for (; li < end; li++) {
          handleLifetimeEvent(allEvents[li]);
        }

        if (li < allEvents.length) {
          statsProgress = `Lifetime stats... ${Math.round((li / allEvents.length) * 100)}%`;
          requestAnimationFrame(processLifetimeChunk);
        } else {
          statsLoading = false;
          statsProgress = "";
        }
      }

      requestAnimationFrame(processLifetimeChunk);
    }).catch(() => {
      ready = true;
      statsLoading = false;
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
    <div class="text-ed-orange text-2xl font-bold tracking-wider">ED Farpoint</div>
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
          {#if lastDockInfo}
            <div class="text-xs text-ed-text-muted px-1">
              Last docked: {lastDockInfo.station} · {lastDockInfo.timestamp}
            </div>
          {:else}
            <div class="text-xs text-ed-amber px-1">Never docked — entire history is one trip</div>
          {/if}
          <TripStats />
          {#if statsLoading}
            <div class="ed-card text-center text-ed-text-muted text-sm py-4">
              <p>{statsProgress}</p>
            </div>
          {:else}
            <LifetimeStats />
          {/if}
        </div>
      {:else if activeTab === "settings"}
        <Settings />
      {/if}
    </main>
  </div>
{/if}
