// Trip stats store — accumulates since last dock

export interface TripState {
  systemsVisited: number;
  bodiesScanned: number;
  bodiesMapped: number;
  firstDiscoveries: number;
  cartoValue: number;
  bioValue: number;
  bioSpeciesFound: number;
  bioSpeciesAnalysed: number;
  distanceTravelled: number;
  visitedSystems: Set<string>;
}

function createTripStore() {
  let state = $state<TripState>({
    systemsVisited: 0,
    bodiesScanned: 0,
    bodiesMapped: 0,
    firstDiscoveries: 0,
    cartoValue: 0,
    bioValue: 0,
    bioSpeciesFound: 0,
    bioSpeciesAnalysed: 0,
    distanceTravelled: 0,
    visitedSystems: new Set(),
  });

  return {
    get current() {
      return state;
    },

    addSystem(name: string, jumpDist: number) {
      if (!state.visitedSystems.has(name)) {
        state.visitedSystems.add(name);
        state.systemsVisited = state.visitedSystems.size;
      }
      state.distanceTravelled += jumpDist;
    },

    addBodyScan(isFirstDiscovery: boolean) {
      state.bodiesScanned++;
      if (isFirstDiscovery) state.firstDiscoveries++;
    },

    addBodyMapped() {
      state.bodiesMapped++;
    },

    addCartoValue(value: number) {
      state.cartoValue += value;
    },

    addBioScan() {
      state.bioSpeciesFound++;
    },

    addBioAnalysis(value: number) {
      state.bioSpeciesAnalysed++;
      state.bioValue += value;
    },

    reset() {
      state.systemsVisited = 0;
      state.bodiesScanned = 0;
      state.bodiesMapped = 0;
      state.firstDiscoveries = 0;
      state.cartoValue = 0;
      state.bioValue = 0;
      state.bioSpeciesFound = 0;
      state.bioSpeciesAnalysed = 0;
      state.distanceTravelled = 0;
      state.visitedSystems = new Set();
    },
  };
}

export const tripStore = createTripStore();
