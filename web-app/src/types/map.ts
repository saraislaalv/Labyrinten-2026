import type { StoryCategory } from "./feed";

export interface MapPoint {
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
  markerVariant:
  | "conflict"
  | "weather"
  | "sport"
  | "culture"
  | "politics"
  | "crime"
  | "economy"
  | "default";
  lat: number;
  lon: number;
  country: string | null;
  city: string | null;
  municipality: string | null;
  zoom: number | null;
  imageUrl: string | null;
  imageCaption: string | null;
}
