# Kartfeed: neste steg

Denne første kartversjonen er bevisst pragmatisk: frontend rendrer direkte fra et normalisert `map-points`-API, og bruker dagens `feed.json` som kilde. For å få en bedre mobilopplevelse med tydelige pins, riktig ikonbruk og mer presis kartstorytelling bør feed-kontrakten strammes opp.

## Dagens midlertidige antagelser

- Kartpunkter hentes fra `story.item.maps[*]`.
- `title` i kartet faller tilbake til `components.front_summary.title`, ellers `item.title`.
- `tag` faller tilbake til `components.front_summary.tag`.
- Preview-bilde hentes fra `images_v2[0]`.
- Markerfarge/ikon utledes foreløpig heuristisk av `tag` og `category`.

Dette fungerer for en første iterasjon, men er ikke en robust kontrakt.

## Hva feeden bør levere

Per kartpunkt bør feeden på sikt levere et tydelig, lite objekt som frontend kan bruke direkte:

```json
{
  "id": "point-1",
  "story_id": "story-123",
  "title": "Kort tittel for kartet",
  "tag": {
    "key": "conflict",
    "label": "Konflikt",
    "icon": "burst",
    "color": "#ff4f4f"
  },
  "location": {
    "lat": 59.91,
    "lon": 10.75
  },
  "place": {
    "country": "Norge",
    "city": "Oslo",
    "municipality": "Oslo"
  },
  "preview": {
    "image_url": "https://...",
    "image_alt": "Kort bildetekst"
  }
}
```

## Konkret: hva må endres og hvor

### 1. `backend/data/feed.json`

Legg inn eksplisitte karttags på story- eller punktnivå.

```json
"maps": [
  {
    "type": "map",
    "location": { "lat": 59.91, "lon": 10.75 },
    "address": { "country": "Norge" },
    "presentation": {
      "tag": {
        "key": "crime",
        "label": "Politi",
        "icon": "alert",
        "color": "#ff7d4d"
      },
      "preview_image_id": "92417620-cbd4-3c18-803f-796a468f7875"
    }
  }
]
```

Poenget er at kartpunktet selv bør vite hvordan det skal presenteres, i stedet for at frontend gjetter.

### 2. `backend/src/feed.ts`

Utvid typene for `maps` slik at `presentation` og eventuelle preview-felt er del av TypeScript-kontrakten.

### 3. `backend/src/mapPoints.ts`

Bytt ut dagens heuristikk med direkte mapping fra feedfelt:

- `tagKey`
- `tagLabel`
- `markerVariant` eller eksplisitt `icon`/`color`
- `imageUrl`
- `imageAlt`

Dette er stedet der rå feed skal normaliseres til et stabilt frontend-format.

### 4. `web-app/src/types/map.ts`

Hold frontend-typen liten og stabil. Hvis backend normaliserer riktig, bør frontend slippe å kjenne til rå feedstruktur.

### 5. `web-app/src/components/MapExplorer.tsx`

Frontend bør kun gjøre presentasjon:

- rendring av kart
- valg av aktiv pin
- visning av bilde/tittel/tag
- enkel filtrering på land

Ikke legg mer feedtolkning her.

## Anbefalt tag-sett for første ordentlige versjon

Hold dette lite i starten:

- `conflict`
- `alert`
- `weather`
- `sport`
- `culture`
- `politics`
- `crime`
- `economy`
- `default`

Da kan pins få både fast ikonografi og faste farger uten at UI-et blir uforutsigbart.

## Hvorfor dette er viktig

Målet er en mobil kartopplevelse der brukeren raskt skjønner:

- hva som skjer
- hvor det skjer
- hvor alvorlig eller hvilken type sak det er

Det krever at feeden leverer kartspesifikk presentasjon eksplisitt, ikke bare generell storydata.
