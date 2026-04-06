// Expedition history store — tracks completed dock-to-dock expeditions
import { invoke } from "@tauri-apps/api/core";

export interface ExpeditionRecord {
  id: string;
  startTimestamp: string;
  endTimestamp: string;
  startSystem: string;
  endStation: string;
  endSystem: string;
  systemsVisited: number;
  bodiesScanned: number;
  starsScanned: number;
  bodiesMapped: number;
  firstDiscoveries: number;
  cartoFSSValue: number;
  cartoDSSValue: number;
  bioValueBase: number;
  bioValueBonus: number;
  bioSpeciesFound: number;
  bioSpeciesAnalysed: number;
  distanceTravelled: number;
  playTimeSeconds: number;
  jumps: number;
  reconstructed: boolean;
}

/** Minimum threshold for an expedition to be worth recording */
function isSignificantExpedition(rec: Partial<ExpeditionRecord>): boolean {
  return (rec.systemsVisited ?? 0) >= 20 || (rec.bioSpeciesAnalysed ?? 0) >= 1;
}

function createExpeditionHistoryStore() {
  let expeditions = $state<ExpeditionRecord[]>([]);
  let loaded = $state(false);

  return {
    get expeditions() { return expeditions; },
    get loaded() { return loaded; },

    async load() {
      try {
        const result = await invoke<Array<Record<string, unknown>> | null>("get_expedition_history");
        if (result && Array.isArray(result)) {
          expeditions = result.map(mapFromRust);
        }
      } catch (e) {
        console.warn("Failed to load expedition history:", e);
      }
      loaded = true;
    },

    /** Snapshot current trip as a completed expedition (called before tripStore.reset on Docked) */
    snapshotCurrentTrip(
      trip: {
        systemsVisited: number; bodiesScanned: number; starsScanned: number;
        bodiesMapped: number; firstDiscoveries: number;
        cartoFSSValue: number; cartoDSSValue: number;
        bioValueBase: number; bioValueBonus: number;
        bioSpeciesFound: number; bioSpeciesAnalysed: number;
        distanceTravelled: number; playTimeSeconds: number; jumps: number;
      },
      startTimestamp: string,
      startSystem: string,
      endTimestamp: string,
      endStation: string,
      endSystem: string,
    ) {
      const record: ExpeditionRecord = {
        id: endTimestamp,
        startTimestamp,
        endTimestamp,
        startSystem,
        endStation,
        endSystem,
        systemsVisited: trip.systemsVisited,
        bodiesScanned: trip.bodiesScanned,
        starsScanned: trip.starsScanned,
        bodiesMapped: trip.bodiesMapped,
        firstDiscoveries: trip.firstDiscoveries,
        cartoFSSValue: trip.cartoFSSValue,
        cartoDSSValue: trip.cartoDSSValue,
        bioValueBase: trip.bioValueBase,
        bioValueBonus: trip.bioValueBonus,
        bioSpeciesFound: trip.bioSpeciesFound,
        bioSpeciesAnalysed: trip.bioSpeciesAnalysed,
        distanceTravelled: trip.distanceTravelled,
        playTimeSeconds: trip.playTimeSeconds,
        jumps: trip.jumps,
        reconstructed: false,
      };

      if (!isSignificantExpedition(record)) return;
      if (expeditions.some(e => e.id === record.id)) return;

      expeditions = [...expeditions, record];
      invoke("save_expedition_record", { record: mapToRust(record) }).catch(() => {});
    },

    /** Add reconstructed records from journal history processing */
    addReconstructed(records: ExpeditionRecord[]) {
      const significant = records.filter(isSignificantExpedition);
      const newRecords = significant.filter(r => !expeditions.some(e => e.id === r.id));
      if (newRecords.length === 0) return;
      expeditions = [...expeditions, ...newRecords];
      // Save all at once via individual calls (history file deduplicates by id)
      for (const r of newRecords) {
        invoke("save_expedition_record", { record: mapToRust(r) }).catch(() => {});
      }
    },
  };
}

/** Map Rust snake_case JSON to TS camelCase */
function mapFromRust(r: Record<string, unknown>): ExpeditionRecord {
  return {
    id: (r.id as string) ?? "",
    startTimestamp: (r.start_timestamp as string) ?? "",
    endTimestamp: (r.end_timestamp as string) ?? "",
    startSystem: (r.start_system as string) ?? "",
    endStation: (r.end_station as string) ?? "",
    endSystem: (r.end_system as string) ?? "",
    systemsVisited: (r.systems_visited as number) ?? 0,
    bodiesScanned: (r.bodies_scanned as number) ?? 0,
    starsScanned: (r.stars_scanned as number) ?? 0,
    bodiesMapped: (r.bodies_mapped as number) ?? 0,
    firstDiscoveries: (r.first_discoveries as number) ?? 0,
    cartoFSSValue: (r.carto_fss_value as number) ?? 0,
    cartoDSSValue: (r.carto_dss_value as number) ?? 0,
    bioValueBase: (r.bio_value_base as number) ?? 0,
    bioValueBonus: (r.bio_value_bonus as number) ?? 0,
    bioSpeciesFound: (r.bio_species_found as number) ?? 0,
    bioSpeciesAnalysed: (r.bio_species_analysed as number) ?? 0,
    distanceTravelled: (r.distance_travelled as number) ?? 0,
    playTimeSeconds: (r.play_time_seconds as number) ?? 0,
    jumps: (r.jumps as number) ?? 0,
    reconstructed: (r.reconstructed as boolean) ?? false,
  };
}

/** Map TS camelCase to Rust snake_case JSON */
function mapToRust(r: ExpeditionRecord): Record<string, unknown> {
  return {
    id: r.id,
    start_timestamp: r.startTimestamp,
    end_timestamp: r.endTimestamp,
    start_system: r.startSystem,
    end_station: r.endStation,
    end_system: r.endSystem,
    systems_visited: r.systemsVisited,
    bodies_scanned: r.bodiesScanned,
    stars_scanned: r.starsScanned,
    bodies_mapped: r.bodiesMapped,
    first_discoveries: r.firstDiscoveries,
    carto_fss_value: r.cartoFSSValue,
    carto_dss_value: r.cartoDSSValue,
    bio_value_base: r.bioValueBase,
    bio_value_bonus: r.bioValueBonus,
    bio_species_found: r.bioSpeciesFound,
    bio_species_analysed: r.bioSpeciesAnalysed,
    distance_travelled: r.distanceTravelled,
    play_time_seconds: r.playTimeSeconds,
    jumps: r.jumps,
    reconstructed: r.reconstructed,
  };
}

export const expeditionHistoryStore = createExpeditionHistoryStore();
