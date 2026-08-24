# VG X Labyrinten Web App

Minimal Vite `react-ts` starter for the VG X competition app.

Current scope:
- Single-page app only.
- Dummy async feed service.
- Feed item union with case switching.
- Story items only for now.
- Fullscreen vertical snap feed.
- One image with a card layered on top.
- Markdown summary rendering on the card.

Deliberately left out:
- Login
- Real backend calls
- Video
- Ads
- Pagination / load more
- Detail page

## Run

```bash
npm install
npm run dev
```

The app expects the backend to run on `http://localhost:3001`.

## Structure

- `src/services/feed.ts`: Dummy backend-shaped feed response
- `src/services/feed.ts`: Frontend API client for `/api/feed`
- `src/types/feed.ts`: Minimal types aligned with the current web feed shape
- `src/components/Feed.tsx`: Feed list and item switching
- `src/components/StoryFeedItem.tsx`: Fullscreen story slide

## Notes

The project uses plain CSS instead of Tailwind to keep setup and boilerplate as small as possible for students.
