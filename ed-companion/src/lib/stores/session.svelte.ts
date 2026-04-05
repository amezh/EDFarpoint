// Last 24h stats store — accumulates all activity from the past 24 hours.
// Tracks active play time using the same gap-filtered approach as trip store.

export interface Last24hState {
  systemsVisited: number;
  bodiesScanned: number;
  starsScanned: number;
  bodiesMapped: number;
  firstDiscoveries: number;
  cartoFSSValue: number;
  cartoDSSValue: number;
  bioValueBase: number;
  bioValueBonus: number;
  bioSpeciesAnalysed: number;
  distanceTravelled: number;
  jumps: number;
  playTimeSeconds: number;
}

function createLast24hStore() {
  let systemsVisited = $state(0);
  let bodiesScanned = $state(0);
  let starsScanned = $state(0);
  let bodiesMapped = $state(0);
  let firstDiscoveries = $state(0);
  let cartoFSSValue = $state(0);
  let cartoDSSValue = $state(0);
  let bioValueBase = $state(0);
  let bioValueBonus = $state(0);
  let bioSpeciesAnalysed = $state(0);
  let distanceTravelled = $state(0);
  let jumps = $state(0);
  let playTimeSeconds = $state(0);
  let lastEventTime: number | null = null;
  const MAX_GAP_MS = 15 * 60 * 1000;
  const visitedSystems = new Set<string>();

  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;

  return {
    get current(): Last24hState {
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
        bioSpeciesAnalysed,
        distanceTravelled,
        jumps,
        playTimeSeconds,
      };
    },

    /** Check if event timestamp is within the last 24 hours */
    isRecent(isoTimestamp: string): boolean {
      return new Date(isoTimestamp).getTime() >= cutoffMs;
    },

    trackTimestamp(isoTimestamp: string) {
      const t = new Date(isoTimestamp).getTime();
      if (isNaN(t)) return;
      if (lastEventTime !== null) {
        const gap = t - lastEventTime;
        if (gap > 0 && gap <= MAX_GAP_MS) {
          playTimeSeconds += gap / 1000;
        }
      }
      lastEventTime = t;
    },

    addSystem(name: string, jumpDist: number) {
      if (!visitedSystems.has(name)) {
        visitedSystems.add(name);
        systemsVisited++;
      }
      jumps++;
      distanceTravelled += jumpDist;
    },

    addSystemVisit(name: string) {
      if (!visitedSystems.has(name)) {
        visitedSystems.add(name);
        systemsVisited++;
      }
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

    addBioAnalysis(baseValue: number, isFirstDiscovery: boolean) {
      bioSpeciesAnalysed++;
      bioValueBase += baseValue;
      if (isFirstDiscovery) {
        bioValueBonus += baseValue * 4;
      }
    },
  };
}

export const last24hStore = createLast24hStore();
