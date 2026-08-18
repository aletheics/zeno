/**
 * ZenoBlob — a tiny "living" presence mark that morphs with the agent run state.
 *
 * The rendering core is deliberately clock-free and framework-free (the same
 * idea as bloub's engine): `sampleBlob(t, state)` is a pure function of time and
 * state, so a frozen frame and a running loop produce the identical image, and
 * it can be tested with no DOM. React only drives the rAF loop and the SVG.
 *
 * The silhouette is Zeno's own (a soft superellipse + state-driven wobble) and
 * paints with `currentColor`, so callers control it via Tailwind `text-*`.
 * Eyes are holes in an SVG <mask>, not shapes painted on top — they clip to
 * whatever sits behind the mark.
 */
import { useEffect, useId, useState } from "react";
import type { ThreadRunState } from "../lib/timeline.ts";
import { cn } from "../lib/utils.ts";

/** Silhouette radius in the 100×100 viewBox. */
const R = 36;
/** Angular samples for the outline (smoothed by Catmull-Rom below). */
const SAMPLES = 24;
const EYE_GAP = 10; // half-distance between eye centres
const EYE_Y = 46;
const EYE_RX = 7;
const EYE_RY = 9;
const BLINK_PERIOD = 2.6;
const BLINK_DUR = 0.16;

type BlobPose = {
  /** Radial wobble amplitude (fraction of R). */
  wobble: number;
  /** Wobble phase speed (rad/s). */
  speed: number;
  /** Uniform scale; <1 reads as deflated/withdrawn. */
  scale: number;
  /** Base eye openness 0..1 (before the periodic blink). */
  eyes: number;
  /** Show the orbiting comet dot. */
  comet: boolean;
  /** Comet angular speed (rad/s). */
  cometSpeed: number;
};

function poseFor(state: ThreadRunState): BlobPose {
  switch (state) {
    case "running":
      return { wobble: 0.1, speed: 3.2, scale: 1, eyes: 1, comet: true, cometSpeed: 2.4 };
    case "recovering":
      return { wobble: 0.06, speed: 1.6, scale: 0.94, eyes: 1, comet: false, cometSpeed: 0 };
    case "waiting":
      return { wobble: 0.035, speed: 0.8, scale: 1, eyes: 0.55, comet: false, cometSpeed: 0 };
    case "completed":
      return { wobble: 0.03, speed: 0.6, scale: 1.05, eyes: 1, comet: false, cometSpeed: 0 };
    case "failed":
    case "crashed":
      return { wobble: 0.03, speed: 0.5, scale: 0.85, eyes: 0.7, comet: false, cometSpeed: 0 };
    case "aborted":
      return { wobble: 0.02, speed: 0.4, scale: 0.9, eyes: 0.8, comet: false, cometSpeed: 0 };
    default:
      return { wobble: 0.05, speed: 1.2, scale: 1, eyes: 1, comet: false, cometSpeed: 0 };
  }
}

/** Superellipse base with three wobble harmonics (integer frequency → closed). */
function radiusAt(theta: number, t: number, pose: BlobPose): number {
  const w = pose.wobble;
  return (
    1 +
    w * 0.6 * Math.sin(2 * theta + pose.speed * t) +
    w * 0.4 * Math.sin(3 * theta - pose.speed * 0.7 * t) +
    w * 0.3 * Math.sin(4 * theta + pose.speed * 0.45 * t + 1)
  );
}

/** Open → closed → open over BLINK_DUR at the top of each period. */
function blinkOpenness(t: number): number {
  const c = t % BLINK_PERIOD;
  if (c < BLINK_DUR) return 1 - Math.sin((Math.PI * c) / BLINK_DUR);
  return 1;
}

/** Catmull-Rom → cubic Bézier, closed; yields a smooth blob from sampled radii. */
function catmullRomClosed(points: Array<{ x: number; y: number }>): string {
  const n = points.length;
  if (n < 3) return "";
  const at = (i: number) => points[((i % n) + n) % n]!;
  const fmt = (v: number) => v.toFixed(2);
  let d = `M ${fmt(at(0).x)} ${fmt(at(0).y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${fmt(c1x)} ${fmt(c1y)}, ${fmt(c2x)} ${fmt(c2y)}, ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return `${d} Z`;
}

export type BlobFrame = {
  d: string;
  eyeL: { cx: number; cy: number; rx: number; ry: number };
  eyeR: { cx: number; cy: number; rx: number; ry: number };
  trail: Array<{ cx: number; cy: number; opacity: number }>;
};

/** Pure function of time + state → one rendered frame. */
export function sampleBlob(t: number, state: ThreadRunState): BlobFrame {
  const pose = poseFor(state);

  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < SAMPLES; i++) {
    const theta = (i / SAMPLES) * Math.PI * 2;
    const rr = radiusAt(theta, t, pose) * pose.scale * R;
    points.push({ x: 50 + Math.cos(theta) * rr, y: 50 + Math.sin(theta) * rr });
  }

  const open = pose.eyes * blinkOpenness(t);
  const ry = Math.max(0.35, EYE_RY * open);
  // Gaze drifts only while the comet orbits (the "busy" look).
  const gx = pose.comet ? Math.sin(t * 0.9) * 2.2 : 0;
  const gy = pose.comet ? Math.sin(t * 0.6) * 1.4 : 0;
  const eye = (side: -1 | 1) => ({
    cx: 50 + side * EYE_GAP + gx,
    cy: EYE_Y + gy,
    rx: EYE_RX,
    ry,
  });

  const trail: BlobFrame["trail"] = [];
  if (pose.comet) {
    for (let i = 0; i < 3; i++) {
      const ang = t * pose.cometSpeed - i * 0.3;
      trail.push({
        cx: 50 + Math.cos(ang) * (R + 8),
        cy: 50 + Math.sin(ang) * (R + 8),
        opacity: 0.9 - i * 0.3,
      });
    }
  }

  return { d: catmullRomClosed(points), eyeL: eye(-1), eyeR: eye(1), trail };
}

/** States that keep the loop running; terminal/idle states render one frame. */
const ANIMATED_STATES: ReadonlySet<ThreadRunState> = new Set(["running", "recovering", "waiting"]);

export function ZenoBlob(props: { state: ThreadRunState; className?: string }) {
  const { state } = props;
  const maskId = `zeno-blob-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [frame, setFrame] = useState<BlobFrame>(() => sampleBlob(0, state));
  const animated = ANIMATED_STATES.has(state);

  useEffect(() => {
    if (!animated) {
      setFrame(sampleBlob(0, state));
      return;
    }
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof requestAnimationFrame !== "function") {
      setFrame(sampleBlob(0, state));
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      // Suspends while hidden, mirroring how the browser throttles rAF there.
      if (!document.hidden) setFrame(sampleBlob((now - t0) / 1000, state));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animated, state]);

  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={cn("size-3 shrink-0", props.className)}
    >
      <defs>
        <mask id={maskId}>
          <rect width="100" height="100" fill="white" />
          <ellipse
            cx={frame.eyeL.cx}
            cy={frame.eyeL.cy}
            rx={frame.eyeL.rx}
            ry={frame.eyeL.ry}
            fill="black"
          />
          <ellipse
            cx={frame.eyeR.cx}
            cy={frame.eyeR.cy}
            rx={frame.eyeR.rx}
            ry={frame.eyeR.ry}
            fill="black"
          />
        </mask>
      </defs>
      <path d={frame.d} fill="currentColor" mask={`url(#${maskId})`} />
      {frame.trail.map((dot, i) => (
        <circle key={i} cx={dot.cx} cy={dot.cy} r={2.6} fill="currentColor" opacity={dot.opacity} />
      ))}
    </svg>
  );
}
