// Overlay view model store — reactive $derived that reads all stores and
// produces a single pre-computed OverlayViewModel for the overlay window.

import type {
  OverlayViewModel,
  OverlayBioTarget,
  OverlayBioTargetSpecies,
  OverlayCartoTarget,
  OverlaySpecies,
} from "$lib/types/overlay";
import type { SystemState } from "$lib/stores/system.svelte";
import type { PlanetBioState } from "$lib/stores/bio.svelte";
import type { TripState } from "$lib/stores/trip.svelte";
import type { RouteState } from "$lib/stores/route.svelte";
import type { StatusState } from "$lib/stores/status.svelte";
import type { AppConfig } from "$lib/stores/config.svelte";
import { systemStore } from "$lib/stores/system.svelte";
import { bioStore } from "$lib/stores/bio.svelte";
import { tripStore } from "$lib/stores/trip.svelte";
import { routeStore } from "$lib/stores/route.svelte";
import { statusStore } from "$lib/stores/status.svelte";
import { configStore } from "$lib/stores/config.svelte";
import {
  buildBioTargets,
  buildCartoTargets,
  buildMergedSpecies,
  computeCartoValue,
  computeRemainingSpecies,
  computeRemainingValue,
  computeStatusDot,
  isBioDone,
} from "$lib/utils/overlayCalc";

function buildViewModel(
  system: SystemState | null,
  bio: PlanetBioState | null,
  trip: TripState,
  route: RouteState,
  status: StatusState,
  config: AppConfig | null,
): OverlayViewModel {
  const bodies = system?.bodies ?? [];
  const bioThreshold = config?.bio?.value_threshold ?? 0;
  const cartoThreshold = config?.poi?.min_carto_value ?? 2_000_000;

  // Trip totals
  const totalValue =
    trip.cartoFSSValue + trip.cartoDSSValue + trip.bioValueBase + trip.bioValueBonus;
  const crPerHour =
    trip.playTimeSeconds > 60 ? totalValue / (trip.playTimeSeconds / 3600) : 0;

  // Current body for bio
  const currentBody = bio?.bodyId
    ? bodies.find((b) => b.bodyId === bio.bodyId) ?? null
    : null;

  // Merged species
  const merged = buildMergedSpecies(bio, currentBody, bioThreshold);

  // On-planet check: show bio tracker when there are unfinished species.
  // Fall through to system view when all bio on this body is complete.
  const hasUnfinishedBio = merged.some((s) => !s.analysed);
  const onPlanet =
    (!!bio?.bodyId || (currentBody != null && (currentBody.bioSpeciesPredicted?.length ?? 0) > 0)) &&
    hasUnfinishedBio;

  const bioMult = currentBody && !currentBody.wasDiscovered ? 5 : 1;

  // Bio targets
  const bioTargetBodies = buildBioTargets(bodies, bioThreshold);
  const bioTargets: OverlayBioTarget[] = bioTargetBodies.slice(0, 8).map((body) => {
    const done = isBioDone(body);
    const mult = !body.wasDiscovered ? 5 : 1;
    const remSpecies = computeRemainingSpecies(body);
    const remVal = computeRemainingValue(body);

    const doneSpecies = done
      ? (body.bioSpeciesPredicted ?? []).filter(
          (s) => s.confidence === "analysed",
        )
      : [];
    const doneVal = doneSpecies.reduce((sum, s) => sum + (s.value ?? 0), 0);

    const species: OverlayBioTargetSpecies[] = done
      ? doneSpecies.map((s) => ({
          name: s.name,
          value: s.value * mult,
          confidence: s.confidence,
        }))
      : remSpecies.map((s) => ({
          name: s.name,
          value: s.value * mult,
          confidence: s.confidence,
        }));

    return {
      bodyId: body.bodyId,
      shortName: body.shortName,
      bioSignals: body.bioSignals,
      mapped: body.mapped,
      landable: body.landable,
      wasDiscovered: body.wasDiscovered,
      done,
      dot: computeStatusDot(body),
      displayValue: done ? doneVal * mult : remVal * mult,
      species,
    };
  });

  // Carto targets
  const cartoTargetBodies = buildCartoTargets(bodies, cartoThreshold);
  const cartoTargets: OverlayCartoTarget[] = cartoTargetBodies.slice(0, 5).map((body) => {
    const val = computeCartoValue(body);
    const dssed = body.mapped || body.personalStatus === "dss";
    let typeTag: string | null = null;
    if (body.type === "Water world") typeTag = "WW";
    else if (body.type === "Ammonia world") typeTag = "AW";
    else if (body.type === "Earthlike body" || body.type === "Earth-like world") typeTag = "ELW";

    return {
      shortName: body.shortName,
      type: body.type,
      mapped: dssed,
      personalStatus: body.personalStatus,
      displayValue: val,
      dot: computeStatusDot(body),
      typeTag,
    };
  });

  // Merged species for overlay
  const overlaySpecies: OverlaySpecies[] = merged.map((sp) => ({
    name: sp.name,
    localName: sp.localName,
    genus: sp.genus,
    value: sp.value,
    clonalRange: sp.clonalRange,
    samples: sp.samples,
    analysed: sp.analysed,
    scanPositions: sp.scanPositions,
    predicted: sp.predicted,
  }));

  // Position
  const position =
    status.latitude != null && status.longitude != null
      ? { lat: status.latitude, lon: status.longitude }
      : null;

  return {
    totalValue,
    crPerHour,
    systemsVisited: trip.systemsVisited,
    bioSpeciesAnalysed: trip.bioSpeciesAnalysed,

    onPlanet,
    bioBodyName: bio?.bodyName ?? null,
    bioMultiplier: bioMult,
    mergedSpecies: overlaySpecies,

    systemName: system?.name ?? null,
    bodyCount: system?.bodyCount ?? null,
    scannedBodyCount: bodies.filter((b) => b.starType || b.planetClass).length,
    bioTargets,
    cartoTargets,

    trip: {
      cartoFSSValue: trip.cartoFSSValue,
      cartoDSSValue: trip.cartoDSSValue,
      bioValue: trip.bioValueBase + trip.bioValueBonus,
      bioSpeciesAnalysed: trip.bioSpeciesAnalysed,
      systemsVisited: trip.systemsVisited,
      jumps: trip.jumps,
      playTimeSeconds: trip.playTimeSeconds,
    },

    route: {
      remainingJumps: route.remainingJumps,
      destination: route.destination,
      nextSystems: route.systems.slice(0, 3).map((s) => ({
        name: s.name,
        starClass: s.starClass,
      })),
    },

    position,
    bodyRadius: bio?.bodyRadius ?? null,
  };
}

function createOverlayViewModelStore() {
  const vm = $derived(
    buildViewModel(
      systemStore.current,
      bioStore.currentPlanet,
      tripStore.current,
      routeStore.current,
      statusStore.current,
      configStore.current,
    ),
  );

  return {
    get current() {
      return vm;
    },
  };
}

export const overlayViewModelStore = createOverlayViewModelStore();
