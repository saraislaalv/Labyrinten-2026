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

export interface FeedImage {
  id: string;
  url: string;
  width: number;
  height: number;
  caption: string;
  byline: string;
}

export interface FrontSummary {
  title: string;
  tag: string;
  summary: string;
}

export interface StorySummary {
  bullet_points: string[];
}

export interface GeneratedStoryComponents {
  front_summary: FrontSummary | null;
  summary?: StorySummary | null;
}

export interface SimpleArticle {
  id: string;
  newsroom: string;
  title: string;
  published: string;
  updated: string;
  category: StoryCategory;
}

export interface StoryWithArticles {
  id: string;
  title: string;
  category: StoryCategory;
  story_type?: StoryType | null;
  images: unknown[];
  images_v2: FeedImage[];
  videos: unknown[];
  maps: unknown[];
  components: GeneratedStoryComponents;
  articles: SimpleArticle[];
}

export interface NewsVideoItem {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
}

export type StoryFeedEntry = {
  type: "story";
  item: StoryWithArticles;
};

export type VideoFeedEntry = {
  type: "newsVideo";
  item: NewsVideoItem;
};

export type UnsupportedFeedEntry = {
  type: Exclude<FeedItemType, "story" | "newsVideo">;
  item: unknown;
};

export type FeedItem = StoryFeedEntry | VideoFeedEntry | UnsupportedFeedEntry;
