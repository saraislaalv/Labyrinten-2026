import type { MainTopic, MainTopicMapSummary } from "../types/mainTopics";

const TOPICS_REQUEST_TIMEOUT_MS = 10_000;

async function fetchJsonWithTimeout<T>(url: string, requestLabel: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, TOPICS_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`${requestLabel} request failed: ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`${requestLabel} request timed out after ${TOPICS_REQUEST_TIMEOUT_MS}ms`);
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function getMainTopics(): Promise<MainTopic[]> {
  return fetchJsonWithTimeout<MainTopic[]>("/api/main-topics", "Main topics");
}

export async function getMainTopicsMap(): Promise<MainTopicMapSummary[]> {
  return fetchJsonWithTimeout<MainTopicMapSummary[]>("/api/main-topics-map", "Main topics map");
}

export async function getMidtostenMainTopic(): Promise<MainTopic> {
  return fetchJsonWithTimeout<MainTopic>("/api/hovedtema/midtosten", "Midtosten main topic");
}

export async function getMainTopic(topicId: string): Promise<MainTopic> {
  return fetchJsonWithTimeout<MainTopic>(
    `/api/hovedtema/${encodeURIComponent(topicId)}`,
    `Main topic (${topicId})`,
  );
}
