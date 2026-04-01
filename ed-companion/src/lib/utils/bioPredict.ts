import { invoke } from "@tauri-apps/api/core";

export interface PredictedSpecies {
  name: string;
  codex_name: string | null;
  value: number;
  clonal_range: number;
  confidence: string;
}

export interface BioPrediction {
  body_name: string;
  body_id: number;
  signal_count: number;
  species: PredictedSpecies[];
  min_value: number;
  max_value: number;
}

export async function predictBio(
  bodyName: string,
  bodyId: number,
  signalCount: number,
  planetClass: string,
  atmosphereType: string,
  gravityG: number,
  temperatureK: number,
  volcanism: string,
  starType: string,
  distanceLs: number,
): Promise<BioPrediction | null> {
  try {
    const result = await invoke<BioPrediction | null>("predict_bio", {
      bodyName,
      bodyId,
      signalCount,
      planetClass,
      atmosphereType,
      gravityG,
      temperatureK,
      volcanism,
      starType,
      distanceLs,
    });
    return result;
  } catch (e) {
    console.error("Bio prediction failed:", e);
    return null;
  }
}

export function formatCredits(value: number): string {
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + "B";
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
  if (value >= 1_000) return (value / 1_000).toFixed(1) + "K";
  return value.toString();
}
