/** Springs + path helpers from the Sand living-mark engine. */

export type Spring = { x: number; v: number; t: number };

export function spring(x: number): Spring {
  return { x, v: 0, t: x };
}

/** Critically-damped-ish spring step (`xl` in the original). */
export function stepSpring(s: Spring, freq: number, damp: number, dt: number): void {
  s.v += (-2 * damp * freq * s.v - freq * freq * (s.x - s.t)) * dt;
  s.x += s.v * dt;
  if (!Number.isFinite(s.x) || !Number.isFinite(s.v)) {
    s.x = s.t;
    s.v = 0;
  }
}

export function lerpPts(a: number[][], b: number[][], t: number): number[][] {
  return a.map((pt, i) => {
    const [x, y] = pt;
    const [bx, by] = b[i] ?? pt;
    return [x! + (bx! - x!) * t, y! + (by! - y!) * t];
  });
}

export function polyPath(pts: number[][]): string {
  if (pts.length === 0) return "";
  return "M" + pts.map((p) => `${p[0]!.toFixed(2)} ${p[1]!.toFixed(2)}`).join("L") + "Z";
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function randBetween(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export function expSmooth(target: number, dt: number): number {
  return 1 - Math.exp(Math.log(1 - target) * 60 * dt);
}

/**
 * Directional look from a pixel delta (cursor − mark center).
 * Near the face: look at that point on the face. Farther away: full look
 * along the vector so it reads as watching the pointer, not a nudge.
 */
export function gazeFromDelta(
  dx: number,
  dy: number,
  localR: number,
  rangeX = 28,
  rangeY = 20,
): { x: number; y: number } {
  const r = Math.max(localR, 8);
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return { x: 0, y: 0 };
  const nx = dx / len;
  const ny = dy / len;
  const reach = clamp(len / r, 0, 1);
  return { x: nx * rangeX * reach, y: ny * rangeY * reach };
}

/** Map a client pointer onto the mark's gaze springs (view-box units). */
export function gazeFromPointer(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  rangeX = 28,
  rangeY = 20,
): { x: number; y: number } {
  const hw = rect.width > 1 ? rect.width / 2 : 1;
  const hh = rect.height > 1 ? rect.height / 2 : 1;
  return gazeFromDelta(
    clientX - (rect.left + hw),
    clientY - (rect.top + hh),
    Math.min(hw, hh),
    rangeX,
    rangeY,
  );
}
