import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { MainTopic, MainTopicStoryPoint } from "../types/mainTopics";
import { useTopicVariantFilter } from "./topicFilter/TopicMapFilter";
import { TOPIC_VARIANT_COLOR, resolveVariantFromCategory } from "./topicFilter/topicVariants";
import "leaflet/dist/leaflet.css";
import "./GenericMainTopicPage.css";

type GenericMainTopicPageProps = {
  topic: MainTopic;
  onExitToMainTopics: () => void;
  onOpenStory: (storyId: string) => void;
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
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function getStoryLocationLabel(story: MainTopicStoryPoint): string {
  if (story.city && story.country && story.city !== story.country) {
    return `${story.city}, ${story.country}`;
  }

  if (story.city) {
    return story.city;
  }

  if (story.municipality && story.country && story.municipality !== story.country) {
    return `${story.municipality}, ${story.country}`;
  }

  if (story.municipality) {
    return story.municipality;
  }

  return story.country ?? "Ukjent sted";
}

function toStoryPinSize(zoom: number): number {
  if (zoom < 4) {
    return 10;
  }

  if (zoom < 5) {
    return 12;
  }

  if (zoom < 6) {
    return 14;
  }

  if (zoom < 7) {
    return 16;
  }

  return 18;
}

function toStoryPinIcon(category: string | null | undefined, isActive: boolean, zoom: number): L.DivIcon {
  const variant = resolveVariantFromCategory(category);
  const color = TOPIC_VARIANT_COLOR[variant] ?? TOPIC_VARIANT_COLOR.default;
  const size = toStoryPinSize(zoom) + (isActive ? 2 : 0);
  const anchor = Math.round(size / 2);

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
    html: `<span class="generic-topic-story-pin ${isActive ? "generic-topic-story-pin--active" : ""}" style="--generic-topic-story-pin-size:${size}px;--generic-topic-story-pin-color:${color}" aria-hidden="true"></span>`,
  });
}

function GenericTopicMapController({ topic }: { topic: MainTopic }) {
  const map = useMap();
  const hasInitialFitRef = useRef(false);

  useEffect(() => {
    if (hasInitialFitRef.current) {
      return;
    }

    hasInitialFitRef.current = true;
    map.fitBounds(
      [
        [topic.region.bounds.sw.lat, topic.region.bounds.sw.lon],
        [topic.region.bounds.ne.lat, topic.region.bounds.ne.lon],
      ],
      {
        animate: false,
        padding: [24, 24],
      },
    );
  }, [map, topic]);

  return null;
}

function GenericTopicZoomExitController({
  exitZoomThreshold,
  onExit,
}: {
  exitZoomThreshold: number;
  onExit: () => void;
}) {
  const hasExitedRef = useRef(false);

  useMapEvents({
    zoomend(event) {
      const currentZoom = event.target.getZoom();
      if (currentZoom < exitZoomThreshold && !hasExitedRef.current) {
        hasExitedRef.current = true;
        onExit();
      }
    },
  });

  return null;
}

function GenericTopicZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend(event) {
      onZoomChange(event.target.getZoom());
    },
  });

  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  return null;
}

export function GenericMainTopicPage({ topic, onExitToMainTopics, onOpenStory }: GenericMainTopicPageProps) {
  const [currentZoom, setCurrentZoom] = useState(4);
  const [activeStoryPointId, setActiveStoryPointId] = useState<string | null>(null);
  const { activeVariants } = useTopicVariantFilter();
  const visibleStories = useMemo(() => {
    const zoomVisible = topic.relevantStories.filter((story) => currentZoom >= story.visibleFromZoom);

    if (activeVariants.size === 0) {
      return zoomVisible;
    }

    return zoomVisible.filter((story) => activeVariants.has(resolveVariantFromCategory(story.category)));
  }, [activeVariants, currentZoom, topic.relevantStories]);

  return (
    <section className="generic-topic" aria-label={`${topic.label} main topic`}>
      <div className="generic-topic__map-layer">
        <MapContainer className="generic-topic__map" center={[topic.region.center.lat, topic.region.center.lon]} zoom={4} minZoom={1.5} zoomControl>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <GenericTopicMapController topic={topic} />
          <GenericTopicZoomExitController
            exitZoomThreshold={topic.region.exitZoomThreshold}
            onExit={onExitToMainTopics}
          />
          <GenericTopicZoomTracker onZoomChange={setCurrentZoom} />

          {visibleStories.map((storyPoint) => (
                <Marker
                  key={storyPoint.id}
                  position={[storyPoint.lat, storyPoint.lon]}
                  icon={toStoryPinIcon(storyPoint.category, storyPoint.id === activeStoryPointId, currentZoom)}
                  eventHandlers={{
                    click: () => {
                      setActiveStoryPointId(storyPoint.id);
                    },
                  }}
                >
                  <Popup>
                    <article className="generic-topic-popup">
                      <p className="generic-topic-popup__type">Relevant nyhetssak</p>
                      <h3 className="generic-topic-popup__title">{storyPoint.title}</h3>
                      <p className="generic-topic-popup__description">{getStoryLocationLabel(storyPoint)}</p>
                      <p className="generic-topic-popup__meta">{formatDate(storyPoint.publishedAt)}</p>
                      <button
                        type="button"
                        className="generic-topic-popup__open-story"
                        onClick={() => {
                          onOpenStory(storyPoint.storyId);
                        }}
                      >
                        Apne sak i feed
                      </button>
                    </article>
                  </Popup>
                </Marker>
              ))}
        </MapContainer>
      </div>

      <header className="generic-topic__headline">
        <p className="generic-topic__eyebrow">Main Topic</p>
        <h1 className="generic-topic__title">{topic.label}</h1>
        <p className="generic-topic__subtitle">Zoom under {topic.region.exitZoomThreshold.toFixed(1)} for a ga tilbake</p>
      </header>

    </section>
  );
}
