// Route store — NavRoute.json data

export interface RouteSystem {
  name: string;
  address: number;
  starPos: [number, number, number];
  starClass: string;
  distanceLy: number | null;
}

export interface RouteState {
  systems: RouteSystem[];
  destination: string | null;
  remainingJumps: number;
  remainingLy: number;
}

function createRouteStore() {
  let state = $state<RouteState>({
    systems: [],
    destination: null,
    remainingJumps: 0,
    remainingLy: 0,
  });

  return {
    get current() {
      return state;
    },

    setRoute(data: Record<string, unknown>) {
      const routeData = data.Route as Array<Record<string, unknown>>;
      if (!routeData || routeData.length === 0) {
        state.systems = [];
        state.destination = null;
        state.remainingJumps = 0;
        state.remainingLy = 0;
        return;
      }

      const systems: RouteSystem[] = routeData.map((entry) => ({
        name: entry.StarSystem as string,
        address: entry.SystemAddress as number,
        starPos: entry.StarPos as [number, number, number],
        starClass: entry.StarClass as string,
        distanceLy: null,
      }));

      // Calculate distances between consecutive systems
      for (let i = 1; i < systems.length; i++) {
        const prev = systems[i - 1].starPos;
        const curr = systems[i].starPos;
        systems[i].distanceLy = Math.sqrt(
          (curr[0] - prev[0]) ** 2 +
          (curr[1] - prev[1]) ** 2 +
          (curr[2] - prev[2]) ** 2
        );
      }

      state.systems = systems;
      state.destination = systems[systems.length - 1]?.name ?? null;
      state.remainingJumps = systems.length - 1;
      state.remainingLy = systems.reduce((sum, s) => sum + (s.distanceLy ?? 0), 0);
    },

    advanceRoute(currentSystem: string) {
      const idx = state.systems.findIndex((s) => s.name === currentSystem);
      if (idx > 0) {
        state.systems = state.systems.slice(idx);
        state.remainingJumps = state.systems.length - 1;
        state.remainingLy = state.systems.reduce((sum, s) => sum + (s.distanceLy ?? 0), 0);
      }
    },
  };
}

export const routeStore = createRouteStore();
