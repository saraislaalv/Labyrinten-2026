import { useCallback, useState } from "react";
import {
  TOPIC_VARIANT_LEGEND,
  getTopicVariantLabel,
  type TopicVariant,
} from "./topicVariants";
import "./TopicMapFilter.css";

type TopicMapFilterProps = {
  activeVariants: Set<TopicVariant>;
  onToggleVariant: (variant: TopicVariant) => void;
};

export function useTopicVariantFilter() {
  const [activeVariants, setActiveVariants] = useState<Set<TopicVariant>>(new Set());

  const toggleVariant = useCallback((variant: TopicVariant) => {
    setActiveVariants((prev) => {
      const next = new Set(prev);

      if (next.has(variant)) {
        next.delete(variant);
      } else {
        next.add(variant);
      }

      return next;
    });
  }, []);

  return { activeVariants, toggleVariant };
}

export function TopicMapFilter({ activeVariants, onToggleVariant }: TopicMapFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {isOpen ? (
        <button
          type="button"
          className="topic-filter-backdrop"
          aria-label="Lukk filter"
          onClick={() => {
            setIsOpen(false);
          }}
        />
      ) : null}

      <div className="topic-filter-overlay">
        <div className="topic-filter-wrapper">
          <button
            type="button"
            className="topic-filter-button"
            aria-expanded={isOpen}
            aria-controls="topic-filter-dropdown"
            onClick={() => {
              setIsOpen((current) => !current);
            }}
          >
            <span className="topic-filter-button__icon" aria-hidden="true">
              |||
            </span>
            <span>Filtrer</span>
          </button>

          <div
            id="topic-filter-dropdown"
            className={`topic-filter-dropdown${isOpen ? " topic-filter-dropdown--open" : ""}`}
            aria-label="Filtrer kategorier"
          >
            <ul className="topic-filter-legend" aria-label="Kategori og farge">
              {TOPIC_VARIANT_LEGEND.map((item) => {
                const isActive = activeVariants.has(item.variant);
                return (
                  <li key={item.variant}>
                    <button
                      type="button"
                      className={`topic-filter-legend__item${isActive ? " topic-filter-legend__item--active" : ""}`}
                      onClick={() => {
                        onToggleVariant(item.variant);
                      }}
                      aria-pressed={isActive}
                    >
                      <span className="topic-filter-legend__dot" style={{ backgroundColor: item.color }} />
                      <span>{getTopicVariantLabel(item.variant)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
