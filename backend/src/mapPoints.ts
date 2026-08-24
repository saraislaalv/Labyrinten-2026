import { loadFeed } from "./feed.js";
import type { FeedMapEntry, FeedMapLocation, StoryCategory, StoryFeedEntry } from "./feed.js";
import { buildSeedEvents } from "./mainTopics.js";
import type { MainTopicCoordinateEvent, MainTopicEventType } from "./mainTopics.js";

type MarkerVariant =
  | "conflict"
  | "weather"
  | "sport"
  | "culture"
  | "politics"
  | "crime"
  | "economy"
  | "default";

export type MapPoint = {
  id: string;
  storyId: string;
  openStoryId: string | null;
  storyGroupId: string | null;
  storyGroupIds: string[];
  storyTags: string[];
  articleId: string | null;
  title: string;
  storyTitle: string;
  category: StoryCategory;
  tag: string | null;
  tagKey: string;
  markerVariant: MarkerVariant;
  lat: number;
  lon: number;
  country: string | null;
  city: string | null;
  municipality: string | null;
  zoom: number | null;
  imageUrl: string | null;
  imageCaption: string | null;
};

function isValidCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasCoordinates(location: FeedMapLocation | null | undefined): location is FeedMapLocation {
  return isValidCoordinate(location?.lat) && isValidCoordinate(location?.lon);
}

function toPointId(storyId: string, map: FeedMapEntry, mapIndex: number): string {
  return map.enrichment_id ? `${storyId}:${map.enrichment_id}` : `${storyId}:${mapIndex}`;
}

function toDeduplicationKey(storyId: string, point: MapPoint): string {
  return [
    storyId,
    point.country ?? "",
    point.city ?? "",
    point.municipality ?? "",
    point.lat.toFixed(6),
    point.lon.toFixed(6),
  ].join(":");
}

const TAG_LABELS: Record<MarkerVariant, string> = {
  conflict: "Konflikt",
  weather: "Vær",
  sport: "Sport",
  culture: "Kultur",
  politics: "Politikk",
  crime: "Krim",
  economy: "Økonomi",
  default: "Siste",
};

function normalizeTagKey(tag: string | null): string {
  if (!tag) {
    return "";
  }

  return tag
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

function toMarkerVariant(rawTagKey: string, category: StoryCategory, contextText: string): MarkerVariant {
  const tagKey = normalizeTagKey(rawTagKey);

  if (tagKey === "conflict") {
    return "conflict";
  }

  if (tagKey === "weather") {
    return "weather";
  }

  if (tagKey === "sport") {
    return "sport";
  }

  if (tagKey === "culture") {
    return "culture";
  }

  if (tagKey === "politics") {
    return "politics";
  }

  if (tagKey === "crime") {
    return "crime";
  }

  if (tagKey === "economy") {
    return "economy";
  }

  if (/(krig|krise|konflikt|angrep|frontlinje|hormuz|israel|iran|missil|ubåt|våpenhvile)/.test(contextText)) {
    return "conflict";
  }

  if (/(politi|drap|mord|overfall|ran|rettssak|etterforsk|pågrepet|varetekt|arrest|vold)/.test(contextText)) {
    return "crime";
  }

  if (/(storting|regjering|valg|politikk|diplomati|president|statsminister|nato)/.test(contextText)) {
    return "politics";
  }

  if (/(rente|inflasjon|arbeidsledighet|børs|økonomi|pris|drivstoff|strømpris|marked)/.test(contextText)) {
    return "economy";
  }

  if (/(vær|storm|vind|regn|snø|temperatur)/.test(contextText)) {
    return "weather";
  }

  if (category === "sport") {
    return "sport";
  }

  if (category === "entertainment") {
    return "culture";
  }

  return "default";
}

function toTagLabel(rawLabel: string | null, markerVariant: MarkerVariant): string {
  const trimmed = rawLabel?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : TAG_LABELS[markerVariant];
}

function toSeedMarkerVariant(type: MainTopicEventType): MarkerVariant {
  switch (type) {
    case "bombing":
    case "conflict":
    case "hormuz":
      return "conflict";
    case "ceasefire":
      return "politics";
    case "death":
      return "crime";
    default:
      return "default";
  }
}

function toSeedZoom(type: MainTopicEventType): number {
  if (type === "hormuz") {
    return 7;
  }

  if (type === "bombing") {
    return 6;
  }

  return 6;
}

function resolvePreviewImage(entry: StoryFeedEntry, map: FeedMapEntry) {
  const requestedId = map.presentation?.preview_image_id;

  if (requestedId) {
    const match = entry.item.images_v2.find((image) => image.id === requestedId);

    if (match) {
      return match;
    }
  }

  return entry.item.images_v2[0];
}

function toMapPoint(entry: StoryFeedEntry, map: FeedMapEntry, mapIndex: number): MapPoint | null {
  if (!hasCoordinates(map.location)) {
    return null;
  }

  const { item } = entry;
  const frontSummary = item.components.front_summary;
  const rawTagKey = map.presentation?.tag?.key ?? frontSummary?.tag ?? null;
  const contextText = `${item.title} ${frontSummary?.tag ?? ""}`.toLowerCase();
  const markerVariant = toMarkerVariant(rawTagKey ?? "", item.category, contextText);
  const tagLabel = toTagLabel(map.presentation?.tag?.label ?? frontSummary?.tag ?? null, markerVariant);
  const previewImage = resolvePreviewImage(entry, map);
  const normalizedGroupIds = [
    ...(Array.isArray(item.story_group_ids) ? item.story_group_ids : []),
    item.story_group_id,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const storyGroupIds = [...new Set(normalizedGroupIds)];

  return {
    id: toPointId(item.id, map, mapIndex),
    storyId: item.id,
    openStoryId: item.id,
    storyGroupId: storyGroupIds[0] ?? null,
    storyGroupIds,
    storyTags: Array.isArray(item.story_tags) ? item.story_tags : [],
    articleId: item.articles[0]?.id ?? null,
    title: frontSummary?.title ?? item.title,
    storyTitle: item.title,
    category: item.category,
    tag: tagLabel,
    tagKey: markerVariant,
    markerVariant,
    lat: map.location.lat,
    lon: map.location.lon,
    country: map.address?.country ?? null,
    city: map.address?.city ?? null,
    municipality: map.address?.municipality ?? null,
    zoom: typeof map.zoom === "number" ? map.zoom : null,
    imageUrl: previewImage?.url ?? null,
    imageCaption: previewImage?.caption || null,
  };
}

function toSeedMapPoint(event: MainTopicCoordinateEvent): MapPoint {
  const markerVariant = toSeedMarkerVariant(event.type);
  const syntheticStoryId = `seed:${event.id}`;

  return {
    id: syntheticStoryId,
    storyId: syntheticStoryId,
    openStoryId: null,
    storyGroupId: null,
    storyGroupIds: [],
    storyTags: ["seed-event", "midtosten"],
    articleId: null,
    title: event.description?.trim() || event.headline,
    storyTitle: event.headline,
    category: "news",
    tag: event.tagLabel,
    tagKey: markerVariant,
    markerVariant,
    lat: event.lat,
    lon: event.lon,
    country: event.country,
    city: event.city,
    municipality: event.municipality,
    zoom: toSeedZoom(event.type),
    imageUrl: null,
    imageCaption: null,
  };
}

export async function loadMapPoints(): Promise<MapPoint[]> {
  const [feed, seedEvents] = await Promise.all([loadFeed(), buildSeedEvents()]);
  const points: MapPoint[] = [];
  const seen = new Set<string>();

  for (const entry of feed) {
    if (entry.type !== "story") {
      continue;
    }

    for (const [mapIndex, map] of entry.item.maps.entries()) {
      const point = toMapPoint(entry, map, mapIndex);

      if (!point) {
        continue;
      }

      const deduplicationKey = toDeduplicationKey(entry.item.id, point);

      if (seen.has(deduplicationKey)) {
        continue;
      }

      seen.add(deduplicationKey);
      points.push(point);
    }
  }

  points.push(...seedEvents.map(toSeedMapPoint));

  points.sort((left, right) => {
    const countryComparison = (left.country ?? "").localeCompare(right.country ?? "", "nb");

    if (countryComparison !== 0) {
      return countryComparison;
    }

    return left.title.localeCompare(right.title, "nb");
  });

  return points;
}

// TODO: Extend this layer with boundary lookups and country drilldown sources when
// we are ready to add shape data. Frontend should continue consuming normalized points.
