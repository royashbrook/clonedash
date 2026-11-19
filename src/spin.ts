// The cube's turn (#120). The look only: the hitbox stays the square, so every jump, landing and
// course plays the same. In the air the cube turns forward from the side it took off on, one turn
// a second. Landing eases it onto the nearest flat side in SETTLE seconds, and it stays on that
// side, upright, on its side or upside down, until the next jump turns on from there. Under
// upside-down gravity the drawing is mirrored, so the turn is too. Only square and pogo turn;
// any other mode puts it back upright, and a cube first seen in the air takes off from there.
import type { GameState } from "./types.ts";

export const TURN = Math.PI * 2,
  QUARTER = Math.PI / 2,
  SETTLE = 0.1;
export interface Spin {
  time: number; // the run time last seen
  air: boolean;
  base: number; // the angle it took off at
  takeoff: number;
  from: number; // the angle it landed at
  rest: number; // the flat side it settles on, a whole quarter in [0, TURN)
  side: number; // how far onto an odd side it was when it took off, carried through the air
  at: number; // when it landed
}
export const newSpin = (): Spin => ({ time: -Infinity, air: false, base: 0, takeoff: 0, from: 0, rest: 0, side: 0, at: -Infinity });

const ease = (k: number) => 1 - (1 - k) ** 3;
const odd = (a: number) => Math.round(a / QUARTER) % 2;

// Advances to this state's moment and returns the angle to draw (clockwise on screen, before the
// gravity mirror) and how far it is onto an odd side (0 upright or upside down, 1 on its side),
// which a skin that is not square needs to keep its feet on the ground. Both are continuous: a
// take-off during the landing's ease starts from where the ease had got to, angle and side alike.
export function spinAt(s: Spin, state: GameState): { angle: number; side: number } {
  const t = state.time;
  if (t < s.time || (state.mode !== "square" && state.mode !== "pogo")) {
    Object.assign(s, newSpin(), { time: t });
    return { angle: 0, side: 0 };
  }
  s.time = t;
  const k = ease(Math.min(1, (t - s.at) / SETTLE)),
    angle = s.from + (s.rest - s.from) * k,
    side = s.side + (odd(s.rest) - s.side) * k;
  if (!state.grounded) {
    if (!s.air) Object.assign(s, { air: true, base: angle, takeoff: t, side });
    return { angle: s.base + (t - s.takeoff) * TURN, side: s.side };
  }
  if (s.air) {
    const landed = s.base + (t - s.takeoff) * TURN,
      rest = Math.round(landed / QUARTER) * QUARTER,
      whole = Math.floor(rest / TURN) * TURN;
    Object.assign(s, { air: false, from: landed - whole, rest: rest - whole, at: t });
    return { angle: s.from, side: s.side };
  }
  return { angle, side };
}
