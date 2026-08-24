import { useEffect, useMemo, useRef, useState } from "react";
import type { LatLngExpression } from "leaflet";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { MapPoint } from "../types/map";
import { createMarkerIcon } from "./map/markerIcon";
import "leaflet/dist/leaflet.css";
import "./GroupMapExplorer.css";

type GroupMapExplorerProps = {
  points: MapPoint[];
};

type GroupStory = {
  storyId: string;
  title: string;
  imageUrl: string | null;
  imageCaption: string | null;
};

type GroupPin = {
  groupId: string;
  lat: number;
  lon: number;
  markerVariant: MapPoint["markerVariant"];
  tags: string[];
  stories: GroupStory[];
};

type RelatedGroup = {
  groupId: string;
  sharedTags: string[];
  score: number;
};

const DEFAULT_CENTER: LatLngExpression = [30, 25];
const DEFAULT_ZOOM = 2;
const MIN_ZOOM = 2;
const MAX_WORLD_BOUNDS = L.latLngBounds(
  [-85.0511, -180],
  [85.0511, 180],
);

function GroupViewportController({
  pins,
  activePin,
}: {
  pins: GroupPin[];
  activePin: GroupPin | null;
}) {
  const map = useMap();
  const previousPinsRef = useRef<GroupPin[]>(pins);

  useEffect(() => {
    if (activePin) {
      map.flyTo([activePin.lat, activePin.lon], 4, {
        animate: true,
        duration: 0.7,
      });
      return;
    }

    if (pins.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      previousPinsRef.current = pins;
      return;
    }

    if (pins.length === 1) {
      const [pin] = pins;
      map.setView([pin.lat, pin.lon], 4);
      previousPinsRef.current = pins;
      return;
    }

    if (previousPinsRef.current !== pins) {
      const bounds = L.latLngBounds(pins.map((pin) => [pin.lat, pin.lon] as [number, number]));
      map.fitBounds(bounds.pad(0.25), {
        animate: true,
        duration: 0.8,
      });
      previousPinsRef.current = pins;
    }
  }, [activePin, map, pins]);

  return null;
}

function toGroupPins(points: MapPoint[]): GroupPin[] {
  const grouped = new Map<string, MapPoint[]>();

  for (const point of points) {
    const groupIds = point.storyGroupIds.length > 0 ? point.storyGroupIds : point.storyGroupId ? [point.storyGroupId] : [];

    if (groupIds.length === 0) {
      continue;
    }

    for (const groupId of groupIds) {
      const current = grouped.get(groupId) ?? [];
      current.push(point);
      grouped.set(groupId, current);
    }
  }

  return [...grouped.entries()]
    .map(([groupId, groupPoints]) => {
      const markerVariant = groupPoints[0]?.markerVariant ?? "default";
      const lat = groupPoints.reduce((sum, point) => sum + point.lat, 0) / groupPoints.length;
      const lon = groupPoints.reduce((sum, point) => sum + point.lon, 0) / groupPoints.length;
      const tagCounts = new Map<string, number>();

      const storiesById = new Map<string, GroupStory>();

      for (const point of groupPoints) {
        for (const tag of point.storyTags) {
          if (!tag) {
            continue;
          }

          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }

        const existing = storiesById.get(point.storyId);

        if (!existing) {
          storiesById.set(point.storyId, {
            storyId: point.storyId,
            title: point.storyTitle,
            imageUrl: point.imageUrl,
            imageCaption: point.imageCaption,
          });
          continue;
        }

        if (!existing.imageUrl && point.imageUrl) {
          storiesById.set(point.storyId, {
            ...existing,
            imageUrl: point.imageUrl,
            imageCaption: point.imageCaption,
          });
        }
      }

      const stories = [...storiesById.values()].sort((left, right) => left.title.localeCompare(right.title, "nb"));
      const tags = [...tagCounts.entries()]
        .sort((left, right) => {
          if (right[1] !== left[1]) {
            return right[1] - left[1];
          }

          return left[0].localeCompare(right[0], "nb");
        })
        .map(([tag]) => tag)
        .slice(0, 12);

      return {
        groupId,
        lat,
        lon,
        markerVariant,
        tags,
        stories,
      };
    })
    .sort((left, right) => left.groupId.localeCompare(right.groupId, "nb"));
}

function isConnectionTag(tag: string): boolean {
  const normalized = tag.trim().toLowerCase();

  if (normalized.length === 0) {
    return false;
  }

  if (normalized.startsWith("country:")) {
    return false;
  }

  const genericTags = new Set([
    "default",
    "news",
    "sport",
    "culture",
    "consumer",
    "economy",
    "technology",
    "politics",
    "weather",
    "geopolitics",
    "conflict",
    "alert",
    "security",
    "forecast",
    "society",
  ]);

  return !genericTags.has(normalized);
}

function getRelatedGroups(activePin: GroupPin | null, allPins: GroupPin[]): RelatedGroup[] {
  if (!activePin) {
    return [];
  }

  const activeTags = new Set(activePin.tags.filter(isConnectionTag));

  if (activeTags.size === 0) {
    return [];
  }

  return allPins
    .filter((pin) => pin.groupId !== activePin.groupId)
    .map((pin) => {
      const sharedTags = pin.tags.filter((tag) => activeTags.has(tag));

      return {
        groupId: pin.groupId,
        sharedTags,
        score: sharedTags.length,
      };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.groupId.localeCompare(right.groupId, "nb");
    })
    .slice(0, 6);
}

export function GroupMapExplorer({ points }: GroupMapExplorerProps) {
  const groupPins = useMemo(() => toGroupPins(points), [points]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const resolvedActiveGroupId = useMemo(() => {
    if (activeGroupId && groupPins.some((pin) => pin.groupId === activeGroupId)) {
      return activeGroupId;
    }

    return groupPins[0]?.groupId ?? null;
  }, [activeGroupId, groupPins]);

  const activePin = useMemo(
    () => groupPins.find((pin) => pin.groupId === resolvedActiveGroupId) ?? null,
    [groupPins, resolvedActiveGroupId],
  );

  const relatedGroups = useMemo(() => getRelatedGroups(activePin, groupPins), [activePin, groupPins]);

  return (
    <section className="group-map" aria-label="Kart over story-grupper">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        minZoom={MIN_ZOOM}
        maxBounds={MAX_WORLD_BOUNDS}
        maxBoundsViscosity={1}
        scrollWheelZoom
        className="group-map__canvas"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <GroupViewportController pins={groupPins} activePin={activePin} />

        {groupPins.map((pin) => (
          <Marker
            key={pin.groupId}
            icon={createMarkerIcon(pin.markerVariant, pin.groupId === resolvedActiveGroupId, pin.stories.length)}
            position={[pin.lat, pin.lon]}
            eventHandlers={{
              click: () => setActiveGroupId(pin.groupId),
            }}
          />
        ))}
      </MapContainer>

      <aside className="group-map__panel" aria-label="Historier i valgt gruppe">
        {activePin ? (
          <>
            <header className="group-map__header">
              <p className="group-map__label">Group ID</p>
              <h2 className="group-map__group-id">{activePin.groupId}</h2>
              <p className="group-map__count">{activePin.stories.length} saker</p>
            </header>

            <section className="group-map__section" aria-label="Tags for gruppe">
              <p className="group-map__section-title">Tags</p>
              <ul className="group-map__tags">
                {activePin.tags.map((tag) => (
                  <li key={tag} className="group-map__tag">
                    {tag}
                  </li>
                ))}
              </ul>
            </section>

            <ul className="group-map__stories">
              {activePin.stories.map((story) => (
                <li key={story.storyId} className="group-map__story">
                  {story.imageUrl ? (
                    <img
                      className="group-map__story-image"
                      src={story.imageUrl}
                      alt={story.imageCaption || story.title}
                    />
                  ) : (
                    <div className="group-map__story-image group-map__story-image--fallback" aria-hidden="true" />
                  )}
                  <p className="group-map__story-title">{story.title}</p>
                </li>
              ))}
            </ul>

            <section className="group-map__section" aria-label="Relaterte grupper">
              <p className="group-map__section-title">Relaterte grupper</p>
              {relatedGroups.length > 0 ? (
                <ul className="group-map__related-list">
                  {relatedGroups.map((group) => (
                    <li key={group.groupId}>
                      <button
                        type="button"
                        className="group-map__related-button"
                        onClick={() => setActiveGroupId(group.groupId)}
                      >
                        <span className="group-map__related-id">{group.groupId}</span>
                        <span className="group-map__related-tags">{group.sharedTags.join(" · ")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="group-map__empty">Ingen tydelige tag-koblinger til andre grupper ennå.</p>
              )}
            </section>
          </>
        ) : (
          <p className="group-map__empty">Fant ingen grupper med `story_group_id`.</p>
        )}
      </aside>
    </section>
  );
}
