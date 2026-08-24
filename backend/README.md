# VG X Labyrinten Backend

Minimal TypeScript REST API for the starter feed.

## Run

```bash
npm install
npm run dev
```

Default URL: `http://localhost:3001`

## Endpoints

- `GET /api/health`
- `GET /api/feed`
- `GET /api/map-points`
- `GET /api/highlights`
- `GET /api/main-topics`
- `GET /api/main-topics-map`
- `GET /api/hovedtema`
- `GET /api/hovedtema/midtosten`

The feed currently returns the same two dummy story items as the frontend starter used before the backend was introduced.

## Data source

The feed response is loaded from `data/feed.json`.
