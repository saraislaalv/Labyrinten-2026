import type { NewsVideoItem } from "../types/feed";
import { VideoFeedOverlay } from "./video-feed/VideoFeedOverlay";
import { useFeedVideoPlayer } from "./video-feed/useFeedVideoPlayer";

type VideoFeedItemProps = {
  video: NewsVideoItem;
};

export function VideoFeedItem({ video }: VideoFeedItemProps) {
  const {
    hasVideoFrame,
    isMuted,
    isPlaying,
    progress,
    remainingTime,
    sectionRef,
    seekToRatio,
    toggleMuted,
    togglePlayback,
    videoRef,
  } = useFeedVideoPlayer(video.url);

  return (
    <section
      ref={sectionRef}
      className="feed-item feed-item--video"
      data-feed-item
      data-kind="newsVideo"
    >
      <img
        className={`feed-item__poster ${hasVideoFrame ? "feed-item__poster--hidden" : ""}`}
        src={video.thumbnail}
        alt=""
        aria-hidden="true"
      />

      <video
        ref={videoRef}
        className="feed-item__video"
        playsInline
        muted={isMuted}
        loop
        preload="auto"
        poster={video.thumbnail}
      />

      <div className="feed-item__overlay feed-item__overlay--video" />

      <div className="feed-item__inner feed-item__inner--video">
        <VideoFeedOverlay
          isMuted={isMuted}
          isPlaying={isPlaying}
          progress={progress}
          remainingTime={remainingTime}
          title={video.title}
          onSeekToRatio={seekToRatio}
          onToggleMuted={toggleMuted}
          onTogglePlayback={togglePlayback}
        />
      </div>
    </section>
  );
}
