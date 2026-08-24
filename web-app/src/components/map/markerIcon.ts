import L from "leaflet";
import type { MapPoint } from "../../types/map";

const MARKER_STYLES: Record<
  MapPoint["markerVariant"],
  {
    color: string;
    halo: string;
    icon: string;
  }
> = {
  conflict: {
    color: "#ff4f4f",
    halo: "rgba(255, 79, 79, 0.28)",
    icon: "✦",
  },
  crime: {
    color: "#ffa836",
    halo: "rgba(255, 168, 54, 0.28)",
    icon: "⚠",
  },
  sport: {
    color: "#9be15d",
    halo: "rgba(155, 225, 93, 0.28)",
    icon: "●",
  },
  culture: {
    color: "#f692ee",
    halo: "rgba(246, 146, 238, 0.28)",
    icon: "★",
  },
  politics: {
    color: "#33842b",
    halo: "rgba(51, 132, 43, 0.28)",
    icon: "⚖",
  },
  economy: {
    color: "#fdea58",
    halo: "rgba(253, 234, 88, 0.28)",
    icon: "¤",
  },
  weather: {
    color: "#53b4ff",
    halo: "rgba(83, 180, 255, 0.28)",
    icon: "≈",
  },
  default: {
    color: "#8f95ff",
    halo: "rgba(143, 149, 255, 0.28)",
    icon: "•",
  },
};

export function getMarkerStyle(variant: MapPoint["markerVariant"]) {
  return MARKER_STYLES[variant];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createMarkerIcon(
  variant: MapPoint["markerVariant"],
  isActive: boolean,
  storyCount: number,
): L.DivIcon {
  const style = MARKER_STYLES[variant];
  const iconLabel = storyCount > 1 ? String(storyCount) : style.icon;
  const sizeClass = iconLabel.length > 2 ? "story-marker__inner--small" : "";

  return L.divIcon({
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `
      <span
        class="story-marker ${isActive ? "story-marker--active" : ""}"
        style="--marker-color:${escapeHtml(style.color)};--marker-halo:${escapeHtml(style.halo)}"
        aria-hidden="true"
      >
        <span class="story-marker__inner ${sizeClass}">${escapeHtml(iconLabel)}</span>
      </span>
    `,
  });
}
