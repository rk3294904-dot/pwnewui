"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Loader2,
  Gauge,
  RotateCcw,
  RotateCw,
  FileText,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamResolution } from "./player-view";

interface NoteDoc {
  id: string;
  name: string;
  url: string;
  note?: string;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function NativePlayer({
  stream,
  title,
  notes,
  onPosition,
  onOpenNote,
  fullPage = false,
}: {
  stream: StreamResolution;
  title: string;
  notes?: NoteDoc[];
  onPosition?: (seconds: number) => void;
  onOpenNote?: (url: string, name: string) => void;
  fullPage?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showSpeed, setShowSpeed] = useState(false);
  const [qualities, setQualities] = useState<{ id: string; label: string }[]>([]);
  const [quality, setQuality] = useState("auto");
  const qualityControlRef = useRef<((id: string) => void) | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [showSlides, setShowSlides] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const speedRef = useRef(speed);
  const positionRef = useRef(onPosition);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    speedRef.current = speed;
    positionRef.current = onPosition;
  }, [speed, onPosition]);

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!videoRef.current?.paused) setShowControls(false);
    }, 2800);
  }, []);
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  /* ---- attach hls.js / dash.js ---- */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let destroyed = false;
    let dispose: (() => void) | undefined;
    let managedStream = false;
    setLoading(true);
    setError(null);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setQualities([]);
    setQuality("auto");
    qualityControlRef.current = null;

    const fail = (message: string) => {
      if (destroyed) return;
      setError(message);
      setLoading(false);
    };
    const handleLoaded = () => {
      if (destroyed) return;
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setLoading(false);
      setError(null);
      video.playbackRate = speedRef.current;
    };
    const handleTime = () => {
      if (destroyed) return;
      setCurrent(video.currentTime);
      if (video.buffered.length) {
        try {
          setBuffered(video.buffered.end(video.buffered.length - 1));
        } catch {
          /* ignore */
        }
      }
      positionRef.current?.(video.currentTime);
    };
    const handlePlay = () => !destroyed && setPlaying(true);
    const handlePause = () => !destroyed && setPlaying(false);
    const handleErr = () => {
      // Adaptive players handle recoverable media errors themselves.
      if (managedStream || destroyed) return;
      const code = video.error?.code;
      fail(code === 2
        ? "The video could not be downloaded. Check your connection and retry."
        : code === 3
          ? "This browser could not decode the video. Retry or use the PW Player."
          : "The video source is unavailable or unsupported. Retry or use the PW Player.");
    };

    video.addEventListener("loadedmetadata", handleLoaded);
    video.addEventListener("timeupdate", handleTime);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("error", handleErr);

    (async () => {
      try {
        if (stream.kind === "hls") {
          const Hls = (await import("hls.js")).default;
          if (destroyed) return;
          // Prefer hls.js when MediaSource is available. Some browsers advertise
          // native HLS support but cannot play these proxied encrypted playlists.
          if (Hls.isSupported()) {
            managedStream = true;
            const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
            dispose = () => hls.destroy();
            qualityControlRef.current = (id) => {
              // nextLevel switches without restarting playback or seeking.
              hls.nextLevel = id === "auto" ? -1 : Number(id);
            };
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              if (destroyed) return;
              setQualities(hls.levels.map((level, index) => ({
                id: String(index),
                label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)} kbps`,
              })));
            });
            let networkRetries = 0;
            let mediaRetries = 0;
            hls.on(Hls.Events.ERROR, (_event, data) => {
              if (destroyed || !data.fatal) return;
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries++ < 2) {
                hls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries++ < 2) {
                hls.recoverMediaError();
              } else {
                fail("The stream could not be loaded. Retry or use the PW Player.");
              }
            });
            hls.loadSource(stream.url);
            hls.attachMedia(video);
          } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = stream.url;
            video.load();
          } else {
            fail("HLS is not supported in this browser. Use the PW Player.");
          }
        } else if (stream.kind === "dash") {
          const { MediaPlayer } = await import("dashjs");
          if (destroyed) return;
          managedStream = true;
          const player = MediaPlayer().create();
          dispose = () => player.reset();
          player.on(MediaPlayer.events.ERROR, () => {
            fail("The DASH stream could not be loaded. Retry or use the PW Player.");
          });
          qualityControlRef.current = (id) => {
            player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: id === "auto" } } } });
            if (id !== "auto") player.setRepresentationForTypeById("video", id);
          };
          player.on(MediaPlayer.events.STREAM_INITIALIZED, () => {
            if (destroyed) return;
            setQualities(player.getRepresentationsByType("video").map((representation) => ({
              id: representation.id,
              label: representation.height ? `${representation.height}p` : `${Math.round(representation.bitrateInKbit)} kbps`,
            })));
          });
          player.initialize(video, undefined, false);
          if (stream.clearKey && stream.clearKid) {
            player.setProtectionData({
              "org.w3.clearkey": {
                clearkeys: { [stream.clearKid]: stream.clearKey },
              },
            });
          }
          player.attachSource(stream.url);
        } else {
          video.src = stream.url;
          video.load();
        }
      } catch {
        fail("Could not initialize the player. Retry or use the PW Player.");
      }
    })();

    return () => {
      destroyed = true;
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("timeupdate", handleTime);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("error", handleErr);
      qualityControlRef.current = null;
      dispose?.();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [stream.url, stream.kind, stream.clearKey, stream.clearKid, attempt]);

  /* ---- fullscreen tracking ---- */
  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play().catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError("Playback could not start. Retry or use the PW Player.");
        setLoading(false);
      });
    }
    else v.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else if (el.requestFullscreen) {
      void el.requestFullscreen().catch(() => {});
    } else {
      // iPhone Safari exposes fullscreen on the video rather than its wrapper.
      const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
      video?.webkitEnterFullscreen?.();
    }
  }, []);

  const changeSpeed = useCallback((s: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = s;
    setSpeed(s);
    setShowSpeed(false);
  }, []);

  const skip = useCallback((offset: number) => {
    const video = videoRef.current;
    if (!video || video.readyState === 0) return;
    const start = video.seekable.length ? video.seekable.start(0) : 0;
    const end = Number.isFinite(video.duration)
      ? video.duration
      : video.seekable.length ? video.seekable.end(video.seekable.length - 1) : video.currentTime;
    const next = Math.min(end, Math.max(start, video.currentTime + offset));
    video.currentTime = next;
    setCurrent(next);
  }, []);

  // Keyboard shortcuts (full-page / fullscreen focus)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          revealControls();
          break;
        case "ArrowLeft":
          skip(-5);
          revealControls();
          break;
        case "ArrowRight":
          skip(5);
          revealControls();
          break;
        case "j":
          skip(-10);
          revealControls();
          break;
        case "l":
          skip(10);
          revealControls();
          break;
        case "m":
          toggleMute();
          revealControls();
          break;
        case "f":
          toggleFullscreen();
          break;
        case "ArrowUp":
          e.preventDefault();
          if (v.volume < 1) v.volume = Math.min(1, v.volume + 0.1);
          revealControls();
          break;
        case "ArrowDown":
          e.preventDefault();
          if (v.volume > 0) v.volume = Math.max(0, v.volume - 0.1);
          revealControls();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, toggleMute, toggleFullscreen, skip, revealControls]);

  const fmt = (s: number) => {
    if (!s || !isFinite(s)) return "0:00";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const onSeekBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    v.currentTime = ratio * duration;
    setCurrent(v.currentTime);
    revealControls();
  };

  const containerClass = fullPage
    ? "sb-native-player relative w-full h-full min-w-0 min-h-0 bg-black overflow-hidden select-none group"
    : "sb-native-player relative w-full min-w-0 bg-black rounded-2xl overflow-hidden border border-white/10 select-none group";

  return (
    <div
      ref={containerRef}
      className={containerClass}
      onMouseMove={revealControls}
      onMouseLeave={() => playing && setShowControls(false)}
      onDoubleClick={toggleFullscreen}
    >
      <video
        ref={videoRef}
        className={cn(
          "sb-native-video w-full object-contain bg-black",
          fullPage ? "h-full max-h-full" : "aspect-video"
        )}
        playsInline
        onClick={(e) => {
          // single tap toggles play; double tap handled by container for fullscreen
          if (e.detail === 1) togglePlay();
          revealControls();
        }}
      />

      {/* loading */}
      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60">
          <Loader2 size={36} className="text-[#4a9eff] animate-spin" />
        </div>
      )}

      {/* big play overlay when paused (full-page) */}
      {fullPage && !loading && !error && !playing && (
        <button
          onClick={togglePlay}
          aria-label="Play"
          className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/15 backdrop-blur-md text-white hover:scale-105 hover:bg-white/25 transition-transform">
            <Play size={34} />
          </span>
        </button>
      )}

      {/* error */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 px-6 text-center">
          <p role="alert" className="max-w-md text-sm text-white/85">{error}</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="mt-4 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25 cursor-pointer"
          >
            Retry playback
          </button>
        </div>
      )}

      {/* slides toggle (top-right, below the floating close bar) */}
      {notes && notes.length > 0 && (
        <button
          onClick={() => setShowSlides((s) => !s)}
          className={cn(
            "absolute z-20 flex items-center gap-1.5 rounded-full glass-soft px-3 py-1.5 text-xs font-semibold text-white/90 transition-colors hover:bg-white/15 cursor-pointer",
            fullPage ? "top-14 right-3" : "top-3 left-3"
          )}
        >
          <FileText size={13} /> Slides
          <span className="rounded-full bg-white/15 px-1.5 text-[10px]">{notes.length}</span>
        </button>
      )}

      {/* slides panel */}
      {showSlides && notes && notes.length > 0 && (
        <div className={cn("absolute z-30 w-64 max-w-[80%] rounded-2xl glass border border-white/10 shadow-2xl overflow-hidden", fullPage ? "top-24 right-3" : "top-12 left-3")}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
            <span className="text-xs font-bold text-white/90">Lecture Slides</span>
            <button onClick={() => setShowSlides(false)} className="text-white/60 hover:text-white cursor-pointer">
              <X size={14} />
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto sb-scroll">
            {notes.map((n) => (
              <button
                key={n.id}
                onClick={() => onOpenNote?.(n.url, n.name)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/8 border-b border-white/5 last:border-0 cursor-pointer"
              >
                <span className="w-8 h-8 rounded-lg glass-soft flex items-center justify-center text-[#4a9eff] shrink-0">
                  <FileText size={13} />
                </span>
                <span className="min-w-0 flex-1 text-[12px] font-medium text-white/85 line-clamp-1">{n.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* controls */}
      {!error && (
        <div
          className={cn(
            "sb-player-controls absolute left-0 right-0 bottom-0 z-20 px-3 pb-2 pt-6 bg-gradient-to-t from-black/95 via-black/70 to-transparent transition-opacity duration-200",
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          {/* seek bar with buffered indicator */}
          <div className="group/seek mb-1.5 flex items-center gap-2">
            <span className="text-[11px] tabular-nums text-white/85 w-12 text-right">{fmt(current)}</span>
            <div
              className="relative flex-1 h-5 cursor-pointer touch-pan-x flex items-center"
              onClick={onSeekBarClick}
              role="slider"
              aria-label="Seek"
              aria-valuenow={Math.round(current)}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              tabIndex={0}
            >
              <div className="relative h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
                {buffered > 0 && duration > 0 && (
                  <div
                    className="absolute top-0 left-0 h-full bg-white/35"
                    style={{ width: `${Math.min(100, (buffered / duration) * 100)}%` }}
                  />
                )}
                <div
                  className="absolute top-0 left-0 h-full bg-[#4a9eff]"
                  style={{ width: `${duration > 0 ? (current / duration) * 100 : 0}%` }}
                />
              </div>
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full bg-white shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity"
                style={{ left: `${duration > 0 ? (current / duration) * 100 : 0}%` }}
              />
            </div>
            <span className="text-[11px] tabular-nums text-white/85 w-12">{fmt(duration)}</span>
          </div>

          {/* buttons */}
          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            <button onClick={() => { togglePlay(); revealControls(); }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-white/10 hover:text-white cursor-pointer focus-visible:ring-2 focus-visible:ring-[#7cc0ff]" aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button type="button" onClick={() => { skip(-10); revealControls(); }} disabled={loading} aria-label="Rewind 10 seconds" title="Rewind 10 seconds" className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-white/10 cursor-pointer disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[#7cc0ff]">
              <RotateCcw size={25} aria-hidden="true" />
              <span className="absolute text-[9px] font-bold" aria-hidden="true">10</span>
            </button>
            <button type="button" onClick={() => { skip(10); revealControls(); }} disabled={loading} aria-label="Forward 10 seconds" title="Forward 10 seconds" className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-white/10 cursor-pointer disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[#7cc0ff]">
              <RotateCw size={25} aria-hidden="true" />
              <span className="absolute text-[9px] font-bold" aria-hidden="true">10</span>
            </button>
            <button onClick={() => { toggleMute(); revealControls(); }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-white/10 hover:text-white cursor-pointer focus-visible:ring-2 focus-visible:ring-[#7cc0ff]" aria-label={muted ? "Unmute" : "Mute"}>
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>

            {/* speed */}
            <div className="relative">
              <button
                onClick={() => setShowSpeed((s) => !s)}
                className="flex min-h-11 items-center gap-1 rounded-full glass-soft px-3 py-1 text-[11px] font-bold text-white/90 hover:bg-white/15 transition-colors cursor-pointer"
                aria-label="Playback speed"
              >
                <Gauge size={12} /> {speed}x
              </button>
              {showSpeed && (
                <div className="absolute bottom-full mb-2 left-0 max-h-32 overflow-y-auto rounded-xl bg-[#0c172b] border border-white/10 shadow-2xl py-1 min-w-[110px]">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      onClick={() => { changeSpeed(s); revealControls(); }}
                      className={cn(
                        "w-full min-h-11 px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-white/10 cursor-pointer",
                        s === speed ? "text-[#4a9eff]" : "text-white/80"
                      )}
                    >
                      {s}x{s === 1 && " (Normal)"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label className="flex min-h-11 items-center gap-1 rounded-full glass-soft px-2 text-[11px] font-bold text-white/90" title={qualities.length ? "Video quality" : "Quality is managed by the browser or video source"}>
              <span>Quality</span>
              <select
                aria-label="Video quality"
                value={quality}
                disabled={qualities.length === 0}
                onChange={(event) => {
                  const id = event.target.value;
                  qualityControlRef.current?.(id);
                  setQuality(id);
                  revealControls();
                }}
                className="min-h-11 max-w-28 bg-transparent cursor-pointer focus-visible:outline-2 focus-visible:outline-[#7cc0ff] disabled:cursor-default disabled:opacity-60"
              >
                <option value="auto" className="bg-[#0c172b]">Auto</option>
                {qualities.map((option) => (
                  <option key={option.id} value={option.id} className="bg-[#0c172b]">{option.label}</option>
                ))}
              </select>
            </label>
            <div className="flex-1" />
            <span className="text-[11px] font-medium text-white/70 line-clamp-1 hidden sm:block max-w-[40%]">{title}</span>
            <button onClick={toggleFullscreen} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-white/10 hover:text-white cursor-pointer focus-visible:ring-2 focus-visible:ring-[#7cc0ff]" aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
              {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
