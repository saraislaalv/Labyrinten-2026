import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { MainTopicMapSummary } from "../types/mainTopics";
import type { MapPoint } from "../types/map";
import { TopicMapFilter, useTopicVariantFilter } from "./topicFilter/TopicMapFilter";
import { TOPIC_VARIANT_COLOR, resolveVariantFromCategory } from "./topicFilter/topicVariants";
import "leaflet/dist/leaflet.css";
import "./MainTopicsMapPage.css";

export type FeaturedTopicStory = {
  topicId: string;
  storyId: string;
  title: string;
  description: string | null;
  category: string | null;
  lat: number;
  lon: number;
  country: string | null;
  city: string | null;
  publishedAt: string | null;
  isMock: boolean;
};

type MainTopicsMapPageProps = {
  topics: MainTopicMapSummary[];
  storyPoints?: MapPoint[];
  featuredStories?: FeaturedTopicStory[];
  onOpenTopic: (topicId: string) => void;
  onOpenStory?: (storyId: string) => void;
};

function formatDate(value: string | null): string {
  if (!value) {
    return "Ingen dato";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Ingen dato";
  }

  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function toStoryPinSize(zoom: number): number {
  if (zoom <= 2) return 6;
  if (zoom <= 3) return 7;
  if (zoom <= 4) return 8;
  if (zoom <= 5) return 10;
  if (zoom <= 6) return 11;
  return 12;
}

function toStoryPinIcon(variant: MapPoint["markerVariant"], zoom: number): L.DivIcon {
  const color = TOPIC_VARIANT_COLOR[variant] ?? TOPIC_VARIANT_COLOR.default;
  const size = toStoryPinSize(zoom);
  const anchor = Math.round(size / 2);

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
    html: `<span class="main-topics-story-pin" style="--story-pin-color:${color};--story-pin-size:${size}px" aria-hidden="true"></span>`,
  });
}

function toFeaturedStoryPinIcon(isActive: boolean, zoom: number): L.DivIcon {
  const base = zoom <= 2 ? 22 : zoom <= 3 ? 26 : zoom <= 4 ? 28 : 30;
  const size = base + (isActive ? 2 : 0);
  const anchor = Math.round(size / 2);

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
    html: `
      <span class="main-topics-featured-pin ${isActive ? "main-topics-featured-pin--active" : ""}" style="--featured-pin-size:${size}px" aria-hidden="true">
        <span class="main-topics-featured-pin__star">&#9733;</span>
      </span>
    `,
  });
}

const TOPIC_HEADLINES: Record<string, { headline: string; shortLabel?: string }> = {
  midtosten: { headline: "Midtosten-konflikten", shortLabel: "Midtosten" },
  ukraina: { headline: "Ukraina-krigen", shortLabel: "Ukraina" },
  usa: { headline: "USA storpolitikk", shortLabel: "USA" },
  sudan: { headline: "Krigen i Sudan", shortLabel: "Sudan" },
  norge: { headline: "Norge-nyheter", shortLabel: "Norge" },
};

function getTopicHeadline(topic: MainTopicMapSummary): string {
  return TOPIC_HEADLINES[topic.id]?.headline ?? topic.label;
}

function getTopicShortLabel(topic: MainTopicMapSummary): string {
  return TOPIC_HEADLINES[topic.id]?.shortLabel ?? topic.label;
}

function getTopicColor(topicId: string): string {
  if (topicId === "midtosten") return "#ff935f";
  if (topicId === "ukraina") return "#7aa9ff";
  if (topicId === "usa") return "#f8c26f";
  if (topicId === "sudan") return "#ff8a82";
  if (topicId === "norge") return "#8fd9a1";
  return "#a9a9ff";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toTopicCenter(topic: MainTopicMapSummary): L.LatLngExpression {
  return [topic.region.center.lat, topic.region.center.lon];
}

function toFontSize(topic: MainTopicMapSummary, zoom: number, isActive: boolean): number {
  const base = 11 + Math.min(6, topic.majorEventCount * 0.25);
  const zoomBoost = zoom >= 4.4 ? 1.4 : zoom >= 3.6 ? 1 : zoom >= 2.8 ? 0.5 : 0;
  const activeBoost = isActive ? 0.8 : 0;
  return Math.round((base + zoomBoost + activeBoost) * 10) / 10;
}

function toTopicIcon({
  topic,
  isActive,
  zoom,
}: {
  topic: MainTopicMapSummary;
  isActive: boolean;
  zoom: number;
}): L.DivIcon {
  const isCompact = zoom < 3;
  const label = isCompact ? getTopicShortLabel(topic) : getTopicHeadline(topic);
  const safeLabel = escapeHtml(label);
  const fontSize = toFontSize(topic, zoom, isActive);
  const color = getTopicColor(topic.id);
  const maxWidth = isCompact ? 126 : 194;

  const estimatedWidth = Math.max(78, Math.min(maxWidth, Math.round(label.length * (fontSize * 0.58) + 32)));
  const height = Math.round(fontSize + 16);

  return L.divIcon({
    className: "",
    iconSize: [estimatedWidth, height],
    iconAnchor: [Math.round(estimatedWidth / 2), Math.round(height / 2)],
    html: `
      <span
        class="main-topic-label ${isActive ? "main-topic-label--active" : ""} ${isCompact ? "main-topic-label--compact" : ""}"
        style="--topic-color:${color};--topic-font-size:${fontSize}px;--topic-max-width:${maxWidth}px"
        aria-hidden="true"
      >
        <span class="main-topic-label__dot"></span>
        <span class="main-topic-label__text">${safeLabel}</span>
      </span>
    `,
  });
}

function MainTopicsViewportController({ topics }: { topics: MainTopicMapSummary[] }) {
  const map = useMap();

  useEffect(() => {
    if (topics.length === 0) {
      map.setView([18, 14], 2);
      return;
    }

    if (topics.length === 1) {
      const topic = topics[0];
      map.fitBounds(
        [
          [topic.region.bounds.sw.lat, topic.region.bounds.sw.lon],
          [topic.region.bounds.ne.lat, topic.region.bounds.ne.lon],
        ],
        { animate: true, padding: [26, 26] },
      );
      return;
    }

    const bounds = L.latLngBounds(
      topics.map((topic) => [topic.region.center.lat, topic.region.center.lon] as [number, number]),
    );

    map.fitBounds(bounds.pad(0.35), {
      animate: true,
      padding: [24, 24],
    });
  }, [map, topics]);

  return null;
}

function getActiveTopicByViewport(map: L.Map, topics: MainTopicMapSummary[]): MainTopicMapSummary | null {
  const zoom = map.getZoom();
  const bounds = map.getBounds();
  const center = map.getCenter();

  const candidates = topics.filter((topic) => {
    if (zoom < topic.autoOpenZoom) {
      return false;
    }

    return bounds.contains(toTopicCenter(topic));
  });

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    const leftDistance = center.distanceTo(L.latLng(left.region.center.lat, left.region.center.lon));
    const rightDistance = center.distanceTo(L.latLng(right.region.center.lat, right.region.center.lon));

    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    return right.autoOpenZoom - left.autoOpenZoom;
  });

  return candidates[0] ?? null;
}

function resolveVisibleTopicIds(map: L.Map, topics: MainTopicMapSummary[]): string[] {
  const zoom = map.getZoom();
  const bounds = map.getBounds().pad(0.05);
  const minDistancePx = zoom < 2.6 ? 150 : zoom < 3.2 ? 118 : zoom < 4 ? 92 : 64;

  const sorted = [...topics].sort((left, right) => right.majorEventCount - left.majorEventCount);
  const kept: Array<{ id: string; point: L.Point }> = [];

  for (const topic of sorted) {
    const center = L.latLng(topic.region.center.lat, topic.region.center.lon);

    if (!bounds.contains(center)) {
      continue;
    }

    const point = map.latLngToContainerPoint(center);
    const tooClose = kept.some((entry) => entry.point.distanceTo(point) < minDistancePx);
    if (tooClose) {
      continue;
    }

    kept.push({ id: topic.id, point });
  }

  return kept.map((entry) => entry.id);
}

function MainTopicsAutoOpenController({
  topics,
  onCandidateChange,
  onOpenTopic,
}: {
  topics: MainTopicMapSummary[];
  onCandidateChange: (topicId: string | null) => void;
  onOpenTopic: (topicId: string) => void;
}) {
  const lastAutoOpenIdRef = useRef<string | null>(null);

  const evaluateViewport = useCallback(
    (map: L.Map) => {
      const candidate = getActiveTopicByViewport(map, topics);
      onCandidateChange(candidate?.id ?? null);

      if (!candidate) {
        lastAutoOpenIdRef.current = null;
        return;
      }

      if (lastAutoOpenIdRef.current === candidate.id) {
        return;
      }

      lastAutoOpenIdRef.current = candidate.id;
      onOpenTopic(candidate.id);
    },
    [onCandidateChange, onOpenTopic, topics],
  );

  const map = useMapEvents({
    moveend(event) {
      evaluateViewport(event.target);
    },
    zoomend(event) {
      evaluateViewport(event.target);
    },
  });

  useEffect(() => {
    evaluateViewport(map);
  }, [evaluateViewport, map]);

  return null;
}

function MainTopicsLabelDensityController({
  topics,
  onVisibleIdsChange,
}: {
  topics: MainTopicMapSummary[];
  onVisibleIdsChange: (topicIds: string[]) => void;
}) {
  const evaluateLabels = useCallback(
    (map: L.Map) => {
      onVisibleIdsChange(resolveVisibleTopicIds(map, topics));
    },
    [onVisibleIdsChange, topics],
  );

  const map = useMapEvents({
    moveend(event) {
      evaluateLabels(event.target);
    },
    zoomend(event) {
      evaluateLabels(event.target);
    },
  });

  useEffect(() => {
    evaluateLabels(map);
  }, [evaluateLabels, map]);

  return null;
}

function MainTopicsZoomController({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend() {
      onZoomChange(map.getZoom());
    },
  });

  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  return null;
}

export function MainTopicsMapPage({
  topics,
  storyPoints = [],
  featuredStories = [],
  onOpenTopic,
  onOpenStory,
}: MainTopicsMapPageProps) {
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [visibleTopicIds, setVisibleTopicIds] = useState<string[]>([]);
  const [currentZoom, setCurrentZoom] = useState<number>(2);
  const [activeFeaturedStoryId, setActiveFeaturedStoryId] = useState<string | null>(null);
  const { activeVariants, toggleVariant } = useTopicVariantFilter();

  const resolvedActiveTopicId = useMemo(() => {
    if (activeTopicId && topics.some((topic) => topic.id === activeTopicId)) {
      return activeTopicId;
    }

    return topics[0]?.id ?? null;
  }, [activeTopicId, topics]);

  const visibleTopicIdSet = useMemo(() => new Set(visibleTopicIds), [visibleTopicIds]);
  const filteredStoryPoints = useMemo(
    () =>
      activeVariants.size === 0
        ? storyPoints
        : storyPoints.filter((point) => activeVariants.has(point.markerVariant)),
    [activeVariants, storyPoints],
  );

  const filteredFeaturedStories = useMemo(() => {
    if (activeVariants.size === 0) {
      return featuredStories;
    }

    return featuredStories.filter((story) =>
      activeVariants.has(resolveVariantFromCategory(story.category)),
    );
  }, [activeVariants, featuredStories]);

  const handleCandidateChange = useCallback((topicId: string | null) => {
    setActiveTopicId(topicId);
  }, []);

  return (
    <section className="main-topics" aria-label="Overordnet kart over main topics">
      <div className="main-topics__map-layer">
        <MapContainer className="main-topics__map" center={[18, 14]} zoom={2} minZoom={2} zoomControl>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MainTopicsViewportController topics={topics} />
          <MainTopicsAutoOpenController
            topics={topics}
            onCandidateChange={handleCandidateChange}
            onOpenTopic={onOpenTopic}
          />
          <MainTopicsLabelDensityController topics={topics} onVisibleIdsChange={setVisibleTopicIds} />
          <MainTopicsZoomController onZoomChange={setCurrentZoom} />

          {filteredStoryPoints.map((point) => (
            <Marker
              key={point.id}
              position={[point.lat, point.lon]}
              icon={toStoryPinIcon(point.markerVariant, currentZoom)}
            >
              <Popup>
                <article className="main-topics-story-popup">
                  <p className="main-topics-story-popup__type">{point.tag ?? point.markerVariant}</p>
                  <h3 className="main-topics-story-popup__title">{point.title}</h3>
                  {point.city || point.country ? (
                    <p className="main-topics-story-popup__meta">
                      {[point.city, point.country].filter(Boolean).join(", ")}
                    </p>
                  ) : null}
                </article>
              </Popup>
            </Marker>
          ))}

          {topics.map((topic) => {
            const isActive = topic.id === resolvedActiveTopicId;
            const isVisible = visibleTopicIdSet.has(topic.id) || isActive;

            if (!isVisible) {
              return null;
            }

            return (
              <Marker
                key={topic.id}
                position={[topic.region.center.lat, topic.region.center.lon]}
                icon={toTopicIcon({
                  topic,
                  isActive,
                  zoom: currentZoom,
                })}
                eventHandlers={{
                  click: () => {
                    setActiveTopicId(topic.id);
                  },
                }}
              />
            );
          })}

          {filteredFeaturedStories.map((story) => {
            const isActive = story.storyId === activeFeaturedStoryId;
            return (
              <Marker
                key={`featured-${story.topicId}`}
                position={[story.lat, story.lon]}
                icon={toFeaturedStoryPinIcon(isActive, currentZoom)}
                zIndexOffset={500}
                eventHandlers={{
                  click: () => {
                    setActiveFeaturedStoryId(story.storyId);
                  },
                }}
              >
                <Popup>
                  <article className="main-topics-featured-popup">
                    <p className="main-topics-featured-popup__type">Hovednyhet</p>
                    <h3 className="main-topics-featured-popup__title">{story.title}</h3>
                    {story.description ? (
                      <p className="main-topics-featured-popup__description">{story.description}</p>
                    ) : null}
                    <p className="main-topics-featured-popup__meta">
                      {[story.city, story.country].filter(Boolean).join(", ") || "Ukjent sted"}
                      {" - "}
                      {formatDate(story.publishedAt)}
                      {story.isMock ? " - mock" : ""}
                    </p>
                    {onOpenStory ? (
                      <button
                        type="button"
                        className="main-topics-featured-popup__open-story"
                        onClick={() => {
                          onOpenStory(story.storyId);
                        }}
                      >
                        Apne sak i feed
                      </button>
                    ) : null}
                  </article>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {storyPoints.length > 0 || featuredStories.length > 0 ? (
        <TopicMapFilter activeVariants={activeVariants} onToggleVariant={toggleVariant} />
      ) : null}
    </section>
  );
}
