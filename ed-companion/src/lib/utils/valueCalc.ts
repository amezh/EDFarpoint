// Cartographic value estimation using official ED exploration formulae
// Source: https://forums.frontier.co.uk/threads/exploration-value-formulae.232000/
// Post-3.3 (Beyond Chapter 4) formulas

const Q = 0.56591828;

// ── Star k values ──────────────────────────────────────────

const STAR_K: Record<string, number> = {
  // Neutron stars
  N: 22628,
  // Black holes
  H: 22628,
  SupermassiveBlackHole: 22628,
  // White dwarfs
  D: 14057,
  DA: 14057,
  DAB: 14057,
  DAO: 14057,
  DAZ: 14057,
  DAV: 14057,
  DB: 14057,
  DBZ: 14057,
  DBV: 14057,
  DO: 14057,
  DOV: 14057,
  DQ: 14057,
  DC: 14057,
  DCV: 14057,
  DX: 14057,
};

const DEFAULT_STAR_K = 1200;

/** Star FSS scan value: k + (mass * k / 66.25) */
export function estimateStarValue(
  starType: string,
  solarMass: number,
  wasDiscovered: boolean,
): number {
  const k = STAR_K[starType] ?? DEFAULT_STAR_K;
  const mass = solarMass || 1;
  let value = k + (mass * k) / 66.25;
  if (!wasDiscovered) value *= 2.6;
  return Math.round(value);
}

// ── Body k values ──────────────────────────────────────────

interface BodyK {
  base: number;
  terraform: number; // additional k when terraformable
}

const BODY_K: Record<string, BodyK> = {
  "Metal rich body": { base: 21790, terraform: 105678 },
  "Metal-rich body": { base: 21790, terraform: 105678 },
  "Ammonia world": { base: 96932, terraform: 0 },
  "Class I gas giant": { base: 1656, terraform: 0 },
  "Sudarsky class I gas giant": { base: 1656, terraform: 0 },
  "Class II gas giant": { base: 9654, terraform: 0 },
  "Sudarsky class II gas giant": { base: 9654, terraform: 0 },
  "High metal content body": { base: 9654, terraform: 100677 },
  "High metal content world": { base: 9654, terraform: 100677 },
  "Water world": { base: 64831, terraform: 116295 },
  "Earthlike body": { base: 64831, terraform: 116295 },
  "Earth-like world": { base: 64831, terraform: 116295 },
};

const DEFAULT_BODY_K: BodyK = { base: 300, terraform: 93328 };

// Mapping multipliers
const MAP_MULT = {
  unmapped: 1.0,
  mapped_both_firsts: 3.699622554, // first discoverer + first mapped
  mapped_first_mapped: 8.0956, // first mapped only (not first discoverer)
  mapped_no_firsts: 3.3333333333, // neither first
};

export interface CartoValueParams {
  bodyType: string;
  terraformable: boolean;
  wasDiscovered: boolean;
  wasMapped: boolean;
  massEM?: number;
  isFirstDiscoverer?: boolean;
  isFirstMapper?: boolean;
  withDSS?: boolean; // whether player mapped it with DSS
  efficiencyBonus?: boolean; // mapped within efficiency target
}

/**
 * Calculate body exploration value (FSS or DSS).
 * Returns credits rounded to integer.
 */
export function estimateCartoValue(params: CartoValueParams): number {
  const bodyK = BODY_K[params.bodyType] ?? DEFAULT_BODY_K;
  let k = bodyK.base;
  if (params.terraformable && bodyK.terraform > 0) {
    k += bodyK.terraform;
  }

  const mass = params.massEM ?? 1;
  // Base value: k + k * q * mass^0.2
  let value = k + k * Q * Math.pow(Math.max(mass, 0.0001), 0.2);

  // First discoverer: is the body undiscovered?
  const isFirstDisc = params.isFirstDiscoverer ?? !params.wasDiscovered;

  // Mapping multiplier
  if (params.withDSS) {
    const isFirstMap = params.isFirstMapper ?? !params.wasMapped;
    if (isFirstMap && isFirstDisc) {
      value *= MAP_MULT.mapped_both_firsts;
    } else if (isFirstMap) {
      value *= MAP_MULT.mapped_first_mapped;
    } else {
      value *= MAP_MULT.mapped_no_firsts;
    }

    // Odyssey/Horizons 4.0 mapping bonus (+30%, min 555)
    value += Math.max(value * 0.3, 555);

    // Efficiency bonus
    if (params.efficiencyBonus) {
      value *= 1.25;
    }
  }

  // Floor of 500 cr
  value = Math.max(500, value);

  // First discoverer multiplier (applied last)
  if (isFirstDisc) {
    value *= 2.6;
  }

  return Math.round(value);
}

// Class III-V gas giants, helium/water giants, etc. all use DEFAULT_BODY_K (k=300)

export interface CartoBreakdown {
  baseValue: number;
  firstDiscBonus: [number, number] | null; // [min, max] – null if already discovered
  surfaceScanValue: number;
  firstSurfaceScanBonus: number;
  efficiencyBonus: number;
  valueAchieved: number;
  achievableValue: number;
}

/**
 * Decompose exploration value into labeled components.
 */
export function cartoBreakdown(p: {
  bodyType: string;
  terraformable: boolean;
  wasDiscovered: boolean;
  wasMapped: boolean;
  massEM?: number;
  mapped: boolean;
  mappedByUs: boolean;
}): CartoBreakdown {
  const shared = {
    bodyType: p.bodyType,
    terraformable: p.terraformable,
    massEM: p.massEM,
  };

  // Base FSS-only value (no first-discovery bonus)
  const baseValue = estimateCartoValue({
    ...shared,
    wasDiscovered: true, wasMapped: true,
    withDSS: false,
  });

  // First discovery bonus range (null if already discovered)
  let firstDiscBonus: [number, number] | null = null;
  if (!p.wasDiscovered) {
    const fssFirstDisc = estimateCartoValue({
      ...shared, wasDiscovered: false, wasMapped: true,
      withDSS: false,
    });
    const optFull = estimateCartoValue({
      ...shared, wasDiscovered: false, wasMapped: false,
      isFirstMapper: true, withDSS: true, efficiencyBonus: true,
    });
    const optNoDisc = estimateCartoValue({
      ...shared, wasDiscovered: true, wasMapped: false,
      isFirstMapper: true, withDSS: true, efficiencyBonus: true,
    });
    firstDiscBonus = [fssFirstDisc - baseValue, optFull - optNoDisc];
  }

  // Surface scan value (DSS, no first-map, no efficiency)
  const valDssNoFirst = estimateCartoValue({
    ...shared, wasDiscovered: true, wasMapped: true,
    withDSS: true, efficiencyBonus: false,
  });
  const surfaceScanValue = valDssNoFirst - baseValue;

  // First surface scan bonus
  let firstSurfaceScanBonus = 0;
  if (!p.wasMapped) {
    const valDssFirst = estimateCartoValue({
      ...shared, wasDiscovered: true, wasMapped: false,
      withDSS: true, efficiencyBonus: false,
    });
    firstSurfaceScanBonus = valDssFirst - valDssNoFirst;
  }

  // Efficiency bonus
  const bestWithoutEff = estimateCartoValue({
    ...shared, wasDiscovered: true, wasMapped: p.wasMapped,
    withDSS: true, efficiencyBonus: false,
  });
  const bestWithEff = estimateCartoValue({
    ...shared, wasDiscovered: true, wasMapped: p.wasMapped,
    withDSS: true, efficiencyBonus: true,
  });
  const efficiencyBonus = bestWithEff - bestWithoutEff;

  // Value achieved: based on current player scan state
  const valueAchieved = estimateCartoValue({
    ...shared,
    wasDiscovered: p.wasDiscovered, wasMapped: p.wasMapped,
    withDSS: p.mapped,
    isFirstMapper: p.mappedByUs,
  });

  // Achievable value: max if player does everything optimally
  const achievableValue = estimateCartoValue({
    ...shared,
    wasDiscovered: p.wasDiscovered, wasMapped: p.wasMapped,
    withDSS: true, efficiencyBonus: true,
  });

  return {
    baseValue,
    firstDiscBonus,
    surfaceScanValue,
    firstSurfaceScanBonus,
    efficiencyBonus,
    valueAchieved,
    achievableValue,
  };
}
