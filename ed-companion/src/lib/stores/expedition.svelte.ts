// Expedition store — visited systems log since last dock + route ahead
import { invoke } from "@tauri-apps/api/core";

export interface VisitedSystem {
  name: string;
  address: number;
  starPos: [number, number, number] | null;
  starClass: string | null;
  jumpDist: number;
  distFromSol: number | null;
  cartoValue: number;   // FSS + DSS value earned
  bioValue: number;     // bio base + bonus earned
  bodiesScanned: number;
  bodiesMapped: number;
  bioSpecies: number;   // species analysed
  firstDiscoveryStar: boolean; // primary star was undiscovered (= system first discovery)
  firstDiscoveryBodies: number; // count of undiscovered bodies
  edsmKnown: boolean | null; // null = loading, true = known to EDSM, false = unknown
  edsmLoading: boolean;
  timestamp: string;    // ISO timestamp of entry
}

function distFromSol(pos: [number, number, number] | null): number | null {
  if (!pos) return null;
  return Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2);
}

const STORAGE_KEY = "expeditionStore";

function saveToSession() {
  try {
    const data = { visited: _visited, currentSystemName: _currentSystemName };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      console.warn("Expedition sessionStorage quota exceeded — session data may be lost on refresh. Consider docking to reset.");
    }
  }
}

function loadFromSession(): { visited: VisitedSystem[]; currentSystemName: string | null } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

// Module-level refs so saveToSession can access them
let _visited: VisitedSystem[] = [];
let _currentSystemName: string | null = null;

function createExpeditionStore() {
  // Restore from sessionStorage on HMR
  const restored = loadFromSession();
  _visited = restored?.visited ?? [];
  _currentSystemName = restored?.currentSystemName ?? null;

  let visited = $state<VisitedSystem[]>(_visited);
  let currentSystemName = $state<string | null>(_currentSystemName);

  // Keep module-level refs in sync for saving
  $effect.root(() => {
    $effect(() => {
      _visited = visited;
      _currentSystemName = currentSystemName;
      saveToSession();
    });
  });

  return {
    get visited() { return visited; },
    get currentSystemName() { return currentSystemName; },

    /** Seed from cached data */
    seedFromCache(cachedVisited: unknown) {
      if (!Array.isArray(cachedVisited)) return;
      visited = (cachedVisited as VisitedSystem[]).map(s => ({
        ...s,
        // Clear stale loading flags from interrupted EDSM fetches
        edsmLoading: false,
      }));
      if (visited.length > 0) {
        currentSystemName = visited[visited.length - 1].name;
      }
    },

    /** Current system entry (last in visited list) */
    get currentSystem(): VisitedSystem | null {
      if (!currentSystemName) return null;
      return visited.find(s => s.name === currentSystemName) ?? null;
    },

    /** Called on FSDJump / Location */
    enterSystem(data: Record<string, unknown>) {
      const name = data.StarSystem as string;
      const address = data.SystemAddress as number;
      const starPos = (data.StarPos as [number, number, number]) ?? null;
      const starClass = (data.StarClass as string) ?? null;
      const jumpDist = (data.JumpDist as number) ?? 0;
      const timestamp = (data.timestamp as string) ?? new Date().toISOString();

      currentSystemName = name;

      // Don't add duplicate (e.g. Location event for same system)
      if (visited.some(s => s.address === address)) return;

      const entry: VisitedSystem = {
        name,
        address,
        starPos,
        starClass,
        jumpDist,
        distFromSol: distFromSol(starPos),
        cartoValue: 0,
        bioValue: 0,
        bodiesScanned: 0,
        bodiesMapped: 0,
        bioSpecies: 0,
        firstDiscoveryStar: false,
        firstDiscoveryBodies: 0,
        edsmKnown: null,
        edsmLoading: true,
        timestamp,
      };

      visited = [...visited, entry];

      // Fire EDSM lookup in background
      this.fetchEdsmInfo(name);
    },

    /** Add cartographic value to current system */
    addCartoValue(systemName: string, value: number) {
      const sys = visited.find(s => s.name === systemName);
      if (sys) {
        sys.cartoValue += value;
        visited = [...visited]; // trigger reactivity
      }
    },

    addBodyScanned(systemName: string) {
      const sys = visited.find(s => s.name === systemName);
      if (sys) {
        sys.bodiesScanned++;
        visited = [...visited];
      }
    },

    addBodyMapped(systemName: string) {
      const sys = visited.find(s => s.name === systemName);
      if (sys) {
        sys.bodiesMapped++;
        visited = [...visited];
      }
    },

    addBioValue(systemName: string, value: number) {
      const sys = visited.find(s => s.name === systemName);
      if (sys) {
        sys.bioValue += value;
        sys.bioSpecies++;
        visited = [...visited];
      }
    },

    markFirstDiscoveryStar(systemName: string) {
      const sys = visited.find(s => s.name === systemName);
      if (sys && !sys.firstDiscoveryStar) {
        sys.firstDiscoveryStar = true;
        visited = [...visited];
      }
    },

    markFirstDiscoveryBody(systemName: string) {
      const sys = visited.find(s => s.name === systemName);
      if (sys) {
        sys.firstDiscoveryBodies++;
        visited = [...visited];
      }
    },

    async fetchEdsmInfo(systemName: string) {
      try {
        const result = await invoke<Record<string, unknown> | null>("fetch_edsm_system", {
          systemName,
        });
        const sys = visited.find(s => s.name === systemName);
        if (!sys) return;

        sys.edsmLoading = false;
        // EDSM returns system data if known, null if unknown
        sys.edsmKnown = result != null && result.name != null;
        visited = [...visited];
      } catch {
        const sys = visited.find(s => s.name === systemName);
        if (sys) {
          sys.edsmLoading = false;
          sys.edsmKnown = null; // request failed
          visited = [...visited];
        }
      }
    },

    /** Reset on dock */
    reset() {
      visited = [];
      currentSystemName = null;
      sessionStorage.removeItem(STORAGE_KEY);
    },
  };
}

export const expeditionStore = createExpeditionStore();
