// Lifetime stats store — persisted across sessions

export interface LifetimeState {
  totalCartoEarned: number;
  totalBioEarned: number;
  totalSystems: number;
  totalBodiesScanned: number;
  totalBodiesMapped: number;
  totalBioSpecies: number;
  totalDistanceLy: number;
  rarestSpecies: string | null;
  rarestSpeciesValue: number;
  longestTripLy: number;
  mostValuableTrip: number;
}

function createLifetimeStore() {
  let state = $state<LifetimeState>({
    totalCartoEarned: 0,
    totalBioEarned: 0,
    totalSystems: 0,
    totalBodiesScanned: 0,
    totalBodiesMapped: 0,
    totalBioSpecies: 0,
    totalDistanceLy: 0,
    rarestSpecies: null,
    rarestSpeciesValue: 0,
    longestTripLy: 0,
    mostValuableTrip: 0,
  });

  return {
    get current() {
      return state;
    },

    load(data: Partial<LifetimeState>) {
      Object.assign(state, data);
    },

    addSystem() {
      state.totalSystems++;
    },

    addBodyScan() {
      state.totalBodiesScanned++;
    },

    addBodyMap() {
      state.totalBodiesMapped++;
    },

    addBioSpecies(name: string, value: number) {
      state.totalBioSpecies++;
      state.totalBioEarned += value;
      if (value > state.rarestSpeciesValue) {
        state.rarestSpecies = name;
        state.rarestSpeciesValue = value;
      }
    },

    addDistance(ly: number) {
      state.totalDistanceLy += ly;
    },

    addCartoEarned(value: number) {
      state.totalCartoEarned += value;
    },

    endTrip(tripValue: number, tripDistanceLy: number) {
      if (tripValue > state.mostValuableTrip) state.mostValuableTrip = tripValue;
      if (tripDistanceLy > state.longestTripLy) state.longestTripLy = tripDistanceLy;
    },

    toJSON(): LifetimeState {
      return { ...state };
    },
  };
}

export const lifetimeStore = createLifetimeStore();
