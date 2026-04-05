// Overlay view model — single pre-computed data structure for the overlay window.
// The overlay receives this as a ready-to-render payload via Tauri IPC.

export interface OverlayViewModel {
  // Header
  totalValue: number;
  crPerHour: number;
  systemsVisited: number;
  bioSpeciesAnalysed: number;

  // Planet bio tracker (when onPlanet = true)
  onPlanet: boolean;
  bioBodyName: string | null;
  bioMultiplier: number; // 1 or 5 (first discovery)
  mergedSpecies: OverlaySpecies[];

  // System view (when onPlanet = false)
  systemName: string | null;
  systemFirstDiscovery: boolean;
  bodyCount: number | null;
  scannedBodyCount: number;
  bioTargets: OverlayBioTarget[];
  cartoTargets: OverlayCartoTarget[];

  // Trip summary
  trip: OverlayTrip;

  // Route
  route: OverlayRoute;

  // Player position (1Hz from Status.json — overlay does local haversine)
  position: { lat: number; lon: number } | null;
  bodyRadius: number | null;
}

export interface OverlaySpecies {
  name: string;
  localName: string;
  genus: string;
  value: number;
  clonalRange: number;
  samples: number; // 0 = predicted, 1-3 = scan progress
  analysed: boolean;
  scanPositions: { latitude: number; longitude: number }[];
  predicted: boolean;
}

export interface OverlayBioTarget {
  bodyId: number;
  shortName: string;
  bioSignals: number;
  mapped: boolean;
  landable: boolean;
  wasDiscovered: boolean;
  done: boolean;
  dot: { ring: string; fill: string };
  // Pre-computed value: remaining or done
  displayValue: number;
  // Species detail for expand
  species: OverlayBioTargetSpecies[];
}

export interface OverlayBioTargetSpecies {
  name: string;
  value: number;
  confidence: string;
}

export interface OverlayCartoTarget {
  shortName: string;
  type: string;
  mapped: boolean;
  wasDiscovered: boolean;
  personalStatus: string;
  displayValue: number;
  dot: { ring: string; fill: string };
  typeTag: string | null; // "WW", "AW", "ELW", or null
}

export interface OverlayTrip {
  cartoFSSValue: number;
  cartoDSSValue: number;
  bioValue: number;
  bioSpeciesAnalysed: number;
  systemsVisited: number;
  jumps: number;
  playTimeSeconds: number;
}

export interface OverlayRoute {
  remainingJumps: number;
  destination: string | null;
  nextSystems: { name: string; starClass: string; discoverer: string | null }[];
}
