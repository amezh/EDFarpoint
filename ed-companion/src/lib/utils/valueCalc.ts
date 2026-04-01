// Cartographic value estimation using known multipliers
// Based on: https://elite-dangerous.fandom.com/wiki/Explorer#Cartographic_value

export interface CartoValueParams {
  bodyType: string;
  terraformable: boolean;
  wasDiscovered: boolean;
  wasMapped: boolean;
  massEM?: number;
  isFirstDiscoverer?: boolean;
  isFirstMapper?: boolean;
  withDSS?: boolean;
}

// Base values by body type (approximate Cr)
const BASE_VALUES: Record<string, number> = {
  "Earthlike body": 270_000,
  "Earth-like world": 270_000,
  "Water world": 100_000,
  "Ammonia world": 150_000,
  "High metal content body": 14_000,
  "Metal rich body": 31_000,
  "Rocky body": 500,
  "Rocky ice body": 500,
  "Icy body": 500,
  "Class I gas giant": 3_800,
  "Class II gas giant": 28_400,
  "Class III gas giant": 1_000,
  "Class IV gas giant": 1_100,
  "Class V gas giant": 1_000,
  "Gas giant with ammonia based life": 1_500,
  "Gas giant with water based life": 1_500,
  "Helium gas giant": 1_000,
  "Helium rich gas giant": 1_000,
  "Water giant": 1_000,
  "Sudarsky class I gas giant": 3_800,
  "Sudarsky class II gas giant": 28_400,
  "Sudarsky class III gas giant": 1_000,
  "Sudarsky class IV gas giant": 1_100,
  "Sudarsky class V gas giant": 1_000,
};

// Terraformable bonus multiplier
const TF_MULTIPLIER: Record<string, number> = {
  "Earthlike body": 1, // ELW is already at max
  "Earth-like world": 1,
  "Water world": 5.3,
  "Ammonia world": 1,
  "High metal content body": 11.4,
  "Rocky body": 9.0,
  "Rocky ice body": 9.0,
};

export function estimateCartoValue(params: CartoValueParams): number {
  let base = BASE_VALUES[params.bodyType] ?? 500;

  // Terraformable bonus
  if (params.terraformable) {
    const tfMult = TF_MULTIPLIER[params.bodyType] ?? 1;
    base *= tfMult;
  }

  // First discovery bonus (×2.6)
  if (params.isFirstDiscoverer || !params.wasDiscovered) {
    base *= 2.6;
  }

  // DSS mapping bonus (×3.33 for first mapper, ×8.95 for first mapper + first discoverer)
  if (params.withDSS) {
    if (params.isFirstMapper || !params.wasMapped) {
      base *= params.isFirstDiscoverer || !params.wasDiscovered ? 8.95 : 3.33;
    } else {
      base *= 1.25; // Already mapped by someone else
    }
  }

  return Math.round(base);
}

// Star scan values
const STAR_VALUES: Record<string, number> = {
  N: 22_628, // Neutron star
  D: 14_057, // White dwarf (various subtypes)
  DA: 14_057,
  DAB: 14_057,
  DAO: 14_057,
  DAZ: 14_057,
  DAV: 14_057,
  DB: 14_057,
  DBZ: 14_057,
  DBV: 14_057,
  DO: 14_057,
  DOV: 14_057,
  DQ: 14_057,
  DC: 14_057,
  DCV: 14_057,
  DX: 14_057,
  H: 22_628, // Black hole
  SupermassiveBlackHole: 33_737,
};

export function estimateStarValue(starType: string, wasDiscovered: boolean): number {
  let base = STAR_VALUES[starType] ?? 1_200;
  if (!wasDiscovered) base *= 2.6;
  return Math.round(base);
}
