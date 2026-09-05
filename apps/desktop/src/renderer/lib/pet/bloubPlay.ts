/**
 * App verbs + prefs → bloub engine inputs.
 * The morph catalogue stays in `./bloub`; this file is the product mapping.
 */
import {
  BotEngine,
  DEFAULT_EXPRESSION,
  DEFAULT_SHAPE,
  EXPRESSION_BY_ID,
  SHAPE_BY_ID,
  STATE_BY_ID,
  type ExpressionId,
  type Look,
  type ShapeId,
  type StateId,
} from "./bloub";
import { PET_LOOK_NEAR_SCALE } from "./petMarkPaint";

export const BLOUB_PICKER_SHAPES = [
  "blob",
  "pebble",
  "squircle",
  "capsule",
  "wedge",
  "hex",
  "cloud",
  "teardrop",
] as const;

export type BloubPickerShape = (typeof BLOUB_PICKER_SHAPES)[number];

const SHAPE_TO_BLOUB: Record<string, ShapeId> = {
  blob: "cercle",
  pebble: "galet",
  bean: "galet",
  egg: "cercle",
  squircle: "squircle",
  tablet: "squircle",
  capsule: "capsule",
  cylinder: "capsule",
  hex: "hexagone",
  gem: "hexagone",
  crystal: "hexagone",
  wedge: "triangle",
  triangle: "triangle",
  shield: "triangle",
  dome: "cercle",
  arch: "squircle",
  cloud: "nuage",
  teardrop: "goutte",
  leaf: "goutte",
};

export const PET_EXPRESSIONS = [
  "neutre",
  "attentif",
  "surpris",
  "excite",
  "heureux",
  "hilare",
  "colere",
  "triste",
  "effraye",
  "mefiant",
  "confus",
  "curieux",
  "fier",
  "timide",
  "blase",
  "somnolent",
] as const;

export type PetExpression = (typeof PET_EXPRESSIONS)[number];

export function isPetExpression(v: string | null | undefined): v is PetExpression {
  return !!v && (PET_EXPRESSIONS as readonly string[]).includes(v);
}

export function normalizePetExpression(v: string | null | undefined): PetExpression {
  return isPetExpression(v) ? v : DEFAULT_EXPRESSION;
}

export function bloubShapeId(shape: string | null | undefined): ShapeId {
  return SHAPE_TO_BLOUB[shape ?? ""] ?? DEFAULT_SHAPE;
}

export function bloubShapeRadii(shape: string | null | undefined): number[] | null {
  return SHAPE_BY_ID.get(bloubShapeId(shape))?.radii ?? null;
}

const VERB_STATE: Record<string, StateId> = {
  idle: "idle",
  thinking: "thinking",
  searching: "comet",
  working: "orbit",
  writing: "alert",
  waiting: "wide",
  notifying: "notify",
  sleeping: "sleep",
  waking: "swirl",
  dragging: "egg",
  sad: "exclaim",
};

const VERB_EXPRESSION: Record<string, ExpressionId> = {
  happy: "heureux",
  curious: "curieux",
  playful: "excite",
  shy: "timide",
  proud: "fier",
  bored: "blase",
  drowsy: "somnolent",
  confused: "confus",
  listening: "attentif",
  excited: "excite",
  surprised: "surpris",
  laughing: "hilare",
  scared: "effraye",
  angry: "colere",
  suspicious: "mefiant",
};

export type BloubPlay = {
  state: StateId;
  expression: ExpressionId;
};

export function resolveBloubPlay(
  verb: string,
  restExpression: string | null | undefined,
): BloubPlay {
  const rest = normalizePetExpression(restExpression);
  const expr = VERB_EXPRESSION[verb];
  if (expr) return { state: "idle", expression: expr };
  const state = VERB_STATE[verb];
  if (state) return { state, expression: rest };
  return { state: "idle", expression: rest };
}

export function bloubExpressionOf(id: string | null | undefined) {
  return EXPRESSION_BY_ID.get(normalizePetExpression(id)) ?? null;
}

export function bloubStateDuration(id: StateId): number {
  return STATE_BY_ID.get(id)?.duration ?? 2;
}

/** Typing (alert) replays while the composer is still live. */
const HOLD_LOOP = new Set<StateId>(["alert"]);

/** Narrative states that should restart while the session verb stays put. */
export function bloubShouldLoop(id: StateId): boolean {
  return HOLD_LOOP.has(id);
}

/**
 * Heavy signature morphs (orbit/comet belts, swirl) play one catalogue
 * cycle, then hold this lighter state so a long turn does not spin the
 * triangle forever.
 */
const SETTLE_AFTER_ONE: Partial<Record<StateId, StateId>> = {
  orbit: "thinking",
  comet: "thinking",
  swirl: "idle",
};

export function bloubSettleState(id: StateId): StateId | null {
  return SETTLE_AFTER_ONE[id] ?? null;
}

/** States whose pose still moves after the enter morph — keep live paint. */
const LIVE_PAINT = new Set<StateId>([
  "thinking",
  "alert",
  "orbit",
  "comet",
  "sleep",
  "play",
  "burst",
  "swirl",
]);

export function bloubStateNeedsLivePaint(id: StateId): boolean {
  return LIVE_PAINT.has(id);
}

/** 3/4 rest → frontal hover: same curve and duration as the expression morph. */
export const BLOUB_LOOK_LOCAL_ENTER_MORPH = BotEngine.SHAPE_MORPH;

/** Full look budget by the outer face, not only at the body silhouette. */
const FACE_R = 0.62;
const YAW_MAX = 18;
const PITCH_MAX = 14;
const REST_PITCH = 8;

/**
 * Local hover look: face the camera, then add spherical perspective from the
 * offset on the mark. `nx`/`ny` are in mark-radius units (1 = body edge).
 *
 * Entering the hover ring (r = PET_LOOK_NEAR_SCALE) stays frontal; travel and
 * foreshortening grow across the face and reach the look budget before the
 * silhouette edge, so a pointer on an eye actually turns the pair.
 */
export function bloubLookAtPointer(nx: number, ny: number, pointer: boolean): Look {
  if (!pointer) {
    return { yaw: 0, pitch: REST_PITCH, mix: 0, spin: 0, wander: 1 };
  }
  const r = Math.hypot(nx, ny);
  let x = nx;
  let y = ny;
  if (r > 1) {
    const ring = Math.max(PET_LOOK_NEAR_SCALE, 1.0001);
    const s = r >= ring ? 0 : 1 - (r - 1) / (ring - 1);
    x *= s;
    y *= s;
  }
  x = Math.max(-1, Math.min(1, x / FACE_R));
  y = Math.max(-1, Math.min(1, y / FACE_R));
  return {
    yaw: x * YAW_MAX,
    pitch: REST_PITCH - y * PITCH_MAX,
    mix: 1,
    spin: 0,
    wander: 0,
  };
}

const NOTIF_INK = "#FF3B1A";
const NOTIF_ALT = "#C8FF00";

function hexClose(a: string, b: string): boolean {
  const pa = parseInt(a.replace("#", "").slice(0, 6), 16);
  const pb = parseInt(b.replace("#", "").slice(0, 6), 16);
  if (!Number.isFinite(pa) || !Number.isFinite(pb)) return false;
  const dr = ((pa >> 16) & 255) - ((pb >> 16) & 255);
  const dg = ((pa >> 8) & 255) - ((pb >> 8) & 255);
  const db = (pa & 255) - (pb & 255);
  return dr * dr + dg * dg + db * db < 70 * 70;
}

/** Unread pastille: vivid orange-red, lime when the body is already that hot. */
export function bloubNotifFill(bodyHex: string): string {
  return hexClose(bodyHex, NOTIF_INK) ? NOTIF_ALT : NOTIF_INK;
}

export function petVerbForComposer(input: { sessionVerb: string; composing: boolean }): string {
  if (input.composing && (input.sessionVerb === "idle" || input.sessionVerb === "waking")) {
    return "writing";
  }
  return input.sessionVerb;
}

/** How long after the last keystroke the pet holds the catalog alert morph. */
export const PET_COMPOSING_HOLD_MS = 1500;

/** Typing → catalog `alert` (slanted !); empty draft or a pause → original rest shape. */
export function petIsComposing(input: {
  empty: boolean;
  lastTypeAt: number;
  now: number;
  holdMs?: number;
}): boolean {
  if (input.empty) return false;
  if (!(input.lastTypeAt > 0)) return false;
  return input.now - input.lastTypeAt < (input.holdMs ?? PET_COMPOSING_HOLD_MS);
}
