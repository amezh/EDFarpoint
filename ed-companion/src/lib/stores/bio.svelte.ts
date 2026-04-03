// Bio tracker store — per-planet species tracking
import { getSpeciesValue } from "$lib/utils/bioValues";

export interface ScanPosition {
  latitude: number;
  longitude: number;
}

export interface BioSpecies {
  name: string;
  localName: string;
  genus: string;
  variant: string;
  value: number | null;
  clonalRange: number | null;
  samples: number; // 0, 1, 2, 3
  analysed: boolean;
  scanPositions: ScanPosition[]; // lat/lon of each scan
}

export interface PlanetBioState {
  bodyName: string;
  bodyId: number;
  systemAddress: number;
  bodyRadius: number | null; // in km, for distance calculation
  species: BioSpecies[];
}

/** Haversine distance between two lat/lon points on a sphere of given radius (km) */
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
  radiusKm: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(a)) * 1000; // return meters
}

function createBioStore() {
  let currentPlanetState = $state<PlanetBioState | null>(null);
  let allPlanets = $state<Map<string, PlanetBioState>>(new Map());

  return {
    get currentPlanet() {
      return currentPlanetState;
    },
    get planets() {
      return allPlanets;
    },

    setPlanet(bodyName: string, bodyId: number, systemAddress: number, bodyRadius: number | null) {
      const key = `${systemAddress}:${bodyId}`;
      if (allPlanets.has(key)) {
        currentPlanetState = allPlanets.get(key)!;
        // Update radius if we have it now
        if (bodyRadius != null) {
          currentPlanetState.bodyRadius = bodyRadius;
        }
      } else {
        currentPlanetState = { bodyName, bodyId, systemAddress, bodyRadius, species: [] };
        allPlanets.set(key, currentPlanetState);
      }
    },

    leavePlanet() {
      currentPlanetState = null;
    },

    handleScanOrganic(data: Record<string, unknown>, latitude: number | null, longitude: number | null) {
      const systemAddress = data.SystemAddress as number;
      const bodyId = data.Body as number;
      const key = `${systemAddress}:${bodyId}`;
      const scanType = data.ScanType as string;
      const speciesName = data.Species as string;
      const speciesLocal = (data.Species_Localised as string) ?? speciesName;
      const genus = (data.Genus_Localised as string) ?? (data.Genus as string) ?? "";
      const variant = (data.Variant_Localised as string) ?? "";

      let planet = allPlanets.get(key);
      if (!planet) {
        planet = { bodyName: `Body ${bodyId}`, bodyId, systemAddress, bodyRadius: null, species: [] };
        allPlanets.set(key, planet);
      }

      let species = planet.species.find((s) => s.name === speciesName);
      if (!species) {
        species = {
          name: speciesName,
          localName: speciesLocal,
          genus,
          variant,
          value: getSpeciesValue(speciesLocal),
          clonalRange: null,
          samples: 0,
          analysed: false,
          scanPositions: [],
        };
        planet.species = [...planet.species, species];
      }

      // Fill value if it was null (journal replay / legacy data)
      if (species.value === null) species.value = getSpeciesValue(speciesLocal);

      // Starting a new scan (Log) on a DIFFERENT species resets all incomplete scans
      // because the game discards partial progress when you switch species
      if (scanType === "Log") {
        for (const s of planet.species) {
          if (s.name !== speciesName && !s.analysed && s.samples > 0) {
            s.samples = 0;
            s.scanPositions = [];
          }
        }
      }

      switch (scanType) {
        case "Log":
          // First sample — reset positions, start fresh
          species.samples = 1;
          species.scanPositions = (latitude != null && longitude != null)
            ? [{ latitude, longitude }]
            : [];
          break;
        case "Sample":
          species.samples = 2;
          if (latitude != null && longitude != null) {
            species.scanPositions.push({ latitude, longitude });
          }
          break;
        case "Analyse":
          species.samples = 3;
          species.analysed = true;
          if (latitude != null && longitude != null) {
            species.scanPositions.push({ latitude, longitude });
          }
          break;
      }

      // Update current planet ref if it matches
      if (currentPlanetState && currentPlanetState.systemAddress === systemAddress && currentPlanetState.bodyId === bodyId) {
        currentPlanetState = planet;
      }
    },
  };
}

export const bioStore = createBioStore();
