import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { LatLngExpression } from "leaflet";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { MapPoint } from "../types/map";
import { createMarkerIcon, getMarkerStyle } from "./map/markerIcon";
import "leaflet/dist/leaflet.css";
import "./MapExplorer.css";

type MapExplorerProps = {
  points: MapPoint[];
  onStorySelect: (storyId: string) => void;
  autoplayStoryIds?: string[];
  autoplayIntervalMs?: number;
  requestedStoryId?: string | null;
  requestToken?: number;
  presentationToken?: number;
  isVisible?: boolean;
};

type TopicPin = {
  id: string;
  groupKey: string;
  storyGroupId: string | null;
  tag: string | null;
  markerVariant: MapPoint["markerVariant"];
  country: string | null;
  lat: number;
  lon: number;
  zoom: number | null;
  stories: MapPoint[];
};

type RelatedTopicPin = {
  pin: TopicPin;
  distanceKm: number;
};

type EdgeIndicator = {
  pin: TopicPin;
  angle: number;
  left: number;
  top: number;
  edge: "left" | "right" | "top" | "bottom";
  isActive?: boolean;
  zIndex?: number;
};

type ViewportSnapshot = {
  width: number;
  height: number;
  revision: number;
};

type ActiveCardLayout = {
  left: number;
  top: number;
  width: number;
};

type ActiveCardBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const DEFAULT_CENTER: LatLngExpression = [30, 25];
const DEFAULT_ZOOM = 2;
const MIN_ZOOM = 2;
const STORY_FOCUS_ZOOM = 8;
const DISMISS_SELECTION_ZOOM = 7;
const DETAIL_MARKER_MIN_ZOOM = 6;
const ZOOM_PREVIEW_MIN_ZOOM = 7;
const ACTIVE_PIN_VIEWPORT_RATIO = 0.72;
const DEFAULT_AUTOPLAY_INTERVAL_MS = 3000;
const EDGE_INDICATOR_LIMIT = 8;
const EDGE_INDICATOR_WIDTH = 176;
const EDGE_INDICATOR_HEIGHT = 58;
const EDGE_INDICATOR_GAP = 8;
const NEARBY_STORY_RADIUS_KM = 0.2;
const MAX_WORLD_BOUNDS = L.latLngBounds(
  [-85.0511, -180],
  [85.0511, 180],
);
const EARTH_RADIUS_KM = 6371;
const LEGEND_ITEMS: Array<{ variant: MapPoint["markerVariant"]; color: string }> = [
  { variant: "conflict", color: "#ff4f4f" },
  { variant: "crime", color: "#ffa836" },
  { variant: "sport", color: "#9be15d" },
  { variant: "culture", color: "#f692ee" },
  { variant: "politics", color: "#33842b" },
  { variant: "economy", color: "#fdea58" },
  { variant: "weather", color: "#53b4ff" },
  { variant: "default", color: "#8f95ff" },
];

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceInKilometers(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLon = toRadians(to.lon - from.lon);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);

  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function getClusterRadiusKilometers(zoom: number): number {
  if (zoom <= 2) return 900;
  if (zoom <= 3) return 650;
  if (zoom <= 4) return 420;
  if (zoom <= 5) return 280;
  if (zoom <= 6) return 180;
  if (zoom <= 7) return 110;
  if (zoom <= 8) return 70;
  if (zoom <= 9) return 45;
  if (zoom <= 10) return 28;
  if (zoom <= 11) return 18;
  if (zoom <= 12) return 12;
  if (zoom <= 13) return 8;
  if (zoom <= 14) return 5;
  return 2;
}

function getDetailMarkerVisibleZoom(point: MapPoint): number {
  if (point.openStoryId === null) {
    return Math.max(point.zoom ?? DETAIL_MARKER_MIN_ZOOM, 6);
  }

  return Math.max(point.zoom ?? DETAIL_MARKER_MIN_ZOOM, DETAIL_MARKER_MIN_ZOOM);
}

function getDetailMarkerSize(zoom: number): number {
  if (zoom < 7) {
    return 10;
  }

  if (zoom < 8) {
    return 11;
  }

  if (zoom < 9) {
    return 12;
  }

  if (zoom < 10) {
    return 13;
  }

  return 14;
}

function createDetailMarkerIcon(point: MapPoint, isActive: boolean, zoom: number): L.DivIcon {
  const markerStyle = getMarkerStyle(point.markerVariant);
  const size = getDetailMarkerSize(zoom) + (isActive ? 2 : 0);
  const anchor = Math.round(size / 2);
  const isSeedBombing = point.openStoryId === null && point.tag?.trim().toLowerCase() === "bombing";
  const iconClassName = isSeedBombing ? " map-detail-marker--bombing" : "";
  const glyph = isSeedBombing ? '<span class="map-detail-marker__glyph" aria-hidden="true">&#128163;</span>' : "";

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
    html: `
      <span
        class="map-detail-marker${iconClassName} ${isActive ? "map-detail-marker--active" : ""}"
        style="--map-detail-marker-size:${size}px;--map-detail-marker-color:${markerStyle.color};--map-detail-marker-halo:${markerStyle.halo}"
        aria-hidden="true"
      >${glyph}</span>
    `,
  });
}

function toGroupKey(point: MapPoint): string {
  if (point.storyGroupId) {
    return `story-group:${point.storyGroupId}`;
  }

  return `${point.country ?? "unknown"}:${point.tagKey}`;
}

function clusterTopicPins(points: MapPoint[], zoom: number): TopicPin[] {
  const radiusKm = getClusterRadiusKilometers(zoom);
  const orderedPoints = [...points].sort((left, right) => {
    const groupKeyComparison = toGroupKey(left).localeCompare(toGroupKey(right), "nb");

    if (groupKeyComparison !== 0) {
      return groupKeyComparison;
    }

    return left.id.localeCompare(right.id, "nb");
  });

  const clusters: TopicPin[] = [];

  for (const point of orderedPoints) {
    const pointGroupKey = toGroupKey(point);
    let closestClusterIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < clusters.length; index += 1) {
      const cluster = clusters[index];

      if (cluster.groupKey !== pointGroupKey) {
        continue;
      }

      const distance = distanceInKilometers(point, cluster);

      if (distance <= radiusKm && distance < closestDistance) {
        closestDistance = distance;
        closestClusterIndex = index;
      }
    }

    if (closestClusterIndex === -1) {
      clusters.push({
        id: `${pointGroupKey}:0:${point.id}`,
        groupKey: pointGroupKey,
        storyGroupId: point.storyGroupId,
        tag: point.tag,
        markerVariant: point.markerVariant,
        country: point.country,
        lat: point.lat,
        lon: point.lon,
        zoom: point.zoom,
        stories: [point],
      });
      continue;
    }

    const cluster = clusters[closestClusterIndex];
    const nextCount = cluster.stories.length + 1;
    cluster.lat = (cluster.lat * cluster.stories.length + point.lat) / nextCount;
    cluster.lon = (cluster.lon * cluster.stories.length + point.lon) / nextCount;
    cluster.zoom =
      typeof cluster.zoom === "number"
        ? typeof point.zoom === "number"
          ? Math.max(cluster.zoom, point.zoom)
          : cluster.zoom
        : point.zoom;
    cluster.stories.push(point);
  }

  return clusters
    .map((cluster, index) => {
      const primaryStory = cluster.stories[0];

      return {
        ...cluster,
        id: `${cluster.groupKey}:${index}:${primaryStory.id}`,
        stories: [...cluster.stories].sort((left, right) => left.title.localeCompare(right.title, "nb")),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id, "nb"));
}

function getPlaceLabel(point: MapPoint): string | null {
  return point.city ?? point.municipality ?? point.country ?? null;
}

function getLocationLabel(point: MapPoint, country: string | null): string | null {
  const place = getPlaceLabel(point);

  if (!place) {
    return null;
  }

  return country && place !== country ? `${place}, ${country}` : place;
}

function getVariantLabel(variant: MapPoint["markerVariant"]): string {
  switch (variant) {
    case "conflict":
      return "Konflikt";
    case "crime":
      return "Krim";
    case "sport":
      return "Sport";
    case "culture":
      return "Kultur";
    case "politics":
      return "Politikk";
    case "economy":
      return "Økonomi";
    case "weather":
      return "Vær";
    default:
      return "Diverse";
  }
}

function getTopicLabel(pin: TopicPin): string {
  if (pin.tag && pin.tag.trim().length > 0) {
    return pin.tag;
  }

  return getVariantLabel(pin.markerVariant);
}

function getPrimaryStory(pin: TopicPin): MapPoint | null {
  return pin.stories[0] ?? null;
}

function getStorySummary(pin: TopicPin, story: MapPoint): string {
  const teaser = story.title.trim();

  if (teaser.length > 0 && teaser !== story.storyTitle.trim()) {
    return teaser;
  }

  const place = getPlaceLabel(story);

  if (!place) {
    return getTopicLabel(pin);
  }

  const countrySuffix = pin.country && place !== pin.country ? `, ${pin.country}` : "";

  return `${getTopicLabel(pin)} i ${place}${countrySuffix}.`;
}

function getRelatedTopicPins(activePin: TopicPin | null, pins: TopicPin[]): RelatedTopicPin[] {
  if (!activePin?.storyGroupId) {
    return [];
  }

  return pins
    .filter((pin) => pin.id !== activePin.id)
    .filter((pin) => pin.stories.some((story) => story.storyGroupIds.includes(activePin.storyGroupId ?? "")))
    .map((pin) => ({
      pin,
      distanceKm: distanceInKilometers(activePin, pin),
    }))
    .sort((left, right) => {
      if (left.distanceKm !== right.distanceKm) {
        return left.distanceKm - right.distanceKm;
      }

      return left.pin.id.localeCompare(right.pin.id, "nb");
    });
}

function getNearbyStories(referenceStory: MapPoint | null, points: MapPoint[]): MapPoint[] {
  if (!referenceStory) {
    return [];
  }

  const nearbyByStoryId = new Map<string, { story: MapPoint; distanceKm: number }>();

  for (const point of points) {
    const distanceKm = distanceInKilometers(referenceStory, point);

    if (distanceKm > NEARBY_STORY_RADIUS_KM) {
      continue;
    }

    const existing = nearbyByStoryId.get(point.storyId);

    if (!existing || distanceKm < existing.distanceKm || (distanceKm === existing.distanceKm && point.id < existing.story.id)) {
      nearbyByStoryId.set(point.storyId, {
        story: point,
        distanceKm,
      });
    }
  }

  return [...nearbyByStoryId.values()]
    .sort((left, right) => {
      if (left.distanceKm !== right.distanceKm) {
        return left.distanceKm - right.distanceKm;
      }

      const titleComparison = left.story.storyTitle.localeCompare(right.story.storyTitle, "nb");

      if (titleComparison !== 0) {
        return titleComparison;
      }

      return left.story.storyId.localeCompare(right.story.storyId, "nb");
    })
    .map((entry) => entry.story);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getEdgeIndicatorBottomInset(viewportHeight: number): number {
  return clamp(viewportHeight * 0.1, 56, 88);
}

function getActiveCardBounds(layout: ActiveCardLayout): ActiveCardBounds {
  const estimatedHeight = clamp(layout.width * 1.18 + 28, 208, 280);

  return {
    left: layout.left - layout.width / 2,
    right: layout.left + layout.width / 2,
    top: layout.top - estimatedHeight - 10,
    bottom: layout.top - 10,
  };
}

function rectanglesOverlap(
  leftA: number,
  topA: number,
  rightA: number,
  bottomA: number,
  leftB: number,
  topB: number,
  rightB: number,
  bottomB: number,
): boolean {
  return leftA < rightB && rightA > leftB && topA < bottomB && bottomA > topB;
}

function avoidActiveCardOverlap(
  indicator: EdgeIndicator,
  activeCardBounds: ActiveCardBounds,
  width: number,
  height: number,
): EdgeIndicator {
  const indicatorHalfWidth = EDGE_INDICATOR_WIDTH / 2;
  const indicatorHalfHeight = EDGE_INDICATOR_HEIGHT / 2;
  const minY = 72;
  const baseBottomInset = getEdgeIndicatorBottomInset(height);
  const maxY = height - baseBottomInset;
  const cardCenterX = (activeCardBounds.left + activeCardBounds.right) / 2;
  const cardCenterY = (activeCardBounds.top + activeCardBounds.bottom) / 2;

  if (indicator.edge === "top" || indicator.edge === "bottom") {
    const indicatorLeft = indicator.left - indicatorHalfWidth;
    const indicatorRight = indicator.left + indicatorHalfWidth;

    if (!rectanglesOverlap(indicatorLeft, indicator.top - indicatorHalfHeight, indicatorRight, indicator.top + indicatorHalfHeight, activeCardBounds.left, activeCardBounds.top, activeCardBounds.right, activeCardBounds.bottom)) {
      return indicator;
    }

    const moveLeft = indicator.left <= cardCenterX;
    const nextLeft = moveLeft
      ? activeCardBounds.left - indicatorHalfWidth - 18
      : activeCardBounds.right + indicatorHalfWidth + 18;

    return clampIndicatorToViewport({ ...indicator, left: nextLeft }, width, height);
  }

  const indicatorTop = indicator.top - indicatorHalfHeight;
  const indicatorBottom = indicator.top + indicatorHalfHeight;

  if (!rectanglesOverlap(indicator.left - indicatorHalfWidth, indicatorTop, indicator.left + indicatorHalfWidth, indicatorBottom, activeCardBounds.left, activeCardBounds.top, activeCardBounds.right, activeCardBounds.bottom)) {
    return indicator;
  }

  const moveUp = indicator.top <= cardCenterY;
  const nextTop = moveUp
    ? activeCardBounds.top - indicatorHalfHeight - 18
    : activeCardBounds.bottom + indicatorHalfHeight + 18;

  return clampIndicatorToViewport(
    {
      ...indicator,
      top: clamp(nextTop, minY + indicatorHalfHeight, maxY - indicatorHalfHeight),
    },
    width,
    height,
  );
}

function projectToEdgeIndicator(
  x: number,
  y: number,
  width: number,
  height: number,
  activeCardLayout: ActiveCardLayout | null,
): Omit<EdgeIndicator, "pin"> | null {
  const edgeInset = 12;
  const minX = edgeInset;
  const maxX = width - edgeInset;
  const minY = 72;
  const baseBottomInset = getEdgeIndicatorBottomInset(height);
  const maxY = height - baseBottomInset;
  const activeCardTop = activeCardLayout
    ? activeCardLayout.top - (width <= 640 ? 142 : 162)
    : maxY;
  const reservedMaxY = clamp(Math.min(maxY, activeCardTop - 16), minY + 72, maxY);
  const activeCardLaneLeft = activeCardLayout
    ? activeCardLayout.left - activeCardLayout.width / 2 - 10
    : Number.NEGATIVE_INFINITY;
  const activeCardLaneRight = activeCardLayout
    ? activeCardLayout.left + activeCardLayout.width / 2 + 10
    : Number.POSITIVE_INFINITY;
  const calculateProjection = (maxYLimit: number): Omit<EdgeIndicator, "pin"> | null => {
    if (x >= minX && x <= maxX && y >= minY && y <= maxYLimit) {
      return null;
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxYLimit) / 2;
    const deltaX = x - centerX;
    const deltaY = y - centerY;

    if (deltaX === 0 && deltaY === 0) {
      return null;
    }

    const scales: Array<{ edge: EdgeIndicator["edge"]; scale: number }> = [];

    if (deltaX > 0) {
      scales.push({ edge: "right", scale: (maxX - centerX) / deltaX });
    } else if (deltaX < 0) {
      scales.push({ edge: "left", scale: (minX - centerX) / deltaX });
    }

    if (deltaY > 0) {
      scales.push({ edge: "bottom", scale: (maxYLimit - centerY) / deltaY });
    } else if (deltaY < 0) {
      scales.push({ edge: "top", scale: (minY - centerY) / deltaY });
    }

    const candidates = scales
      .filter((candidate) => Number.isFinite(candidate.scale) && candidate.scale >= 0)
      .sort((left, right) => left.scale - right.scale);
    const target = candidates[0];

    if (!target) {
      return null;
    }

    const projectedLeft = centerX + deltaX * target.scale;
    const projectedTop = centerY + deltaY * target.scale;

    const left =
      target.edge === "top" || target.edge === "bottom"
        ? clamp(projectedLeft, EDGE_INDICATOR_WIDTH / 2 + edgeInset, width - EDGE_INDICATOR_WIDTH / 2 - edgeInset)
        : target.edge === "left"
          ? edgeInset
          : width - edgeInset;
    const top =
      target.edge === "left" || target.edge === "right"
        ? clamp(projectedTop, minY + EDGE_INDICATOR_HEIGHT / 2, maxYLimit - EDGE_INDICATOR_HEIGHT / 2)
        : target.edge === "top"
          ? minY
          : maxYLimit;

    return {
      left,
      top,
      angle: (Math.atan2(deltaY, deltaX) * 180) / Math.PI,
      edge: target.edge,
    };
  };

  const initialProjection = calculateProjection(maxY);

  if (!initialProjection || !activeCardLayout || initialProjection.edge !== "bottom") {
    return initialProjection;
  }

  const indicatorLeft = initialProjection.left - EDGE_INDICATOR_WIDTH / 2;
  const indicatorRight = initialProjection.left + EDGE_INDICATOR_WIDTH / 2;
  const overlapsActiveCardLane = indicatorRight >= activeCardLaneLeft && indicatorLeft <= activeCardLaneRight;

  if (!overlapsActiveCardLane) {
    return initialProjection;
  }

  return calculateProjection(reservedMaxY);
}

function clampIndicatorToViewport(indicator: EdgeIndicator, width: number, height: number): EdgeIndicator {
  const edgeInset = 12;
  const minY = 72;
  const baseBottomInset = getEdgeIndicatorBottomInset(height);
  const maxY = height - baseBottomInset;

  if (indicator.edge === "top" || indicator.edge === "bottom") {
    return {
      ...indicator,
      left: clamp(indicator.left, EDGE_INDICATOR_WIDTH / 2 + edgeInset, width - EDGE_INDICATOR_WIDTH / 2 - edgeInset),
      top: indicator.edge === "top" ? minY : maxY,
    };
  }

  return {
    ...indicator,
    left: indicator.edge === "left" ? edgeInset : width - edgeInset,
    top: clamp(indicator.top, minY + EDGE_INDICATOR_HEIGHT / 2, maxY - EDGE_INDICATOR_HEIGHT / 2),
  };
}

function offsetIndicatorAlongEdge(indicator: EdgeIndicator, offset: number, width: number, height: number): EdgeIndicator {
  if (indicator.edge === "top" || indicator.edge === "bottom") {
    return clampIndicatorToViewport({ ...indicator, left: indicator.left + offset }, width, height);
  }

  return clampIndicatorToViewport({ ...indicator, top: indicator.top + offset }, width, height);
}

function getIndicatorAxis(indicator: EdgeIndicator): number {
  return indicator.edge === "top" || indicator.edge === "bottom" ? indicator.left : indicator.top;
}

function packEdgeIndicatorsOnAxis(indicators: EdgeIndicator[], width: number, height: number): EdgeIndicator[] {
  if (indicators.length <= 1) {
    return indicators.map((indicator) => clampIndicatorToViewport(indicator, width, height));
  }

  const edgeInset = 12;
  const minY = 72;
  const baseBottomInset = getEdgeIndicatorBottomInset(height);
  const maxY = height - baseBottomInset;
  const isHorizontalEdge = indicators[0].edge === "top" || indicators[0].edge === "bottom";
  const spacing = (isHorizontalEdge ? EDGE_INDICATOR_WIDTH : EDGE_INDICATOR_HEIGHT) + EDGE_INDICATOR_GAP;
  const minAxis = isHorizontalEdge ? EDGE_INDICATOR_WIDTH / 2 + edgeInset : minY + EDGE_INDICATOR_HEIGHT / 2;
  const maxAxis = isHorizontalEdge
    ? width - EDGE_INDICATOR_WIDTH / 2 - edgeInset
    : maxY - EDGE_INDICATOR_HEIGHT / 2;

  const sorted = indicators
    .map((indicator, originalIndex) => ({ indicator: clampIndicatorToViewport(indicator, width, height), originalIndex }))
    .sort((left, right) => {
      const axisDiff = getIndicatorAxis(left.indicator) - getIndicatorAxis(right.indicator);

      if (axisDiff !== 0) {
        return axisDiff;
      }

      return left.originalIndex - right.originalIndex;
    });

  const packedAxis: number[] = new Array(sorted.length);
  packedAxis[0] = clamp(getIndicatorAxis(sorted[0].indicator), minAxis, maxAxis);

  for (let index = 1; index < sorted.length; index += 1) {
    const wanted = clamp(getIndicatorAxis(sorted[index].indicator), minAxis, maxAxis);
    packedAxis[index] = Math.max(wanted, packedAxis[index - 1] + spacing);
  }

  if (packedAxis[packedAxis.length - 1] > maxAxis) {
    packedAxis[packedAxis.length - 1] = maxAxis;

    for (let index = packedAxis.length - 2; index >= 0; index -= 1) {
      packedAxis[index] = Math.min(packedAxis[index], packedAxis[index + 1] - spacing);
    }

    if (packedAxis[0] < minAxis) {
      const correction = minAxis - packedAxis[0];

      for (let index = 0; index < packedAxis.length; index += 1) {
        packedAxis[index] = clamp(packedAxis[index] + correction, minAxis, maxAxis);
      }
    }
  }

  const packedSorted = sorted.map((entry, index) => {
    const axisOffset = packedAxis[index] - getIndicatorAxis(entry.indicator);
    return {
      indicator: offsetIndicatorAlongEdge(entry.indicator, axisOffset, width, height),
      originalIndex: entry.originalIndex,
    };
  });

  return packedSorted
    .sort((left, right) => left.originalIndex - right.originalIndex)
    .map((entry) => entry.indicator);
}

function resolveEdgeIndicatorLayout(
  indicators: EdgeIndicator[],
  width: number,
  height: number,
  activeCardBounds: ActiveCardBounds | null,
): EdgeIndicator[] {
  if (indicators.length <= 1) {
    return activeCardBounds
      ? indicators.map((indicator) => avoidActiveCardOverlap(clampIndicatorToViewport(indicator, width, height), activeCardBounds, width, height))
      : indicators;
  }

  const byEdge = {
    left: [] as Array<{ indicator: EdgeIndicator; index: number }>,
    right: [] as Array<{ indicator: EdgeIndicator; index: number }>,
    top: [] as Array<{ indicator: EdgeIndicator; index: number }>,
    bottom: [] as Array<{ indicator: EdgeIndicator; index: number }>,
  };

  indicators.forEach((indicator, index) => {
    byEdge[indicator.edge].push({ indicator, index });
  });

  const positioned: EdgeIndicator[] = [...indicators];

  (Object.keys(byEdge) as Array<keyof typeof byEdge>).forEach((edge) => {
    const entries = byEdge[edge];

    if (entries.length === 0) {
      return;
    }

    const packed = packEdgeIndicatorsOnAxis(
      entries.map((entry) => entry.indicator),
      width,
      height,
    );

    packed.forEach((indicator, packedIndex) => {
      positioned[entries[packedIndex].index] = indicator;
    });
  });

  return positioned.map((indicator, index) => {
    const clamped = activeCardBounds ? avoidActiveCardOverlap(indicator, activeCardBounds, width, height) : indicator;

    return {
      ...clamped,
      zIndex: clamped.isActive ? 710 : 700 - index,
    };
  });
}

function getFocusedCenter(map: L.Map, coordinates: { lat: number; lon: number }, zoom: number): L.LatLng {
  const size = map.getSize();
  const targetPoint = map.project(L.latLng(coordinates.lat, coordinates.lon), zoom);
  const desiredScreenY = size.y * ACTIVE_PIN_VIEWPORT_RATIO;
  const centerOffsetY = desiredScreenY - size.y / 2;
  const focusedCenter = L.point(targetPoint.x, targetPoint.y - centerOffsetY);

  return map.unproject(focusedCenter, zoom);
}

function focusMapOnPoints(map: L.Map, points: MapPoint[]): void {
  if (points.length === 0) {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: true });
    return;
  }

  if (points.length === 1) {
    const [point] = points;
    const targetZoom = Math.max(point.zoom ?? STORY_FOCUS_ZOOM, STORY_FOCUS_ZOOM, MIN_ZOOM);
    const targetCenter = getFocusedCenter(map, point, targetZoom);
    map.flyTo(targetCenter, targetZoom, {
      animate: true,
      duration: 0.85,
    });
    return;
  }

  const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lon] as [number, number]));
  map.fitBounds(bounds.pad(0.22), {
    animate: true,
    duration: 0.85,
  });
}

function MapViewportController({
  activePin,
  activePoint,
  activePointId,
  focusRequestToken,
  selectionSource,
  points,
}: {
  activePin: TopicPin | null;
  activePoint: MapPoint | null;
  activePointId: string | null;
  focusRequestToken: number;
  selectionSource: "manual" | "zoom-preview";
  points: MapPoint[];
}) {
  const map = useMap();
  const previousActivePinRef = useRef<TopicPin | null>(null);
  const previousActivePointIdRef = useRef<string | null>(activePointId);
  const previousFocusRequestTokenRef = useRef<number>(focusRequestToken);
  const previousPointsRef = useRef<MapPoint[]>(points);

  useEffect(() => {
    const focusChanged = previousFocusRequestTokenRef.current !== focusRequestToken;

    if (activePin && activePoint) {
      const selectionChanged =
        previousActivePointIdRef.current !== activePointId ||
        focusChanged;

      previousActivePinRef.current = activePin;
      previousActivePointIdRef.current = activePointId;
      previousFocusRequestTokenRef.current = focusRequestToken;
      previousPointsRef.current = points;

      if (!selectionChanged) {
        return;
      }

      if (selectionSource === "zoom-preview") {
        return;
      }

      const targetZoom = Math.max(activePoint.zoom ?? STORY_FOCUS_ZOOM, STORY_FOCUS_ZOOM, MIN_ZOOM);
      const targetCenter = getFocusedCenter(map, activePoint, targetZoom);
      const currentCenter = map.getCenter();
      const currentDistance = currentCenter.distanceTo(targetCenter);

      if (currentDistance < 1000 && Math.abs(map.getZoom() - targetZoom) < 0.1) {
        return;
      }

      map.flyTo(targetCenter, targetZoom, {
        animate: true,
        duration: 0.8,
      });
      return;
    }

    const previousActivePin = previousActivePinRef.current;
    const previousPoints = previousPointsRef.current;

    if (previousActivePin && previousPoints === points) {
      previousActivePinRef.current = null;
      previousActivePointIdRef.current = activePointId;
      previousFocusRequestTokenRef.current = focusRequestToken;
      previousPointsRef.current = points;
      return;
    }

    if (focusChanged && !previousActivePinRef.current) {
      previousActivePinRef.current = null;
      previousActivePointIdRef.current = activePointId;
      previousFocusRequestTokenRef.current = focusRequestToken;
      previousPointsRef.current = points;
      map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: true, duration: 0.85 });
      return;
    }

    if (points.length === 0) {
      previousActivePinRef.current = null;
      previousActivePointIdRef.current = activePointId;
      previousFocusRequestTokenRef.current = focusRequestToken;
      previousPointsRef.current = points;
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    if (points.length === 1) {
      const [point] = points;
      previousActivePinRef.current = null;
      previousActivePointIdRef.current = activePointId;
      previousFocusRequestTokenRef.current = focusRequestToken;
      previousPointsRef.current = points;
      map.setView(getFocusedCenter(map, point, Math.max(STORY_FOCUS_ZOOM, MIN_ZOOM)), Math.max(STORY_FOCUS_ZOOM, MIN_ZOOM));
      return;
    }

    previousActivePinRef.current = null;
    previousActivePointIdRef.current = activePointId;
    previousFocusRequestTokenRef.current = focusRequestToken;
    previousPointsRef.current = points;
    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lon] as [number, number]));
    map.fitBounds(bounds.pad(0.22), {
      animate: true,
      duration: 0.8,
    });
  }, [activePin, activePoint, activePointId, focusRequestToken, map, points, selectionSource]);

  return null;
}

function MapZoomController({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom());
    },
  });

  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  return null;
}

function MapInteractionController({ onMapPress }: { onMapPress: () => void }) {
  const map = useMap();
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const ignoreNextClickRef = useRef(false);

  useEffect(() => {
    const container = map.getContainer();

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0] ?? event.changedTouches[0] ?? null;

      if (!touch) {
        return;
      }

      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      ignoreNextClickRef.current = false;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0] ?? event.changedTouches[0] ?? null;
      const start = touchStartRef.current;

      if (!touch || !start) {
        return;
      }

      const distanceX = Math.abs(touch.clientX - start.x);
      const distanceY = Math.abs(touch.clientY - start.y);

      if (distanceX > 10 || distanceY > 10) {
        ignoreNextClickRef.current = true;
      }
    };

    const handleTouchEnd = () => {
      touchStartRef.current = null;
    };

    const handleTouchCancel = () => {
      touchStartRef.current = null;
      ignoreNextClickRef.current = false;
    };

    const handleClick = () => {
      if (ignoreNextClickRef.current) {
        ignoreNextClickRef.current = false;
        return;
      }

      onMapPress();
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });
    container.addEventListener("touchcancel", handleTouchCancel, { passive: true });
    map.on("click", handleClick);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchCancel);
      map.off("click", handleClick);
    };
  }, [map, onMapPress]);

  return null;
}

function MapViewportSnapshotController({
  onMapReady,
  onViewportChange,
}: {
  onMapReady: (map: L.Map) => void;
  onViewportChange: (snapshot: ViewportSnapshot) => void;
}) {
  const map = useMap();

  const publishViewport = useCallback(() => {
    const size = map.getSize();

    onViewportChange({
      width: size.x,
      height: size.y,
      revision: Date.now(),
    });
  }, [map, onViewportChange]);

  useMapEvents({
    move: publishViewport,
    resize: publishViewport,
    zoom: publishViewport,
  });

  useEffect(() => {
    onMapReady(map);
    publishViewport();
  }, [map, onMapReady, publishViewport]);

  return null;
}

function MapActiveCard({
  pin,
  story,
  nearbyStories,
  currentStoryIndex,
  layout,
  autoplayDurationMs,
  onClose,
  onStorySelect,
  onSelectNearbyStory,
}: {
  pin: TopicPin;
  story: MapPoint;
  nearbyStories: MapPoint[];
  currentStoryIndex: number;
  layout: ActiveCardLayout;
  autoplayDurationMs: number | null;
  onClose: () => void;
  onStorySelect: (storyId: string) => void;
  onSelectNearbyStory: (storyId: string) => void;
}) {
  const swipeStartRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  const markerStyle = getMarkerStyle(pin.markerVariant);
  const locationLabel = getLocationLabel(story, pin.country);
  const cardStyle = {
    left: `${layout.left}px`,
    top: `${layout.top}px`,
    "--map-active-card-width": `${layout.width}px`,
    "--map-active-card-accent": markerStyle.color,
    "--map-active-card-accent-soft": markerStyle.halo,
    ...(autoplayDurationMs ? { "--map-active-card-autoplay-duration": `${autoplayDurationMs}ms` } : {}),
  } as CSSProperties;

  const hasNearbyStories = nearbyStories.length > 1;
  const previousStory = hasNearbyStories ? nearbyStories[(currentStoryIndex - 1 + nearbyStories.length) % nearbyStories.length] : null;
  const nextStory = hasNearbyStories ? nearbyStories[(currentStoryIndex + 1) % nearbyStories.length] : null;

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!hasNearbyStories || event.button !== 0) {
        return;
      }

      const target = event.target as HTMLElement | null;

      if (target?.closest("button, a, input, textarea, select, [role='button']")) {
        return;
      }

      swipeStartRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };

      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [hasNearbyStories],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const swipeStart = swipeStartRef.current;

      if (!swipeStart || swipeStart.pointerId !== event.pointerId) {
        return;
      }

      swipeStartRef.current = null;

      const deltaX = event.clientX - swipeStart.startX;
      const deltaY = event.clientY - swipeStart.startY;
      const swipeDistance = Math.abs(deltaX);
      const verticalDistance = Math.abs(deltaY);

      if (swipeDistance < 56 || swipeDistance < verticalDistance * 1.15) {
        return;
      }

      if (deltaX < 0 && nextStory) {
        onSelectNearbyStory(nextStory.id);
      } else if (deltaX > 0 && previousStory) {
        onSelectNearbyStory(previousStory.id);
      }
    },
    [nextStory, onSelectNearbyStory, previousStory],
  );

  const handlePointerCancel = useCallback(() => {
    swipeStartRef.current = null;
  }, []);
  const canOpenStory = Boolean(story.openStoryId);

  return (
    <div className="map-active-card-layer" aria-live="polite">
      <article
        className={`map-active-card${hasNearbyStories ? " map-active-card--swipeable" : ""}${autoplayDurationMs ? " map-active-card--autoplay" : ""}`}
        style={cardStyle}
        aria-label={`${canOpenStory ? "Valgt sak" : "Valgt hendelse"}: ${story.storyTitle}${hasNearbyStories ? `, ${nearbyStories.length} nærliggende saker` : ""}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handlePointerCancel}
      >
        <div className="map-active-card__shell">
          <div className="map-active-card__inner">
            <button type="button" className="map-active-card__close" aria-label="Lukk valgt sak" onClick={onClose}>
              ×
            </button>

            <div className="map-active-card__header">
              <div className="map-active-card__media">
                {story.imageUrl ? (
                  <img className="map-active-card__image" src={story.imageUrl} alt={story.imageCaption || story.storyTitle} />
                ) : (
                  <div className="map-active-card__image-fallback">{getVariantLabel(pin.markerVariant)}</div>
                )}
              </div>

              <div className="map-active-card__header-body">
                <p className="map-active-card__eyebrow">{getTopicLabel(pin)}</p>
                {canOpenStory ? (
                  <button
                    type="button"
                    className="map-active-card__title"
                    onClick={() => {
                      if (story.openStoryId) {
                        onStorySelect(story.openStoryId);
                      }
                    }}
                  >
                    {story.storyTitle}
                  </button>
                ) : (
                  <h2 className="map-active-card__title map-active-card__title--static">{story.storyTitle}</h2>
                )}
                {locationLabel ? <p className="map-active-card__meta">{locationLabel}</p> : null}
              </div>
            </div>

            <p className="map-active-card__summary">{getStorySummary(pin, story)}</p>

            {hasNearbyStories ? (
              <div className="map-active-card__carousel" aria-label="Nærliggende saker">
                <button
                  type="button"
                  className="map-active-card__carousel-button"
                  aria-label={`Vis forrige sak: ${previousStory?.storyTitle ?? "forrige"}`}
                  onClick={() => previousStory && onSelectNearbyStory(previousStory.id)}
                >
                  ‹
                </button>

                <p className="map-active-card__carousel-status">
                  <span className="map-active-card__carousel-count">
                    {currentStoryIndex + 1}/{nearbyStories.length}
                  </span>
                  <span className="map-active-card__carousel-hint">Sveip sidelengs for flere</span>
                </p>

                <button
                  type="button"
                  className="map-active-card__carousel-button"
                  aria-label={`Vis neste sak: ${nextStory?.storyTitle ?? "neste"}`}
                  onClick={() => nextStory && onSelectNearbyStory(nextStory.id)}
                >
                  ›
                </button>
              </div>
            ) : null}

            {/* {hasRelatedPins ? (
              <section className="map-active-card__related" aria-label="Relevante saker i kartet">
                <p className="map-active-card__related-title">Relevante saker</p>
                <ul className="map-active-card__related-list">
                  {relatedPins.slice(0, 3).map(({ pin: relatedPin, distanceKm }) => {
                    const relatedStory = getPrimaryStory(relatedPin);

                    if (!relatedStory) {
                      return null;
                    }

                    const relatedLocation = getLocationLabel(relatedStory, relatedPin.country);
                    const distanceLabel = formatDistanceLabel(distanceKm);

                    return (
                      <li key={relatedPin.id}>
                        <button
                          type="button"
                          className="map-active-card__related-button"
                          aria-label={`Vis relatert sak i kartet: ${relatedStory.storyTitle}`}
                          onClick={() => onSelectRelatedPin(relatedPin)}
                        >
                          <span className="map-active-card__related-headline">{relatedStory.storyTitle}</span>
                          <span className="map-active-card__related-meta">
                            {[relatedLocation, distanceLabel].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null} */}
          </div>
        </div>
      </article>
    </div>
  );
}

function MapZoomPreview({
  pin,
  stories,
  activeStoryId,
  onOpenStory,
  onClose,
}: {
  pin: TopicPin;
  stories: MapPoint[];
  activeStoryId: string | null;
  onOpenStory: (storyId: string) => void;
  onClose: () => void;
}) {
  const markerStyle = getMarkerStyle(pin.markerVariant);

  return (
    <div className="map-zoom-preview-layer" aria-live="polite">
      <article className="map-zoom-preview" style={{ "--map-zoom-preview-color": markerStyle.color } as CSSProperties}>
        <header className="map-zoom-preview__header">
          <p className="map-zoom-preview__eyebrow">{getTopicLabel(pin)}{stories.length > 1 ? ` · ${stories.length} saker` : ""}</p>

          <button
            type="button"
            className="map-zoom-preview__close"
            aria-label="Lukk liten forhåndsvisning"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <ul className="map-zoom-preview__list" aria-label="Saker i valgt sted">
          {stories.map((story) => {
            const locationLabel = getLocationLabel(story, pin.country);
            const isActive = story.id === activeStoryId;

            return (
              <li key={story.id} className="map-zoom-preview__item">
                <button
                  type="button"
                  className={`map-zoom-preview__open${isActive ? " map-zoom-preview__open--active" : ""}`}
                  aria-label={`Vis sak: ${story.storyTitle}`}
                  onClick={() => onOpenStory(story.id)}
                >
                  <span className="map-zoom-preview__title">{story.storyTitle}</span>
                  {locationLabel ? <span className="map-zoom-preview__meta">{locationLabel}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </article>
    </div>
  );
}

function MapEdgeIndicators({
  indicators,
  onSelectPin,
}: {
  indicators: EdgeIndicator[];
  onSelectPin: (pin: TopicPin) => void;
}) {
  if (indicators.length === 0) {
    return null;
  }

  return (
    <div className="map-edge-indicators" aria-label="Relaterte saker utenfor kartutsnittet">
      {indicators.map(({ pin, left, top, edge, isActive, zIndex }) => {
        const primaryStory = getPrimaryStory(pin);
        const locationLabel = primaryStory ? getLocationLabel(primaryStory, pin.country) : null;
        const markerStyle = getMarkerStyle(pin.markerVariant);
        const indicatorStyle = {
          left: `${left}px`,
          top: `${top}px`,
          zIndex,
          "--map-edge-indicator-color": markerStyle.color,
          "--map-edge-indicator-halo": markerStyle.halo,
        } as CSSProperties;

        return (
          <button
            key={pin.id}
            type="button"
            className={`map-edge-indicator map-edge-indicator--${edge}${isActive ? " map-edge-indicator--active" : ""}`}
            style={indicatorStyle}
            aria-label={`${isActive ? "Vis valgt sak" : "Hopp til relatert sak"}: ${primaryStory?.storyTitle ?? getTopicLabel(pin)}`}
            title={`${primaryStory?.storyTitle ?? getTopicLabel(pin)}${locationLabel ? ` · ${locationLabel}` : ""}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelectPin(pin);
            }}
          >
            <span className="map-edge-indicator__media" aria-hidden="true">
              {primaryStory?.imageUrl ? (
                <img className="map-edge-indicator__image" src={primaryStory.imageUrl} alt="" />
              ) : (
                <span className="map-edge-indicator__image-fallback">{markerStyle.icon}</span>
              )}
            </span>
            <span className="map-edge-indicator__body">
              <span className="map-edge-indicator__title">{primaryStory?.storyTitle ?? getTopicLabel(pin)}</span>
              {locationLabel ? <span className="map-edge-indicator__meta">{locationLabel}</span> : null}
            </span>
            {pin.stories.length > 1 ? (
              <span className="map-edge-indicator__badge" aria-hidden="true">
                {pin.stories.length}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function MapExplorer({
  points,
  onStorySelect,
  autoplayStoryIds = [],
  autoplayIntervalMs = DEFAULT_AUTOPLAY_INTERVAL_MS,
  requestedStoryId = null,
  requestToken = 0,
  presentationToken = 0,
  isVisible = true,
}: MapExplorerProps) {
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [activeCardAnchorStoryId, setActiveCardAnchorStoryId] = useState<string | null>(null);
  const [zoomPreviewStoryId, setZoomPreviewStoryId] = useState<string | null>(null);
  const [activeCardStories, setActiveCardStories] = useState<MapPoint[]>([]);
  const [focusRequestToken, setFocusRequestToken] = useState(0);
  const [selectionSource, setSelectionSource] = useState<"manual" | "zoom-preview">("manual");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isAutoplayEnabled, setIsAutoplayEnabled] = useState(autoplayStoryIds.length > 0);
  const [activeVariants, setActiveVariants] = useState<Set<MapPoint["markerVariant"]>>(new Set());
  const [currentZoom, setCurrentZoom] = useState<number>(DEFAULT_ZOOM);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [viewportSnapshot, setViewportSnapshot] = useState<ViewportSnapshot>({
    width: 0,
    height: 0,
    revision: 0,
  });
  const previousZoomRef = useRef<number | null>(null);

  useEffect(() => {
    setIsAutoplayEnabled(autoplayStoryIds.length > 0);
  }, [autoplayStoryIds]);

  const stopAutoplay = useCallback(() => {
    setIsAutoplayEnabled(false);
  }, []);

  const focusRequestedPoints = useCallback(() => {
    if (!mapInstance || requestToken === 0) {
      return;
    }

    const requestedPoints = requestedStoryId
      ? points.filter((point) => point.storyId === requestedStoryId)
      : points;

    focusMapOnPoints(mapInstance, requestedPoints);
  }, [mapInstance, points, requestToken, requestedStoryId]);

  const focusStoryPoint = useCallback((pointId: string | null) => {
    setActivePointId(pointId);
    setSelectionSource("manual");
    setActiveCardAnchorStoryId(pointId);
    setZoomPreviewStoryId(null);
    setIsFilterOpen(false);
    setFocusRequestToken((current) => current + 1);

    if (!pointId) {
      setActiveCardStories([]);
    }
  }, []);

  useEffect(() => {
    if (requestToken === 0) {
      return;
    }

    stopAutoplay();

    if (!requestedStoryId) {
      focusStoryPoint(null);
      return;
    }

    const requestedPoint = points.find((point) => point.storyId === requestedStoryId) ?? null;
    focusStoryPoint(requestedPoint?.id ?? null);
  }, [focusStoryPoint, points, requestToken, requestedStoryId, stopAutoplay]);

  useEffect(() => {
    if (!mapInstance || !isVisible || requestToken === 0 || presentationToken === 0) {
      return;
    }

    let cancelled = false;

    const syncVisibleMap = () => {
      if (cancelled) {
        return;
      }

      mapInstance.invalidateSize(false);
    };

    const applyRequestedFocus = () => {
      if (cancelled) {
        return;
      }

      focusRequestedPoints();
    };

    let secondFrameId: number | null = null;
    const firstFrameId = window.requestAnimationFrame(() => {
      syncVisibleMap();

      secondFrameId = window.requestAnimationFrame(applyRequestedFocus);
    });
    const timeoutId = window.setTimeout(() => {
      syncVisibleMap();
      applyRequestedFocus();
    }, 340);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrameId);
      if (secondFrameId !== null) {
        window.cancelAnimationFrame(secondFrameId);
      }
      window.clearTimeout(timeoutId);
    };
  }, [focusRequestedPoints, isVisible, mapInstance, presentationToken, requestToken]);

  const autoplayPoints = useMemo(() => {
    if (autoplayStoryIds.length === 0) {
      return [] as MapPoint[];
    }

    const seen = new Set<string>();

    return autoplayStoryIds.flatMap((storyId) => {
      const point = points.find((candidate) => candidate.storyId === storyId);

      if (!point || seen.has(point.id)) {
        return [];
      }

      seen.add(point.id);
      return [point];
    });
  }, [autoplayStoryIds, points]);

  useEffect(() => {
    if (!isAutoplayEnabled || autoplayPoints.length === 0) {
      return;
    }

    const hasActiveAutoplayPoint = autoplayPoints.some((point) => point.id === activePointId);

    if (!hasActiveAutoplayPoint) {
      focusStoryPoint(autoplayPoints[0].id);
    }
  }, [activePointId, autoplayPoints, focusStoryPoint, isAutoplayEnabled]);

  useEffect(() => {
    if (!isAutoplayEnabled || autoplayPoints.length < 2) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const currentIndex = autoplayPoints.findIndex((point) => point.id === activePointId);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % autoplayPoints.length;
      focusStoryPoint(autoplayPoints[nextIndex].id);
    }, autoplayIntervalMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activePointId, autoplayIntervalMs, autoplayPoints, focusStoryPoint, isAutoplayEnabled]);

  const filteredPoints = activeVariants.size === 0 ? points : points.filter((p) => activeVariants.has(p.markerVariant));

  function toggleVariant(variant: MapPoint["markerVariant"]) {
    stopAutoplay();
    setActiveVariants((prev) => {
      const next = new Set(prev);
      if (next.has(variant)) {
        next.delete(variant);
      } else {
        next.add(variant);
      }
      return next;
    });
  }

  const visibleMapPoints = useMemo(
    () =>
      filteredPoints.filter(
        (point) => point.openStoryId !== null || currentZoom >= getDetailMarkerVisibleZoom(point),
      ),
    [currentZoom, filteredPoints],
  );
  const topicPins = useMemo(() => clusterTopicPins(visibleMapPoints, currentZoom), [currentZoom, visibleMapPoints]);
  const visibleDetailPoints = useMemo(
    () => visibleMapPoints.filter((point) => currentZoom >= getDetailMarkerVisibleZoom(point)),
    [currentZoom, visibleMapPoints],
  );
  const visibleDetailPointIds = useMemo(
    () => new Set(visibleDetailPoints.map((point) => point.id)),
    [visibleDetailPoints],
  );
  const renderedTopicPins = useMemo(
    () => topicPins.filter((pin) => !pin.stories.every((story) => visibleDetailPointIds.has(story.id))),
    [topicPins, visibleDetailPointIds],
  );

  const activePin = useMemo(
    () => topicPins.find((pin) => pin.stories.some((story) => story.id === activePointId)) ?? null,
    [activePointId, topicPins],
  );
  const activePoint = useMemo(
    () => visibleMapPoints.find((point) => point.id === activePointId) ?? null,
    [activePointId, visibleMapPoints],
  );

  const relatedPins = useMemo(() => getRelatedTopicPins(activePin, topicPins), [activePin, topicPins]);
  const filterButtonLabel = "Filtrer";
  const activePrimaryStory =
    activePin?.stories.find((story) => story.id === activePointId) ??
    activePin?.stories[0] ??
    null;
  const zoomPreviewStories = useMemo(() => {
    if (!activePin || !zoomPreviewStoryId) {
      return [] as MapPoint[];
    }

    const containsPreviewStory = activePin.stories.some((story) => story.id === zoomPreviewStoryId);
    return containsPreviewStory ? activePin.stories : ([] as MapPoint[]);
  }, [activePin, zoomPreviewStoryId]);

  useEffect(() => {
    if (!activeCardAnchorStoryId) {
      if (activeCardStories.length > 0) {
        setActiveCardStories([]);
      }

      return;
    }

    const anchorStory = filteredPoints.find((point) => point.id === activeCardAnchorStoryId);

    if (!anchorStory) {
      setActiveCardStories([]);
      return;
    }

    const anchorPin = topicPins.find((pin) => pin.stories.some((story) => story.id === anchorStory.id)) ?? null;

    if (!anchorPin) {
      setActiveCardStories([]);
      return;
    }

    const samePinStories = anchorPin.stories;
    const nextStories =
      samePinStories.length > 1
        ? samePinStories
        : getNearbyStories(anchorStory, filteredPoints).filter((candidate) => candidate.id !== anchorStory.id);

    const stableStories = nextStories.length > 1 ? nextStories : [];
    const currentStoryStillVisible = stableStories.some((story) => story.id === activePointId);

    setActiveCardStories(stableStories);

    if (!currentStoryStillVisible && stableStories.length > 0) {
      setActivePointId(stableStories[0].id);
      setFocusRequestToken((current) => current + 1);
    }
  }, [activeCardAnchorStoryId, activeCardStories.length, activePointId, filteredPoints, topicPins]);

  useEffect(() => {
    if (!zoomPreviewStoryId) {
      return;
    }

    const isVisible = visibleMapPoints.some((point) => point.id === zoomPreviewStoryId);

    if (!isVisible) {
      setZoomPreviewStoryId(null);
    }
  }, [visibleMapPoints, zoomPreviewStoryId]);

  const activeCardStoryIndex = useMemo(() => {
    if (!activePrimaryStory) {
      return 0;
    }

    const index = activeCardStories.findIndex((candidate) => candidate.id === activePrimaryStory.id);
    return index === -1 ? 0 : index;
  }, [activeCardStories, activePrimaryStory]);
  const activeCardLayout = useMemo(() => {
    if (!activePin || !activePrimaryStory || !mapInstance || viewportSnapshot.width <= 0 || viewportSnapshot.height <= 0) {
      return null;
    }

    const containerPoint = mapInstance.latLngToContainerPoint([activePin.lat, activePin.lon]);
    const width = clamp(Math.min(264, viewportSnapshot.width - 24), 196, 264);
    const horizontalPadding = 16;

    return {
      left: clamp(containerPoint.x, width / 2 + horizontalPadding, viewportSnapshot.width - width / 2 - horizontalPadding),
      top: containerPoint.y,
      width,
    } satisfies ActiveCardLayout;
  }, [activePin, activePrimaryStory, mapInstance, viewportSnapshot]);

  const activeCardBounds = useMemo(() => (activeCardLayout ? getActiveCardBounds(activeCardLayout) : null), [activeCardLayout]);

  const activeEdgeIndicator = useMemo(() => {
    if (!activePin || !mapInstance || viewportSnapshot.width <= 0 || viewportSnapshot.height <= 0) {
      return null;
    }

    const containerPoint = mapInstance.latLngToContainerPoint([activePin.lat, activePin.lon]);
    const projected = projectToEdgeIndicator(
      containerPoint.x,
      containerPoint.y,
      viewportSnapshot.width,
      viewportSnapshot.height,
      null,
    );

    if (!projected) {
      return null;
    }

    return {
      pin: activePin,
      ...projected,
      isActive: true,
    } satisfies EdgeIndicator;
  }, [activePin, mapInstance, viewportSnapshot]);

  const edgeIndicators = useMemo(() => {
    if (zoomPreviewStories.length > 0 && !activeCardAnchorStoryId) {
      return [] as EdgeIndicator[];
    }

    if (!mapInstance || viewportSnapshot.width <= 0 || viewportSnapshot.height <= 0) {
      return activeEdgeIndicator ? [activeEdgeIndicator] : ([] as EdgeIndicator[]);
    }

    const reservedLayout = activeEdgeIndicator ? null : activeCardLayout;
    const relatedIndicators = relatedPins
      .map(({ pin }) => {
        const containerPoint = mapInstance.latLngToContainerPoint([pin.lat, pin.lon]);
        const projected = projectToEdgeIndicator(
          containerPoint.x,
          containerPoint.y,
          viewportSnapshot.width,
          viewportSnapshot.height,
          reservedLayout,
        );

        if (!projected) {
          return null;
        }

        return {
          pin,
          ...projected,
        };
      })
      .filter((indicator): indicator is EdgeIndicator => indicator !== null)
      .slice(0, activeEdgeIndicator ? EDGE_INDICATOR_LIMIT - 1 : EDGE_INDICATOR_LIMIT);

    const indicatorsToLayout: EdgeIndicator[] = [
      ...(activeEdgeIndicator ? [activeEdgeIndicator] : []),
      ...relatedIndicators,
    ];

    return resolveEdgeIndicatorLayout(
      indicatorsToLayout,
      viewportSnapshot.width,
      viewportSnapshot.height,
      activeCardBounds,
    );
  }, [activeCardAnchorStoryId, activeCardBounds, activeCardLayout, activeEdgeIndicator, mapInstance, relatedPins, viewportSnapshot, zoomPreviewStories.length]);

  const handleZoomChange = useCallback((zoom: number) => {
    setCurrentZoom(zoom);

    const previousZoom = previousZoomRef.current;
    previousZoomRef.current = zoom;

    if (previousZoom === null || !mapInstance || activeCardAnchorStoryId) {
      return;
    }

    if (zoom <= previousZoom + 0.01) {
      return;
    }

    if (zoom < ZOOM_PREVIEW_MIN_ZOOM) {
      setZoomPreviewStoryId(null);
      return;
    }

    const pinsAtZoom = clusterTopicPins(visibleMapPoints, zoom);

    if (pinsAtZoom.length === 0) {
      setZoomPreviewStoryId(null);
      return;
    }

    const mapCenterPoint = mapInstance.latLngToContainerPoint(mapInstance.getCenter());
    const MAX_PICK_DISTANCE_PX = 180;

    const candidate = pinsAtZoom
      .map((pin) => {
        const pinPoint = mapInstance.latLngToContainerPoint([pin.lat, pin.lon]);
        const deltaX = pinPoint.x - mapCenterPoint.x;
        const deltaY = pinPoint.y - mapCenterPoint.y;
        const distance = Math.hypot(deltaX, deltaY);

        return {
          pin,
          distance,
        };
      })
      .filter((entry) => entry.distance <= MAX_PICK_DISTANCE_PX)
      .sort((left, right) => left.distance - right.distance)[0];

    if (!candidate) {
      setZoomPreviewStoryId(null);
      return;
    }

    const nextStoryId = candidate.pin.stories[0]?.id ?? null;

    if (!nextStoryId) {
      setZoomPreviewStoryId(null);
      return;
    }

    setActivePointId(nextStoryId);
    setSelectionSource("zoom-preview");
    setActiveCardAnchorStoryId(null);
    setActiveCardStories([]);
    setZoomPreviewStoryId(nextStoryId);
  }, [activeCardAnchorStoryId, mapInstance, visibleMapPoints]);

  const handleEdgeIndicatorSelect = useCallback(
    (pin: TopicPin) => {
      const nextStoryId = pin.stories[0]?.id ?? null;
      stopAutoplay();
      focusStoryPoint(nextStoryId);
    },
    [focusStoryPoint, stopAutoplay],
  );

  const handleOpenMapStory = useCallback((storyId: string | null) => {
    stopAutoplay();
    focusStoryPoint(storyId);
  }, [focusStoryPoint, stopAutoplay]);

  const handleDismissActiveSelection = useCallback(() => {
    const hasActiveSelection =
      activePointId !== null ||
      activeCardAnchorStoryId !== null ||
      zoomPreviewStoryId !== null;

    stopAutoplay();
    focusStoryPoint(null);

    if (!hasActiveSelection || !mapInstance) {
      return;
    }

    const currentMapZoom = mapInstance.getZoom();
    const targetZoom = Math.max(MIN_ZOOM, Math.min(DISMISS_SELECTION_ZOOM, currentMapZoom - 1.5));

    if (targetZoom >= currentMapZoom - 0.05) {
      return;
    }

    mapInstance.flyTo(mapInstance.getCenter(), targetZoom, {
      animate: true,
      duration: 0.6,
    });
  }, [activeCardAnchorStoryId, activePointId, focusStoryPoint, mapInstance, stopAutoplay, zoomPreviewStoryId]);

  const handleMoveWithinActiveCard = useCallback((storyId: string | null) => {
    stopAutoplay();
    setActivePointId(storyId);
    setSelectionSource("manual");
    setFocusRequestToken((current) => current + 1);
  }, [stopAutoplay]);

  return (
    <section className="map-explorer" aria-label="Kartvisning">
      <div className="map-shell">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          minZoom={MIN_ZOOM}
          zoomControl={false}
          maxBounds={MAX_WORLD_BOUNDS}
          maxBoundsViscosity={1}
          scrollWheelZoom
          className="map-canvas"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapViewportController
            activePin={activePin}
            activePoint={activePoint}
            activePointId={activePointId}
            focusRequestToken={focusRequestToken}
            selectionSource={selectionSource}
            points={points}
          />
          <MapZoomController onZoomChange={handleZoomChange} />
          <MapViewportSnapshotController onMapReady={setMapInstance} onViewportChange={setViewportSnapshot} />
          <MapInteractionController
            onMapPress={handleDismissActiveSelection}
          />

          {renderedTopicPins.map((pin) => {
            const isActive = pin.id === activePin?.id;

            return (
              <Marker
                key={pin.id}
                icon={createMarkerIcon(pin.markerVariant, isActive, pin.stories.length)}
                position={[pin.lat, pin.lon]}
                eventHandlers={{
                  click: () => {
                    handleOpenMapStory(pin.stories[0]?.id ?? null);
                  },
                }}
              />
            );
          })}

          {visibleDetailPoints.map((point) => (
            <Marker
              key={`detail:${point.id}`}
              icon={createDetailMarkerIcon(point, point.id === activePointId, currentZoom)}
              position={[point.lat, point.lon]}
              zIndexOffset={800}
              eventHandlers={{
                click: () => {
                  handleOpenMapStory(point.id);
                },
              }}
            />
          ))}
        </MapContainer>

        <MapEdgeIndicators indicators={edgeIndicators} onSelectPin={handleEdgeIndicatorSelect} />


        {isFilterOpen ? (
          <button
            type="button"
            className="map-drawer-backdrop"
            aria-label="Lukk filter"
            onClick={() => {
              stopAutoplay();
              setIsFilterOpen(false);
            }}
          />
        ) : null}

        <div className="map-overlay map-overlay--top">
          <div className="map-filter-wrapper">
            <button
              type="button"
              className="map-filter-button"
              aria-expanded={isFilterOpen}
              aria-controls="map-filter-dropdown"
              onClick={() => {
                stopAutoplay();
                setIsFilterOpen((current) => !current);
              }}
            >
              <span className="map-filter-button__icon" aria-hidden="true">
                ≡
              </span>
              <span>{filterButtonLabel}</span>
            </button>

            <div
              id="map-filter-dropdown"
              className={`map-filter-dropdown${isFilterOpen ? " map-filter-dropdown--open" : ""}`}
              aria-label="Filtrér"
            >
              <ul className="map-legend__list" aria-label="Kategori og farge">
                {LEGEND_ITEMS.map((item) => {
                  const isActive = activeVariants.has(item.variant);
                  return (
                    <li key={item.variant}>
                      <button
                        type="button"
                        className={`map-legend__item map-legend__item--button${isActive ? " map-legend__item--active" : ""}`}
                        onClick={() => toggleVariant(item.variant)}
                        aria-pressed={isActive}
                      >
                        <span className="map-legend__dot" style={{ backgroundColor: item.color }} />
                        <span>{getVariantLabel(item.variant)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>

        {activePin && zoomPreviewStories.length > 0 && !activeCardAnchorStoryId ? (
          <MapZoomPreview
            pin={activePin}
            stories={zoomPreviewStories}
            activeStoryId={activePointId}
            onOpenStory={(storyId) => {
              setActivePointId(storyId);
              setSelectionSource("manual");
              setActiveCardAnchorStoryId(storyId);
              setZoomPreviewStoryId(null);
            }}
            onClose={handleDismissActiveSelection}
          />
        ) : null}

        {activePin && activePrimaryStory && activeCardLayout && !activeEdgeIndicator && Boolean(activeCardAnchorStoryId) ? (
          <MapActiveCard
            key={isAutoplayEnabled ? `autoplay-${activePrimaryStory.id}` : `manual-${activePrimaryStory.id}`}
            pin={activePin}
            story={activePrimaryStory}
            nearbyStories={activeCardStories}
            currentStoryIndex={activeCardStoryIndex}
            layout={activeCardLayout}
            autoplayDurationMs={isAutoplayEnabled ? autoplayIntervalMs : null}
            onClose={handleDismissActiveSelection}
            onStorySelect={(storyId) => {
              stopAutoplay();
              onStorySelect(storyId);
            }}
            onSelectNearbyStory={handleMoveWithinActiveCard}
          />
        ) : null}
      </div>
    </section>
  );
}
