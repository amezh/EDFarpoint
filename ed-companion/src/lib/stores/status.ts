// Status.json poller state — receives updates from Rust backend

export interface StatusFlags {
  docked: boolean;
  landed: boolean;
  landingGear: boolean;
  shields: boolean;
  supercruise: boolean;
  faSoff: boolean;
  hardpoints: boolean;
  inWing: boolean;
  lights: boolean;
  cargoScoop: boolean;
  silentRunning: boolean;
  scooping: boolean;
  srvHandbrake: boolean;
  srvTurret: boolean;
  srvNearShip: boolean;
  srvDriveAssist: boolean;
  massLocked: boolean;
  fsdCharging: boolean;
  fsdCooldown: boolean;
  lowFuel: boolean;
  overheating: boolean;
  hasLatLon: boolean;
  inDanger: boolean;
  interdicted: boolean;
  inMainShip: boolean;
  inFighter: boolean;
  inSRV: boolean;
  analysisMode: boolean;
  nightVision: boolean;
  altFromAvgRadius: boolean;
  fsdJump: boolean;
  srvHighBeam: boolean;
  onFoot: boolean;
  inTaxi: boolean;
  inMulticrew: boolean;
  onFootInStation: boolean;
  onFootOnPlanet: boolean;
  aimDownSight: boolean;
  lowOxygen: boolean;
  lowHealth: boolean;
  cold: boolean;
  hot: boolean;
  veryCold: boolean;
  veryHot: boolean;
}

export interface StatusState {
  flags: number;
  parsed: Partial<StatusFlags>;
  fuel: { main: number; reserve: number } | null;
  cargo: number;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  heading: number | null;
  bodyName: string | null;
}

function parseFlags(flags: number): Partial<StatusFlags> {
  return {
    docked: !!(flags & (1 << 0)),
    landed: !!(flags & (1 << 1)),
    landingGear: !!(flags & (1 << 2)),
    shields: !!(flags & (1 << 3)),
    supercruise: !!(flags & (1 << 4)),
    hardpoints: !!(flags & (1 << 6)),
    inWing: !!(flags & (1 << 7)),
    lights: !!(flags & (1 << 8)),
    scooping: !!(flags & (1 << 11)),
    fsdCharging: !!(flags & (1 << 18)),
    lowFuel: !!(flags & (1 << 19)),
    overheating: !!(flags & (1 << 20)),
    hasLatLon: !!(flags & (1 << 21)),
    inMainShip: !!(flags & (1 << 24)),
    inSRV: !!(flags & (1 << 26)),
    analysisMode: !!(flags & (1 << 27)),
    onFoot: !!(flags & (1 << 30)),
    onFootOnPlanet: !!(flags & (1 << 34)),
  };
}

function createStatusStore() {
  let state = $state<StatusState>({
    flags: 0,
    parsed: {},
    fuel: null,
    cargo: 0,
    latitude: null,
    longitude: null,
    altitude: null,
    heading: null,
    bodyName: null,
  });

  return {
    get current() {
      return state;
    },
    get flags() {
      return state.parsed;
    },

    update(payload: unknown) {
      const data = payload as Record<string, unknown>;
      if (!data) return;

      state.flags = (data.Flags as number) ?? 0;
      state.parsed = parseFlags(state.flags);

      if (data.Fuel && typeof data.Fuel === "object") {
        const fuel = data.Fuel as Record<string, number>;
        state.fuel = { main: fuel.FuelMain ?? 0, reserve: fuel.FuelReserve ?? 0 };
      }

      state.latitude = (data.Latitude as number) ?? null;
      state.longitude = (data.Longitude as number) ?? null;
      state.altitude = (data.Altitude as number) ?? null;
      state.heading = (data.Heading as number) ?? null;
      state.bodyName = (data.BodyName as string) ?? null;
    },
  };
}

export const statusStore = createStatusStore();
