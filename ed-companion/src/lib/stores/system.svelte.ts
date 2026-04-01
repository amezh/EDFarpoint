// System store — tracks current system + body list
import type { PredictedSpecies, BioPrediction } from "$lib/utils/bioPredict";

export interface RingInfo {
  name: string;
  ringClass: string;   // e.g. "eRingClass_Rocky", "eRingClass_Icy"
  massMT: number;      // mass in megatons
  innerRad: number;    // inner radius in meters
  outerRad: number;    // outer radius in meters
}

export interface Body {
  bodyId: number;
  name: string;
  shortName: string;
  type: string;
  planetClass: string;
  starType: string | null;
  starSubclass: number | null;
  stellarMass: number | null;
  luminosity: string | null;
  distanceLs: number | null;
  radius: number | null;
  gravity: number | null;
  atmosphere: string;
  atmosphereType: string;
  surfacePressure: number | null; // in Atmospheres (journal value / 101325)
  temperature: number | null;
  volcanism: string;
  landable: boolean;
  terraformable: boolean;
  mapped: boolean;        // we DSS'd this body
  mappedByUs: boolean;    // we were first to map it (journal wasMapped=false when we DSS)
  bioSignals: number;
  geoSignals: number;
  bioSpeciesPredicted: PredictedSpecies[];
  bioValueMin: number | null;
  bioValueMax: number | null;
  estimatedValue: number | null;
  wasDiscovered: boolean;
  wasMapped: boolean;     // someone else mapped before us (from journal)
  wasFootfalled: boolean;
  personalStatus: "unvisited" | "fss" | "dss" | "landed" | "bio_complete";
  parents: Array<Record<string, number>>;
  rings: RingInfo[];
  semiMajorAxis: number | null;  // meters
  eccentricity: number | null;
  orbitalInclination: number | null; // degrees
  orbitalPeriod: number | null;  // seconds
  edsmDiscoverer: string | null;
  edsmDiscoveryDate: string | null;
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
  stars: Map<number, string>; // bodyId → starType (e.g. "M", "K", "F")
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
        stars: new Map(),
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

      // Parse rings if present
      const rawRings = scan.Rings as Array<Record<string, unknown>> | undefined;
      const rings: RingInfo[] = rawRings?.map((r) => ({
        name: (r.Name as string) ?? "",
        ringClass: (r.RingClass as string) ?? "",
        massMT: (r.MassMT as number) ?? 0,
        innerRad: (r.InnerRad as number) ?? 0,
        outerRad: (r.OuterRad as number) ?? 0,
      })) ?? [];

      const body: Body = {
        bodyId,
        name: scan.BodyName as string,
        shortName: shortBodyName(scan.BodyName as string, state.name),
        type: (scan.StarType as string) ? "Star" : (scan.PlanetClass as string) ?? "Unknown",
        planetClass: (scan.PlanetClass as string) ?? "",
        starType: (scan.StarType as string) ?? null,
        starSubclass: (scan.Subclass as number) ?? null,
        stellarMass: (scan.StellarMass as number) ?? null,
        luminosity: (scan.Luminosity as string) ?? null,
        distanceLs: (scan.DistanceFromArrivalLS as number) ?? null,
        radius: scan.Radius != null ? (scan.Radius as number) / 1000 : null,
        gravity: scan.SurfaceGravity != null ? (scan.SurfaceGravity as number) / 9.81 : null,
        atmosphere: (scan.Atmosphere as string) ?? "",
        atmosphereType: (scan.AtmosphereType as string) ?? "",
        surfacePressure: scan.SurfacePressure != null ? (scan.SurfacePressure as number) / 101325 : null,
        temperature: (scan.SurfaceTemperature as number) ?? null,
        volcanism: (scan.Volcanism as string) ?? "",
        landable: (scan.Landable as boolean) ?? false,
        terraformable: (scan.TerraformState as string) === "Terraformable",
        mapped: existing >= 0 ? state.bodies[existing].mapped : false,
        mappedByUs: false,
        bioSignals: existing >= 0 ? state.bodies[existing].bioSignals : 0,
        geoSignals: existing >= 0 ? state.bodies[existing].geoSignals : 0,
        bioSpeciesPredicted: existing >= 0 ? state.bodies[existing].bioSpeciesPredicted : [],
        bioValueMin: existing >= 0 ? state.bodies[existing].bioValueMin : null,
        bioValueMax: existing >= 0 ? state.bodies[existing].bioValueMax : null,
        estimatedValue: null,
        wasDiscovered: (scan.WasDiscovered as boolean) ?? false,
        wasMapped: (scan.WasMapped as boolean) ?? false,
        wasFootfalled: (scan.WasFootfalled as boolean) ?? false,
        personalStatus: existing >= 0 ? state.bodies[existing].personalStatus : "fss",
        parents: (scan.Parents as Array<Record<string, number>>) ?? [],
        rings,
        semiMajorAxis: (scan.SemiMajorAxis as number) ?? null,
        eccentricity: (scan.Eccentricity as number) ?? null,
        orbitalInclination: (scan.OrbitalInclination as number) ?? null,
        orbitalPeriod: (scan.OrbitalPeriod as number) ?? null,
        edsmDiscoverer: existing >= 0 ? state.bodies[existing].edsmDiscoverer : null,
        edsmDiscoveryDate: existing >= 0 ? state.bodies[existing].edsmDiscoveryDate : null,
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

      let body = state.bodies.find((b) => b.bodyId === bodyId);

      // FSSBodySignals can arrive before Scan — create a stub so signals
      // are preserved when addBody later merges into the existing entry.
      if (!body) {
        const bodyName = (data.BodyName as string) ?? `Body ${bodyId}`;
        body = {
          bodyId,
          name: bodyName,
          shortName: shortBodyName(bodyName, state.name),
          type: "Unknown",
          planetClass: "",
          starType: null,
          starSubclass: null,
          stellarMass: null,
          luminosity: null,
          distanceLs: null,
          radius: null,
          gravity: null,
          atmosphere: "",
          atmosphereType: "",
          surfacePressure: null,
          temperature: null,
          volcanism: "",
          landable: false,
          terraformable: false,
          mapped: false,
          mappedByUs: false,
          bioSignals: 0,
          geoSignals: 0,
          bioSpeciesPredicted: [],
          bioValueMin: null,
          bioValueMax: null,
          estimatedValue: null,
          wasDiscovered: false,
          wasMapped: false,
          wasFootfalled: false,
          personalStatus: "fss",
          parents: [],
          rings: [],
          semiMajorAxis: null,
          eccentricity: null,
          orbitalInclination: null,
          orbitalPeriod: null,
          edsmDiscoverer: null,
          edsmDiscoveryDate: null,
        };
        state.bodies = [...state.bodies, body];
      }

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
        // If wasMapped was false when we scanned, we're the first mapper
        if (!body.wasMapped) {
          body.mappedByUs = true;
        }
        body.personalStatus = "dss";
      }
    },

    addStar(bodyId: number, starType: string) {
      if (!state) return;
      state.stars.set(bodyId, starType);
    },

    getParentStarType(body: Body): string {
      if (!state) return "";
      // Walk parents to find the nearest Star reference
      for (const parent of body.parents) {
        if ("Star" in parent) {
          const starId = parent.Star;
          return state.stars.get(starId) ?? "";
        }
      }
      // Fallback: use first star in the system (the primary)
      if (state.stars.size > 0) {
        return state.stars.values().next().value ?? "";
      }
      return "";
    },

    updateBioPrediction(bodyId: number, prediction: BioPrediction) {
      if (!state) return;
      const body = state.bodies.find((b) => b.bodyId === bodyId);
      if (body) {
        body.bioSpeciesPredicted = prediction.species;
        body.bioValueMin = prediction.min_value;
        body.bioValueMax = prediction.max_value;
      }
    },

    /** Apply EDSM discovery data to matching bodies */
    applyEdsmBodies(edsmBodies: Array<{ body_id?: number; name?: string; discovery?: { commander?: string; date?: string } }>) {
      if (!state) return;
      for (const eb of edsmBodies) {
        if (eb.body_id == null || !eb.discovery?.commander) continue;
        const body = state.bodies.find((b) => b.bodyId === eb.body_id);
        if (body) {
          body.edsmDiscoverer = eb.discovery.commander;
          body.edsmDiscoveryDate = eb.discovery.date ?? null;
        }
      }
    },
  };
}

export const systemStore = createSystemStore();
