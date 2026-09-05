/**
 * Rest-face + pointer overlays on top of the living-mark session verb.
 * Does not replace PetMark — only chooses which already-ported topology runs.
 */
import { verbToMarkState } from "./markTables";

/** Idle-only catalog (Bloub rest expressions → living-mark states). */
export const PET_REST_MOODS = [
  "idle",
  "happy",
  "curious",
  "playful",
  "shy",
  "proud",
  "bored",
  "drowsy",
  "confused",
  "listening",
  "excited",
  "surprised",
  "laughing",
] as const;

export type PetRestMood = (typeof PET_REST_MOODS)[number];

export function isPetRestMood(v: string | null | undefined): v is PetRestMood {
  return !!v && (PET_REST_MOODS as readonly string[]).includes(v);
}

export function pickRestEmote(exclude?: string, roll = Math.random()): PetRestMood {
  const list = PET_REST_MOODS.filter((m) => m !== "idle" && m !== exclude);
  const pool = list.length ? list : PET_REST_MOODS.filter((m) => m !== "idle");
  const i = Math.floor(roll * pool.length) % pool.length;
  return pool[i] ?? "happy";
}

export type LivingMoodInput = {
  sessionVerb: string;
  now: number;
  dragging?: boolean;
  hovering?: boolean;
  hoverMs?: number;
  emoteMood?: string | null;
  emoteUntil?: number;
  idleBurstMood?: string | null;
  idleBurstUntil?: number;
};

export function resolveLivingMood(input: LivingMoodInput): string {
  const session = verbToMarkState(input.sessionVerb);
  if (input.dragging) return "dragging";
  if (
    input.emoteMood &&
    (input.emoteUntil ?? 0) > input.now &&
    verbToMarkState(input.emoteMood) !== "idle"
  ) {
    return verbToMarkState(input.emoteMood);
  }
  if (session === "idle") {
    if (input.hovering) {
      // Local hover faces the viewer immediately. Curious-first held an
      // uneven pair until a long dwell elapsed.
      return "listening";
    }
    if (input.idleBurstMood && (input.idleBurstUntil ?? 0) > input.now) {
      return verbToMarkState(input.idleBurstMood);
    }
  }
  return session;
}
