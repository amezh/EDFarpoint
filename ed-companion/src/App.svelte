<script lang="ts">
  import BioTracker from "$lib/components/BioTracker/BioTracker.svelte";
  import RouteView from "$lib/components/RouteView/RouteView.svelte";
  import Settings from "$lib/components/Settings/Settings.svelte";
  import SystemView from "$lib/components/SystemView.svelte";
  import TripStats from "$lib/components/TripStats/TripStats.svelte";
  import { bioStore } from "$lib/stores/bio.svelte";
  import { journalStore } from "$lib/stores/journal.svelte";
  import { lifetimeStore } from "$lib/stores/lifetime.svelte";
  import { routeStore } from "$lib/stores/route.svelte";
  import { statusStore } from "$lib/stores/status.svelte";
  import { systemStore } from "$lib/stores/system.svelte";
  import { tripStore } from "$lib/stores/trip.svelte";
  import { expeditionStore } from "$lib/stores/expedition.svelte";
  import { configStore } from "$lib/stores/config.svelte";
  import { getSpeciesValue } from "$lib/utils/bioValues";
  import { predictBio } from "$lib/utils/bioPredict";
  import { estimateCartoValue, estimateStarValue } from "$lib/utils/valueCalc";
  import { pushRemoteState } from "$lib/utils/remotePush";
  import type { Body } from "$lib/stores/system.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";

  let ready = $state(false);
  let showSettings = $state(false);
  let statsLoading = $state(true);
  let statsProgress = $state("");
  let lastDockInfo = $state<{ timestamp: string; station: string } | null>(null);

  function fmtCr(v: number): string {
    if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + "B";
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
    if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
    return v.toString();
  }

  // Push state to remote WebSocket server when stores change
  $effect(() => { pushRemoteState("system", systemStore.current); });
  $effect(() => { pushRemoteState("route", routeStore.current); });
  $effect(() => { pushRemoteState("expedition", expeditionStore.visited); });
  $effect(() => { pushRemoteState("trip", tripStore.current); });
  $effect(() => { pushRemoteState("status", statusStore.current); });

  // Track body discovery status: key = "systemAddr:bodyId" => wasDiscovered
  const bodyDiscoveryMap = new Map<string, boolean>();

  function bodyKey(systemAddr: number, bodyId: number) {
    return `${systemAddr}:${bodyId}`;
  }

  async function fetchEdsmBodies(systemName: string) {
    try {
      const result = await invoke<Array<Record<string, unknown>> | null>("fetch_edsm_bodies", { systemName });
      if (result) {
        systemStore.applyEdsmBodies(result as Array<{ body_id?: number; name?: string; discovery?: { commander?: string; date?: string } }>);
      }
    } catch { /* EDSM may be unreachable — silently ignore */ }
  }

  async function triggerBioPrediction(body: Body) {
    if (body.bioSignals === 0 || body.bioSpeciesPredicted.length > 0) return;
    if (!body.planetClass) return; // stub from FSSBodySignals — wait for Scan
    const starType = systemStore.getParentStarType(body);
    if (!starType) return; // star not scanned yet — will retry when star arrives
    // Pass AtmosphereType enum (e.g. "ThinArgon") — Rust normalizes to base type ("Argon")
    const result = await predictBio(
      body.name,
      body.bodyId,
      body.bioSignals,
      body.planetClass,
      body.atmosphereType || body.atmosphere,
      body.gravity ?? 0,
      body.temperature ?? 0,
      body.volcanism,
      starType,
      body.distanceLs ?? 0,
    );
    if (result) {
      systemStore.updateBioPrediction(body.bodyId, result);
    }
  }

  function handleJournalEvent(data: Record<string, unknown>) {
    const event = data.event as string;
    if (!event) return;

    journalStore.handleEvent(data);

    switch (event) {
      case "FSDJump":
      case "Location":
        systemStore.setSystem(data);
        expeditionStore.enterSystem(data);
        // Fetch EDSM body data in background for discoverer info
        fetchEdsmBodies(data.StarSystem as string);
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
        // Always add to bodies list (for system map)
        systemStore.addOrUpdateBody(data);

        if (isStar) {
          const starValue = estimateStarValue(
            data.StarType as string,
            (data.StellarMass as number) ?? 1,
            !!(data.WasDiscovered),
          );
          tripStore.addStarScan(starValue);
          if (systemStore.current?.name) {
            expeditionStore.addCartoValue(systemStore.current.name, starValue);
            if (!(data.WasDiscovered)) {
              expeditionStore.markFirstDiscoveryStar(systemStore.current.name);
            }
          }

          // Track star type for bio predictions
          const starBodyId = data.BodyID as number;
          const starType = data.StarType as string;
          if (starBodyId != null && starType) {
            systemStore.addStar(starBodyId, starType);
            // Re-trigger predictions for bio bodies that were waiting for star type
            for (const body of systemStore.current?.bodies ?? []) {
              triggerBioPrediction(body);
            }
          }
        } else {
          systemStore.addOrUpdateBody(data);
          const wasDiscovered = !!(data.WasDiscovered);
          const isFirst = !wasDiscovered;

          // Track body discovery status for bio bonus later
          const sysAddr = data.SystemAddress as number;
          const bodyId = data.BodyID as number;
          if (sysAddr && bodyId) {
            bodyDiscoveryMap.set(bodyKey(sysAddr, bodyId), wasDiscovered);
          }

          const fssValue = estimateCartoValue({
            bodyType: (data.PlanetClass as string) ?? "",
            terraformable: (data.TerraformState as string) === "Terraformable",
            wasDiscovered,
            wasMapped: !!(data.WasMapped),
            massEM: (data.MassEM as number) ?? undefined,
            withDSS: false,
          });
          tripStore.addBodyScan(isFirst, fssValue);
          if (systemStore.current?.name) {
            expeditionStore.addCartoValue(systemStore.current.name, fssValue);
            expeditionStore.addBodyScanned(systemStore.current.name);
            if (isFirst) expeditionStore.markFirstDiscoveryBody(systemStore.current.name);
          }

          // Trigger bio prediction for this body
          const scannedBody = systemStore.current?.bodies.find((b) => b.bodyId === bodyId);
          if (scannedBody) {
            triggerBioPrediction(scannedBody);
          }
        }
        break;
      }

      case "FSSDiscoveryScan":
        systemStore.updateFSSProgress(data);
        break;

      case "FSSBodySignals":
      case "SAASignalsFound":
        systemStore.updateBodySignals(data);

        // Trigger bio prediction when signals are first detected
        if (event === "FSSBodySignals") {
          const sigBody = systemStore.current?.bodies.find(
            (b) => b.bodyId === (data.BodyID as number),
          );
          if (sigBody) {
            triggerBioPrediction(sigBody);
          }
        }

        if (event === "SAASignalsFound") {
          const bodyId = data.BodyID as number;
          systemStore.markBodyMapped(bodyId);

          // Calculate DSS mapping bonus (full mapped value minus FSS-only)
          const body = systemStore.current?.bodies.find((b) => b.bodyId === bodyId);
          if (body) {
            const common = {
              bodyType: body.planetClass || body.type,
              terraformable: body.terraformable,
              wasDiscovered: body.wasDiscovered,
              wasMapped: body.wasMapped,
            };
            const dssValue = estimateCartoValue({ ...common, withDSS: true });
            const fssValue = estimateCartoValue({ ...common, withDSS: false });
            const dssBonus = Math.max(0, dssValue - fssValue);
            tripStore.addBodyMapped(dssBonus);
            if (systemStore.current?.name) {
              expeditionStore.addCartoValue(systemStore.current.name, dssBonus);
              expeditionStore.addBodyMapped(systemStore.current.name);
            }
          } else {
            tripStore.addBodyMapped(0);
            if (systemStore.current?.name) {
              expeditionStore.addBodyMapped(systemStore.current.name);
            }
          }
        }
        break;

      case "ScanOrganic":
        bioStore.handleScanOrganic(data, statusStore.current.latitude, statusStore.current.longitude);
        if ((data.ScanType as string) === "Analyse") {
          const speciesName = (data.Species_Localised as string) ?? (data.Species as string) ?? "";
          const baseValue = getSpeciesValue(speciesName);
          // Check if body was undiscovered (first discovery bio bonus)
          const sysAddr = data.SystemAddress as number;
          const bodyId = data.Body as number;
          const wasDisc = bodyDiscoveryMap.get(bodyKey(sysAddr, bodyId)) ?? true;
          tripStore.addBioAnalysis(baseValue, !wasDisc);
          if (systemStore.current?.name) {
            const totalBioValue = !wasDisc ? baseValue * 5 : baseValue;
            expeditionStore.addBioValue(systemStore.current.name, totalBioValue);
          }
        } else if ((data.ScanType as string) === "Log") {
          tripStore.addBioScan();
        }
        break;

      case "ApproachBody": {
        const approachBodyId = data.BodyID as number;
        const approachBody = systemStore.current?.bodies.find((b) => b.bodyId === approachBodyId);
        bioStore.setPlanet(
          data.Body as string,
          approachBodyId,
          data.SystemAddress as number,
          approachBody?.radius ?? null,
        );
        break;
      }

      case "LeaveBody":
        bioStore.leavePlanet();
        break;

      case "Docked":
        tripStore.reset();
        expeditionStore.reset();
        bodyDiscoveryMap.clear();
        break;
    }
  }

  // Lightweight body cache for lifetime stats processing
  // key = "systemAddr:bodyId" => { planetClass, terraformable, wasDiscovered, wasMapped, massEM }
  interface BodyInfo {
    planetClass: string;
    terraformable: boolean;
    wasDiscovered: boolean;
    wasMapped: boolean;
    massEM?: number;
  }
  const bodyScanCache = new Map<string, BodyInfo>();

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
          lifetimeStore.addStarScan(
            estimateStarValue(
              data.StarType as string,
              (data.StellarMass as number) ?? 1,
              !!(data.WasDiscovered),
            ),
          );
        } else {
          const wasDiscovered = !!(data.WasDiscovered);
          const wasMapped = !!(data.WasMapped);
          const sysAddr = data.SystemAddress as number;
          const bid = data.BodyID as number;
          const bk = bodyKey(sysAddr, bid);

          // Track for bio bonus
          if (sysAddr && bid) {
            bodyDiscoveryMap.set(bk, wasDiscovered);
          }

          const planetClass = (data.PlanetClass as string) ?? "";
          const terraformable = (data.TerraformState as string) === "Terraformable";
          const massEM = (data.MassEM as number) ?? undefined;

          // Cache body info for DSS lookup later
          bodyScanCache.set(bk, { planetClass, terraformable, wasDiscovered, wasMapped, massEM });

          const fssValue = estimateCartoValue({
            bodyType: planetClass,
            terraformable,
            wasDiscovered,
            wasMapped,
            massEM,
            withDSS: false,
          });
          lifetimeStore.addBodyScan(fssValue);
        }
        break;
      }
      case "SAASignalsFound": {
        // Calculate DSS mapping bonus using cached body scan data
        const sysAddr = data.SystemAddress as number;
        const bid = data.BodyID as number;
        const cached = bodyScanCache.get(bodyKey(sysAddr, bid));
        if (cached) {
          const common = {
            bodyType: cached.planetClass,
            terraformable: cached.terraformable,
            wasDiscovered: cached.wasDiscovered,
            wasMapped: cached.wasMapped,
            massEM: cached.massEM,
          };
          const dssValue = estimateCartoValue({ ...common, withDSS: true });
          const fssValue = estimateCartoValue({ ...common, withDSS: false });
          lifetimeStore.addBodyMap(Math.max(0, dssValue - fssValue));
        } else {
          lifetimeStore.addBodyMap(0);
        }
        break;
      }
      case "ScanOrganic":
        if ((data.ScanType as string) === "Analyse") {
          const lsName = (data.Species_Localised as string) ?? (data.Species as string) ?? "";
          const baseValue = getSpeciesValue(lsName);
          const sysAddr = data.SystemAddress as number;
          const bid = data.Body as number;
          const wasDisc = bodyDiscoveryMap.get(bodyKey(sysAddr, bid)) ?? true;
          lifetimeStore.addBioSpecies(lsName, baseValue, !wasDisc);
        }
        break;
    }
  }

  onMount(() => {
    // Load app config
    configStore.load();

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

      // Batch-trigger bio predictions for any bodies that loaded from history
      for (const body of systemStore.current?.bodies ?? []) {
        triggerBioPrediction(body);
      }

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
    <!-- Top bar: system + CMDR + trip value + settings toggle -->
    <header class="flex items-center gap-4 px-4 py-1.5 bg-ed-panel border-b border-ed-border">
      <span class="text-ed-orange font-bold tracking-wide">ED Farpoint</span>
      {#if journalStore.commander}
        <span class="text-ed-text-muted text-xs">CMDR {journalStore.commander}</span>
      {/if}
      {#if systemStore.current}
        <span class="text-ed-amber text-sm font-bold">{systemStore.current.name}</span>
        <span class="text-ed-text-muted text-xs">{systemStore.current.distanceFromSol?.toFixed(0)} LY</span>
      {/if}
      <div class="ml-auto flex items-center gap-4 text-xs font-mono">
        <span>
          <span class="text-ed-text-muted">CARTO</span>
          <span class="text-ed-amber ml-1">{fmtCr(tripStore.current.cartoFSSValue + tripStore.current.cartoDSSValue)}</span>
        </span>
        <span>
          <span class="text-ed-text-muted">BIO</span>
          <span class="text-ed-green ml-1">{fmtCr(tripStore.current.bioValueBase + tripStore.current.bioValueBonus)}</span>
        </span>
        <span>
          <span class="text-ed-text-muted">TOTAL</span>
          <span class="text-ed-orange font-bold ml-1">{fmtCr(tripStore.current.cartoFSSValue + tripStore.current.cartoDSSValue + tripStore.current.bioValueBase + tripStore.current.bioValueBonus)}</span>
        </span>
        <span class="text-ed-text-muted">
          {tripStore.current.systemsVisited} sys | {tripStore.current.bodiesScanned} scn | {tripStore.current.bioSpeciesAnalysed} bio
          {#if statsLoading}
            <span class="text-ed-dim ml-1" title={statsProgress}>...</span>
          {/if}
          {#if lastDockInfo}
            <span class="ml-1" title="Last dock: {lastDockInfo.station}">| {lastDockInfo.station}</span>
          {/if}
        </span>
        <button class="text-ed-text-muted hover:text-ed-text transition-colors"
                onclick={() => showSettings = !showSettings}
                title="Settings">
          {showSettings ? "✕" : "⚙"}
        </button>
      </div>
    </header>

    <!-- Main dashboard: card grid -->
    {#if showSettings}
      <main class="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full">
        <Settings />
      </main>
    {:else}
      <main class="flex-1 overflow-y-auto p-2">
        <div class="grid grid-cols-[minmax(200px,1fr)_minmax(400px,3fr)_minmax(240px,1fr)] gap-2 h-full">
          <!-- Left card: Route -->
          <div class="bg-ed-surface/60 rounded-lg border border-ed-border/50 overflow-y-auto p-2">
            <RouteView />
          </div>

          <!-- Center card: System discovery -->
          <div class="bg-ed-surface/60 rounded-lg border border-ed-border/50 overflow-y-auto p-3">
            <SystemView />
          </div>

          <!-- Right card: Bio tracker + stats -->
          <div class="bg-ed-surface/60 rounded-lg border border-ed-border/50 overflow-y-auto p-2">
            <BioTracker />
            {#if !bioStore.currentPlanet || bioStore.currentPlanet.species.length === 0}
              <div class="mt-2 pt-2 border-t border-ed-border/30">
                <TripStats />
              </div>
            {/if}
          </div>
        </div>
      </main>
    {/if}
  </div>
{/if}
