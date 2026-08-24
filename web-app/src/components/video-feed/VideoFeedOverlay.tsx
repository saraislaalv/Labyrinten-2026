import type { MouseEvent } from "react";

type VideoFeedOverlayProps = {
  isMuted: boolean;
  isPlaying: boolean;
  progress: number;
  remainingTime: number;
  title: string;
  onSeekToRatio: (ratio: number) => void;
  onToggleMuted: () => void;
  onTogglePlayback: () => void | Promise<void>;
};

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M8 5.5v13l10-6.5z" />
    </svg>
  );
}

function VolumeOnIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M14.5 5.5a.75.75 0 0 1 1.28-.53A9.3 9.3 0 0 1 18.5 12a9.3 9.3 0 0 1-2.72 7.03.75.75 0 1 1-1.06-1.06A7.8 7.8 0 0 0 17 12a7.8 7.8 0 0 0-2.28-5.97.75.75 0 0 1-.22-.53ZM12 3.6a.75.75 0 0 1 1.28-.53A12 12 0 0 1 16.75 12a12 12 0 0 1-3.47 8.93.75.75 0 1 1-1.06-1.06A10.5 10.5 0 0 0 15.25 12a10.5 10.5 0 0 0-3.03-7.87.75.75 0 0 1-.22-.53ZM4.25 9.5H7.8l4.12-3.54A.75.75 0 0 1 13.15 6.5v11a.75.75 0 0 1-1.23.57L7.8 14.5H4.25a.75.75 0 0 1-.75-.75v-3.5a.75.75 0 0 1 .75-.75Z"
      />
    </svg>
  );
}

function VolumeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4.25 9.5H7.8l4.12-3.54A.75.75 0 0 1 13.15 6.5v11a.75.75 0 0 1-1.23.57L7.8 14.5H4.25a.75.75 0 0 1-.75-.75v-3.5a.75.75 0 0 1 .75-.75Zm11.28-.28a.75.75 0 0 1 1.06 0L18 10.69l1.41-1.47a.75.75 0 1 1 1.08 1.04L19.08 11.75l1.41 1.47a.75.75 0 0 1-1.08 1.04L18 12.81l-1.41 1.45a.75.75 0 1 1-1.08-1.04l1.41-1.47-1.39-1.49a.75.75 0 0 1 0-1.04Z"
      />
    </svg>
  );
}

function formatTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0:00";
  }

  const rounded = Math.floor(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function VideoFeedOverlay({
  isMuted,
  isPlaying,
  progress,
  remainingTime,
  title,
  onSeekToRatio,
  onToggleMuted,
  onTogglePlayback,
}: VideoFeedOverlayProps) {
  const handleSeek = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    onSeekToRatio(ratio);
  };

  return (
    <div className="video-ui">
      <button
        type="button"
        className="video-ui__surface"
        onClick={onTogglePlayback}
        aria-label={isPlaying ? "Pause video" : "Play video"}
      />

      {!isPlaying && (
        <button
          type="button"
          className="video-ui__center-play"
          onClick={onTogglePlayback}
          aria-label="Play video"
        >
          <PlayIcon />
        </button>
      )}

      <div className="video-ui__bottom">
        <div className="video-ui__title-row">
          <h2 className="video-ui__title">{title}</h2>

          <div className="video-ui__button-group">
            <button
              type="button"
              className="video-ui__control"
              onClick={(event) => {
                event.stopPropagation();
                onToggleMuted();
              }}
              aria-label={isMuted ? "Turn on sound" : "Mute video"}
            >
              {isMuted ? <VolumeOffIcon /> : <VolumeOnIcon />}
            </button>

            <div className="video-ui__timer" aria-live="off">
              {formatTime(remainingTime)}
            </div>
          </div>
        </div>

        <div className="video-ui__slider-wrap">
          <button
            className="video-ui__slider-hit"
            type="button"
            onClick={handleSeek}
            aria-label="Seek video"
          />
          <div className="video-ui__slider-track">
            <div className="video-ui__slider-buffer" />
            <div
              className="video-ui__slider-seen"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
