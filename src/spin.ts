// The cube's turn (#120). The look only: the hitbox stays the square, so every jump, landing and
// course plays the same. In the air the cube turns forward from the side it took off on, one turn
// a second. Landing eases it onto the nearest flat side in SETTLE seconds, and it stays on that
// side, upright, on its side or upside down, until the next jump turns on from there. Under
// upside-down gravity the drawing is mirrored, so the turn is too. Only square and pogo turn;
// any other mode puts it back upright for the next time it is a cube.
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
  was: number; // the side it rested on before this landing
  at: number; // when it landed
}
export const newSpin = (): Spin => ({ time: -Infinity, air: false, base: 0, takeoff: 0, from: 0, rest: 0, was: 0, at: -Infinity });

const ease = (k: number) => 1 - (1 - k) ** 3;
const settle = (s: Spin, t: number) => Math.min(1, (t - s.at) / SETTLE);

// Advances to this state's moment and returns the angle to draw (clockwise on screen, before the
// gravity mirror) and how far it has moved onto an odd side (0 upright or upside down, 1 on its
// side), which a skin that is not square needs to keep its feet on the ground.
export function spinAt(s: Spin, state: GameState): { angle: number; side: number } {
  const t = state.time;
  if (t < s.time || (state.mode !== "square" && state.mode !== "pogo")) Object.assign(s, newSpin());
  s.time = t;
  const odd = (a: number) => Math.round(a / QUARTER) % 2;
  if (!state.grounded) {
    if (!s.air) {
      s.air = true;
      s.base = s.from + (s.rest - s.from) * ease(settle(s, t));
      s.takeoff = t;
    }
    return { angle: s.base + (t - s.takeoff) * TURN, side: odd(s.rest) };
  }
  if (s.air) {
    s.air = false;
    const landed = s.base + (t - s.takeoff) * TURN,
      rest = Math.round(landed / QUARTER) * QUARTER,
      whole = Math.floor(rest / TURN) * TURN;
    s.was = s.rest;
    s.from = landed - whole;
    s.rest = rest - whole;
    s.at = t;
  }
  const k = ease(settle(s, t));
  return { angle: s.from + (s.rest - s.from) * k, side: odd(s.was) + (odd(s.rest) - odd(s.was)) * k };
}
