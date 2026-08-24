import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { MainTopic, MainTopicCoordinateEvent, MainTopicEventType, MainTopicStoryPoint } from "../types/mainTopics";
import { TopicMapFilter, useTopicVariantFilter } from "./topicFilter/TopicMapFilter";
import { TOPIC_VARIANT_COLOR, resolveVariantFromCategory } from "./topicFilter/topicVariants";
import "leaflet/dist/leaflet.css";
import "./MidtostenTopicPage.css";

type MidtostenTopicPageMode = "landing" | "timeline" | "live";

type MidtostenTopicPageProps = {
  topic: MainTopic;
  mode: MidtostenTopicPageMode;
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

function getEventTypeLabel(type: MainTopicEventType): string {
  if (type === "bombing") return "Bombing";
  if (type === "death") return "Dodsfall";
  if (type === "conflict") return "Konflikt";
  if (type === "hormuz") return "Hormuz";
  if (type === "ceasefire") return "Vaapenhvile";
  return "Annet";
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

function toPinSize(zoom: number, type: MainTopicEventType): number {
  const base =
    zoom <= 2
      ? 12
      : zoom <= 3
        ? 14
        : zoom <= 4
          ? 16
          : zoom <= 5
            ? 18
            : zoom <= 6
              ? 20
              : 22;

  if (type === "bombing") {
    return Math.max(11, base - 2);
  }

  return base;
}

function toEventPinIcon(type: MainTopicEventType, isActive: boolean, zoom: number): L.DivIcon {
  const palette: Record<MainTopicEventType, string> = {
    bombing: "#ff6b57",
    death: "#c774ff",
    conflict: "#ff9f43",
    hormuz: "#54c8ff",
    ceasefire: "#8be18b",
    other: "#a2a6ff",
  };

  const color = palette[type];
  const size = toPinSize(zoom, type) + (isActive ? 2 : 0);
  const anchor = Math.round(size / 2);

  if (type === "bombing") {
    return L.divIcon({
      className: "",
      iconSize: [size, size],
      iconAnchor: [anchor, anchor],
      html: `
        <span class="midtosten-pin-emoji ${isActive ? "midtosten-pin-emoji--active" : ""}" style="--emoji-size:${size}px" aria-hidden="true">&#128163;</span>
      `,
    });
  }

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
    html: `
      <span class="midtosten-pin ${isActive ? "midtosten-pin--active" : ""}" style="--pin-color:${color}" aria-hidden="true"></span>
    `,
  });
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
    html: `<span class="midtosten-story-pin ${isActive ? "midtosten-story-pin--active" : ""}" style="--story-pin-size:${size}px;--story-pin-color:${color}" aria-hidden="true"></span>`,
  });
}

function MidtostenMapController({
  topic,
  activeEvent,
}: {
  topic: MainTopic;
  activeEvent: MainTopicCoordinateEvent | null;
}) {
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
        padding: [20, 20],
      },
    );
  }, [map, topic.region.bounds.ne.lat, topic.region.bounds.ne.lon, topic.region.bounds.sw.lat, topic.region.bounds.sw.lon]);

  useEffect(() => {
    if (!activeEvent) {
      return;
    }

    map.flyTo([activeEvent.lat, activeEvent.lon], Math.max(map.getZoom(), 5), {
      animate: true,
      duration: 0.8,
    });
  }, [activeEvent, map]);

  return null;
}

function MidtostenZoomExitController({
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

function MidtostenZoomTracker({
  onZoomChange,
}: {
  onZoomChange: (zoom: number) => void;
}) {
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

function toLandingEvents(topic: MainTopic): MainTopicCoordinateEvent[] {
  const feedTimelineNewest = [...topic.timelineEvents]
    .filter((event) => event.source === "feed")
    .reverse()
    .slice(0, 8);
  const seedEvents = topic.timelineEvents.filter((event) => event.source === "seed");
  const byId = new Map<string, MainTopicCoordinateEvent>();

  for (const event of [...topic.liveEvents, ...feedTimelineNewest, ...seedEvents]) {
    if (!byId.has(event.id)) {
      byId.set(event.id, event);
    }
  }

  return [...byId.values()];
}

function toModeEvents(topic: MainTopic, mode: MidtostenTopicPageMode): MainTopicCoordinateEvent[] {
  if (mode === "timeline") {
    return topic.timelineEvents;
  }

  if (mode === "live") {
    return topic.liveEvents;
  }

  return toLandingEvents(topic);
}

export function MidtostenTopicPage({ topic, mode, onExitToMainTopics, onOpenStory }: MidtostenTopicPageProps) {
  const events = useMemo(() => toModeEvents(topic, mode), [mode, topic]);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [currentZoom, setCurrentZoom] = useState(5);
  const [activeStoryPointId, setActiveStoryPointId] = useState<string | null>(null);
  const { activeVariants, toggleVariant } = useTopicVariantFilter();

  const activeEvent = useMemo(
    () => events.find((event) => event.id === activeEventId) ?? events[0] ?? null,
    [activeEventId, events],
  );

  const visibleRelevantStories = useMemo(() => {
    const zoomVisible = topic.relevantStories.filter((story) => currentZoom >= story.visibleFromZoom);

    if (activeVariants.size === 0) {
      return zoomVisible;
    }

    return zoomVisible.filter((story) => activeVariants.has(resolveVariantFromCategory(story.category)));
  }, [activeVariants, currentZoom, topic.relevantStories]);

  return (
    <section className="midtosten-topic" aria-label="Midtosten main topic">
      <div className="midtosten-topic__map-layer">
        <MapContainer
          className="midtosten-topic__map"
          center={[topic.region.center.lat, topic.region.center.lon]}
          zoom={5}
          minZoom={1}
          zoomControl
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MidtostenMapController topic={topic} activeEvent={activeEvent} />
          <MidtostenZoomExitController
            exitZoomThreshold={topic.region.exitZoomThreshold}
            onExit={onExitToMainTopics}
          />
          <MidtostenZoomTracker onZoomChange={setCurrentZoom} />

          {events.map((event) => (
            <Marker
              key={event.id}
              position={[event.lat, event.lon]}
              icon={toEventPinIcon(event.type, event.id === activeEventId, currentZoom)}
              eventHandlers={{
                click: () => {
                  setActiveEventId(event.id);
                },
              }}
            >
              <Popup>
                <article className="midtosten-popup">
                  <p className="midtosten-popup__type">{getEventTypeLabel(event.type)}</p>
                  <h3 className="midtosten-popup__title">{event.headline}</h3>
                  {event.description ? <p className="midtosten-popup__description">{event.description}</p> : null}
                  <p className="midtosten-popup__meta">
                    {event.country ?? "Ukjent sted"} - {formatDate(event.publishedAt)} - {event.isMock ? "mock/seed" : "feed"}
                  </p>
                </article>
              </Popup>
            </Marker>
          ))}

          {visibleRelevantStories.map((storyPoint) => (
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
                <article className="midtosten-popup">
                  <p className="midtosten-popup__type">Relevant nyhetssak</p>
                  <h3 className="midtosten-popup__title">{storyPoint.title}</h3>
                  <p className="midtosten-popup__meta">
                    {getStoryLocationLabel(storyPoint)} - {formatDate(storyPoint.publishedAt)}
                  </p>
                  <button
                    type="button"
                    className="midtosten-popup__open-story"
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

      <header className="midtosten-topic__headline">
        <p className="midtosten-topic__eyebrow">Main Topic</p>
        <h1 className="midtosten-topic__title">Midtosten</h1>
      </header>

      <TopicMapFilter activeVariants={activeVariants} onToggleVariant={toggleVariant} />
    </section>
  );
}
