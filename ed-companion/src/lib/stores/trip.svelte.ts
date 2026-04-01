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
}

function createTripStore() {
  let systemsVisited = $state(0);
  let bodiesScanned = $state(0);
  let bodiesMapped = $state(0);
  let firstDiscoveries = $state(0);
  let cartoValue = $state(0);
  let bioValue = $state(0);
  let bioSpeciesFound = $state(0);
  let bioSpeciesAnalysed = $state(0);
  let distanceTravelled = $state(0);
  const visitedSystems = new Set<string>();

  return {
    get current(): TripState {
      return {
        systemsVisited,
        bodiesScanned,
        bodiesMapped,
        firstDiscoveries,
        cartoValue,
        bioValue,
        bioSpeciesFound,
        bioSpeciesAnalysed,
        distanceTravelled,
      };
    },

    addSystem(name: string, jumpDist: number) {
      if (!visitedSystems.has(name)) {
        visitedSystems.add(name);
        systemsVisited = visitedSystems.size;
      }
      distanceTravelled += jumpDist;
    },

    addBodyScan(isFirstDiscovery: boolean) {
      bodiesScanned++;
      if (isFirstDiscovery) firstDiscoveries++;
    },

    addBodyMapped() {
      bodiesMapped++;
    },

    addCartoValue(value: number) {
      cartoValue += value;
    },

    addBioScan() {
      bioSpeciesFound++;
    },

    addBioAnalysis(value: number) {
      bioSpeciesAnalysed++;
      bioValue += value;
    },

    reset() {
      systemsVisited = 0;
      bodiesScanned = 0;
      bodiesMapped = 0;
      firstDiscoveries = 0;
      cartoValue = 0;
      bioValue = 0;
      bioSpeciesFound = 0;
      bioSpeciesAnalysed = 0;
      distanceTravelled = 0;
      visitedSystems.clear();
    },
  };
}

export const tripStore = createTripStore();
