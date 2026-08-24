import { useEffect, useRef, useState } from "react";

type HlsPlayer = {
  attachMedia: (media: HTMLMediaElement) => void;
  destroy: () => void;
  loadSource: (source: string) => void;
};

const VISIBILITY_THRESHOLD = 0.35;
const VISIBILITY_ROOT_MARGIN = "20% 0px";

const tryPlay = async (media: HTMLVideoElement) => {
  try {
    await media.play();
    return true;
  } catch {
    return false;
  }
};

const resetMedia = (media: HTMLVideoElement) => {
  media.pause();
  media.removeAttribute("src");
  media.load();
};

const attachStreamSource = async (
  media: HTMLVideoElement,
  url: string,
): Promise<() => void> => {
  let cancelled = false;
  let hls: HlsPlayer | null = null;

  if (media.canPlayType("application/vnd.apple.mpegurl")) {
    media.src = url;
    media.load();
  } else {
    const hlsModule = await import("hls.js");
    const Hls = hlsModule.default;

    if (!cancelled) {
      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true });
        hls.loadSource(url);
        hls.attachMedia(media);
      } else {
        media.src = url;
        media.load();
      }
    }
  }

  return () => {
    cancelled = true;
    hls?.destroy();
    resetMedia(media);
  };
};

export function useFeedVideoPlayer(url: string) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasVideoFrame, setHasVideoFrame] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;

    if (!section) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry?.isIntersecting ?? false);
      },
      {
        threshold: VISIBILITY_THRESHOLD,
        rootMargin: VISIBILITY_ROOT_MARGIN,
      },
    );

    observer.observe(section);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const media = videoRef.current;

    if (!media) {
      return;
    }

    let detachSource = () => {};

    void attachStreamSource(media, url).then((cleanup) => {
      detachSource = cleanup;
    });

    return () => {
      detachSource();
    };
  }, [url]);

  useEffect(() => {
    const media = videoRef.current;

    if (!media) {
      return;
    }

    media.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    const media = videoRef.current;

    if (!media) {
      return;
    }

    const syncPlaybackState = () => {
      setIsPlaying(!media.paused);
    };

    const syncFrameState = () => {
      setHasVideoFrame(true);
    };

    const syncProgress = () => {
      setCurrentTime(media.currentTime || 0);
      setDuration(media.duration || 0);
    };

    media.addEventListener("play", syncPlaybackState);
    media.addEventListener("pause", syncPlaybackState);
    media.addEventListener("loadeddata", syncFrameState);
    media.addEventListener("playing", syncFrameState);
    media.addEventListener("timeupdate", syncProgress);
    media.addEventListener("loadedmetadata", syncProgress);
    media.addEventListener("durationchange", syncProgress);

    return () => {
      media.removeEventListener("play", syncPlaybackState);
      media.removeEventListener("pause", syncPlaybackState);
      media.removeEventListener("loadeddata", syncFrameState);
      media.removeEventListener("playing", syncFrameState);
      media.removeEventListener("timeupdate", syncProgress);
      media.removeEventListener("loadedmetadata", syncProgress);
      media.removeEventListener("durationchange", syncProgress);
    };
  }, []);

  useEffect(() => {
    const media = videoRef.current;

    if (!media) {
      return;
    }

    if (!isVisible) {
      media.pause();
      return;
    }

    void tryPlay(media).then((didPlay) => {
      if (!didPlay) {
        setIsPlaying(false);
      }
    });
  }, [isVisible]);

  useEffect(() => {
    const media = videoRef.current;

    if (!media) {
      return;
    }

    const handleCanPlay = () => {
      if (!isVisible) {
        return;
      }

      void tryPlay(media).then((didPlay) => {
        if (!didPlay) {
          setIsPlaying(false);
        }
      });
    };

    media.addEventListener("canplay", handleCanPlay);

    return () => {
      media.removeEventListener("canplay", handleCanPlay);
    };
  }, [isVisible]);

  const toggleMuted = () => {
    setIsMuted((current) => !current);
  };

  const togglePlayback = async () => {
    const media = videoRef.current;

    if (!media) {
      return;
    }

    if (media.paused) {
      const didPlay = await tryPlay(media);
      if (!didPlay) {
        setIsPlaying(false);
      }
      return;
    }

    media.pause();
  };

  const seekToRatio = (ratio: number) => {
    const media = videoRef.current;

    if (!media || duration <= 0) {
      return;
    }

    const safeRatio = Math.max(0, Math.min(ratio, 1));
    media.currentTime = duration * safeRatio;
  };

  return {
    sectionRef,
    videoRef,
    hasVideoFrame,
    isMuted,
    isPlaying,
    progress: duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0,
    remainingTime: Math.max(duration - currentTime, 0),
    toggleMuted,
    togglePlayback,
    seekToRatio,
  };
}
