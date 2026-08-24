export type MainTopicEventType = "bombing" | "death" | "conflict" | "hormuz" | "ceasefire" | "other";

export type MainTopicEventSource = "feed" | "seed";

export interface MainTopicLocation {
  lat: number;
  lon: number;
}

export interface MainTopicBounds {
  sw: MainTopicLocation;
  ne: MainTopicLocation;
}

export interface MainTopicRegion {
  type: "region";
  center: MainTopicLocation;
  bounds: MainTopicBounds;
  exitZoomThreshold: number;
}

export interface MainTopicCoordinateEvent {
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
}

export interface MainTopicStoryPoint {
  id: string;
  storyId: string;
  storyTitle: string;
  title: string;
  category: string;
  lat: number;
  lon: number;
  country: string | null;
  city: string | null;
  municipality: string | null;
  publishedAt: string | null;
  mapZoom: number | null;
  visibleFromZoom: number;
}

export interface MainTopicNewsItem {
  storyId: string;
  title: string;
  frontTitle: string | null;
  category: string;
  latestPublished: string | null;
  latestUpdated: string | null;
  storyGroupIds: string[];
  articleIds: string[];
  articleTitles: string[];
  mapPointCount: number;
}

export interface MainTopic {
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
}

export interface MainTopicMapSummary {
  id: string;
  key: string;
  label: string;
  region: MainTopicRegion;
  autoOpenZoom: number;
  majorEventCount: number;
  lastUpdated: string | null;
}
