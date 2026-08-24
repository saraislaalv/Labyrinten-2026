# Main Topics API Contract (v1)

This document describes the skeleton contract for the main-topic map experience.

## Endpoints

- `GET /api/hovedtema/midtosten`
- `GET /api/main-topics`
- `GET /api/main-topics-map`

## Main Topic Shape

`MainTopic` includes:

- `id`, `key`, `label`, `recap`
- `region`
  - `type: "region"`
  - `center`
  - `bounds`
  - `exitZoomThreshold`
- `timelineEvents` (all events, chronological)
- `liveEvents` (last 72 hours, newest first)
- `coordinates` (compat view over event coordinates)
- `news.new` and `news.old`
- `metadata` including `majorEventCount`

## Event Types

Supported `type` values:

- `bombing`
- `death`
- `conflict`
- `hormuz`
- `ceasefire`
- `other`

Each event also carries:

- `source: "feed" | "seed"`
- `isMock: boolean`

## Seed Strategy

v1 is feed-first. A small fact-based `seed` list is merged in to keep key historical events visible even when they are not present in the feed at runtime.

Seed file location:

- `backend/data/midtosten-seed-events.json`

Seed events are always marked with:

- `source: "seed"`
- `isMock: true`

The seed file may include demo scenarios (for prototype storytelling). These should include a clear note in `note`.
