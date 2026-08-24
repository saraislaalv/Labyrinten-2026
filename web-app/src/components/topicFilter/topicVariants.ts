import type { MapPoint } from "../../types/map";

export type TopicVariant = MapPoint["markerVariant"];

export const TOPIC_VARIANT_COLOR: Record<TopicVariant, string> = {
  conflict: "#ff4f4f",
  crime: "#ffa836",
  sport: "#9be15d",
  culture: "#f692ee",
  politics: "#33842b",
  economy: "#fdea58",
  weather: "#53b4ff",
  default: "#8f95ff",
};

export const TOPIC_VARIANT_LEGEND: Array<{ variant: TopicVariant; color: string }> = [
  { variant: "conflict", color: TOPIC_VARIANT_COLOR.conflict },
  { variant: "crime", color: TOPIC_VARIANT_COLOR.crime },
  { variant: "sport", color: TOPIC_VARIANT_COLOR.sport },
  { variant: "culture", color: TOPIC_VARIANT_COLOR.culture },
  { variant: "politics", color: TOPIC_VARIANT_COLOR.politics },
  { variant: "economy", color: TOPIC_VARIANT_COLOR.economy },
  { variant: "weather", color: TOPIC_VARIANT_COLOR.weather },
  { variant: "default", color: TOPIC_VARIANT_COLOR.default },
];

export function getTopicVariantLabel(variant: TopicVariant): string {
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
      return "Okonomi";
    case "weather":
      return "Vaer";
    default:
      return "Diverse";
  }
}

const CATEGORY_TO_VARIANT: Record<string, TopicVariant> = {
  conflict: "conflict",
  konflikt: "conflict",
  war: "conflict",
  krig: "conflict",
  crime: "crime",
  krim: "crime",
  kriminalitet: "crime",
  sport: "sport",
  culture: "culture",
  kultur: "culture",
  entertainment: "culture",
  underholdning: "culture",
  politics: "politics",
  politikk: "politics",
  economy: "economy",
  okonomi: "economy",
  consumer: "economy",
  forbruker: "economy",
  weather: "weather",
  vaer: "weather",
  vaeret: "weather",
};

export function resolveVariantFromCategory(category: string | null | undefined): TopicVariant {
  if (!category) {
    return "default";
  }

  const normalized = category.trim().toLowerCase();
  return CATEGORY_TO_VARIANT[normalized] ?? "default";
}
