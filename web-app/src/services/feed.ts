import type { FeedItem } from "../types/feed";

export async function getFeed(): Promise<FeedItem[]> {
  const response = await fetch("/api/feed");

  if (!response.ok) {
    throw new Error(`Feed request failed: ${response.status}`);
  }

  return (await response.json()) as FeedItem[];
}
