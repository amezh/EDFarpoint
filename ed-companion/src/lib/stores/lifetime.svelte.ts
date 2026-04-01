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

    toJSON(): LifetimeState {
      return { ...state };
    },
  };
}

export const lifetimeStore = createLifetimeStore();
