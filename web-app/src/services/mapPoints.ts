import type { MapPoint } from "../types/map";

export async function getMapPoints(): Promise<MapPoint[]> {
  const response = await fetch("/api/map-points");

  if (!response.ok) {
    throw new Error(`Map points request failed: ${response.status}`);
  }

  return (await response.json()) as MapPoint[];
}
