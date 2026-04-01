// Bio tracker store — per-planet species tracking

export interface BioSpecies {
  name: string;
  localName: string;
  genus: string;
  variant: string;
  value: number | null;
  clonalRange: number | null;
  samples: number; // 0, 1, 2, 3
  analysed: boolean;
}

export interface PlanetBioState {
  bodyName: string;
  bodyId: number;
  systemAddress: number;
  species: BioSpecies[];
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

    setPlanet(bodyName: string, bodyId: number, systemAddress: number) {
      const key = `${systemAddress}:${bodyId}`;
      if (allPlanets.has(key)) {
        currentPlanetState = allPlanets.get(key)!;
      } else {
        currentPlanetState = { bodyName, bodyId, systemAddress, species: [] };
        allPlanets.set(key, currentPlanetState);
      }
    },

    leavePlanet() {
      currentPlanetState = null;
    },

    handleScanOrganic(data: Record<string, unknown>) {
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
        planet = { bodyName: `Body ${bodyId}`, bodyId, systemAddress, species: [] };
        allPlanets.set(key, planet);
      }

      let species = planet.species.find((s) => s.name === speciesName);
      if (!species) {
        species = {
          name: speciesName,
          localName: speciesLocal,
          genus,
          variant,
          value: null,
          clonalRange: null,
          samples: 0,
          analysed: false,
        };
        planet.species = [...planet.species, species];
      }

      switch (scanType) {
        case "Log":
          species.samples = Math.max(species.samples, 1);
          break;
        case "Sample":
          species.samples = Math.max(species.samples, 2);
          break;
        case "Analyse":
          species.samples = 3;
          species.analysed = true;
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
