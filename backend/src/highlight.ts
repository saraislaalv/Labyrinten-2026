import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const highlightFilePath = resolve(dirname(fileURLToPath(import.meta.url)), "../data/highlight.json");

export async function loadHighlightStoryIds(): Promise<string[]> {
  const fileContents = await readFile(highlightFilePath, "utf8");
  return JSON.parse(fileContents) as string[];
}
