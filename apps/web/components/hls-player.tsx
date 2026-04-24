"use client";

import Hls from "hls.js";
import { useEffect, useRef } from "react";

type Props = {
  src: string;
  poster?: string;
  onProgress?: (value: number) => void;
};

export default function HlsPlayer({ src, poster, onProgress }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    } else if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
    }

    const handleTimeUpdate = () => {
      if (!onProgress || !video.duration || Number.isNaN(video.duration)) return;
      const value = (video.currentTime / video.duration) * 100;
      if (!Number.isFinite(value)) return;
      onProgress(Math.max(0, Math.min(100, value)));
    };

    video.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      if (hls) hls.destroy();
    };
  }, [src, onProgress]);

  return (
    <video
      ref={videoRef}
      controls
      playsInline
      poster={poster}
      className="video-player"
    />
  );
}