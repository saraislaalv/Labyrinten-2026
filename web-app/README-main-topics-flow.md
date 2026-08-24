# Main Topics Frontend Flow (v1)

This README documents the route skeleton and ownership for the Midtosten map universe.

## Routes

- `/main-topics`
  - Overordnet kart for storskala nyheter (main topics map).
- `/midtosten`
  - Landing page for Midtosten with recap, map, and levende hendelser.
- `/midtosten/hva-har-skjedd`
  - Timeline page over historical events.
- `/midtosten/dette-skjer-na`
  - Live page with events from the last 72 hours.

## Exit Rule

On Midtosten routes, zooming out below `region.exitZoomThreshold` triggers navigation back to `/main-topics`.

## Component Responsibilities

- `MainTopicsMapPage`
  - Render overordnet map as main surface with overlay controls.
- `MidtostenTopicPage`
  - Render landing/timeline/live views as map-first overlays.
  - Keep events, recap, and controls on top of the map.
- `App.tsx`
  - Path-based routing, top-level navigation, and data loading orchestration.

## Data Sources

- `GET /api/main-topics-map` for overordnet map cards.
- `GET /api/hovedtema/midtosten` for full Midtosten page payload.
