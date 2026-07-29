"use client";

import { Pause as PauseIcon, Play as PlayIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const slowConnectionTypes = new Set(["slow-2g", "2g"]);

type ConnectionInformation = Readonly<{
  addEventListener?: (type: "change", listener: () => void) => void;
  effectiveType?: string;
  removeEventListener?: (type: "change", listener: () => void) => void;
  saveData?: boolean;
}>;

type NavigatorWithConnection = Navigator &
  Readonly<{
    connection?: ConnectionInformation;
    mozConnection?: ConnectionInformation;
    webkitConnection?: ConnectionInformation;
  }>;

type HeroVideoPreference = Readonly<{
  effectiveType?: string;
  reduceMotion: boolean;
  saveData?: boolean;
}>;

export function shouldAnimateHero({
  effectiveType,
  reduceMotion,
  saveData,
}: HeroVideoPreference) {
  return (
    !reduceMotion &&
    !saveData &&
    !slowConnectionTypes.has(effectiveType?.toLowerCase() ?? "")
  );
}

function getConnection() {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  const browserNavigator = navigator as NavigatorWithConnection;

  return (
    browserNavigator.connection ??
    browserNavigator.mozConnection ??
    browserNavigator.webkitConnection
  );
}

export function HeroVideo({
  imageAlt,
  pauseLabel,
  playLabel,
}: Readonly<{
  imageAlt: string;
  pauseLabel: string;
  playLabel: string;
}>) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [playbackState, setPlaybackState] = useState<
    "loading" | "paused" | "playing" | "poster"
  >("poster");

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const motionPreference = window.matchMedia(reducedMotionQuery);
    const connection = getConnection();
    const syncPreference = () => {
      const shouldAnimate = shouldAnimateHero({
        effectiveType: connection?.effectiveType,
        reduceMotion: motionPreference.matches,
        saveData: connection?.saveData,
      });

      setVideoEnabled(shouldAnimate);
      setUserPaused(false);
      setPlaybackState(shouldAnimate ? "loading" : "poster");
    };

    syncPreference();
    motionPreference.addEventListener("change", syncPreference);
    connection?.addEventListener?.("change", syncPreference);

    return () => {
      motionPreference.removeEventListener("change", syncPreference);
      connection?.removeEventListener?.("change", syncPreference);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !videoEnabled) {
      video?.pause();
      return;
    }

    if (video.readyState === 0) {
      video.load();
    }

    if (userPaused) {
      video.pause();
      return;
    }

    const playVideo = () => {
      void video.play().catch(() => {
        setPlaybackState("poster");
      });
    };
    const syncVisibility = () => {
      if (document.hidden) {
        video.pause();
        return;
      }

      playVideo();
    };

    playVideo();
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      video.pause();
    };
  }, [userPaused, videoEnabled]);

  const togglePlayback = () => {
    if (userPaused) {
      setUserPaused(false);
      return;
    }

    videoRef.current?.pause();
    setPlaybackState("paused");
    setUserPaused(true);
  };

  const showPlaybackControl =
    playbackState === "paused" || playbackState === "playing";

  return (
    <>
      <div
        className="marketing-hero__media"
        data-hero-media-state={playbackState}
      >
        <Image
          alt={imageAlt}
          className="marketing-hero__poster"
          fill
          loading="eager"
          priority
          sizes="100vw"
          src="/media/ygf-cinematic-hero-poster.webp"
        />
        <video
          aria-hidden="true"
          autoPlay={videoEnabled}
          className="marketing-hero__video"
          disablePictureInPicture
          loop
          muted
          onError={() => setPlaybackState("poster")}
          onPlaying={() => setPlaybackState("playing")}
          playsInline
          preload={videoEnabled ? "metadata" : "none"}
          ref={videoRef}
          tabIndex={-1}
        >
          {videoEnabled ? (
            <>
              <source
                src="/media/ygf-cinematic-hero.webm"
                type="video/webm"
              />
              <source
                src="/media/ygf-cinematic-hero.mp4"
                type="video/mp4"
              />
            </>
          ) : null}
        </video>
      </div>
      {showPlaybackControl ? (
        <button
          aria-label={userPaused ? playLabel : pauseLabel}
          aria-pressed={userPaused}
          className="marketing-hero__motion-toggle"
          onClick={togglePlayback}
          type="button"
        >
          {userPaused ? (
            <PlayIcon aria-hidden="true" size={16} />
          ) : (
            <PauseIcon aria-hidden="true" size={16} />
          )}
          <span>{userPaused ? playLabel : pauseLabel}</span>
        </button>
      ) : null}
    </>
  );
}
