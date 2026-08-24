import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFeed } from "./feed.js";
import type {
  FeedMapAddress,
  FeedMapBounds,
  FeedMapEntry,
  FeedMapLocation,
  StoryCategory,
  StoryFeedEntry,
  StoryWithArticles,
} from "./feed.js";

const LIVE_WINDOW_MS = 72 * 60 * 60 * 1000;
const NEW_STORY_LIMIT = 5;
const DEFAULT_EXIT_ZOOM_THRESHOLD = 3.1;
const DEFAULT_STORY_VISIBLE_ZOOM = 5.2;
const seedEventsFilePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../data/midtosten-seed-events.json",
);

const MIDTOSTEN_RECAP =
  "Krigen i Midtosten handler om eskalering mellom Iran, Israel og USA, med stor regional risiko. " +
  "Konflikten paavirker sivile, energimarkedet og skipsfart gjennom Hormuzstredet, samtidig som " +
  "forsok pa vaapenhvile og de-eskalering er skjore.";

const MIDDLE_EAST_GROUP_HINTS = ["middle-east", "iran-us-war", "israel-iran", "hormuz"];
const MIDDLE_EAST_TEXT_HINT =
  /\b(midtosten|middle east|hormuz|iran|israel|gaza|libanon|syria|yemen|persiabukta|rodehavet|hizbollah|hamas)\b/;
const MAJOR_EVENT_TYPES = new Set<MainTopicEventType>(["bombing", "death", "conflict", "hormuz"]);

const COUNTRY_TEXT_HINTS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Iran", pattern: /\biran\b/ },
  { label: "Israel", pattern: /\bisrael\b/ },
  { label: "USA", pattern: /\b(usa|usas|united states|amerika)\b/ },
  { label: "Libanon", pattern: /\blibanon\b/ },
  { label: "Oman", pattern: /\boman\b/ },
  { label: "Palestina", pattern: /\b(palestina|gaza)\b/ },
  { label: "Syria", pattern: /\bsyria\b/ },
  { label: "Jemen", pattern: /\byemen\b/ },
  { label: "Qatar", pattern: /\bqatar\b/ },
  { label: "Saudi-Arabia", pattern: /\bsaudi[- ]arabia\b/ },
  {
    label: "De forente arabiske emirater",
    pattern: /\b(de forente arabiske emirater|emiratene|uae)\b/,
  },
  { label: "Jordan", pattern: /\bjordan\b/ },
  { label: "Egypt", pattern: /\begypt\b/ },
  { label: "Norge", pattern: /\b(norge|norway)\b/ },
  { label: "Ukraina", pattern: /\b(ukraina|ukraine)\b/ },
  { label: "Sudan", pattern: /\bsudan\b/ },
  { label: "Sverige", pattern: /\b(sverige|sweden)\b/ },
  { label: "Tyskland", pattern: /\b(tyskland|germany)\b/ },
  { label: "Romania", pattern: /\bromania\b/ },
];

type TopicDefinition = {
  id: string;
  key: string;
  label: string;
  recap: string;
  region: MainTopicRegion;
  autoOpenZoom: number;
  countryAliases: string[];
  groupHints?: string[];
  textHints?: string[];
  includeWithoutStories?: boolean;
};

type ResolvedTopicDefinition = TopicDefinition & {
  normalizedAliases: Set<string>;
  normalizedGroupHints: string[];
  normalizedTextHints: string[];
};

type SeedEventDefinition = {
  id: string;
  type: MainTopicEventType;
  headline: string;
  description: string;
  publishedAt: string;
  location: FeedMapLocation;
  address: FeedMapAddress;
  tagKey: string | null;
  tagLabel: string | null;
  sourceUrls?: string[];
  note?: string | null;
};

type StoryContext = {
  story: StoryWithArticles;
  latestPublishedMs: number;
  latestPublishedIso: string | null;
  latestUpdatedIso: string | null;
};

const BASE_TOPIC_DEFINITIONS: TopicDefinition[] = [
  {
    id: "midtosten",
    key: "middle-east",
    label: "Midtosten",
    recap: MIDTOSTEN_RECAP,
    region: {
      type: "region",
      center: { lat: 27.5, lon: 45.5 },
      bounds: {
        sw: { lat: 8, lon: 20 },
        ne: { lat: 44, lon: 70 },
      },
      exitZoomThreshold: DEFAULT_EXIT_ZOOM_THRESHOLD,
    },
    autoOpenZoom: 4.6,
    countryAliases: [
      "Iran",
      "Israel",
      "Libanon",
      "Oman",
      "Palestina",
      "Syria",
      "Jemen",
      "Qatar",
      "Saudi-Arabia",
      "De forente arabiske emirater",
      "Jordan",
      "Egypt",
      "Irak",
    ],
    groupHints: MIDDLE_EAST_GROUP_HINTS,
    textHints: ["midtosten", "hormuz", "iran", "israel", "gaza", "libanon", "syria", "yemen"],
    includeWithoutStories: true,
  },
  {
    id: "norge",
    key: "norway-major-news",
    label: "Norge",
    recap: "Nyhetsbildet i Norge med hendelser fra hele landet.",
    region: {
      type: "region",
      center: { lat: 64.7, lon: 13.5 },
      bounds: {
        sw: { lat: 57, lon: 4 },
        ne: { lat: 71.5, lon: 31 },
      },
      exitZoomThreshold: DEFAULT_EXIT_ZOOM_THRESHOLD,
    },
    autoOpenZoom: 5.2,
    countryAliases: ["Norge", "Norway"],
    textHints: ["norge", "norway", "oslo", "stavanger", "bergen", "trondheim", "tromso"],
    includeWithoutStories: true,
  },
  {
    id: "ukraina",
    key: "ukraine-war",
    label: "Ukraina",
    recap: "Nyhetsbildet fra Ukraina og naboland i regionen.",
    region: {
      type: "region",
      center: { lat: 49, lon: 32 },
      bounds: {
        sw: { lat: 44, lon: 22 },
        ne: { lat: 53, lon: 41 },
      },
      exitZoomThreshold: DEFAULT_EXIT_ZOOM_THRESHOLD,
    },
    autoOpenZoom: 4.8,
    countryAliases: ["Ukraina", "Ukraine"],
    textHints: ["ukraina", "ukraine", "kyiv", "kharkiv", "donbas"],
    includeWithoutStories: true,
  },
  {
    id: "usa",
    key: "usa-major-news",
    label: "USA",
    recap: "Store nyheter fra USA med global betydning.",
    region: {
      type: "region",
      center: { lat: 39, lon: -98 },
      bounds: {
        sw: { lat: 24, lon: -125 },
        ne: { lat: 49, lon: -66 },
      },
      exitZoomThreshold: DEFAULT_EXIT_ZOOM_THRESHOLD,
    },
    autoOpenZoom: 4.2,
    countryAliases: ["USA", "United States", "United States of America", "US"],
    textHints: ["usa", "united states", "washington", "new york", "los angeles"],
    includeWithoutStories: true,
  },
  {
    id: "sudan",
    key: "sudan-war",
    label: "Sudan",
    recap: "Utviklingen i Sudan med fokus pa konflikt og humanitaer situasjon.",
    region: {
      type: "region",
      center: { lat: 15.5, lon: 30 },
      bounds: {
        sw: { lat: 8, lon: 21 },
        ne: { lat: 23, lon: 38 },
      },
      exitZoomThreshold: DEFAULT_EXIT_ZOOM_THRESHOLD,
    },
    autoOpenZoom: 4.9,
    countryAliases: ["Sudan"],
    textHints: ["sudan", "khartoum", "darfur"],
    includeWithoutStories: true,
  },
];

export type MainTopicEventType = "bombing" | "death" | "conflict" | "hormuz" | "ceasefire" | "other";

export type MainTopicEventSource = "feed" | "seed";

export type MainTopicRegion = {
  type: "region";
  center: FeedMapLocation;
  bounds: FeedMapBounds;
  exitZoomThreshold: number;
};

export type MainTopicNewsItem = {
  storyId: string;
  title: string;
  frontTitle: string | null;
  category: StoryCategory;
  latestPublished: string | null;
  latestUpdated: string | null;
  storyGroupIds: string[];
  articleIds: string[];
  articleTitles: string[];
  mapPointCount: number;
};

export type MainTopicCoordinateEvent = {
  id: string;
  type: MainTopicEventType;
  eventType: MainTopicEventType;
  source: MainTopicEventSource;
  isMock: boolean;
  sourceUrls: string[];
  note: string | null;
  storyId: string | null;
  storyTitle: string;
  headline: string;
  description: string | null;
  publishedAt: string | null;
  lat: number;
  lon: number;
  country: string | null;
  city: string | null;
  municipality: string | null;
  tagKey: string | null;
  tagLabel: string | null;
  isBombing: boolean;
  isHormuzStrait: boolean;
};

export type MainTopicStoryPoint = {
  id: string;
  storyId: string;
  storyTitle: string;
  title: string;
  category: StoryCategory;
  lat: number;
  lon: number;
  country: string | null;
  city: string | null;
  municipality: string | null;
  publishedAt: string | null;
  mapZoom: number | null;
  visibleFromZoom: number;
};

export type MainTopic = {
  id: string;
  key: string;
  label: string;
  recap: string;
  region: MainTopicRegion;
  autoOpenZoom: number;
  hormuzStraitOpen: boolean;
  hormuzStatusSourceStoryId: string | null;
  hormuzStatusSourcePublishedAt: string | null;
  involvedCountries: string[];
  metadata: {
    storyCount: number;
    coordinateEventCount: number;
    bombingEventCount: number;
    hormuzEventCount: number;
    majorEventCount: number;
    newestStoryPublishedAt: string | null;
    oldestStoryPublishedAt: string | null;
    relevantStoryCount: number;
  };
  coordinates: MainTopicCoordinateEvent[];
  timelineEvents: MainTopicCoordinateEvent[];
  liveEvents: MainTopicCoordinateEvent[];
  relevantStories: MainTopicStoryPoint[];
  news: {
    new: MainTopicNewsItem[];
    old: MainTopicNewsItem[];
  };
};

export type MainTopicMapSummary = {
  id: string;
  key: string;
  label: string;
  region: MainTopicRegion;
  autoOpenZoom: number;
  majorEventCount: number;
  lastUpdated: string | null;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeCountryName(value: string | null | undefined): string {
  return normalizeText(value).replace(/\s+/g, " ");
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toSlug(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function asStoryEntries(feed: Awaited<ReturnType<typeof loadFeed>>): StoryFeedEntry[] {
  return feed.filter((entry): entry is StoryFeedEntry => entry.type === "story");
}

function getStoryGroupIds(story: StoryWithArticles): string[] {
  const values = [
    ...(Array.isArray(story.story_group_ids) ? story.story_group_ids : []),
    story.story_group_id ?? undefined,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return [...new Set(values)];
}

function getStoryTextBlob(story: StoryWithArticles): string {
  const summaryBullets = story.components.summary?.bullet_points ?? [];
  const articleTitles = story.articles.map((article) => article.title);
  const storyTags = Array.isArray(story.story_tags) ? story.story_tags : [];

  return normalizeText(
    [
      story.title,
      story.components.front_summary?.title,
      story.components.front_summary?.summary,
      ...summaryBullets,
      ...articleTitles,
      ...storyTags,
    ]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" "),
  );
}

function isMiddleEastStory(story: StoryWithArticles): boolean {
  const groupIds = getStoryGroupIds(story).map((id) => normalizeText(id));

  if (groupIds.some((id) => MIDDLE_EAST_GROUP_HINTS.some((hint) => id.includes(hint)))) {
    return true;
  }

  return MIDDLE_EAST_TEXT_HINT.test(getStoryTextBlob(story));
}

function parseDateMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toSortedAscByDate(events: MainTopicCoordinateEvent[]): MainTopicCoordinateEvent[] {
  return [...events].sort((left, right) => {
    const leftMs = parseDateMs(left.publishedAt) ?? 0;
    const rightMs = parseDateMs(right.publishedAt) ?? 0;
    return leftMs - rightMs;
  });
}

function toSortedDescByDate(events: MainTopicCoordinateEvent[]): MainTopicCoordinateEvent[] {
  return [...events].sort((left, right) => {
    const leftMs = parseDateMs(left.publishedAt) ?? 0;
    const rightMs = parseDateMs(right.publishedAt) ?? 0;
    return rightMs - leftMs;
  });
}

function toSortedDescStoryPoints(stories: MainTopicStoryPoint[]): MainTopicStoryPoint[] {
  return [...stories].sort((left, right) => {
    const leftMs = parseDateMs(left.publishedAt) ?? 0;
    const rightMs = parseDateMs(right.publishedAt) ?? 0;

    if (leftMs !== rightMs) {
      return rightMs - leftMs;
    }

    return left.title.localeCompare(right.title, "nb");
  });
}

function getLatestStoryDates(story: StoryWithArticles): {
  latestPublishedMs: number;
  latestPublishedIso: string | null;
  latestUpdatedIso: string | null;
} {
  let latestPublishedMs = 0;
  let latestPublishedIso: string | null = null;
  let latestUpdatedIso: string | null = null;

  for (const article of story.articles) {
    const publishedMs = parseDateMs(article.published);
    if (publishedMs === null) {
      continue;
    }

    if (publishedMs >= latestPublishedMs) {
      latestPublishedMs = publishedMs;
      latestPublishedIso = article.published;
      latestUpdatedIso = article.updated ?? null;
    }
  }

  return { latestPublishedMs, latestPublishedIso, latestUpdatedIso };
}

function toStoryContexts(feed: Awaited<ReturnType<typeof loadFeed>>): StoryContext[] {
  const stories = asStoryEntries(feed).map((entry) => entry.item);

  return stories
    .map((story) => {
      const latest = getLatestStoryDates(story);
      return {
        story,
        latestPublishedMs: latest.latestPublishedMs,
        latestPublishedIso: latest.latestPublishedIso,
        latestUpdatedIso: latest.latestUpdatedIso,
      };
    })
    .sort((left, right) => right.latestPublishedMs - left.latestPublishedMs);
}

function hasCoordinates(map: FeedMapEntry): map is FeedMapEntry & { location: { lat: number; lon: number } } {
  return (
    typeof map.location?.lat === "number" &&
    Number.isFinite(map.location.lat) &&
    typeof map.location?.lon === "number" &&
    Number.isFinite(map.location.lon)
  );
}

function isLocationInBounds(location: FeedMapLocation, bounds: FeedMapBounds): boolean {
  return (
    location.lat >= bounds.sw.lat &&
    location.lat <= bounds.ne.lat &&
    location.lon >= bounds.sw.lon &&
    location.lon <= bounds.ne.lon
  );
}

function inferEventType(rawText: string): MainTopicEventType {
  const text = normalizeText(rawText);

  if (/\bhormuz\b/.test(text)) {
    return "hormuz";
  }

  if (/\b(dod|dodsfall|drept|omkom|killed|death)\b/.test(text)) {
    return "death";
  }

  if (/\b(bomb|bombing|luftangrep|angrep|missil|rakett|drone|strike)\b/.test(text)) {
    return "bombing";
  }

  if (/\b(vapenhvile|ceasefire)\b/.test(text)) {
    return "ceasefire";
  }

  if (/\b(krig|konflikt|frontlinje|eskalering)\b/.test(text)) {
    return "conflict";
  }

  return "other";
}

function createEvent({
  id,
  type,
  source,
  isMock,
  sourceUrls,
  note,
  storyId,
  storyTitle,
  headline,
  description,
  publishedAt,
  lat,
  lon,
  country,
  city,
  municipality,
  tagKey,
  tagLabel,
}: {
  id: string;
  type: MainTopicEventType;
  source: MainTopicEventSource;
  isMock: boolean;
  sourceUrls?: string[];
  note?: string | null;
  storyId: string | null;
  storyTitle: string;
  headline: string;
  description: string | null;
  publishedAt: string | null;
  lat: number;
  lon: number;
  country: string | null;
  city: string | null;
  municipality: string | null;
  tagKey: string | null;
  tagLabel: string | null;
}): MainTopicCoordinateEvent {
  return {
    id,
    type,
    eventType: type,
    source,
    isMock,
    sourceUrls: sourceUrls ?? [],
    note: note ?? null,
    storyId,
    storyTitle,
    headline,
    description,
    publishedAt,
    lat,
    lon,
    country,
    city,
    municipality,
    tagKey,
    tagLabel,
    isBombing: type === "bombing",
    isHormuzStrait: type === "hormuz" || /\bhormuz\b/.test(normalizeText(headline)),
  };
}

function mapCountryMatchesTopic(map: FeedMapEntry, definition: ResolvedTopicDefinition): boolean {
  const normalizedMapCountry = normalizeCountryName(map.address?.country ?? null);
  return normalizedMapCountry.length > 0 && definition.normalizedAliases.has(normalizedMapCountry);
}

function mapBelongsToTopic(map: FeedMapEntry, definition: ResolvedTopicDefinition): boolean {
  if (!hasCoordinates(map)) {
    return false;
  }

  if (mapCountryMatchesTopic(map, definition)) {
    return true;
  }

  return isLocationInBounds(map.location, definition.region.bounds);
}

function includesAnyHint(text: string, hints: string[]): boolean {
  return hints.some((hint) => hint.length > 0 && text.includes(hint));
}

function storyBelongsToTopic(context: StoryContext, definition: ResolvedTopicDefinition): boolean {
  const { story } = context;

  if (definition.id === "midtosten" && isMiddleEastStory(story)) {
    return true;
  }

  const groupIds = getStoryGroupIds(story).map((value) => normalizeText(value));

  if (includesAnyHint(groupIds.join(" "), definition.normalizedGroupHints)) {
    return true;
  }

  const storyText = getStoryTextBlob(story);

  if (includesAnyHint(storyText, definition.normalizedTextHints)) {
    return true;
  }

  if (includesAnyHint(storyText, [...definition.normalizedAliases])) {
    return true;
  }

  return story.maps.some((map) => mapBelongsToTopic(map, definition));
}

function buildFeedEvents(
  contexts: StoryContext[],
  mapFilter: (map: FeedMapEntry, context: StoryContext) => boolean,
): MainTopicCoordinateEvent[] {
  const events: MainTopicCoordinateEvent[] = [];
  const seen = new Set<string>();

  for (const context of contexts) {
    const { story } = context;
    const frontTitle = story.components.front_summary?.title ?? story.title;
    const frontSummary = story.components.front_summary?.summary ?? null;
    const storyTextBlob = getStoryTextBlob(story);

    for (const [mapIndex, map] of story.maps.entries()) {
      if (!hasCoordinates(map) || !mapFilter(map, context)) {
        continue;
      }

      const tagKey = map.presentation?.tag?.key ?? null;
      const tagLabel = map.presentation?.tag?.label ?? null;
      const textForEventType = `${frontTitle} ${story.title} ${storyTextBlob} ${tagKey ?? ""} ${tagLabel ?? ""}`;
      const eventType = inferEventType(textForEventType);
      const eventId = map.enrichment_id ? `${story.id}:${map.enrichment_id}` : `${story.id}:${mapIndex}`;
      const dedupeKey = `${story.id}:${map.location.lat.toFixed(6)}:${map.location.lon.toFixed(6)}:${tagKey ?? ""}`;

      if (seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);

      events.push(
        createEvent({
          id: eventId,
          type: eventType,
          source: "feed",
          isMock: false,
          sourceUrls: [],
          note: null,
          storyId: story.id,
          storyTitle: story.title,
          headline: frontTitle,
          description: frontSummary,
          publishedAt: context.latestPublishedIso,
          lat: map.location.lat,
          lon: map.location.lon,
          country: map.address?.country ?? null,
          city: map.address?.city ?? null,
          municipality: map.address?.municipality ?? null,
          tagKey,
          tagLabel,
        }),
      );
    }
  }

  return events;
}

function buildRelevantStoryPoints(
  contexts: StoryContext[],
  definition: ResolvedTopicDefinition,
): MainTopicStoryPoint[] {
  const points: MainTopicStoryPoint[] = [];
  const seen = new Set<string>();

  for (const context of contexts) {
    const { story } = context;
    const frontTitle = story.components.front_summary?.title ?? story.title;

    for (const [mapIndex, map] of story.maps.entries()) {
      if (!hasCoordinates(map) || !mapBelongsToTopic(map, definition)) {
        continue;
      }

      const pointId = map.enrichment_id
        ? `${story.id}:${map.enrichment_id}:story`
        : `${story.id}:${mapIndex}:story`;
      const dedupeKey = `${story.id}:${map.location.lat.toFixed(6)}:${map.location.lon.toFixed(6)}`;

      if (seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);

      const sourceZoom = typeof map.zoom === "number" && Number.isFinite(map.zoom)
        ? map.zoom
        : DEFAULT_STORY_VISIBLE_ZOOM;

      points.push({
        id: pointId,
        storyId: story.id,
        storyTitle: story.title,
        title: frontTitle,
        category: story.category,
        lat: map.location.lat,
        lon: map.location.lon,
        country: map.address?.country ?? null,
        city: map.address?.city ?? null,
        municipality: map.address?.municipality ?? null,
        publishedAt: context.latestPublishedIso,
        mapZoom: typeof map.zoom === "number" ? map.zoom : null,
        visibleFromZoom: clampNumber(sourceZoom - 2, 2, 10),
      });
    }
  }

  return toSortedDescStoryPoints(points);
}

function isEventType(value: unknown): value is MainTopicEventType {
  return (
    value === "bombing" ||
    value === "death" ||
    value === "conflict" ||
    value === "hormuz" ||
    value === "ceasefire" ||
    value === "other"
  );
}

function isSeedEventDefinition(value: unknown): value is SeedEventDefinition {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SeedEventDefinition>;

  return (
    typeof candidate.id === "string" &&
    isEventType(candidate.type) &&
    typeof candidate.headline === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.publishedAt === "string" &&
    typeof candidate.location?.lat === "number" &&
    Number.isFinite(candidate.location.lat) &&
    typeof candidate.location?.lon === "number" &&
    Number.isFinite(candidate.location.lon) &&
    typeof candidate.address === "object" &&
    candidate.address !== null
  );
}

async function loadSeedEventDefinitions(): Promise<SeedEventDefinition[]> {
  try {
    const fileContents = await readFile(seedEventsFilePath, "utf8");
    const parsed = JSON.parse(fileContents) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isSeedEventDefinition);
  } catch (error) {
    console.error("Failed to load midtosten seed events", error);
    return [];
  }
}

export async function buildSeedEvents(): Promise<MainTopicCoordinateEvent[]> {
  const seedEvents = await loadSeedEventDefinitions();

  return seedEvents.map((event) =>
    createEvent({
      id: event.id,
      type: event.type,
      source: "seed",
      isMock: true,
      sourceUrls: event.sourceUrls ?? [],
      note: event.note ?? null,
      storyId: null,
      storyTitle: "Historisk hendelse",
      headline: event.headline,
      description: event.description,
      publishedAt: event.publishedAt,
      lat: event.location.lat,
      lon: event.location.lon,
      country: event.address.country,
      city: event.address.city,
      municipality: event.address.municipality,
      tagKey: event.tagKey,
      tagLabel: event.tagLabel,
    }),
  );
}

function mergeEvents(
  feedEvents: MainTopicCoordinateEvent[],
  seedEvents: MainTopicCoordinateEvent[],
): MainTopicCoordinateEvent[] {
  const merged = new Map<string, MainTopicCoordinateEvent>();

  for (const event of [...seedEvents, ...feedEvents]) {
    if (!merged.has(event.id)) {
      merged.set(event.id, event);
    }
  }

  return [...merged.values()];
}

function inferHormuzStraitStatus(contexts: StoryContext[]): {
  open: boolean;
  sourceStoryId: string | null;
  sourcePublishedAt: string | null;
} {
  for (const context of contexts) {
    const text = getStoryTextBlob(context.story);

    if (!/\bhormuz\b/.test(text)) {
      continue;
    }

    const hasOpenSignal = /\b(er|forblir|fortsatt|holdes)\s+apent\b|\b(gjenapnet|apnet)\b/.test(text);
    const hasClosedSignal =
      /\b(er|forblir|fortsatt|holdes)\s+stengt\b|\b(stengt|lukket|blokkert|stenging)\b/.test(text);

    if (hasOpenSignal && !hasClosedSignal) {
      return {
        open: true,
        sourceStoryId: context.story.id,
        sourcePublishedAt: context.latestPublishedIso,
      };
    }

    if (hasClosedSignal && !hasOpenSignal) {
      return {
        open: false,
        sourceStoryId: context.story.id,
        sourcePublishedAt: context.latestPublishedIso,
      };
    }

    if (hasOpenSignal && hasClosedSignal) {
      const explicitlyOpenNow = /\b(er|forblir|fortsatt)\s+apent\b/.test(text);
      return {
        open: explicitlyOpenNow,
        sourceStoryId: context.story.id,
        sourcePublishedAt: context.latestPublishedIso,
      };
    }
  }

  return {
    open: false,
    sourceStoryId: null,
    sourcePublishedAt: null,
  };
}

function inferInvolvedCountries(
  contexts: StoryContext[],
  events: MainTopicCoordinateEvent[],
  relevantStories: MainTopicStoryPoint[],
): string[] {
  const countries = new Set<string>();

  for (const event of events) {
    if (event.country && event.country.trim().length > 0) {
      countries.add(event.country.trim());
    }
  }

  for (const storyPoint of relevantStories) {
    if (storyPoint.country && storyPoint.country.trim().length > 0) {
      countries.add(storyPoint.country.trim());
    }
  }

  for (const context of contexts) {
    const text = getStoryTextBlob(context.story);

    for (const hint of COUNTRY_TEXT_HINTS) {
      if (hint.pattern.test(text)) {
        countries.add(hint.label);
      }
    }
  }

  return [...countries].sort((left, right) => left.localeCompare(right, "nb"));
}

function toNewsItem(context: StoryContext): MainTopicNewsItem {
  const { story } = context;

  return {
    storyId: story.id,
    title: story.title,
    frontTitle: story.components.front_summary?.title ?? null,
    category: story.category,
    latestPublished: context.latestPublishedIso,
    latestUpdated: context.latestUpdatedIso,
    storyGroupIds: getStoryGroupIds(story),
    articleIds: story.articles.map((article) => article.id),
    articleTitles: story.articles.map((article) => article.title),
    mapPointCount: story.maps.length,
  };
}

function splitNewsByRecency(newsItems: MainTopicNewsItem[]): { new: MainTopicNewsItem[]; old: MainTopicNewsItem[] } {
  return {
    new: newsItems.slice(0, NEW_STORY_LIMIT),
    old: newsItems.slice(NEW_STORY_LIMIT),
  };
}

function resolveLiveEvents(events: MainTopicCoordinateEvent[]): MainTopicCoordinateEvent[] {
  const cutoffMs = Date.now() - LIVE_WINDOW_MS;

  return toSortedDescByDate(
    events.filter((event) => {
      const publishedMs = parseDateMs(event.publishedAt);
      return publishedMs !== null && publishedMs >= cutoffMs;
    }),
  );
}

function resolveLastUpdated(topic: MainTopic): string | null {
  const newestStory = parseDateMs(topic.metadata.newestStoryPublishedAt) ?? 0;
  const newestEvent = Math.max(
    ...topic.timelineEvents.map((event) => parseDateMs(event.publishedAt) ?? 0),
    0,
  );
  const newestRelevantStory = Math.max(
    ...topic.relevantStories.map((story) => parseDateMs(story.publishedAt) ?? 0),
    0,
  );

  const resolved = Math.max(newestStory, newestEvent, newestRelevantStory);
  return resolved > 0 ? new Date(resolved).toISOString() : null;
}

function toResolvedDefinition(definition: TopicDefinition): ResolvedTopicDefinition {
  return {
    ...definition,
    normalizedAliases: new Set(definition.countryAliases.map((value) => normalizeCountryName(value)).filter((value) => value.length > 0)),
    normalizedGroupHints: (definition.groupHints ?? []).map((value) => normalizeText(value)).filter((value) => value.length > 0),
    normalizedTextHints: (definition.textHints ?? []).map((value) => normalizeText(value)).filter((value) => value.length > 0),
  };
}

function toBoundsFromLocations(locations: FeedMapLocation[]): FeedMapBounds {
  const latitudes = locations.map((location) => location.lat);
  const longitudes = locations.map((location) => location.lon);

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);

  const latSpan = Math.max(0.3, maxLat - minLat);
  const lonSpan = Math.max(0.3, maxLon - minLon);
  const latPadding = Math.max(0.6, latSpan * 0.55);
  const lonPadding = Math.max(0.6, lonSpan * 0.55);

  return {
    sw: {
      lat: clampNumber(minLat - latPadding, -85, 85),
      lon: clampNumber(minLon - lonPadding, -180, 180),
    },
    ne: {
      lat: clampNumber(maxLat + latPadding, -85, 85),
      lon: clampNumber(maxLon + lonPadding, -180, 180),
    },
  };
}

function toCenterFromBounds(bounds: FeedMapBounds): FeedMapLocation {
  return {
    lat: (bounds.sw.lat + bounds.ne.lat) / 2,
    lon: (bounds.sw.lon + bounds.ne.lon) / 2,
  };
}

function toAutoOpenZoomFromBounds(bounds: FeedMapBounds): number {
  const latSpan = Math.max(0.2, bounds.ne.lat - bounds.sw.lat);
  const lonSpan = Math.max(0.2, bounds.ne.lon - bounds.sw.lon);
  const largestSpan = Math.max(latSpan, lonSpan);

  if (largestSpan <= 1) {
    return 6.5;
  }

  if (largestSpan <= 3) {
    return 6.0;
  }

  if (largestSpan <= 7) {
    return 5.4;
  }

  if (largestSpan <= 14) {
    return 4.9;
  }

  if (largestSpan <= 26) {
    return 4.5;
  }

  return 4.2;
}

function createDynamicCountryDefinitions(
  contexts: StoryContext[],
  baseDefinitions: TopicDefinition[],
): TopicDefinition[] {
  const coveredAliases = new Set(
    baseDefinitions
      .flatMap((definition) => definition.countryAliases)
      .map((alias) => normalizeCountryName(alias))
      .filter((alias) => alias.length > 0),
  );

  const countryBuckets = new Map<string, { label: string; locations: FeedMapLocation[] }>();

  for (const context of contexts) {
    for (const map of context.story.maps) {
      if (!hasCoordinates(map)) {
        continue;
      }

      const country = map.address?.country?.trim();
      const normalizedCountry = normalizeCountryName(country);

      if (!country || normalizedCountry.length === 0 || coveredAliases.has(normalizedCountry)) {
        continue;
      }

      const bucket = countryBuckets.get(normalizedCountry);

      if (bucket) {
        bucket.locations.push(map.location);
        continue;
      }

      countryBuckets.set(normalizedCountry, {
        label: country,
        locations: [map.location],
      });
    }
  }

  const usedIds = new Set(baseDefinitions.map((definition) => definition.id));
  const dynamicDefinitions: TopicDefinition[] = [];

  for (const [, bucket] of [...countryBuckets.entries()].sort((left, right) => left[1].label.localeCompare(right[1].label, "nb"))) {
    const bounds = toBoundsFromLocations(bucket.locations);
    const center = toCenterFromBounds(bounds);
    const baseSlug = toSlug(bucket.label);

    if (!baseSlug) {
      continue;
    }

    let id = baseSlug;
    let suffix = 2;

    while (usedIds.has(id)) {
      id = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    usedIds.add(id);

    dynamicDefinitions.push({
      id,
      key: `${id}-major-news`,
      label: bucket.label,
      recap: `Relevante nyhetssaker fra ${bucket.label} i den globale feeden.`,
      region: {
        type: "region",
        center,
        bounds,
        exitZoomThreshold: DEFAULT_EXIT_ZOOM_THRESHOLD,
      },
      autoOpenZoom: toAutoOpenZoomFromBounds(bounds),
      countryAliases: [bucket.label],
      textHints: [bucket.label],
      includeWithoutStories: false,
    });
  }

  return dynamicDefinitions;
}

function buildMainTopicFromDefinition({
  definition,
  allContexts,
  seedEvents,
}: {
  definition: ResolvedTopicDefinition;
  allContexts: StoryContext[];
  seedEvents: MainTopicCoordinateEvent[];
}): MainTopic {
  const contexts = allContexts.filter((context) => storyBelongsToTopic(context, definition));
  const feedEvents = buildFeedEvents(contexts, (map) => mapBelongsToTopic(map, definition));
  const mergedEvents = definition.id === "midtosten" ? mergeEvents(feedEvents, seedEvents) : feedEvents;
  const timelineEvents = toSortedAscByDate(mergedEvents);
  const liveEvents = resolveLiveEvents(mergedEvents);
  const coordinates = toSortedDescByDate(mergedEvents);
  const relevantStories = buildRelevantStoryPoints(contexts, definition);
  const newsItems = contexts.map(toNewsItem);
  const newsByRecency = splitNewsByRecency(newsItems);
  const hormuzStatus =
    definition.id === "midtosten"
      ? inferHormuzStraitStatus(contexts)
      : {
          open: false,
          sourceStoryId: null,
          sourcePublishedAt: null,
        };

  const involvedCountries = inferInvolvedCountries(contexts, mergedEvents, relevantStories);
  const newestStory = contexts[0];
  const oldestStory = contexts[contexts.length - 1];
  const majorEventCount = mergedEvents.filter((event) => MAJOR_EVENT_TYPES.has(event.type)).length;
  const resolvedMajorEventCount = Math.max(majorEventCount, relevantStories.length);

  return {
    id: definition.id,
    key: definition.key,
    label: definition.label,
    recap: definition.recap,
    region: definition.region,
    autoOpenZoom: definition.autoOpenZoom,
    hormuzStraitOpen: hormuzStatus.open,
    hormuzStatusSourceStoryId: hormuzStatus.sourceStoryId,
    hormuzStatusSourcePublishedAt: hormuzStatus.sourcePublishedAt,
    involvedCountries,
    metadata: {
      storyCount: contexts.length,
      coordinateEventCount: coordinates.length,
      bombingEventCount: mergedEvents.filter((event) => event.type === "bombing").length,
      hormuzEventCount: mergedEvents.filter((event) => event.type === "hormuz").length,
      majorEventCount: resolvedMajorEventCount,
      newestStoryPublishedAt: newestStory?.latestPublishedIso ?? null,
      oldestStoryPublishedAt: oldestStory?.latestPublishedIso ?? null,
      relevantStoryCount: relevantStories.length,
    },
    coordinates,
    timelineEvents,
    liveEvents,
    relevantStories,
    news: newsByRecency,
  };
}

async function buildAllTopics(): Promise<MainTopic[]> {
  const feed = await loadFeed();
  const contexts = toStoryContexts(feed);
  const dynamicDefinitions = createDynamicCountryDefinitions(contexts, BASE_TOPIC_DEFINITIONS);
  const definitions = [...BASE_TOPIC_DEFINITIONS, ...dynamicDefinitions].map(toResolvedDefinition);
  const seedEvents = await buildSeedEvents();

  const topics = definitions
    .map((definition) =>
      buildMainTopicFromDefinition({
        definition,
        allContexts: contexts,
        seedEvents,
      }),
    )
    .filter((topic) => {
      const baseDefinition = BASE_TOPIC_DEFINITIONS.find((definition) => definition.id === topic.id);

      if (!baseDefinition) {
        return topic.metadata.storyCount > 0 || topic.relevantStories.length > 0;
      }

      return (
        baseDefinition.includeWithoutStories === true ||
        topic.metadata.storyCount > 0 ||
        topic.relevantStories.length > 0
      );
    });

  return topics;
}

export async function loadMainTopics(): Promise<MainTopic[]> {
  return buildAllTopics();
}

export async function loadMainTopicById(topicId: string): Promise<MainTopic | null> {
  const normalizedTopicId = normalizeText(topicId);
  const topics = await loadMainTopics();

  return topics.find((topic) => normalizeText(topic.id) === normalizedTopicId) ?? null;
}

export async function loadMidtostenMainTopic(): Promise<MainTopic> {
  const topic = await loadMainTopicById("midtosten");

  if (!topic) {
    throw new Error("Midtosten main topic is not available");
  }

  return topic;
}

export async function loadMainTopicsMap(): Promise<MainTopicMapSummary[]> {
  const topics = await loadMainTopics();

  return topics.map((topic) => ({
    id: topic.id,
    key: topic.key,
    label: topic.label,
    region: topic.region,
    autoOpenZoom: topic.autoOpenZoom,
    majorEventCount: topic.metadata.majorEventCount,
    lastUpdated: resolveLastUpdated(topic),
  }));
}
