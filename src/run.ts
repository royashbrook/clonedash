import { createState, step, STEP, levelHeight } from "./engine.ts";
import type { GameState, Level } from "./types.ts";

/** Mutable simulation state is not a Svelte store. Only the HUD snapshot crosses into UI. */
export class Run {
  state: GameState;
  attempt = 1;
  deathTime = 0;
  readyTime = 0.4;
  held = false;
  jumpBuffer = 0;
  acc = 0;
  camera = 0;
  cameraY = 0;
  learned = false;
  cueUntil = 5;

  constructor(level: Level) {
    this.state = createState(structuredClone(level));
  }
  release() {
    this.held = false;
  }
  interrupt() {
    this.held = false;
    this.jumpBuffer = 0;
    this.acc = 0;
  }
  press() {
    this.held = true;
    this.jumpBuffer = 0.12;
    this.learned = true;
  }
  reset() {
    this.state = createState(this.state.level);
    this.deathTime = 0;
    this.readyTime = 0.4;
    this.cameraY = 0;
    this.cueUntil = 5;
    this.interrupt();
  }
  advance(dt: number) {
    let died = false,
      complete = false,
      restarted = false;
    if (this.state.status === "complete") return { died, complete, restarted };
    if (this.state.status === "dead") {
      this.deathTime += dt;
      if (this.deathTime >= 0.65) {
        this.attempt++;
        this.reset();
        restarted = true;
      }
    } else if (this.readyTime > 0) this.readyTime -= dt;
    else {
      this.acc += dt;
      const state = this.state;
      while (this.acc >= STEP && state.status === "playing") {
        const grounded = state.grounded,
          previousMode = state.mode,
          ringsUsed = state.usedRings.length,
          freshTap = this.jumpBuffer > 0;
        step(
          state,
          this.held || (state.mode === "square" && this.jumpBuffer > 0),
          STEP,
          freshTap,
        );
        this.jumpBuffer =
          (freshTap &&
            (previousMode === "wheel" || previousMode === "jumper")) ||
          ringsUsed !== state.usedRings.length ||
          previousMode !== state.mode ||
          (grounded && !state.grounded)
            ? 0
            : Math.max(0, this.jumpBuffer - STEP);
        if (previousMode !== state.mode) {
          this.learned = false;
          this.cueUntil = state.time + 4;
        }
        this.acc -= STEP;
      }
      if (state.status === "dead") {
        this.deathTime = 0;
        this.held = false;
        died = true;
      }
      if (state.status === "complete") complete = true;
    }
    this.camera = Math.max(0, this.state.x - 3);
    const targetY = Math.max(
      0,
      Math.min(levelHeight(this.state.level) - 7, this.state.y - 3),
    );
    this.cameraY += (targetY - this.cameraY) * (1 - Math.exp(-10 * dt));
    return { died, complete, restarted };
  }
}
