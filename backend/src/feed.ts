import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type FeedItemType =
  | "story"
  | "newsVideo"
  | "advertisement"
  | "feedback"
  | "recruiting";

export type StoryCategory =
  | "news"
  | "sport"
  | "consumer"
  | "economy"
  | "entertainment"
  | "default";

export type StoryType = "small" | "default" | "big";

export type FeedImage = {
  id: string;
  url: string;
  width: number;
  height: number;
  caption: string;
  byline: string;
};

export type FrontSummary = {
  title: string;
  tag: string;
  summary: string;
};

export type StorySummary = {
  bullet_points: string[];
};

export type GeneratedStoryComponents = {
  front_summary: FrontSummary | null;
  summary?: StorySummary | null;
};

export type SimpleArticle = {
  id: string;
  newsroom: string;
  title: string;
  published: string;
  updated: string;
  category: StoryCategory;
};

export type FeedMapLocation = {
  lat: number;
  lon: number;
};

export type FeedMapBounds = {
  sw: FeedMapLocation;
  ne: FeedMapLocation;
};

export type FeedMapAddress = {
  road: string | null;
  suburb: string | null;
  city: string | null;
  municipality: string | null;
  postcode: string | null;
  county: string | null;
  country: string | null;
};

export type FeedMapPresentationTag = {
  key: string;
  label: string | null;
  icon: string | null;
  color: string | null;
};

export type FeedMapPresentation = {
  tag: FeedMapPresentationTag | null;
  preview_image_id?: string | null;
};

export type FeedMapEntry = {
  type: "map";
  zoom: number;
  location: FeedMapLocation;
  bounds: FeedMapBounds | null;
  address: FeedMapAddress | null;
  presentation?: FeedMapPresentation | null;
  enrichment_id: string | null;
};

export type StoryWithArticles = {
  id: string;
  title: string;
  category: StoryCategory;
  story_group_id?: string | null;
  story_group_ids?: string[];
  story_tags?: string[];
  story_type?: StoryType | null;
  images: unknown[];
  images_v2: FeedImage[];
  videos: unknown[];
  maps: FeedMapEntry[];
  components: GeneratedStoryComponents;
  articles: SimpleArticle[];
};

export type StoryFeedEntry = {
  type: "story";
  item: StoryWithArticles;
};

export type UnsupportedFeedEntry = {
  type: Exclude<FeedItemType, "story">;
  item: unknown;
};

export type FeedItem = StoryFeedEntry | UnsupportedFeedEntry;

const feedFilePath = resolve(dirname(fileURLToPath(import.meta.url)), "../data/feed.json");

export async function loadFeed(): Promise<FeedItem[]> {
  const fileContents = await readFile(feedFilePath, "utf8");
  return JSON.parse(fileContents) as FeedItem[];
}
