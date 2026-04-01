// Trip stats store — accumulates since last dock

export interface TripState {
  systemsVisited: number;
  bodiesScanned: number;
  starsScanned: number;
  bodiesMapped: number;
  firstDiscoveries: number;
  cartoFSSValue: number; // FSS (honk + scan) value
  cartoDSSValue: number; // DSS mapping bonus (on top of FSS)
  bioValueBase: number; // Bio base value (Vista Genomics base)
  bioValueBonus: number; // Bio first-discovery bonus (4x base extra)
  bioSpeciesFound: number;
  bioSpeciesAnalysed: number;
  distanceTravelled: number;
}

function createTripStore() {
  let systemsVisited = $state(0);
  let bodiesScanned = $state(0);
  let starsScanned = $state(0);
  let bodiesMapped = $state(0);
  let firstDiscoveries = $state(0);
  let cartoFSSValue = $state(0);
  let cartoDSSValue = $state(0);
  let bioValueBase = $state(0);
  let bioValueBonus = $state(0);
  let bioSpeciesFound = $state(0);
  let bioSpeciesAnalysed = $state(0);
  let distanceTravelled = $state(0);
  const visitedSystems = new Set<string>();

  return {
    get current(): TripState {
      return {
        systemsVisited,
        bodiesScanned,
        starsScanned,
        bodiesMapped,
        firstDiscoveries,
        cartoFSSValue,
        cartoDSSValue,
        bioValueBase,
        bioValueBonus,
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

    addStarScan(value: number) {
      starsScanned++;
      cartoFSSValue += value;
    },

    addBodyScan(isFirstDiscovery: boolean, fssValue: number) {
      bodiesScanned++;
      if (isFirstDiscovery) firstDiscoveries++;
      cartoFSSValue += fssValue;
    },

    addBodyMapped(dssBonus: number) {
      bodiesMapped++;
      cartoDSSValue += dssBonus;
    },

    addBioScan() {
      bioSpeciesFound++;
    },

    addBioAnalysis(baseValue: number, isFirstDiscovery: boolean) {
      bioSpeciesAnalysed++;
      bioValueBase += baseValue;
      if (isFirstDiscovery) {
        bioValueBonus += baseValue * 4; // first-discovery bonus is 4x base (total payout = 5x)
      }
    },

    reset() {
      systemsVisited = 0;
      bodiesScanned = 0;
      starsScanned = 0;
      bodiesMapped = 0;
      firstDiscoveries = 0;
      cartoFSSValue = 0;
      cartoDSSValue = 0;
      bioValueBase = 0;
      bioValueBonus = 0;
      bioSpeciesFound = 0;
      bioSpeciesAnalysed = 0;
      distanceTravelled = 0;
      visitedSystems.clear();
    },
  };
}

export const tripStore = createTripStore();
