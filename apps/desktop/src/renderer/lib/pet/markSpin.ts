/**
 * Grok Bot living-mark spin roster (`qn` / `Or` / `Sn` / `vr`).
 * Task-complete and the pet menu pick one at random.
 */

import { spring, stepSpring, type Spring } from "./markMath";
import { spinWildAt, SPIN_WILD } from "./markOrbit";

export const PET_SPIN_KINDS = [
  "turn1",
  "turn2Wide",
  "spinBounce",
  "spinDizzy",
  "turn1Burst",
  "spinWild",
] as const;

export type PetSpinKind = (typeof PET_SPIN_KINDS)[number];

const TWO_PI = Math.PI * 2;

/** Bounce hops from Sand `Lie` / `vr`. */
export const SPIN_BOUNCE_HOPS = [
  { h: 48, d: 0.5 },
  { h: 28, d: 0.382 },
  { h: 14, d: 0.27 },
  { h: 6, d: 0.177 },
] as const;

export function spinBounceDuration(): number {
  return SPIN_BOUNCE_HOPS.reduce((sum, hop) => sum + hop.d, 0);
}

export function easeInOutCubic(n: number): number {
  return n < 0.5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2;
}

/** Parabolic hop chain (`Ni = -4 h u (1-u)`). */
export function bounceOffsetY(elapsed: number): number {
  if (elapsed < 0) return 0;
  let acc = 0;
  for (const hop of SPIN_BOUNCE_HOPS) {
    if (elapsed < acc + hop.d) {
      const u = (elapsed - acc) / hop.d;
      return -4 * hop.h * u * (1 - u);
    }
    acc += hop.d;
  }
  return 0;
}

export function pickPetSpinKind(prev?: PetSpinKind | null): PetSpinKind {
  const pool =
    prev && PET_SPIN_KINDS.length > 1 ? PET_SPIN_KINDS.filter((k) => k !== prev) : PET_SPIN_KINDS;
  return pool[Math.floor(Math.random() * pool.length)] ?? "spinWild";
}

export type PetSpinSample = {
  spinAngle: number;
  bodyRotDeg: number;
  wobbleTurn: number;
  wobbleTilt: number;
  wobbleBob: number;
  bounceY: number;
  lid: number | null;
  wideStyle: boolean;
  done: boolean;
};

export type PetSpinRun = {
  kind: PetSpinKind;
  t0: number;
  dir: number;
  turns: number;
  spring: Spring | null;
  bounceAt: number | null;
};

export function beginPetSpin(kind: PetSpinKind, now: number, dir?: number): PetSpinRun {
  const sign = dir === 1 || dir === -1 ? dir : Math.random() < 0.5 ? 1 : -1;
  if (kind === "turn1" || kind === "turn1Burst") {
    return {
      kind,
      t0: now,
      dir: sign,
      turns: 1,
      spring: springToward(sign * TWO_PI),
      bounceAt: null,
    };
  }
  if (kind === "turn2Wide") {
    return {
      kind,
      t0: now,
      dir: sign,
      turns: 2,
      spring: springToward(sign * TWO_PI * 2),
      bounceAt: null,
    };
  }
  if (kind === "spinDizzy") {
    return {
      kind,
      t0: now,
      dir: sign,
      turns: Math.round(3 + Math.random()),
      spring: null,
      bounceAt: null,
    };
  }
  if (kind === "spinBounce") {
    return {
      kind,
      t0: now,
      dir: sign,
      turns: 1,
      spring: null,
      bounceAt: null,
    };
  }
  return {
    kind: "spinWild",
    t0: now,
    dir: sign,
    turns: SPIN_WILD.turns,
    spring: null,
    bounceAt: null,
  };
}

export function petSpinWantsBurst(kind: PetSpinKind): boolean {
  return kind === "turn1Burst" || kind === "spinWild";
}

export function stepPetSpin(run: PetSpinRun, now: number, dt: number): PetSpinSample {
  const idle: PetSpinSample = {
    spinAngle: 0,
    bodyRotDeg: 0,
    wobbleTurn: 0,
    wobbleTilt: 0,
    wobbleBob: 0,
    bounceY: 0,
    lid: null,
    wideStyle: false,
    done: true,
  };
  if (run.spring) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) stepSpring(run.spring, 6.2, 1, h);
    const settled = Math.abs(run.spring.x - run.spring.t) < 0.04 && Math.abs(run.spring.v) < 0.08;
    return {
      ...idle,
      spinAngle: run.spring.x,
      wideStyle: run.kind === "turn2Wide",
      done: settled,
    };
  }
  const elapsed = (now - run.t0) / 1000;
  if (run.kind === "spinBounce") {
    if (run.bounceAt == null) {
      if (elapsed < 0.7) {
        return {
          ...idle,
          spinAngle: run.dir * TWO_PI * run.turns * easeInOutCubic(elapsed / 0.7),
          done: false,
        };
      }
      run.bounceAt = now;
    }
    const bounceT = (now - run.bounceAt) / 1000;
    const dur = spinBounceDuration();
    return {
      ...idle,
      bounceY: bounceOffsetY(bounceT),
      done: bounceT >= dur,
    };
  }
  if (run.kind === "spinDizzy") {
    const spinDur = 0.55 + run.turns * 0.16;
    const wobbleDur = 1.5;
    if (elapsed < spinDur) {
      const u = elapsed / spinDur;
      return {
        ...idle,
        spinAngle: run.turns * TWO_PI * run.dir * (u * u),
        done: false,
      };
    }
    if (elapsed < spinDur + wobbleDur) {
      const u = elapsed - spinDur;
      const fade = Math.pow(1 - u / wobbleDur, 1.3);
      return {
        ...idle,
        wobbleTurn: Math.sin(u * 10) * 17 * run.dir * fade,
        wobbleTilt: Math.cos(u * 10) * 10 * run.dir * fade,
        wobbleBob: Math.sin(u * 20) * 3 * fade,
        lid: 0.46 + 0.14 * Math.sin(u * 21),
        done: false,
      };
    }
    return idle;
  }
  const wild = spinWildAt(elapsed, run.dir, run.turns);
  return {
    ...idle,
    spinAngle: wild.angle,
    bodyRotDeg: wild.bodyRotDeg,
    wobbleTurn: wild.wobbleTurn,
    wobbleTilt: wild.wobbleTilt,
    wobbleBob: wild.wobbleBob,
    wideStyle: !wild.done,
    done: wild.done,
  };
}

function springToward(target: number): Spring {
  const s = spring(0);
  s.t = target;
  return s;
}
