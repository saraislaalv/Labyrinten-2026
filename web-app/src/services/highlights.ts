export async function getHighlightStoryIds(): Promise<string[]> {
  const response = await fetch("/api/highlights");

  if (!response.ok) {
    throw new Error(`Highlights request failed: ${response.status}`);
  }

  return (await response.json()) as string[];
}
