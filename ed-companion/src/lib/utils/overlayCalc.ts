// Shared utility functions for overlay view model computation and UI display.
// Used by overlayViewModel store, BioTracker, and OverlayWidget.

import type { Body } from "$lib/stores/system.svelte";
import type { PlanetBioState } from "$lib/stores/bio.svelte";
import type { PredictedSpecies } from "$lib/utils/bioPredict";
import { estimateCartoValue } from "$lib/utils/valueCalc";

// ── Formatting ─────────────────────────────────────────────

export function formatCredits(v: number): string {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + "B";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
  return v.toString();
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) return (meters / 1000).toFixed(1) + "km";
  return Math.round(meters) + "m";
}

// ── Clonal ranges ──────────────────────────────────────────

export const CLONAL_RANGES: Record<string, number> = {
  Aleoida: 150, Bacterium: 500, Cactoida: 300, Clypeus: 150, Concha: 150,
  Electricae: 1000, Fonticulua: 500, Frutexa: 150, Fumerola: 100,
  Fungoida: 300, Osseus: 800, Recepta: 150, Stratum: 500, Tubus: 800, Tussock: 200,
};

export function getClonalRange(species: { clonalRange?: number | null; genus?: string; localName?: string }): number {
  if (species.clonalRange) return species.clonalRange;
  const genus = species.genus || species.localName?.split(" ")[0] || "";
  return CLONAL_RANGES[genus] ?? 200;
}

// ── Bio body analysis ──────────────────────────────────────

/** Get remaining (un-picked) species for a body, filtering out analysed
 *  species AND other species from the same genus as an analysed one. */
export function computeRemainingSpecies(body: Body): PredictedSpecies[] {
  const preds = body.bioSpeciesPredicted ?? [];
  const doneGenera = new Set<string>();
  for (const s of preds) {
    if (s.confidence === "analysed") doneGenera.add(s.name.split(" ")[0].toLowerCase());
  }
  return preds.filter((s) => {
    const g = s.name.split(" ")[0].toLowerCase();
    return !doneGenera.has(g);
  });
}

/** Sum remaining species value (max per genus). */
export function computeRemainingValue(body: Body): number {
  const rem = computeRemainingSpecies(body);
  const byGenus = new Map<string, number>();
  for (const s of rem) {
    const g = s.name.split(" ")[0].toLowerCase();
    byGenus.set(g, Math.max(byGenus.get(g) ?? 0, s.value ?? 0));
  }
  let total = 0;
  for (const v of byGenus.values()) total += v;
  return total;
}

export function allBioAnalysed(body: Body): boolean {
  if (body.bioSignals <= 0) return false;
  return computeRemainingSpecies(body).length === 0;
}

export function isBioDone(body: Body): boolean {
  return body.personalStatus === "bio_complete" || allBioAnalysed(body);
}

/** Status dot colors: ring = blue if DSS done, fill depends on bio progress */
export function computeStatusDot(body: Body): { ring: string; fill: string } {
  const dssed = body.mapped || body.personalStatus === "dss";
  const ring = dssed ? "#60a5fa" : "#6b7280"; // blue-400 / gray-500
  let fill = "none";
  if (body.bioSignals > 0) {
    if (body.personalStatus === "bio_complete" || allBioAnalysed(body)) fill = "#4ade80"; // green-400
    else if (
      body.personalStatus === "landed" ||
      body.bioSpeciesPredicted?.some(
        (s) => s.confidence === "scanned" || s.confidence === "analysed",
      )
    )
      fill = "#fbbf24"; // amber-400
  } else {
    if (dssed) fill = "#4ade80"; // green-400
  }
  return { ring, fill };
}

// ── Carto value ────────────────────────────────────────────

export function computeCartoValue(body: Body): number {
  return estimateCartoValue({
    bodyType: body.type ?? body.planetClass ?? "",
    terraformable: !!body.terraformable,
    wasDiscovered: !!body.wasDiscovered,
    wasMapped: !!body.wasMapped,
    isFirstDiscoverer: !body.wasDiscovered,
    isFirstMapper: !!body.mappedByUs || !body.wasMapped,
    withDSS: true,
    efficiencyBonus: true,
  });
}

// ── Bio targets ────────────────────────────────────────────

export function buildBioTargets(bodies: Body[], bioThreshold: number): Body[] {
  return bodies
    .filter((b) => {
      if (!b.planetClass || b.bioSignals <= 0) return false;
      if (isBioDone(b)) return true; // keep completed, sort to end
      if (bioThreshold > 0 && b.bioValueMax != null) {
        const eff = b.bioValueMax * (!b.wasDiscovered ? 5 : 1);
        if (eff < bioThreshold) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aDone = isBioDone(a) ? 1 : 0;
      const bDone = isBioDone(b) ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return (b.bioValueMax ?? 0) - (a.bioValueMax ?? 0);
    });
}

// ── Carto targets ──────────────────────────────────────────

const POI_TYPES = new Set([
  "Earthlike body", "Earth-like world", "Water world", "Ammonia world",
]);

export function buildCartoTargets(bodies: Body[], cartoThreshold: number): Body[] {
  return bodies
    .filter((b) => {
      if (b.starType || !b.planetClass || b.bioSignals > 0) return false;
      if (b.personalStatus === "bio_complete") return false;
      if (POI_TYPES.has(b.type)) return true;
      if (b.terraformable) return true;
      return computeCartoValue(b) >= cartoThreshold;
    })
    .sort((a, b) => computeCartoValue(b) - computeCartoValue(a));
}

// ── Merged species ─────────────────────────────────────────

export interface MergedSpecies {
  name: string;
  localName: string;
  genus: string;
  value: number;
  clonalRange: number;
  samples: number; // 0 = predicted only, 1-3 = scanning/done
  analysed: boolean;
  scanPositions: { latitude: number; longitude: number }[];
  predicted: boolean;
  aboveThreshold: boolean;
}

/**
 * Merge actual bio scans with predictions into a single sorted list.
 * Used by both BioTracker (main window) and the overlay view model.
 */
export function buildMergedSpecies(
  tracker: PlanetBioState | null,
  currentBody: Body | null,
  bioThreshold: number,
): MergedSpecies[] {
  const result: MergedSpecies[] = [];
  const seen = new Set<string>();
  const mult = currentBody && !currentBody.wasDiscovered ? 5 : 1;

  // Start with actual scans from the tracker
  if (tracker) {
    for (const s of tracker.species) {
      const genus = s.genus || s.localName.split(" ")[0];
      const range = s.clonalRange ?? CLONAL_RANGES[genus] ?? 200;
      const value = s.value ?? 0;
      result.push({
        name: s.name,
        localName: s.localName,
        genus,
        value,
        clonalRange: range,
        samples: s.samples,
        analysed: s.analysed,
        scanPositions: s.scanPositions,
        predicted: false,
        aboveThreshold: value * mult >= bioThreshold,
      });
      seen.add(s.localName.toLowerCase());
      const baseName = s.localName.split(" - ")[0].trim();
      seen.add(baseName.toLowerCase());
    }
  }

  // Collect genera already identified by scanning
  const confirmedGenera = new Set<string>();
  for (const r of result) {
    if (!r.predicted) confirmedGenera.add(r.genus.toLowerCase());
  }

  // Add predicted species that haven't been scanned yet
  if (currentBody) {
    for (const pred of currentBody.bioSpeciesPredicted) {
      const key = pred.name.toLowerCase();
      if (seen.has(key)) continue;
      const genus = pred.name.split(" ")[0];
      if (confirmedGenera.has(genus.toLowerCase())) continue;
      seen.add(key);
      result.push({
        name: pred.codex_name ?? pred.name,
        localName: pred.name,
        genus,
        value: pred.value,
        clonalRange: pred.clonal_range,
        samples: 0,
        analysed: false,
        scanPositions: [],
        predicted: true,
        aboveThreshold: pred.value * mult >= bioThreshold,
      });
    }
  }

  // Sort: active scans first, then unscanned predictions by value desc, then completed
  return result.sort((a, b) => {
    if (a.analysed !== b.analysed) return a.analysed ? 1 : -1;
    if ((a.samples > 0) !== (b.samples > 0)) return a.samples > 0 ? -1 : 1;
    return b.value - a.value;
  });
}

export const SCOOPABLE_STARS = new Set(["K", "G", "B", "F", "O", "A", "M"]);
