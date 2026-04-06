<script lang="ts">
  import BioTracker from "$lib/components/BioTracker/BioTracker.svelte";
  import ExpeditionHistory from "$lib/components/ExpeditionHistory/ExpeditionHistory.svelte";
  import RouteView from "$lib/components/RouteView/RouteView.svelte";
  import Settings from "$lib/components/Settings/Settings.svelte";
  import SystemView from "$lib/components/SystemView.svelte";
  import TodayStats from "$lib/components/TripStats/TodayStats.svelte";
  import TripStats from "$lib/components/TripStats/TripStats.svelte";
  import { bioStore } from "$lib/stores/bio.svelte";
  import { configStore } from "$lib/stores/config.svelte";
  import { expeditionStore } from "$lib/stores/expedition.svelte";
  import { journalStore } from "$lib/stores/journal.svelte";
  import { lifetimeStore } from "$lib/stores/lifetime.svelte";
  import { overlayViewModelStore } from "$lib/stores/overlayViewModel.svelte";
  import { routeStore } from "$lib/stores/route.svelte";
  import { statusStore } from "$lib/stores/status.svelte";
  import type { Body } from "$lib/stores/system.svelte";
  import { systemStore } from "$lib/stores/system.svelte";
  import { last24hStore } from "$lib/stores/session.svelte";
  import { tripStore } from "$lib/stores/trip.svelte";
  import { expeditionHistoryStore, type ExpeditionRecord } from "$lib/stores/expeditionHistory.svelte";
  import { predictBio } from "$lib/utils/bioPredict";
  import { getSpeciesValue } from "$lib/utils/bioValues";
  import { pushRemoteState } from "$lib/utils/remotePush";
  import { playDiscovery } from "$lib/utils/sounds";
  import { estimateCartoValue, estimateStarValue } from "$lib/utils/valueCalc";
  import { invoke } from "@tauri-apps/api/core";
  import { emitTo, listen } from "@tauri-apps/api/event";
  import { check } from "@tauri-apps/plugin-updater";
  import { onMount } from "svelte";

  // Events that indicate active player input — used for Cr/h play time tracking.
  // Excludes passive/ambient events (Music, ReceiveText, Friends, Status, etc.)
  // that fire while AFK and would inflate the timer.
  const ACTIVE_EVENTS = new Set([
    "FSDJump", "FSDTarget", "StartJump",
    "Scan", "FSSDiscoveryScan", "FSSBodySignals", "FSSAllBodiesFound",
    "SAAScanComplete", "SAASignalsFound",
    "ScanOrganic",
    "ApproachBody", "LeaveBody", "Touchdown", "Liftoff",
    "SupercruiseEntry", "SupercruiseExit",
    "Location", "Undocked", "Docked",
    "LaunchSRV", "DockSRV",
    "NavRoute", "NavRouteClear",
  ]);

  function emitToOverlay(event: string, payload: unknown) {
    emitTo("overlay", event, payload).catch(() => {});
  }

  let ready = $state(false);
  let appReady = false; // suppress sounds during history replay
  let showSettings = $state(false);
  let showHistory = $state(false);
  let statsLoading = $state(true);
  let statsProgress = $state("");
  let lastDockInfo = $state<{ timestamp: string; station: string } | null>(null);
  let cacheFileInfo = { fileName: "", fileOffset: 0 }; // for cache saving
  let lastProcessedTimestamp = ""; // track latest event timestamp for cache
  let appVersion = $state("dev");
  let updateAvailable = $state<Awaited<ReturnType<typeof check>> | null>(null);

  function fmtCr(v: number): string {
    if (!Number.isFinite(v)) return "0";
    if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + "B";
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
    if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
    return v.toString();
  }

  // Push state to remote WebSocket server
  $effect(() => { pushRemoteState("system", systemStore.current); });
  $effect(() => { pushRemoteState("route", routeStore.current); });
  $effect(() => { pushRemoteState("expedition", expeditionStore.visited); });
  $effect(() => { pushRemoteState("trip", tripStore.current); });
  $effect(() => { pushRemoteState("status", statusStore.current); });

  // Push pre-computed view model to overlay window and Rust cache (single event replaces 6 individual pushes)
  $effect(() => { const vm = overlayViewModelStore.current; emitToOverlay("overlay-viewmodel", vm); pushRemoteState("overlay", vm); });
  $effect(() => { if (configStore.current) emitToOverlay("overlay-opacity", configStore.current.window?.overlay_opacity ?? 1); });


  // Track body discovery status: key = "systemAddr:bodyId" => wasDiscovered
  const bodyDiscoveryMap = new Map<string, boolean>();
  const lifetimeBodyDiscoveryMap = new Map<string, boolean>();
  let lifetimeReady = false; // true after initial lifetime processing completes

  function bodyKey(systemAddr: number, bodyId: number) {
    return `${systemAddr}:${bodyId}`;
  }

  async function fetchEdsmBodies(systemName: string) {
    try {
      const result = await invoke<Array<Record<string, unknown>> | null>("fetch_edsm_bodies", { systemName });
      if (result) {
        systemStore.applyEdsmBodies(result);
      }
    } catch { /* EDSM may be unreachable — silently ignore */ }
  }

  /** Save journal cache to disk for fast startup next time */
  function saveJournalCache() {
    const lt = lifetimeStore.toJSON();
    const tr = tripStore.current;

    // Serialize system state (Map → array for JSON)
    const sys = systemStore.current;
    const systemStateJson = sys
      ? { ...sys, stars: Array.from(sys.stars.entries()) }
      : null;

    invoke("save_journal_cache", {
      cache: {
        version: 3,
        last_event_timestamp: lastProcessedTimestamp,
        last_file_name: cacheFileInfo.fileName,
        last_file_offset: cacheFileInfo.fileOffset,
        last_dock_timestamp: lastDockInfo?.timestamp ?? null,
        last_dock_station: lastDockInfo?.station ?? null,
        lifetime: {
          total_carto_fss: lt.totalCartoFSS,
          total_carto_dss: lt.totalCartoDSS,
          total_bio_base: lt.totalBioBase,
          total_bio_bonus: lt.totalBioBonus,
          total_systems: lt.totalSystems,
          total_bodies_scanned: lt.totalBodiesScanned,
          total_stars_scanned: lt.totalStarsScanned,
          total_bodies_mapped: lt.totalBodiesMapped,
          total_bio_species: lt.totalBioSpecies,
          total_distance_ly: lt.totalDistanceLy,
          rarest_species: lt.rarestSpecies,
          rarest_species_value: lt.rarestSpeciesValue,
        },
        trip: {
          systems_visited: tr.systemsVisited,
          bodies_scanned: tr.bodiesScanned,
          stars_scanned: tr.starsScanned,
          bodies_mapped: tr.bodiesMapped,
          first_discoveries: tr.firstDiscoveries,
          carto_fss_value: tr.cartoFSSValue,
          carto_dss_value: tr.cartoDSSValue,
          bio_value_base: tr.bioValueBase,
          bio_value_bonus: tr.bioValueBonus,
          bio_species_found: tr.bioSpeciesFound,
          bio_species_analysed: tr.bioSpeciesAnalysed,
          distance_travelled: tr.distanceTravelled,
          play_time_seconds: tr.playTimeSeconds,
          jumps: tr.jumps,
        },
        commander: journalStore.commander,
        ship_name: journalStore.shipName,
        ship_type: null,
        system_state: systemStateJson,
        expedition: expeditionStore.visited,
        bio: bioStore.toJSON(),
      },
    }).catch(() => {});
  }

  /** Fetch EDSM discoverer info for the next N route systems */
  async function fetchRouteDiscoverers() {
    const systems = routeStore.current.systems;
    // Skip first (current system), fetch next 5
    const upcoming = systems.slice(1, 6);
    for (const sys of upcoming) {
      if (sys.discoverer !== null || sys.discovererLoading) continue;
      routeStore.setDiscovererLoading(sys.name);
      try {
        const bodies = await invoke<Array<Record<string, unknown>> | null>("fetch_edsm_bodies", { systemName: sys.name });
        if (bodies && bodies.length > 0) {
          // Find main star (isMainStar or lowest bodyId) — Rust serializes as camelCase
          const mainStar = bodies.find((b: any) => b.isMainStar)
            ?? bodies.reduce((a: any, b: any) => ((a.bodyId ?? 999) < (b.bodyId ?? 999) ? a : b));
          const disc = (mainStar as any)?.discovery;
          routeStore.setDiscoverer(sys.name, disc?.commander ?? "???");
        } else {
          // System not in EDSM — undiscovered
          routeStore.setDiscoverer(sys.name, "???");
        }
      } catch {
        routeStore.setDiscoverer(sys.name, "???");
      }
    }
  }

  /** Cross-reference bio store's actual scan data with predictions to restore confidence */
  function syncPredictionConfidence(body: Body) {
    const sysAddr = systemStore.current?.address;
    if (!sysAddr) return;
    const planet = bioStore.currentPlanet;
    if (!planet || planet.bodyId !== body.bodyId || planet.systemAddress !== sysAddr) {
      // Check allPlanets map for historical data
      const planets = bioStore.planets;
      if (!planets) return;
      for (const [, p] of planets) {
        if (p.bodyId === body.bodyId && p.systemAddress === sysAddr) {
          applyConfidenceFromScans(body, p.species);
          return;
        }
      }
      return;
    }
    applyConfidenceFromScans(body, planet.species);
  }

  function applyConfidenceFromScans(body: Body, scans: Array<{ localName: string; analysed: boolean; samples: number }>) {
    for (const scan of scans) {
      const scanName = scan.localName.toLowerCase().split(" - ")[0].trim();
      for (const p of body.bioSpeciesPredicted) {
        if (p.name.toLowerCase() === scanName) {
          if (scan.analysed) {
            p.confidence = "analysed";
          } else if (scan.samples > 0) {
            p.confidence = "scanned";
          }
        }
      }
    }
    // Check if all bio on this body is now complete
    checkBioComplete(body);
  }

  function checkBioComplete(body: Body) {
    if (body.bioSignals <= 0 || body.personalStatus === "bio_complete") return;
    const analysedGenera = new Set(
      body.bioSpeciesPredicted
        .filter((p) => p.confidence === "analysed")
        .map((p) => p.name.split(" ")[0].toLowerCase())
    );
    if (analysedGenera.size >= body.bioSignals) {
      body.personalStatus = "bio_complete";
    }
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
      // If we have confirmed genuses from DSS, filter predictions to only matching genera
      if (body.confirmedGenuses.length > 0) {
        const confirmed = new Set(body.confirmedGenuses.map(g => g.toLowerCase()));
        result.species = result.species.filter(s => {
          const genus = s.name.split(" ")[0].toLowerCase();
          return confirmed.has(genus);
        });
        // Recalculate min/max with filtered list
        const sorted = [...result.species].sort((a, b) => b.value - a.value);
        result.max_value = sorted.slice(0, result.signal_count).reduce((s, sp) => s + sp.value, 0);
        result.min_value = sorted.slice(-result.signal_count).reduce((s, sp) => s + sp.value, 0);
      }
      systemStore.updateBioPrediction(body.bodyId, result);
      // Sync confidence from bio store's actual scan data (survives re-prediction)
      syncPredictionConfidence(body);
    }
  }

  function handleJournalEvent(data: Record<string, unknown>) {
    const event = data.event as string;
    if (!event) return;

    // Track play time — only from events that indicate active player input.
    // Passive events (Music, ReceiveText, Friends, etc.) fire while AFK
    // and would incorrectly inflate play time.
    const timestamp = data.timestamp as string | undefined;

    const eventIsRecent = !!timestamp && last24hStore.isRecent(timestamp);

    if (timestamp && ACTIVE_EVENTS.has(event)) {
      tripStore.trackTimestamp(timestamp);
      if (eventIsRecent) last24hStore.trackTimestamp(timestamp);
    }

    if (timestamp) lastProcessedTimestamp = timestamp;

    journalStore.handleEvent(data);

    switch (event) {
      case "FSDJump":
      case "Location":
        bioStore.leavePlanet(); // Clear any active planet tracker on system change
        systemStore.setSystem(data);
        expeditionStore.enterSystem(data);
        // Fetch EDSM body data in background for discoverer info
        fetchEdsmBodies(data.StarSystem as string);
        if (event === "FSDJump") {
          const jumpSys = data.StarSystem as string;
          const jumpDist = (data.JumpDist as number) ?? 0;
          tripStore.addSystem(jumpSys, jumpDist);
          if (eventIsRecent) last24hStore.addSystem(jumpSys, jumpDist);

          routeStore.advanceRoute(jumpSys);
          fetchRouteDiscoverers();
        } else {
          // Location event (game load) — register system without counting a jump
          const locSys = data.StarSystem as string;
          tripStore.addSystemVisit(locSys);
          if (eventIsRecent) last24hStore.addSystemVisit(locSys);

          // If player is on a planet surface (logged in while landed/on foot),
          // restore the active planet so bio tracker works immediately
          const locBodyId = data.BodyID as number;
          const locBodyName = data.Body as string;
          const locSysAddr = data.SystemAddress as number;
          if (locBodyId != null && locBodyName && data.BodyType === "Planet") {
            const locBody = systemStore.current?.bodies.find(b => b.bodyId === locBodyId);
            bioStore.setPlanet(locBodyName, locBodyId, locSysAddr, locBody?.radius ?? null);
          }
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
          if (eventIsRecent) last24hStore.addStarScan(starValue);

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
          if (eventIsRecent) last24hStore.addBodyScan(isFirst, fssValue);

          if (systemStore.current?.name) {
            expeditionStore.addCartoValue(systemStore.current.name, fssValue);
            expeditionStore.addBodyScanned(systemStore.current.name);
            if (isFirst) expeditionStore.markFirstDiscoveryBody(systemStore.current.name);
          }

          // Play sound for valuable planet discovery (only during live play)
          if (appReady && fssValue >= (configStore.current?.poi?.min_carto_value ?? 2_000_000)) {
            playDiscovery();
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
          // Play sound for bio signal discovery (only during live play, not history)
          const sigs = data.Signals as Array<{ Type: string; Count: number }> | undefined;
          if (appReady && sigs?.some(s => s.Type.includes("Biological"))) {
            playDiscovery();
          }
        }

        if (event === "SAASignalsFound") {
          // Re-trigger bio prediction with confirmed genuses from DSS
          const bodyId = data.BodyID as number;
          const dssBody = systemStore.current?.bodies.find((b) => b.bodyId === bodyId);
          if (dssBody && dssBody.confirmedGenuses.length > 0) {
            // Clear old predictions and re-predict with genus filter
            dssBody.bioSpeciesPredicted = [];
            triggerBioPrediction(dssBody);
          }
        }
        break;

      case "SAAScanComplete": {
        const bodyId = data.BodyID as number;
        systemStore.markBodyMapped(bodyId);

        // Calculate DSS mapping bonus (full mapped value minus FSS-only)
        const body = systemStore.current?.bodies.find((b) => b.bodyId === bodyId);
        if (body) {
          const probesUsed = (data.ProbesUsed as number) ?? 0;
          const effTarget = (data.EfficiencyTarget as number) ?? 0;
          const efficient = effTarget > 0 && probesUsed <= effTarget;
          const common = {
            bodyType: body.planetClass || body.type,
            terraformable: body.terraformable,
            wasDiscovered: body.wasDiscovered,
            wasMapped: body.wasMapped,
            massEM: body.massEM ?? undefined,
          };
          const dssValue = estimateCartoValue({ ...common, withDSS: true, efficiencyBonus: efficient });
          const fssValue = estimateCartoValue({ ...common, withDSS: false });
          const dssBonus = Math.max(0, dssValue - fssValue);
          tripStore.addBodyMapped(dssBonus);
          if (eventIsRecent) last24hStore.addBodyMapped(dssBonus);
          if (systemStore.current?.name) {
            expeditionStore.addCartoValue(systemStore.current.name, dssBonus);
            expeditionStore.addBodyMapped(systemStore.current.name);
          }
        } else {
          tripStore.addBodyMapped(0);
          if (eventIsRecent) last24hStore.addBodyMapped(0);
          if (systemStore.current?.name) {
            expeditionStore.addBodyMapped(systemStore.current.name);
          }
        }
        break;
      }

      case "ScanOrganic": {
        // Ensure planet is active — covers edge cases where ApproachBody/Location
        // didn't set it (e.g. history replay, late event ordering)
        const scanOrgBodyId = data.Body as number;
        const scanOrgSysAddr = data.SystemAddress as number;
        if (!bioStore.currentPlanet || bioStore.currentPlanet.bodyId !== scanOrgBodyId) {
          const scanOrgBody = systemStore.current?.bodies.find(b => b.bodyId === scanOrgBodyId);
          bioStore.setPlanet(
            scanOrgBody?.name ?? `Body ${scanOrgBodyId}`,
            scanOrgBodyId,
            scanOrgSysAddr,
            scanOrgBody?.radius ?? null,
          );
        }
        bioStore.handleScanOrganic(data, statusStore.current.latitude, statusStore.current.longitude);
        if ((data.ScanType as string) === "Analyse") {
          const speciesName = (data.Species_Localised as string) ?? (data.Species as string) ?? "";
          const baseValue = getSpeciesValue(speciesName);
          // Check if body was undiscovered (first discovery bio bonus)
          const sysAddr = data.SystemAddress as number;
          const bodyId = data.Body as number;
          const analyseBody = systemStore.current?.bodies.find(b => b.bodyId === bodyId);
          // Fall back to body's wasDiscovered flag if not in discovery map (e.g. scanned before cache point)
          const wasDisc = bodyDiscoveryMap.get(bodyKey(sysAddr, bodyId))
            ?? analyseBody?.wasDiscovered
            ?? true;
          tripStore.addBioAnalysis(baseValue, !wasDisc);
          if (eventIsRecent) last24hStore.addBioAnalysis(baseValue, !wasDisc);
          if (analyseBody) {
            const spLower = speciesName.toLowerCase().split(" - ")[0].trim();
            for (const p of analyseBody.bioSpeciesPredicted) {
              if (p.name.toLowerCase() === spLower) p.confidence = "analysed";
            }
            checkBioComplete(analyseBody);
          }
          if (systemStore.current?.name) {
            const totalBioValue = !wasDisc ? baseValue * 5 : baseValue;
            expeditionStore.addBioValue(systemStore.current.name, totalBioValue);
          }
        } else if ((data.ScanType as string) === "Log") {
          tripStore.addBioScan();
          // We now know the exact species — remove other predictions from the same genus
          const logBodyId = data.Body as number;
          const logSpecies = (data.Species_Localised as string) ?? (data.Species as string) ?? "";
          const logGenus = (data.Genus_Localised as string) ?? logSpecies.split(" ")[0];
          const logBody = systemStore.current?.bodies.find(b => b.bodyId === logBodyId);
          if (logBody && logGenus) {
            const genusLower = logGenus.toLowerCase();
            const speciesLower = logSpecies.toLowerCase().split(" - ")[0].trim();
            logBody.bioSpeciesPredicted = logBody.bioSpeciesPredicted.filter(p => {
              const pGenus = p.name.split(" ")[0].toLowerCase();
              if (pGenus === genusLower) {
                if (p.name.toLowerCase() === speciesLower) {
                  p.confidence = "scanned"; // confirmed, scanning in progress
                  return true;
                }
                return false; // remove other species from same genus
              }
              return true;
            });
          }
        }
        break;
      }

      case "ApproachBody": {
        const approachBodyId = data.BodyID as number;
        const approachBody = systemStore.current?.bodies.find((b) => b.bodyId === approachBodyId);
        // Mark as visited if only FSS'd or unvisited before
        if (approachBody && (approachBody.personalStatus === "fss" || approachBody.personalStatus === "unvisited")) {
          approachBody.personalStatus = "visited";
        }
        bioStore.setPlanet(
          data.Body as string,
          approachBodyId,
          data.SystemAddress as number,
          approachBody?.radius ?? null,
        );
        break;
      }

      case "LeaveBody":
      case "SupercruiseEntry":
        bioStore.leavePlanet();
        break;

      case "Touchdown": {
        const tdBodyId = data.BodyID as number;
        if (tdBodyId != null) {
          const tdBody = systemStore.current?.bodies.find(b => b.bodyId === tdBodyId);
          if (tdBody && tdBody.personalStatus !== "bio_complete") {
            tdBody.personalStatus = "landed";
          }
        }
        break;
      }

      case "Docked": {
        // Snapshot expedition BEFORE resetting (only if app is ready — skip during history replay)
        if (appReady) {
          const firstVisited = expeditionStore.visited[0];
          expeditionHistoryStore.snapshotCurrentTrip(
            tripStore.current,
            lastDockInfo?.timestamp ?? firstVisited?.timestamp ?? "",
            firstVisited?.name ?? "",
            (data.timestamp as string) ?? "",
            (data.StationName as string) ?? "",
            (data.StarSystem as string) ?? "",
          );
          lastDockInfo = {
            timestamp: (data.timestamp as string) ?? "",
            station: (data.StationName as string) ?? "",
          };
        }
        tripStore.reset();
        expeditionStore.reset();
        bodyDiscoveryMap.clear();
        break;
      }
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

          // Track for bio bonus (use lifetime-specific map)
          if (sysAddr && bid) {
            lifetimeBodyDiscoveryMap.set(bk, wasDiscovered);
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
      case "SAAScanComplete": {
        // Calculate DSS mapping bonus using cached body scan data
        const sysAddr = data.SystemAddress as number;
        const bid = data.BodyID as number;
        const cached = bodyScanCache.get(bodyKey(sysAddr, bid));
        if (cached) {
          const ltProbes = (data.ProbesUsed as number) ?? 0;
          const ltEffTarget = (data.EfficiencyTarget as number) ?? 0;
          const ltEfficient = ltEffTarget > 0 && ltProbes <= ltEffTarget;
          const common = {
            bodyType: cached.planetClass,
            terraformable: cached.terraformable,
            wasDiscovered: cached.wasDiscovered,
            wasMapped: cached.wasMapped,
            massEM: cached.massEM,
          };
          const dssValue = estimateCartoValue({ ...common, withDSS: true, efficiencyBonus: ltEfficient });
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
          // Fall back to bodyScanCache's wasDiscovered if not in discovery map
          const wasDisc = lifetimeBodyDiscoveryMap.get(bodyKey(sysAddr, bid))
            ?? bodyScanCache.get(bodyKey(sysAddr, bid))?.wasDiscovered
            ?? true;
          lifetimeStore.addBioSpecies(lsName, baseValue, !wasDisc);
        }
        break;
    }
  }

  onMount(() => {
    // Load app config and expedition history
    configStore.load();
    expeditionHistoryStore.load();
    invoke<string>("get_app_version").then(v => {
      appVersion = v === "0.0.0" ? "dev" : `v${v}`;
    }).catch(() => {});

    // Check for updates on startup and every 10 minutes
    function checkForUpdate() {
      check().then(update => {
        if (update) updateAvailable = update;
      }).catch(() => {});
    }
    checkForUpdate();
    const updateInterval = setInterval(checkForUpdate, 10 * 60 * 1000);

    // Pull structured history from Rust backend
    invoke<Record<string, unknown> | null>("get_journal_history").then((result) => {
      if (!result) {
        ready = true;
        appReady = true;
        statsLoading = false;
        return;
      }

      const allEvents = result.allEvents as Record<string, unknown>[];
      const tripStartIdx = result.tripStartIdx as number;
      cacheFileInfo = {
        fileName: (result.latestFileName as string) ?? "",
        fileOffset: (result.latestFileOffset as number) ?? 0,
      };
      lastDockInfo = result.lastDockTimestamp
        ? { timestamp: result.lastDockTimestamp as string, station: (result.lastDockStation as string) ?? "" }
        : null;

      // Seed stores from cache if available
      const cachedLifetime = result.cachedLifetime as Record<string, unknown> | null;
      const cachedTrip = result.cachedTrip as Record<string, unknown> | null;
      if (cachedLifetime) {
        lifetimeStore.seed({
          totalCartoFSS: (cachedLifetime.total_carto_fss as number) ?? 0,
          totalCartoDSS: (cachedLifetime.total_carto_dss as number) ?? 0,
          totalBioBase: (cachedLifetime.total_bio_base as number) ?? 0,
          totalBioBonus: (cachedLifetime.total_bio_bonus as number) ?? 0,
          totalSystems: (cachedLifetime.total_systems as number) ?? 0,
          totalBodiesScanned: (cachedLifetime.total_bodies_scanned as number) ?? 0,
          totalStarsScanned: (cachedLifetime.total_stars_scanned as number) ?? 0,
          totalBodiesMapped: (cachedLifetime.total_bodies_mapped as number) ?? 0,
          totalBioSpecies: (cachedLifetime.total_bio_species as number) ?? 0,
          totalDistanceLy: (cachedLifetime.total_distance_ly as number) ?? 0,
          rarestSpecies: (cachedLifetime.rarest_species as string) ?? null,
          rarestSpeciesValue: (cachedLifetime.rarest_species_value as number) ?? 0,
        });
      }

      // Seed trip from cache if no new dock happened in the new events
      const newEventsHaveDock = allEvents.some(e => e.event === "Docked");
      if (cachedTrip && !newEventsHaveDock) {
        tripStore.seed({
          systemsVisited: (cachedTrip.systems_visited as number) ?? 0,
          bodiesScanned: (cachedTrip.bodies_scanned as number) ?? 0,
          starsScanned: (cachedTrip.stars_scanned as number) ?? 0,
          bodiesMapped: (cachedTrip.bodies_mapped as number) ?? 0,
          firstDiscoveries: (cachedTrip.first_discoveries as number) ?? 0,
          cartoFSSValue: (cachedTrip.carto_fss_value as number) ?? 0,
          cartoDSSValue: (cachedTrip.carto_dss_value as number) ?? 0,
          bioValueBase: (cachedTrip.bio_value_base as number) ?? 0,
          bioValueBonus: (cachedTrip.bio_value_bonus as number) ?? 0,
          bioSpeciesFound: (cachedTrip.bio_species_found as number) ?? 0,
          bioSpeciesAnalysed: (cachedTrip.bio_species_analysed as number) ?? 0,
          distanceTravelled: (cachedTrip.distance_travelled as number) ?? 0,
          playTimeSeconds: (cachedTrip.play_time_seconds as number) ?? 0,
          jumps: (cachedTrip.jumps as number) ?? 0,
        });
      }

      // Seed additional stores from cache
      if (cachedLifetime) {
        const cachedCommander = result.cachedCommander as string | null;
        const cachedShipName = result.cachedShipName as string | null;
        const cachedSystemState = result.cachedSystemState as unknown;
        const cachedExpedition = result.cachedExpedition as unknown;
        const cachedBio = result.cachedBio as unknown;

        if (cachedCommander || cachedShipName) {
          journalStore.seed(cachedCommander, cachedShipName);
        }
        if (cachedSystemState) {
          systemStore.seedFromCache(cachedSystemState);
        }
        if (cachedExpedition) {
          expeditionStore.seedFromCache(cachedExpedition);
        }
        if (cachedBio) {
          bioStore.seedFromCache(cachedBio);
        }
      }

      if (cachedLifetime) {
        // === CACHED PATH: fast startup ===
        // Lifetime + trip + system + expedition already seeded from cache above.

        // Rebuild bodyDiscoveryMap and bodyScanCache from cached system bodies
        // so that DSS value calculations work for bodies scanned before the cache point
        if (systemStore.current) {
          for (const body of systemStore.current.bodies) {
            if (body.bodyId != null && systemStore.current.address) {
              const bk = bodyKey(systemStore.current.address, body.bodyId);
              bodyDiscoveryMap.set(bk, body.wasDiscovered);
              if (body.planetClass) {
                bodyScanCache.set(bk, {
                  planetClass: body.planetClass,
                  terraformable: body.terraformable,
                  wasDiscovered: body.wasDiscovered,
                  wasMapped: body.wasMapped,
                  massEM: body.massEM ?? undefined,
                });
              }
            }
          }
        }

        // allEvents contains ONLY new events since the cache.
        // Process ALL new events through both handlers (they accumulate on top of seeded values).
        for (let i = 0; i < allEvents.length; i++) {
          handleJournalEvent(allEvents[i]);
          handleLifetimeEvent(allEvents[i]);
        }

        // Trigger bio predictions and EDSM fetch for cached system
        for (const body of systemStore.current?.bodies ?? []) {
          triggerBioPrediction(body);
          syncPredictionConfidence(body);
        }
        if (systemStore.current?.name) {
          fetchEdsmBodies(systemStore.current.name);
          fetchRouteDiscoverers();
        }

        // Process last 24h events for the "Last 24h" stats panel.
        // These are pre-filtered by Rust to events within ~25h.
        // Build a local body scan lookup so SAAScanComplete can calculate proper DSS values.
        const recent24h = (result.recent24hEvents ?? []) as Record<string, unknown>[];
        const recent24hBodyScans = new Map<string, BodyInfo>();
        for (const ev of recent24h) {
          if (ev.event === "Scan" && !ev.StarType) {
            const sysAddr = ev.SystemAddress as number;
            const bid = ev.BodyID as number;
            if (sysAddr && bid) {
              recent24hBodyScans.set(bodyKey(sysAddr, bid), {
                planetClass: (ev.PlanetClass as string) ?? "",
                terraformable: (ev.TerraformState as string) === "Terraformable",
                wasDiscovered: !!(ev.WasDiscovered),
                wasMapped: !!(ev.WasMapped),
                massEM: (ev.MassEM as number) ?? undefined,
              });
            }
          }
        }
        for (const ev of recent24h) {
          const ts = ev.timestamp as string | undefined;
          if (ts && last24hStore.isRecent(ts)) {
            const event = ev.event as string;
            if (ACTIVE_EVENTS.has(event)) last24hStore.trackTimestamp(ts);
            // Mirror the relevant stat accumulation for last24h
            switch (event) {
              case "FSDJump":
                last24hStore.addSystem(ev.StarSystem as string, (ev.JumpDist as number) ?? 0);
                break;
              case "Location":
                last24hStore.addSystemVisit(ev.StarSystem as string);
                break;
              case "Scan":
                if (ev.StarType) {
                  last24hStore.addStarScan(estimateStarValue(ev.StarType as string, (ev.StellarMass as number) ?? 1, !!(ev.WasDiscovered)));
                } else {
                  const fv = estimateCartoValue({ bodyType: (ev.PlanetClass as string) ?? "", terraformable: (ev.TerraformState as string) === "Terraformable", wasDiscovered: !!(ev.WasDiscovered), wasMapped: !!(ev.WasMapped), massEM: (ev.MassEM as number) ?? undefined, withDSS: false });
                  last24hStore.addBodyScan(!ev.WasDiscovered, fv);
                }
                break;
              case "SAAScanComplete": {
                const sysAddr = ev.SystemAddress as number;
                const bid = ev.BodyID as number;
                const scanInfo = recent24hBodyScans.get(bodyKey(sysAddr, bid));
                if (scanInfo) {
                  const probesUsed = (ev.ProbesUsed as number) ?? 0;
                  const effTarget = (ev.EfficiencyTarget as number) ?? 0;
                  const efficient = effTarget > 0 && probesUsed <= effTarget;
                  const common = {
                    bodyType: scanInfo.planetClass,
                    terraformable: scanInfo.terraformable,
                    wasDiscovered: scanInfo.wasDiscovered,
                    wasMapped: scanInfo.wasMapped,
                    massEM: scanInfo.massEM,
                  };
                  const dssValue = estimateCartoValue({ ...common, withDSS: true, efficiencyBonus: efficient });
                  const fssValue = estimateCartoValue({ ...common, withDSS: false });
                  last24hStore.addBodyMapped(Math.max(0, dssValue - fssValue));
                } else {
                  last24hStore.addBodyMapped(0);
                }
                break;
              }
              case "ScanOrganic":
                if ((ev.ScanType as string) === "Analyse") {
                  const spName = (ev.Species_Localised as string) ?? (ev.Species as string) ?? "";
                  last24hStore.addBioAnalysis(getSpeciesValue(spName), !(ev.WasDiscovered));
                }
                break;
            }
          }
        }

        ready = true;
        appReady = true;
        statsLoading = false;
        lifetimeReady = true;

        // Update cache with new state
        saveJournalCache();
      } else {
        // === FULL READ PATH: no cache, first run ===
        // Phase 1: Process trip events immediately (post-dock → end)
        for (let i = tripStartIdx; i < allEvents.length; i++) {
          handleJournalEvent(allEvents[i]);
        }
        ready = true;
        appReady = true;

        // Batch-trigger bio predictions
        for (const body of systemStore.current?.bodies ?? []) {
          triggerBioPrediction(body);
          syncPredictionConfidence(body);
        }

        // Phase 2: Process ALL events for lifetime stats in background chunks
        // Also reconstruct expedition history from dock boundaries (one-time)
        const dockBounds = (result.dockBoundaries ?? []) as Array<{ eventIdx: number; timestamp: string; station: string; system: string }>;
        const shouldReconstruct = !expeditionHistoryStore.loaded || expeditionHistoryStore.expeditions.length === 0;

        statsProgress = `Processing lifetime stats (${allEvents.length} events)...`;
        let li = 0;
        const CHUNK = 5000;

        // Expedition reconstruction accumulators
        let expDockIdx = 0;
        const expAccum = {
          systemsVisited: 0, bodiesScanned: 0, starsScanned: 0, bodiesMapped: 0,
          firstDiscoveries: 0, cartoFSSValue: 0, cartoDSSValue: 0,
          bioValueBase: 0, bioValueBonus: 0, bioSpeciesFound: 0, bioSpeciesAnalysed: 0,
          distanceTravelled: 0, playTimeSeconds: 0, jumps: 0,
          startTimestamp: "", startSystem: "",
          lastEventTime: null as number | null,
          visitedSystems: new Set<string>(),
        };
        const MAX_GAP_MS = 15 * 60 * 1000;
        const reconstructedExpeditions: ExpeditionRecord[] = [];

        function resetExpAccum() {
          expAccum.systemsVisited = 0; expAccum.bodiesScanned = 0; expAccum.starsScanned = 0;
          expAccum.bodiesMapped = 0; expAccum.firstDiscoveries = 0;
          expAccum.cartoFSSValue = 0; expAccum.cartoDSSValue = 0;
          expAccum.bioValueBase = 0; expAccum.bioValueBonus = 0;
          expAccum.bioSpeciesFound = 0; expAccum.bioSpeciesAnalysed = 0;
          expAccum.distanceTravelled = 0; expAccum.playTimeSeconds = 0; expAccum.jumps = 0;
          expAccum.startTimestamp = ""; expAccum.startSystem = "";
          expAccum.lastEventTime = null;
          expAccum.visitedSystems.clear();
        }

        function accumExpEvent(ev: Record<string, unknown>) {
          const event = ev.event as string;
          if (!event) return;
          const ts = ev.timestamp as string | undefined;
          if (ts) {
            if (!expAccum.startTimestamp) expAccum.startTimestamp = ts;
            const t = new Date(ts).getTime();
            if (!isNaN(t) && expAccum.lastEventTime !== null) {
              const gap = t - expAccum.lastEventTime;
              if (gap > 0 && gap <= MAX_GAP_MS) expAccum.playTimeSeconds += gap / 1000;
            }
            if (!isNaN(t)) expAccum.lastEventTime = t;
          }
          switch (event) {
            case "FSDJump": {
              const name = ev.StarSystem as string;
              if (name && !expAccum.visitedSystems.has(name)) {
                expAccum.visitedSystems.add(name);
                expAccum.systemsVisited++;
              }
              if (!expAccum.startSystem) expAccum.startSystem = name ?? "";
              expAccum.jumps++;
              expAccum.distanceTravelled += (ev.JumpDist as number) ?? 0;
              break;
            }
            case "Location": {
              const name = ev.StarSystem as string;
              if (name && !expAccum.visitedSystems.has(name)) {
                expAccum.visitedSystems.add(name);
                expAccum.systemsVisited++;
              }
              if (!expAccum.startSystem) expAccum.startSystem = name ?? "";
              break;
            }
            case "Scan":
              if (ev.StarType) {
                expAccum.starsScanned++;
                expAccum.cartoFSSValue += estimateStarValue(ev.StarType as string, (ev.StellarMass as number) ?? 1, !!(ev.WasDiscovered));
              } else {
                expAccum.bodiesScanned++;
                if (!ev.WasDiscovered) expAccum.firstDiscoveries++;
                expAccum.cartoFSSValue += estimateCartoValue({
                  bodyType: (ev.PlanetClass as string) ?? "",
                  terraformable: (ev.TerraformState as string) === "Terraformable",
                  wasDiscovered: !!(ev.WasDiscovered), wasMapped: !!(ev.WasMapped),
                  massEM: (ev.MassEM as number) ?? undefined, withDSS: false,
                });
              }
              break;
            case "SAAScanComplete":
              expAccum.bodiesMapped++;
              break;
            case "ScanOrganic":
              if ((ev.ScanType as string) === "Log") expAccum.bioSpeciesFound++;
              if ((ev.ScanType as string) === "Analyse") {
                expAccum.bioSpeciesAnalysed++;
                const spName = (ev.Species_Localised as string) ?? (ev.Species as string) ?? "";
                const baseVal = getSpeciesValue(spName);
                expAccum.bioValueBase += baseVal;
                if (!ev.WasDiscovered) expAccum.bioValueBonus += baseVal * 4;
              }
              break;
          }
        }

        function processLifetimeChunk() {
          const end = Math.min(li + CHUNK, allEvents.length);
          for (; li < end; li++) {
            handleLifetimeEvent(allEvents[li]);

            // Expedition reconstruction: accumulate events per dock segment
            if (shouldReconstruct) {
              accumExpEvent(allEvents[li]);
              // Check if we hit a dock boundary
              if (expDockIdx < dockBounds.length && li === dockBounds[expDockIdx].eventIdx) {
                const dock = dockBounds[expDockIdx];
                reconstructedExpeditions.push({
                  id: dock.timestamp,
                  startTimestamp: expAccum.startTimestamp,
                  endTimestamp: dock.timestamp,
                  startSystem: expAccum.startSystem,
                  endStation: dock.station,
                  endSystem: dock.system,
                  systemsVisited: expAccum.systemsVisited,
                  bodiesScanned: expAccum.bodiesScanned,
                  starsScanned: expAccum.starsScanned,
                  bodiesMapped: expAccum.bodiesMapped,
                  firstDiscoveries: expAccum.firstDiscoveries,
                  cartoFSSValue: expAccum.cartoFSSValue,
                  cartoDSSValue: expAccum.cartoDSSValue,
                  bioValueBase: expAccum.bioValueBase,
                  bioValueBonus: expAccum.bioValueBonus,
                  bioSpeciesFound: expAccum.bioSpeciesFound,
                  bioSpeciesAnalysed: expAccum.bioSpeciesAnalysed,
                  distanceTravelled: expAccum.distanceTravelled,
                  playTimeSeconds: expAccum.playTimeSeconds,
                  jumps: expAccum.jumps,
                  reconstructed: true,
                });
                resetExpAccum();
                expDockIdx++;
              }
            }
          }

          if (li < allEvents.length) {
            statsProgress = `Lifetime stats... ${Math.round((li / allEvents.length) * 100)}%`;
            requestAnimationFrame(processLifetimeChunk);
          } else {
            statsLoading = false;
            statsProgress = "";
            lifetimeReady = true;

            // Save reconstructed expeditions
            if (shouldReconstruct && reconstructedExpeditions.length > 0) {
              expeditionHistoryStore.addReconstructed(reconstructedExpeditions);
            }

            // Save cache for next startup
            saveJournalCache();
          }
        }

        requestAnimationFrame(processLifetimeChunk);
      }
    }).catch(() => {
      ready = true;
      appReady = true;
      statsLoading = false;
    });

    // Live events (after startup)
    const unlistenJournal = listen<unknown>("journal-event", (event) => {
      const data = event.payload as Record<string, unknown>;
      handleJournalEvent(data);
      if (lifetimeReady) handleLifetimeEvent(data);
    });

    const unlistenStatus = listen<unknown>("status-update", (event) => {
      statusStore.update(event.payload);
    });

    const unlistenNavRoute = listen<unknown>("navroute-update", (event) => {
      routeStore.setRoute(event.payload as Record<string, unknown>);
      fetchRouteDiscoverers();
    });

    // When the overlay window finishes loading its event listeners it emits
    // "overlay-ready".  Respond by pushing the current state snapshot so the
    // overlay has data immediately without waiting for the next state change.
    const unlistenOverlayReady = listen<boolean>("overlay-ready", () => {
      emitToOverlay("overlay-viewmodel", overlayViewModelStore.current);
      emitToOverlay("overlay-opacity", configStore.current?.window?.overlay_opacity ?? 1);
    });

    // Periodic cache save every 5 minutes (protects against crash data loss)
    const cacheInterval = setInterval(() => {
      if (lifetimeReady) saveJournalCache();
    }, 5 * 60 * 1000);

    // Save cache on app close
    const handleBeforeUnload = () => {
      if (lifetimeReady) saveJournalCache();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(updateInterval);
      clearInterval(cacheInterval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (lifetimeReady) saveJournalCache();
      unlistenJournal.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
      unlistenNavRoute.then((fn) => fn());
      unlistenOverlayReady.then((fn) => fn());
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
      <span class="text-ed-text-muted text-[10px]">{appVersion}</span>
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
        {#if configStore.current?.carrier?.enabled}
          {@const carrierVal = (tripStore.current.cartoFSSValue + tripStore.current.cartoDSSValue + tripStore.current.bioValueBase + tripStore.current.bioValueBonus) * 0.65625}
          <span>
            <span class="text-ed-text-muted">CARRIER</span>
            <span class="text-ed-dim ml-1">{fmtCr(carrierVal)}</span>
          </span>
        {/if}
        {#if tripStore.current.playTimeSeconds > 60}
          {@const totalVal = tripStore.current.cartoFSSValue + tripStore.current.cartoDSSValue + tripStore.current.bioValueBase + tripStore.current.bioValueBonus}
          <span>
            <span class="text-ed-text-muted">Cr/h</span>
            <span class="text-ed-cyan ml-1">{fmtCr(totalVal / (tripStore.current.playTimeSeconds / 3600))}</span>
          </span>
        {/if}
        <span class="text-ed-text-muted">
          {tripStore.current.systemsVisited} sys | {tripStore.current.bodiesScanned} scn | {tripStore.current.bioSpeciesAnalysed} bio
          {#if statsLoading}
            <span class="text-ed-dim ml-1" title={statsProgress}>...</span>
          {/if}
          {#if lastDockInfo}
            <span class="ml-1" title="Last dock: {lastDockInfo.station}">| {lastDockInfo.station}</span>
          {/if}
        </span>
        <button class="text-ed-text-muted hover:text-ed-text transition-colors text-[10px]"
                onclick={() => { showHistory = !showHistory; if (showHistory) showSettings = false; }}
                title="Expedition History">
          {showHistory ? "✕ History" : "History"}
        </button>
        <button class="text-ed-text-muted hover:text-ed-text transition-colors"
                onclick={() => { showSettings = !showSettings; if (showSettings) showHistory = false; }}
                title="Settings">
          {showSettings ? "✕" : "⚙"}
        </button>
      </div>
    </header>

    {#if updateAvailable}
      <div class="flex items-center justify-center gap-2 px-4 py-1 bg-ed-surface border-b border-ed-border text-xs">
        <span class="text-ed-amber">Update available: v{updateAvailable.version}</span>
        <button class="text-ed-orange underline hover:text-ed-amber" onclick={async () => {
          await updateAvailable!.downloadAndInstall();
          await invoke("clear_cache_and_restart");
        }}>Install now</button>
      </div>
    {/if}

    <!-- Main dashboard: card grid -->
    {#if showSettings}
      <main class="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full">
        <Settings />
      </main>
    {:else if showHistory}
      <main class="flex-1 overflow-y-auto p-4">
        <div class="ed-card">
          <h2 class="text-ed-amber font-bold mb-3">Expedition History</h2>
          <ExpeditionHistory />
        </div>
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
              <div class="mt-2">
                <TodayStats />
              </div>
            {/if}
          </div>
        </div>
      </main>
    {/if}
  </div>
{/if}
