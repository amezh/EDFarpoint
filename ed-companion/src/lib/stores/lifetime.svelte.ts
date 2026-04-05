// Lifetime stats store — persisted across sessions

export interface LifetimeState {
  totalCartoFSS: number;
  totalCartoDSS: number;
  totalBioBase: number;
  totalBioBonus: number;
  totalSystems: number;
  totalBodiesScanned: number;
  totalStarsScanned: number;
  totalBodiesMapped: number;
  totalBioSpecies: number;
  totalDistanceLy: number;
  rarestSpecies: string | null;
  rarestSpeciesValue: number;
}

function createLifetimeStore() {
  let state = $state<LifetimeState>({
    totalCartoFSS: 0,
    totalCartoDSS: 0,
    totalBioBase: 0,
    totalBioBonus: 0,
    totalSystems: 0,
    totalBodiesScanned: 0,
    totalStarsScanned: 0,
    totalBodiesMapped: 0,
    totalBioSpecies: 0,
    totalDistanceLy: 0,
    rarestSpecies: null,
    rarestSpeciesValue: 0,
  });

  return {
    get current() {
      return state;
    },

    addSystem() {
      state.totalSystems++;
    },

    addStarScan(value: number) {
      state.totalStarsScanned++;
      state.totalCartoFSS += value;
    },

    addBodyScan(fssValue: number) {
      state.totalBodiesScanned++;
      state.totalCartoFSS += fssValue;
    },

    addBodyMap(dssBonus: number) {
      state.totalBodiesMapped++;
      state.totalCartoDSS += dssBonus;
    },

    addBioSpecies(name: string, baseValue: number, isFirstDiscovery: boolean) {
      state.totalBioSpecies++;
      state.totalBioBase += baseValue;
      if (isFirstDiscovery) {
        state.totalBioBonus += baseValue * 4;
      }
      if (baseValue > state.rarestSpeciesValue) {
        state.rarestSpecies = name;
        state.rarestSpeciesValue = baseValue;
      }
    },

    addDistance(ly: number) {
      state.totalDistanceLy += ly;
    },

    /** Seed from cached data (startup optimization) */
    seed(cached: Partial<LifetimeState>) {
      if (cached.totalCartoFSS != null) state.totalCartoFSS = cached.totalCartoFSS;
      if (cached.totalCartoDSS != null) state.totalCartoDSS = cached.totalCartoDSS;
      if (cached.totalBioBase != null) state.totalBioBase = cached.totalBioBase;
      if (cached.totalBioBonus != null) state.totalBioBonus = cached.totalBioBonus;
      if (cached.totalSystems != null) state.totalSystems = cached.totalSystems;
      if (cached.totalBodiesScanned != null) state.totalBodiesScanned = cached.totalBodiesScanned;
      if (cached.totalStarsScanned != null) state.totalStarsScanned = cached.totalStarsScanned;
      if (cached.totalBodiesMapped != null) state.totalBodiesMapped = cached.totalBodiesMapped;
      if (cached.totalBioSpecies != null) state.totalBioSpecies = cached.totalBioSpecies;
      if (cached.totalDistanceLy != null) state.totalDistanceLy = cached.totalDistanceLy;
      if (cached.rarestSpecies !== undefined) state.rarestSpecies = cached.rarestSpecies ?? null;
      if (cached.rarestSpeciesValue != null) state.rarestSpeciesValue = cached.rarestSpeciesValue;
    },

    toJSON(): LifetimeState {
      return { ...state };
    },
  };
}

export const lifetimeStore = createLifetimeStore();
