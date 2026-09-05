/**
 * Vendored from https://github.com/jeremy-prt/bloub (MIT, Jérémy Perret).
 * Framework-free SVG morph engine: `engine.sample(t)` is a pure function of time.
 * Measurements are from the reference video — do not round them.
 */
export { BotEngine, type BotFrame, type Look, type RenderedEye } from "./engine";
export {
  EXPRESSIONS,
  EXPRESSION_BY_ID,
  DEFAULT_EXPRESSION,
  blendExpression,
  type BotExpression,
  type ExpressionId,
} from "./expressions";
export {
  SHAPES,
  SHAPE_BY_ID,
  DEFAULT_SHAPE,
  COLORS,
  COLOR_BY_ID,
  DEFAULT_COLOR,
  mixHex,
  type BotShape,
  type ShapeId,
  type ColorId,
} from "./skins";
export { STATES, STATE_BY_ID, SEQUENCE, POSES, type StateId, type StateDef } from "./states";
export { NOTIF_BLUE, NOTIF_INK } from "./decor";
export { RAYON, DEMI_VIEWBOX } from "./repere";
export { clamp, easings } from "./math";
