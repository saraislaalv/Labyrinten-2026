import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LatLngExpression } from "leaflet";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { FeedItem } from "../types/feed";
import type { MapPoint } from "../types/map";
import { MapExplorer } from "./MapExplorer";
import { StoryFeedItem } from "./StoryFeedItem";
import { VideoFeedItem } from "./VideoFeedItem";
import { createMarkerIcon } from "./map/markerIcon";

type FeedProps = {
  items: FeedItem[];
  introMapPoints: MapPoint[];
  introHighlightStoryIds: string[];
  selectedStoryId: string | null;
  onStorySelect: (storyId: string) => void;
  onSwipeToMap: (storyId: string | null) => void;
  onActiveStoryChange?: (storyId: string | null) => void;
  onSelectedStoryReached: () => void;
};

const DEFAULT_CENTER: LatLngExpression = [30, 25];
const DEFAULT_ZOOM = 2;
const MIN_ZOOM = 2;
const MAX_WORLD_BOUNDS = L.latLngBounds(
  [-85.0511, -180],
  [85.0511, 180],
);

function getPlaceLabel(point: MapPoint): string {
  return point.city ?? point.municipality ?? point.country ?? "Ukjent sted";
}

function FeedMapPreviewViewportController({ points }: { points: MapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    if (points.length === 1) {
      const [point] = points;
      const contextualZoom = point.zoom ? Math.max(Math.min(point.zoom - 4, 3), 2) : 2;
      map.setView([point.lat, point.lon], contextualZoom, {
        animate: false,
      });
      return;
    }

    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lon] as [number, number]));
    map.fitBounds(bounds.pad(0.32), {
      animate: false,
    });
  }, [map, points]);

  return null;
}

function FeedMapPreview({
  storyTitle,
  points,
}: {
  storyTitle: string;
  points: MapPoint[];
}) {
  const primaryPoint = points[0] ?? null;
  const summaryLabel = primaryPoint
    ? points.length > 1
      ? `${getPlaceLabel(primaryPoint)} og ${points.length - 1} steder til`
      : getPlaceLabel(primaryPoint)
    : "Ingen posisjon registrert for denne saken";

  return (
    <div className="feed-map-preview" aria-live="polite">
      <div className="feed-map-preview__backdrop" />
      <div className="feed-map-preview__card">
        <p className="feed-map-preview__eyebrow">Hold inne for kart</p>
        <h3 className="feed-map-preview__title">{storyTitle}</h3>
        <p className="feed-map-preview__meta">{summaryLabel}</p>

        {points.length > 0 ? (
          <div className="feed-map-preview__map-shell">
            <MapContainer
              center={DEFAULT_CENTER}
              zoom={DEFAULT_ZOOM}
              minZoom={MIN_ZOOM}
              maxBounds={MAX_WORLD_BOUNDS}
              maxBoundsViscosity={1}
              scrollWheelZoom={false}
              dragging={false}
              doubleClickZoom={false}
              boxZoom={false}
              keyboard={false}
              zoomControl={false}
              attributionControl={false}
              className="feed-map-preview__map"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FeedMapPreviewViewportController points={points} />
              {points.map((point) => (
                <Marker
                  key={point.id}
                  icon={createMarkerIcon(point.markerVariant, true, 1)}
                  position={[point.lat, point.lon]}
                />
              ))}
            </MapContainer>
          </div>
        ) : (
          <div className="feed-map-preview__empty">Fant ingen koordinater for denne saken.</div>
        )}

        <p className="feed-map-preview__hint">Slipp for å lukke kartet</p>
      </div>
    </div>
  );
}

export function Feed({
  items,
  introMapPoints,
  introHighlightStoryIds,
  selectedStoryId,
  onStorySelect,
  onSwipeToMap,
  onActiveStoryChange,
  onSelectedStoryReached,
}: FeedProps) {
  const feedRef = useRef<HTMLDivElement | null>(null);
  const [previewStoryId, setPreviewStoryId] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!selectedStoryId) {
      return;
    }

    const feedElement = feedRef.current;
    const targetElement = feedElement
      ? Array.from(feedElement.querySelectorAll<HTMLElement>("[data-feed-item-id]")).find(
          (element) => element.dataset.feedItemId === selectedStoryId,
        ) ?? null
      : null;

    if (!targetElement) {
      onSelectedStoryReached();
      return;
    }

    feedElement?.scrollTo({
      top: targetElement.offsetTop,
      behavior: "auto",
    });

    requestAnimationFrame(() => onSelectedStoryReached());
  }, [onSelectedStoryReached, selectedStoryId]);

  useEffect(() => {
    const feedElement = feedRef.current;

    if (!feedElement || !onActiveStoryChange) {
      return;
    }

    const updateActiveStory = () => {
      const feedItems = Array.from(feedElement.querySelectorAll<HTMLElement>("[data-feed-item]"));

      if (feedItems.length === 0) {
        onActiveStoryChange(null);
        return;
      }

      const viewportCenter = feedElement.scrollTop + feedElement.clientHeight / 2;
      let closestItem: HTMLElement | null = null;
      let closestDistance = Number.POSITIVE_INFINITY;

      for (const item of feedItems) {
        const itemCenter = item.offsetTop + item.offsetHeight / 2;
        const distance = Math.abs(itemCenter - viewportCenter);

        if (distance < closestDistance) {
          closestItem = item;
          closestDistance = distance;
        }
      }

      onActiveStoryChange(closestItem?.dataset.feedItemId ?? null);
    };

    updateActiveStory();
    feedElement.addEventListener("scroll", updateActiveStory, { passive: true });
    window.addEventListener("resize", updateActiveStory);

    return () => {
      feedElement.removeEventListener("scroll", updateActiveStory);
      window.removeEventListener("resize", updateActiveStory);
    };
  }, [onActiveStoryChange]);

  const previewStory = useMemo(() => {
    if (!previewStoryId) {
      return null;
    }

    return items.find((entry) => entry.type === "story" && entry.item.id === previewStoryId) ?? null;
  }, [items, previewStoryId]);

  const previewPoints = useMemo(() => {
    if (!previewStoryId) {
      return [] as MapPoint[];
    }

    return introMapPoints.filter((point) => point.storyId === previewStoryId);
  }, [introMapPoints, previewStoryId]);

  return (
    <div className="feed-shell">
      <div ref={feedRef} className="feed" aria-label="VG X feed">
        <section className="feed-item feed-item--map-intro" data-feed-item>
          <MapExplorer
            points={introMapPoints}
            onStorySelect={onStorySelect}
            autoplayStoryIds={introHighlightStoryIds}
            autoplayIntervalMs={3000}
          />
          <div className="feed-map-intro-swipe-hint" aria-hidden="true">
            <span>Sveip nedover</span>
            <span className="feed-map-intro-swipe-hint__finger">👇</span>
          </div>
        </section>

        {items.map((entry) => {
          switch (entry.type) {
            case "story":
              return (
                <StoryFeedItem
                  key={entry.item.id}
                  story={entry.item}
                  isSelected={entry.item.id === selectedStoryId}
                  onHoldPreviewStart={() => setPreviewStoryId(entry.item.id)}
                  onHoldPreviewEnd={() => setPreviewStoryId((current) => (current === entry.item.id ? null : current))}
                  onSwipeToMap={() => onSwipeToMap(entry.item.id)}
                />
              );

            case "newsVideo":
              return <VideoFeedItem key={entry.item.id} video={entry.item} />;

            default:
              return null;
          }
        })}
      </div>

      {previewStory?.type === "story" ? (
        <FeedMapPreview
          storyTitle={previewStory.item.components.front_summary?.title ?? previewStory.item.title}
          points={previewPoints}
        />
      ) : null}
    </div>
  );
}
