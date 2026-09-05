/**
 * Colorful orbit belts + burst sparks — port of Grok Bot / Sand `Won`
 * plus the `spinWild` 9-turn script (`Or("spinWild")`).
 *
 * Belts spawn when |d(spinAngle)/dt| crosses ~0.9 rad/s and ride a
 * tilted ellipse around the living mark, with an HSL gradient trail.
 */

import { MARK_CENTER } from "./markTables";
import { clamp, randBetween } from "./markMath";

const SVG_NS = "http://www.w3.org/2000/svg";
const GRAD_STOPS = 5;
const TRAIL_SAMPLE = 0.09;
const BELT_SPEED = 0.9;
const BELT_START_SPEED = 5;
const MAX_PARTICLES = 120;

export const ORBIT_PALETTE = [
  "#f9705c",
  "#5b95f0",
  "#3fbe86",
  "#f5b13f",
  "#9a72ee",
  "#35c3bd",
] as const;

export const STAR_COLOR = "#f4c34e";

export const STAR_PATH = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 1 : 0.42;
    pts.push(`${(Math.cos(a) * r).toFixed(3)} ${(Math.sin(a) * r).toFixed(3)}`);
  }
  return `M${pts.join("L")}Z`;
})();

/** `spinWild` phase lengths, seconds (Sand `Or("spinWild")`). */
export const SPIN_WILD = {
  windup: 0.24,
  accel: 0.3,
  cruise: 2,
  decel: 1.25,
  settle: 1.7,
  reverse: 0.5,
  turns: 9,
} as const;

export function spinWildDuration(): number {
  return SPIN_WILD.windup + SPIN_WILD.accel + SPIN_WILD.cruise + SPIN_WILD.decel + SPIN_WILD.settle;
}

export type SpinWildSample = {
  /** Orbit angle fed to the belt engine (radians). */
  angle: number;
  /** Extra body rotation in degrees (3 turns across the 9-orbit spin). */
  bodyRotDeg: number;
  wobbleTurn: number;
  wobbleTilt: number;
  wobbleBob: number;
  done: boolean;
};

/**
 * Scripted 9-turn spin: reverse wind-up → accelerate → cruise → ease out
 * → wobble settle. `dir` is ±1.
 */
export function spinWildAt(
  elapsed: number,
  dir: number,
  turns: number = SPIN_WILD.turns,
): SpinWildSample {
  const { windup, accel, cruise, decel, settle, reverse } = SPIN_WILD;
  const cruiseEnd = windup + accel + cruise;
  const scriptEnd = cruiseEnd + decel;
  const total = scriptEnd + settle;
  if (elapsed >= total) {
    return {
      angle: 0,
      bodyRotDeg: 0,
      wobbleTurn: 0,
      wobbleTilt: 0,
      wobbleBob: 0,
      done: true,
    };
  }
  const twoPi = Math.PI * 2;
  const km = (turns * twoPi + reverse) / (accel / 2 + cruise + decel / 4);
  let raw: number;
  if (elapsed < windup) {
    raw = (-reverse * (1 - Math.cos((elapsed / windup) * Math.PI))) / 2;
  } else if (elapsed < windup + accel) {
    const u = elapsed - windup;
    raw = -reverse + (km * u * u) / (2 * accel);
  } else if (elapsed < cruiseEnd) {
    raw = -reverse + km * (accel / 2 + (elapsed - windup - accel));
  } else if (elapsed < scriptEnd) {
    const u = (elapsed - cruiseEnd) / decel;
    raw = -reverse + km * (accel / 2 + cruise) + (km * decel * (1 - Math.pow(1 - u, 4))) / 4;
  } else {
    raw = turns * twoPi;
  }
  let wobbleAmt = 0;
  if (elapsed > cruiseEnd) {
    const u = Math.min((elapsed - cruiseEnd) / decel, 1);
    wobbleAmt = u < 0.4 ? 0 : Math.pow((u - 0.4) / 0.6, 2);
    if (elapsed >= scriptEnd) {
      wobbleAmt = Math.pow(1 - (elapsed - scriptEnd) / settle, 1.6);
    }
  }
  const wobbleT = Math.max(elapsed - cruiseEnd, 0);
  const sign = dir < 0 ? -1 : 1;
  return {
    angle: raw * sign,
    bodyRotDeg: (raw / (turns * twoPi)) * 3 * 360 * sign,
    wobbleTurn: Math.sin(wobbleT * 9.2) * 11 * sign * wobbleAmt,
    wobbleTilt: (Math.cos(wobbleT * 9.2) - 1) * 6 * sign * wobbleAmt,
    wobbleBob: Math.sin(wobbleT * 18.4) * 2.6 * wobbleAmt,
    done: false,
  };
}

type TrailPt = { x: number; y: number; l: number; z: number };

type BeltLane = { tilt: number; roll: number };

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  rot: number;
  vr: number;
  curl: number;
  color: string;
  round: boolean;
  star: boolean;
  ret: number;
  hue?: number;
  hueSpan?: number;
  hueVel?: number;
  orbit: null | {
    lam: number;
    lamVel: number;
    tilt: number;
    roll: number;
    rad: number;
    radVel: number;
    follow: number;
    carry: number;
    arc: number;
  };
  hist: TrailPt[];
  el: SVGElement | null;
  trailEl: SVGPathElement | null;
  trailFrontEl: SVGPathElement | null;
  gradEl: SVGLinearGradientElement | null;
  stops: SVGStopElement[];
};

export type MarkOrbit = {
  burst: (count?: number, speed?: number, extra?: number) => void;
  clear: () => void;
  update: (
    now: number,
    dt: number,
    opts: {
      spinAngle: number;
      sizeScale: number;
      wideStyle: boolean;
      sustainBelts: boolean;
    },
  ) => void;
  hasLife: () => boolean;
};

function pickColor(): string {
  return ORBIT_PALETTE[(Math.random() * ORBIT_PALETTE.length) | 0] ?? ORBIT_PALETTE[0];
}

function orbitPoint(
  belt: { rad: number; tilt: number; roll: number },
  lam: number,
): { x: number; y: number } {
  const hx = belt.rad * Math.sin(lam);
  const hy = -belt.rad * Math.cos(lam) * Math.sin(belt.tilt);
  const c = Math.cos(belt.roll);
  const s = Math.sin(belt.roll);
  return {
    x: MARK_CENTER + hx * c - hy * s,
    y: MARK_CENTER + hx * s + hy * c,
  };
}

function orbitDepth(belt: { tilt: number }, lam: number): number {
  return Math.cos(lam) * Math.cos(belt.tilt);
}

function r1(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

/** Capsule ribbon from a 3-D trail (front / back split by z). */
export function ribbonPaths(pts: TrailPt[], halfWidth: number): { front: string; back: string } {
  const n = pts.length;
  if (n < 2) return { front: "", back: "" };
  let len = 0;
  for (let i = 1; i < n; i++) {
    len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  const width = Math.min(halfWidth, len * 0.34);
  const speeds: number[] = [];
  let maxSpeed = 0;
  for (let i = 0; i < n; i++) {
    const prev = pts[i > 0 ? i - 1 : 0]!;
    const next = pts[i < n - 1 ? i + 1 : n - 1]!;
    const dl = Math.abs(next.l - prev.l);
    const speed = dl > 1e-6 ? Math.hypot(next.x - prev.x, next.y - prev.y) / dl : 0;
    speeds.push(speed);
    if (speed > maxSpeed) maxSpeed = speed;
  }
  const nx: number[] = [];
  const ny: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[i > 0 ? i - 1 : 0]!;
    const next = pts[i < n - 1 ? i + 1 : n - 1]!;
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const hyp = Math.hypot(tx, ty) || 1;
    tx /= hyp;
    ty /= hyp;
    const t = clamp(maxSpeed > 0 ? speeds[i]! / (maxSpeed * 0.55) : 1, 0, 1);
    const ease = Math.max(t * t * (3 - 2 * t), 0.04);
    const w = (width * (0.5 + 0.5 * (i / (n - 1))) * ease) / 2;
    nx.push(-ty * w);
    ny.push(tx * w);
  }
  const arcAt = (i: number) => {
    const r = Math.max(Math.hypot(nx[i]!, ny[i]!), 0.2);
    return `A${r1(r)} ${r1(r)} 0 0 0 `;
  };
  const capsule = (from: number, to: number) => {
    let d = "";
    for (let i = from; i <= to; i++) {
      d += `${i === from ? "M" : "L"}${r1(pts[i]!.x + nx[i]!)} ${r1(pts[i]!.y + ny[i]!)}`;
    }
    d += arcAt(to);
    for (let i = to; i >= from; i--) {
      d += `${i === to ? "" : "L"}${r1(pts[i]!.x - nx[i]!)} ${r1(pts[i]!.y - ny[i]!)}`;
    }
    d += `${arcAt(from)}${r1(pts[from]!.x + nx[from]!)} ${r1(pts[from]!.y + ny[from]!)}`;
    return `${d}Z`;
  };
  const kink: boolean[] = [];
  for (let i = 0; i < n; i++) {
    kink.push(
      i > 0 &&
        i < n - 1 &&
        (pts[i]!.x - pts[i - 1]!.x) * (pts[i + 1]!.x - pts[i]!.x) +
          (pts[i]!.y - pts[i - 1]!.y) * (pts[i + 1]!.y - pts[i]!.y) <
          0,
    );
  }
  let front = "";
  let back = "";
  let i = 0;
  let afterKink = false;
  while (i < n) {
    const frontSide = pts[i]!.z >= 0;
    let j = i;
    while (j + 1 < n && pts[j + 1]!.z >= 0 === frontSide && !kink[j + 1]) j++;
    const nextKink = j + 1 < n && kink[j + 1];
    const from = afterKink ? i : Math.max(i - 1, 0);
    const to = nextKink ? j + 1 : Math.min(j + 1, n - 1);
    if (to > from) {
      const d = capsule(from, to);
      if (frontSide) front += d;
      else back += d;
    }
    afterKink = Boolean(nextKink);
    i = j + 1;
  }
  return { front, back };
}

export function createMarkOrbit(opts: {
  back: SVGGElement | null;
  front: SVGGElement | null;
  idPrefix: string;
  reduceMotion: boolean;
  radius: () => number;
}): MarkOrbit {
  const scale = () => opts.radius() / MARK_CENTER;
  let spinAngle = 0;
  let sizeScale = 1;
  let wide = false;
  let sustain = false;
  let lastNow = -1;
  const particles: Particle[] = [];
  let beltPhase = randBetween(0, Math.PI * 2);
  let emitting = false;
  let rearm = false;
  const spawnQ: Array<{ at: number; i: number }> = [];
  let lanes: BeltLane[] = [];
  let hue0 = 0;
  let beltCount = 4;
  let lastAngle = 0;
  let spinVel = 0;
  let trailSeq = 0;

  const pickLanes = (count = 1) => {
    const roll = randBetween(-0.85, 0.85);
    lanes = [];
    for (let i = 0; i < count; i++) {
      lanes.push({
        tilt: randBetween(0.16, 0.5),
        roll: roll + (i * Math.PI) / count + randBetween(-0.12, 0.12),
      });
    }
    beltCount = count > 1 ? count * 3 : Math.round(randBetween(3, 5));
    hue0 = randBetween(0, 360);
  };

  const burst = (count = 20, speed = 1, extra = 0) => {
    const back = opts.back;
    if (opts.reduceMotion || !back) return;
    if (particles.length > MAX_PARTICLES) return;
    const s = scale();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + randBetween(-0.35, 0.35);
      const rad = randBetween(96, 116) * s;
      const v = randBetween(170, 360) * speed;
      const tx = -Math.sin(a);
      const ty = Math.cos(a);
      const kick = extra * v * 0.2;
      const star = Math.random() < 0.18;
      particles.push({
        x: MARK_CENTER + Math.cos(a) * rad,
        y: MARK_CENTER + Math.sin(a) * rad,
        vx: Math.cos(a) * v + tx * kick,
        vy: Math.sin(a) * v + ty * kick - randBetween(20, 75),
        life: 0,
        max: randBetween(0.45, 0.85),
        r: star ? randBetween(4, 7) : randBetween(3.5, 8),
        rot: randBetween(0, 360),
        vr: randBetween(-260, 260),
        curl: 0,
        color: star ? STAR_COLOR : pickColor(),
        round: !star && Math.random() < 0.3,
        star,
        ret: 0,
        orbit: null,
        hist: [],
        el: null,
        trailEl: null,
        trailFrontEl: null,
        gradEl: null,
        stops: [],
      });
    }
  };

  const spawnBelt = (lam: number, vel: number, index: number) => {
    if (particles.length > 110) return;
    if (lanes.length === 0) pickLanes();
    const lane = lanes[index % lanes.length]!;
    const rings = Math.max(Math.ceil(beltCount / lanes.length) - 1, 1);
    particles.push({
      x: MARK_CENTER,
      y: MARK_CENTER,
      vx: 0,
      vy: 0,
      life: 0,
      max: 9,
      r:
        beltCount <= 3
          ? randBetween(8, 10.5)
          : beltCount === 4
            ? randBetween(6.6, 8.6)
            : randBetween(5.6, 7.4),
      rot: randBetween(0, 360),
      vr: randBetween(-240, 240),
      curl: 0,
      color: pickColor(),
      round: true,
      star: false,
      ret: 0,
      hue: hue0 + (index * 360) / Math.max(beltCount, 1) + randBetween(-14, 14),
      hueSpan: randBetween(45, 95) * (Math.random() < 0.5 ? 1 : -1),
      hueVel: randBetween(18, 42) * (Math.random() < 0.5 ? 1 : -1),
      orbit: {
        lam,
        lamVel: vel * randBetween(0.5, 1.1),
        tilt: lane.tilt + randBetween(-0.04, 0.04),
        roll: lane.roll + randBetween(-0.05, 0.05),
        rad:
          scale() * 116 + Math.floor(index / lanes.length) * (38 / rings) + randBetween(-1.5, 1.5),
        radVel: randBetween(0, 2.5),
        follow: randBetween(0.74, 0.94),
        carry: 0,
        arc: randBetween(2.2, 3.4),
      },
      hist: [],
      el: null,
      trailEl: null,
      trailFrontEl: null,
      gradEl: null,
      stops: [],
    });
  };

  const drop = (p: Particle) => {
    p.el?.remove();
    p.trailEl?.remove();
    p.trailFrontEl?.remove();
    p.gradEl?.remove();
    p.el = null;
    p.trailEl = null;
    p.trailFrontEl = null;
    p.gradEl = null;
    p.stops = [];
  };

  const trackSpin = (dt: number) => {
    let dAng = spinAngle - lastAngle;
    if (!Number.isFinite(dAng) || Math.abs(dAng) > 1.2) dAng = 0;
    lastAngle = spinAngle;
    const wasFast = Math.abs(spinVel) >= BELT_SPEED;
    spinVel = dt > 0 ? dAng / dt : 0;
    const nowFast = Math.abs(spinVel) >= BELT_SPEED;
    if (!wasFast && nowFast) {
      pickLanes(wide ? 3 : 1);
      emitting = false;
      rearm = false;
    }
    if (wasFast && !nowFast) {
      spawnQ.length = 0;
      rearm = false;
    }
  };

  const scheduleBelts = (now: number) => {
    if (opts.reduceMotion || !opts.back) return;
    beltPhase = spinAngle;
    const speed = Math.abs(spinVel);
    const living = particles.some((p) => p.orbit != null && p.ret < 1);
    if (sustain && emitting && spawnQ.length === 0 && speed >= BELT_SPEED && !living) {
      emitting = false;
      rearm = true;
    }
    if (!emitting && (speed >= BELT_START_SPEED || (sustain && rearm && speed >= BELT_SPEED))) {
      emitting = true;
      rearm = false;
      spawnQ.length = 0;
      for (let i = 0; i < beltCount; i++) {
        spawnQ.push({ at: now + i * randBetween(55, 105), i });
      }
    }
    while (spawnQ.length && now >= spawnQ[0]!.at) {
      const job = spawnQ.shift()!;
      spawnBelt(beltPhase - randBetween(0, 0.18), Math.sign(spinVel) || 1, job.i);
    }
  };

  const ensureTrail = (p: Particle, back: SVGGElement) => {
    if (p.trailEl) return;
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("data-trail", "");
    path.setAttribute("stroke", "none");
    const grad = document.createElementNS(SVG_NS, "linearGradient");
    const id = `${opts.idPrefix}t${trailSeq++}`;
    grad.setAttribute("id", id);
    grad.setAttribute("gradientUnits", "userSpaceOnUse");
    p.stops = [];
    for (let i = 0; i < GRAD_STOPS; i++) {
      const stop = document.createElementNS(SVG_NS, "stop");
      stop.setAttribute("offset", (i / (GRAD_STOPS - 1)).toFixed(3));
      grad.appendChild(stop);
      p.stops.push(stop);
    }
    back.appendChild(grad);
    p.gradEl = grad;
    path.setAttribute("fill", `url(#${id})`);
    back.appendChild(path);
    p.trailEl = path;
    const front = document.createElementNS(SVG_NS, "path");
    front.setAttribute("data-trail", "");
    front.setAttribute("stroke", "none");
    front.setAttribute("fill", path.getAttribute("fill") ?? p.color);
    opts.front?.appendChild(front);
    p.trailFrontEl = front;
  };

  const step = (dt: number, trailDt: number) => {
    const back = opts.back;
    if (!back || particles.length === 0) return;
    const spinning = Math.abs(spinVel) >= BELT_SPEED;
    const vel = spinVel;
    const dLam = spinVel * dt;
    const keep: Particle[] = [];
    for (const p of particles) {
      p.life += p.life > 0 ? trailDt : dt;
      const u = clamp(p.life / p.max, 0, 1);
      if (p.orbit) {
        const dying = !spinning || u > 0.55;
        p.ret = clamp(p.ret + (dying ? trailDt / 0.5 : -trailDt / 0.35), 0, 1);
        if (p.ret >= 1) {
          drop(p);
          continue;
        }
      } else if (p.life >= p.max) {
        drop(p);
        continue;
      }
      const fade = p.orbit
        ? Math.min(1, p.life / 0.26)
        : u < 0.1
          ? u / 0.1
          : Math.pow(1 - (u - 0.1) / 0.9, 1.7);
      if (p.orbit) {
        const belt = p.orbit;
        if (spinning) {
          belt.carry = vel * belt.follow;
          belt.lam += dLam * belt.follow + belt.lamVel * dt;
          belt.rad += belt.radVel * dt;
        } else {
          belt.lam += (belt.carry + belt.lamVel) * dt;
          belt.carry *= Math.exp(-2.6 * dt);
          belt.lamVel *= Math.exp(-2.6 * dt);
          belt.rad += belt.radVel * dt;
        }
        const pos = orbitPoint(belt, belt.lam);
        p.x = pos.x;
        p.y = pos.y;
        const z = orbitDepth(belt, belt.lam);
        const depth = 0.72 + 0.28 * clamp(z, 0, 1);
        const grow = Math.min(p.life / 0.34, 1);
        const growEase = grow * grow * (3 - 2 * grow);
        const halfW = Math.max(
          p.r * depth * 1.7 * sizeScale * growEase * (1 - 0.72 * p.ret * p.ret),
          0.5,
        );
        ensureTrail(p, back);
        const hist = p.hist;
        const prevL = hist.length ? hist[hist.length - 1]!.l : belt.lam;
        const dL = belt.lam - prevL;
        const steps = Math.min(Math.ceil(Math.abs(dL) / TRAIL_SAMPLE), 24);
        for (let s = 1; s <= steps; s++) {
          const lam = prevL + (dL * s) / steps;
          const pt = orbitPoint(belt, lam);
          hist.push({ x: pt.x, y: pt.y, l: lam, z: orbitDepth(belt, lam) });
        }
        if (hist.length === 0) hist.push({ x: p.x, y: p.y, l: belt.lam, z });
        const arc = belt.arc * (1 - p.ret * p.ret * (3 - 2 * p.ret));
        while (hist.length > 2 && Math.abs(belt.lam - hist[0]!.l) > arc) hist.shift();
        const extra = Math.abs(belt.lam - hist[0]!.l) - arc;
        if (hist.length >= 2 && extra > 0) {
          const lam = hist[0]!.l + Math.sign(belt.lam - hist[0]!.l) * extra;
          const pt = orbitPoint(belt, lam);
          hist[0] = { x: pt.x, y: pt.y, l: lam, z: orbitDepth(belt, lam) };
        }
        if (hist.length > 48) hist.splice(0, hist.length - 48);
        if (hist.length >= 2 && p.trailEl) {
          const { front, back: backD } = ribbonPaths(hist, halfW);
          const op = fade.toFixed(3);
          p.trailEl.setAttribute("d", backD);
          p.trailEl.setAttribute("opacity", op);
          p.trailFrontEl?.setAttribute("d", front);
          p.trailFrontEl?.setAttribute("opacity", op);
          const hue = (p.hue ?? 0) + (p.hueVel ?? 0) * p.life;
          for (let s = 0; s < p.stops.length; s++) {
            const t = s / (p.stops.length - 1);
            const q = hue + t * (p.hueSpan ?? 120);
            const wrap = ((q % 360) + 360) % 360;
            p.stops[s]!.setAttribute(
              "stop-color",
              `hsl(${wrap.toFixed(0)} 56% ${(56 + 11 * t).toFixed(0)}%)`,
            );
          }
          const a = hist[0]!;
          const b = hist[hist.length - 1]!;
          p.gradEl?.setAttribute("x1", a.x.toFixed(1));
          p.gradEl?.setAttribute("y1", a.y.toFixed(1));
          p.gradEl?.setAttribute("x2", b.x.toFixed(1));
          p.gradEl?.setAttribute("y2", b.y.toFixed(1));
        } else {
          p.trailEl?.setAttribute("opacity", "0");
          p.trailFrontEl?.setAttribute("opacity", "0");
        }
        keep.push(p);
        continue;
      }
      if (p.curl) {
        const c = Math.cos(p.curl * dt);
        const s = Math.sin(p.curl * dt);
        const vx = p.vx * c - p.vy * s;
        const vy = p.vx * s + p.vy * c;
        p.vx = vx;
        p.vy = vy;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const drag = Math.pow(0.94, dt * 60);
      p.vx *= drag;
      p.vy = p.vy * drag + 40 * dt;
      const age = p.life / p.max;
      const sparkFade = age < 0.1 ? age / 0.1 : Math.pow(1 - (age - 0.1) / 0.9, 1.7);
      const rr = Math.max(p.r * (1 - age * 0.4), 0.5);
      if (!p.el) {
        const el = document.createElementNS(SVG_NS, p.star ? "path" : p.round ? "circle" : "rect");
        if (p.star) el.setAttribute("d", STAR_PATH);
        el.setAttribute("fill", p.color);
        back.appendChild(el);
        p.el = el;
      }
      p.el.setAttribute("opacity", sparkFade.toFixed(3));
      if (p.star) {
        p.rot += p.vr * dt;
        p.el.setAttribute(
          "transform",
          `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rot.toFixed(1)}) scale(${rr.toFixed(2)})`,
        );
      } else if (p.round) {
        p.el.setAttribute("cx", p.x.toFixed(1));
        p.el.setAttribute("cy", p.y.toFixed(1));
        p.el.setAttribute("r", rr.toFixed(2));
      } else {
        const speed = Math.hypot(p.vx, p.vy);
        const w = Math.max(rr * 2, Math.min(speed * 0.05, 30));
        const h = rr * 1.5;
        const ang = (Math.atan2(p.vy, p.vx) * 180) / Math.PI;
        p.el.setAttribute("width", w.toFixed(1));
        p.el.setAttribute("height", h.toFixed(1));
        p.el.setAttribute("rx", (h / 2).toFixed(2));
        p.el.setAttribute("x", (p.x - w / 2).toFixed(1));
        p.el.setAttribute("y", (p.y - h / 2).toFixed(1));
        p.el.setAttribute(
          "transform",
          `rotate(${ang.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)})`,
        );
      }
      keep.push(p);
    }
    particles.length = 0;
    particles.push(...keep);
  };

  return {
    burst,
    clear: () => {
      for (const p of particles) drop(p);
      particles.length = 0;
      spawnQ.length = 0;
      emitting = false;
      rearm = false;
    },
    update: (now, dt, next) => {
      const trailDt = lastNow < 0 ? dt : Math.max((now - lastNow) / 1000, 0);
      lastNow = now;
      sizeScale = next.sizeScale;
      spinAngle = next.spinAngle;
      wide = next.wideStyle;
      sustain = next.sustainBelts === true;
      trackSpin(dt);
      scheduleBelts(now);
      step(dt, trailDt);
    },
    hasLife: () => particles.length > 0 || spawnQ.length > 0,
  };
}
