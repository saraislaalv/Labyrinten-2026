import { useEffect, useRef } from "react";
import Markdown from "react-markdown";
import type { StoryWithArticles } from "../types/feed";

type StoryFeedItemProps = {
  story: StoryWithArticles;
  isSelected?: boolean;
  onHoldPreviewStart?: () => void;
  onHoldPreviewEnd?: () => void;
  onSwipeToMap?: () => void;
};

const HOLD_PREVIEW_DELAY_MS = 240;
const HOLD_MOVE_CANCEL_PX = 12;

export function StoryFeedItem({
  story,
  isSelected = false,
  onHoldPreviewStart,
  onHoldPreviewEnd,
  onSwipeToMap,
}: StoryFeedItemProps) {
  const frontSummary = story.components.front_summary;
  const title = frontSummary?.title ?? story.title;
  const summary = frontSummary?.summary ?? "";
  const tag = frontSummary?.tag ?? "";
  const primaryImage = story.images_v2[0];
  const hasMap = Array.isArray(story.maps) && story.maps.length > 0;
  const holdTimeoutRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const isPreviewActiveRef = useRef(false);

  function clearHoldTimer() {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  }

  function cancelPreview() {
    clearHoldTimer();

    if (isPreviewActiveRef.current) {
      isPreviewActiveRef.current = false;
      onHoldPreviewEnd?.();
    }
  }

  function resetGesture() {
    cancelPreview();

    pointerStartRef.current = null;
  }

  useEffect(() => resetGesture, []);

  return (
    <section
      className="feed-item feed-item--story"
      data-feed-item-id={story.id}
      data-feed-item
      data-kind="story"
      data-category={story.category}
      data-selected={isSelected ? "true" : "false"}
      onPointerDown={(event) => {
        if (!onHoldPreviewStart) {
          return;
        }

        if (event.pointerType === "mouse" && event.button !== 0) {
          return;
        }

        resetGesture();
        pointerStartRef.current = { x: event.clientX, y: event.clientY };
        holdTimeoutRef.current = window.setTimeout(() => {
          isPreviewActiveRef.current = true;
          onHoldPreviewStart();
        }, HOLD_PREVIEW_DELAY_MS);
      }}
      onPointerMove={(event) => {
        const pointerStart = pointerStartRef.current;

        if (!pointerStart) {
          return;
        }

        const deltaX = event.clientX - pointerStart.x;
        const deltaY = event.clientY - pointerStart.y;
        const absDeltaX = Math.abs(deltaX);
        const absDeltaY = Math.abs(deltaY);

        if (absDeltaX >= HOLD_MOVE_CANCEL_PX || absDeltaY >= HOLD_MOVE_CANCEL_PX) {
          cancelPreview();
        }
      }}
      onPointerUp={resetGesture}
      onPointerCancel={resetGesture}
      onPointerLeave={resetGesture}
      onContextMenu={(event) => {
        if (isPreviewActiveRef.current) {
          event.preventDefault();
        }
      }}
    >
      {primaryImage ? (
        <img
          className="feed-item__image"
          src={primaryImage.url}
          alt={primaryImage.caption || title}
        />
      ) : (
        <div
          className="feed-item__image feed-item__image--fallback"
          aria-hidden="true"
        />
      )}

      <div className="feed-item__overlay" />

      <div className="feed-item__inner feed-item__inner--story">
        <div className="story-stack">
          <div className="story-tag-row">
            {tag && <p className="story-tag">{tag}</p>}
            {hasMap && (
              <button
              type="button"
              className="story-hold-hint story-hold-hint--button"
              aria-label="Sveip til kart"
              onPointerDown={(event) => {
                event.stopPropagation();
                resetGesture();
              }}
              onClick={(event) => {
                event.stopPropagation();
                onSwipeToMap?.();
              }}
              >
              <span>Kart</span>
              <span className="story-hold-hint__swipe" aria-hidden="true">👉</span>
            </button>
            )}
          </div>

          <article className="story-card">
            <h2 className="story-card__title">{title}</h2>

            {summary && (
              <div className="story-card__summary">
                <Markdown>{summary}</Markdown>
              </div>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}
