import { useEffect, useRef, useState } from "react";
import "./demoVideo.css";

type DemoVideoProps = {
  src: string;
  poster: string;
  /** shown in the drawn address bar, e.g. "blackmarketreader.com/loot-split" */
  url: string;
  label: string;
};

/**
 * A recorded tool demo in a browser frame. Nothing loads until it scrolls into view; it then plays
 * muted on a loop and pauses again off screen. The button pauses it for good; reduced motion starts
 * it paused.
 */
export function DemoVideo({ src, poster, url, label }: DemoVideoProps) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [still] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  // a visitor's pause sticks: scrolling back does not start the clip again
  const [stopped, setStopped] = useState(still);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video || stopped || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void video.play().catch(() => undefined);
        else video.pause();
      },
      { threshold: 0.35 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [stopped]);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) {
      setStopped(false);
      void video.play().catch(() => undefined);
    } else {
      setStopped(true);
      video.pause();
    }
  };

  return (
    <figure className="demo-frame">
      <div className="demo-bar">
        <i aria-hidden="true" />
        <i aria-hidden="true" />
        <i aria-hidden="true" />
        <span aria-hidden="true">{url}</span>
        <button type="button" className="demo-toggle" onClick={toggle} aria-label={playing ? "Pause clip" : "Play clip"}>
          {/* drawn, not an icon font: the guides do not load Material Symbols */}
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path fill="currentColor" d={playing ? "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" : "M8 5.5v13l10.5-6.5z"} />
          </svg>
        </button>
      </div>
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="none"
        aria-label={label}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
    </figure>
  );
}
