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
  flags2: number;
  parsed: Partial<StatusFlags>;
  fuel: { main: number; reserve: number } | null;
  cargo: number;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  heading: number | null;
  bodyName: string | null;
  /** Docked state from journal events — used as fallback when Status.json hasn't been polled yet */
  journalDocked: boolean;
}

function parseFlags(flags: number, flags2: number): Partial<StatusFlags> {
  return {
    // Flags (bits 0-30)
    docked: !!(flags & (1 << 0)),
    landed: !!(flags & (1 << 1)),
    landingGear: !!(flags & (1 << 2)),
    shields: !!(flags & (1 << 3)),
    supercruise: !!(flags & (1 << 4)),
    faSoff: !!(flags & (1 << 5)),
    hardpoints: !!(flags & (1 << 6)),
    inWing: !!(flags & (1 << 7)),
    lights: !!(flags & (1 << 8)),
    cargoScoop: !!(flags & (1 << 9)),
    silentRunning: !!(flags & (1 << 10)),
    scooping: !!(flags & (1 << 11)),
    srvHandbrake: !!(flags & (1 << 12)),
    srvTurret: !!(flags & (1 << 13)),
    srvNearShip: !!(flags & (1 << 14)),
    srvDriveAssist: !!(flags & (1 << 15)),
    massLocked: !!(flags & (1 << 16)),
    fsdCharging: !!(flags & (1 << 18)),
    fsdCooldown: !!(flags & (1 << 17)),
    lowFuel: !!(flags & (1 << 19)),
    overheating: !!(flags & (1 << 20)),
    hasLatLon: !!(flags & (1 << 21)),
    inDanger: !!(flags & (1 << 22)),
    interdicted: !!(flags & (1 << 23)),
    inMainShip: !!(flags & (1 << 24)),
    inFighter: !!(flags & (1 << 25)),
    inSRV: !!(flags & (1 << 26)),
    analysisMode: !!(flags & (1 << 27)),
    nightVision: !!(flags & (1 << 28)),
    altFromAvgRadius: !!(flags & (1 << 29)),
    fsdJump: !!(flags & (1 << 30)),
    srvHighBeam: !!(flags & (1 << 31)),
    // Flags2 (Odyssey on-foot flags)
    onFoot: !!(flags2 & (1 << 0)),
    inTaxi: !!(flags2 & (1 << 1)),
    inMulticrew: !!(flags2 & (1 << 2)),
    onFootInStation: !!(flags2 & (1 << 3)),
    onFootOnPlanet: !!(flags2 & (1 << 4)),
    aimDownSight: !!(flags2 & (1 << 5)),
    lowOxygen: !!(flags2 & (1 << 6)),
    lowHealth: !!(flags2 & (1 << 7)),
    cold: !!(flags2 & (1 << 8)),
    hot: !!(flags2 & (1 << 9)),
    veryCold: !!(flags2 & (1 << 10)),
    veryHot: !!(flags2 & (1 << 11)),
  };
}

function createStatusStore() {
  let state = $state<StatusState>({
    flags: 0,
    flags2: 0,
    parsed: {},
    fuel: null,
    cargo: 0,
    latitude: null,
    longitude: null,
    altitude: null,
    heading: null,
    bodyName: null,
    journalDocked: false,
  });

  return {
    get current() {
      return state;
    },
    get flags() {
      return state.parsed;
    },

    setJournalDocked(docked: boolean) {
      state.journalDocked = docked;
    },

    update(payload: unknown) {
      const data = payload as Record<string, unknown>;
      if (!data) return;

      state.flags = (data.Flags as number) ?? 0;
      state.flags2 = (data.Flags2 as number) ?? 0;
      state.parsed = parseFlags(state.flags, state.flags2);

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
