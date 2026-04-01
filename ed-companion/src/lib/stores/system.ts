// System store — tracks current system + body list

export interface Body {
  bodyId: number;
  name: string;
  shortName: string;
  type: string;
  planetClass: string;
  starType: string | null;
  distanceLs: number | null;
  radius: number | null;
  gravity: number | null;
  atmosphere: string;
  atmosphereType: string;
  temperature: number | null;
  volcanism: string;
  landable: boolean;
  terraformable: boolean;
  mapped: boolean;
  bioSignals: number;
  geoSignals: number;
  bioSpeciesPredicted: string[];
  bioValueMin: number | null;
  bioValueMax: number | null;
  estimatedValue: number | null;
  wasDiscovered: boolean;
  wasMapped: boolean;
  personalStatus: "unvisited" | "fss" | "dss" | "landed" | "bio_complete";
  parents: Array<Record<string, number>>;
}

export interface SystemState {
  name: string;
  address: number;
  starPos: [number, number, number];
  starClass: string | null;
  bodyCount: number | null;
  nonBodyCount: number | null;
  fssProgress: number;
  distanceFromSol: number | null;
  bodies: Body[];
  firstDiscovery: boolean;
}

function distFromSol(pos: [number, number, number]): number {
  return Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2);
}

function shortBodyName(fullName: string, systemName: string): string {
  if (fullName.startsWith(systemName)) {
    return fullName.slice(systemName.length).trim() || fullName;
  }
  return fullName;
}

function createSystemStore() {
  let state = $state<SystemState | null>(null);

  return {
    get current() {
      return state;
    },

    setSystem(data: Record<string, unknown>) {
      const name = data.StarSystem as string;
      const starPos = data.StarPos as [number, number, number];

      state = {
        name,
        address: data.SystemAddress as number,
        starPos,
        starClass: null,
        bodyCount: null,
        nonBodyCount: null,
        fssProgress: 0,
        distanceFromSol: distFromSol(starPos),
        bodies: [],
        firstDiscovery: false,
      };
    },

    updateFSSProgress(data: Record<string, unknown>) {
      if (!state || state.address !== data.SystemAddress) return;
      state.bodyCount = (data.BodyCount as number) ?? state.bodyCount;
      state.nonBodyCount = (data.NonBodyCount as number) ?? state.nonBodyCount;
      state.fssProgress = (data.Progress as number) ?? state.fssProgress;
    },

    addOrUpdateBody(scan: Record<string, unknown>) {
      if (!state) return;
      const bodyId = scan.BodyID as number;
      const existing = state.bodies.findIndex((b) => b.bodyId === bodyId);

      const body: Body = {
        bodyId,
        name: scan.BodyName as string,
        shortName: shortBodyName(scan.BodyName as string, state.name),
        type: (scan.StarType as string) ? "Star" : (scan.PlanetClass as string) ?? "Unknown",
        planetClass: (scan.PlanetClass as string) ?? "",
        starType: (scan.StarType as string) ?? null,
        distanceLs: (scan.DistanceFromArrivalLS as number) ?? null,
        radius: scan.Radius != null ? (scan.Radius as number) / 1000 : null,
        gravity: scan.SurfaceGravity != null ? (scan.SurfaceGravity as number) / 9.81 : null,
        atmosphere: (scan.Atmosphere as string) ?? "",
        atmosphereType: (scan.AtmosphereType as string) ?? "",
        temperature: (scan.SurfaceTemperature as number) ?? null,
        volcanism: (scan.Volcanism as string) ?? "",
        landable: (scan.Landable as boolean) ?? false,
        terraformable: (scan.TerraformState as string) === "Terraformable",
        mapped: false,
        bioSignals: existing >= 0 ? state.bodies[existing].bioSignals : 0,
        geoSignals: existing >= 0 ? state.bodies[existing].geoSignals : 0,
        bioSpeciesPredicted: existing >= 0 ? state.bodies[existing].bioSpeciesPredicted : [],
        bioValueMin: existing >= 0 ? state.bodies[existing].bioValueMin : null,
        bioValueMax: existing >= 0 ? state.bodies[existing].bioValueMax : null,
        estimatedValue: null,
        wasDiscovered: (scan.WasDiscovered as boolean) ?? false,
        wasMapped: (scan.WasMapped as boolean) ?? false,
        personalStatus: "fss",
        parents: (scan.Parents as Array<Record<string, number>>) ?? [],
      };

      if (existing >= 0) {
        state.bodies[existing] = body;
      } else {
        state.bodies = [...state.bodies, body].sort(
          (a, b) => (a.distanceLs ?? 0) - (b.distanceLs ?? 0)
        );
      }
    },

    updateBodySignals(data: Record<string, unknown>) {
      if (!state) return;
      const bodyId = data.BodyID as number;
      const signals = data.Signals as Array<{ Type: string; Count: number }>;
      const genuses = data.Genuses as Array<{ Genus: string; Genus_Localised: string }> | undefined;

      const body = state.bodies.find((b) => b.bodyId === bodyId);
      if (!body) return;

      for (const sig of signals ?? []) {
        if (sig.Type.includes("Biological")) {
          body.bioSignals = sig.Count;
        } else if (sig.Type.includes("Geological")) {
          body.geoSignals = sig.Count;
        }
      }
    },

    markBodyMapped(bodyId: number) {
      if (!state) return;
      const body = state.bodies.find((b) => b.bodyId === bodyId);
      if (body) {
        body.mapped = true;
        body.personalStatus = "dss";
      }
    },
  };
}

export const systemStore = createSystemStore();
