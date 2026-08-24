import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { loadFeed } from "./feed.js";
import { loadHighlightStoryIds } from "./highlight.js";
import { loadMapPoints } from "./mapPoints.js";
import { loadMainTopicById, loadMainTopics, loadMainTopicsMap, loadMidtostenMainTopic } from "./mainTopics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/feed", async (_request, response) => {
  try {
    const feed = await loadFeed();
    response.json(feed);
  } catch (error) {
    console.error("Failed to load feed.json", error);
    response.status(500).json({ error: "Failed to load feed" });
  }
});

app.get("/api/map-points", async (_request, response) => {
  try {
    const points = await loadMapPoints();
    response.json(points);
  } catch (error) {
    console.error("Failed to load map points from feed.json", error);
    response.status(500).json({ error: "Failed to load map points" });
  }
});

app.get("/api/highlights", async (_request, response) => {
  try {
    const storyIds = await loadHighlightStoryIds();
    response.json(storyIds);
  } catch (error) {
    console.error("Failed to load highlight.json", error);
    response.status(500).json({ error: "Failed to load highlights" });
  }
});

app.get("/api/main-topics", async (_request, response) => {
  try {
    const topics = await loadMainTopics();
    response.json(topics);
  } catch (error) {
    console.error("Failed to load main topics", error);
    response.status(500).json({ error: "Failed to load main topics" });
  }
});

app.get("/api/main-topics-map", async (_request, response) => {
  try {
    const topics = await loadMainTopicsMap();
    response.json(topics);
  } catch (error) {
    console.error("Failed to load main topics map", error);
    response.status(500).json({ error: "Failed to load main topics map" });
  }
});

app.get("/api/hovedtema", async (_request, response) => {
  try {
    const topics = await loadMainTopics();
    response.json(topics);
  } catch (error) {
    console.error("Failed to load hovedtema", error);
    response.status(500).json({ error: "Failed to load hovedtema" });
  }
});

app.get("/api/hovedtema/midtosten", async (_request, response) => {
  try {
    const topic = await loadMidtostenMainTopic();
    response.json(topic);
  } catch (error) {
    console.error("Failed to load midtosten hovedtema", error);
    response.status(500).json({ error: "Failed to load midtosten hovedtema" });
  }
});

app.get("/api/hovedtema/:topicId", async (request, response) => {
  try {
    const topicId = request.params.topicId;
    const topic = await loadMainTopicById(topicId);

    if (!topic) {
      response.status(404).json({ error: "Hovedtema not found" });
      return;
    }

    response.json(topic);
  } catch (error) {
    console.error("Failed to load hovedtema by id", error);
    response.status(500).json({ error: "Failed to load hovedtema by id" });
  }
});

// Serve frontend static files
const frontendPath = path.resolve(__dirname, "../../web-app/dist");
app.use(express.static(frontendPath));

// Fallback to index.html for SPA routing
app.use((_request, response) => {
  response.sendFile(path.join(frontendPath, "index.html"));
});

app.listen(port, () => {
  console.log(`VG X Labyrinten backend running on http://localhost:${port}`);
});
