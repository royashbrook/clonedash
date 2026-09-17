# Clone Dash: proposed release-stack migration

status: architecture recommendation for review, not implementation or a performance claim.
implementation waits for approval of the release rules and this project plan.
source inspected: `c00928c1c005aad711b752690881b9b5f332a089`.

## keep the game; improve its boundaries

the existing split is already useful:

- `public/engine.js`: framework-free collision, transforms, validation and modes, fixed
  `STEP = 1 / 120`; speed 5 blocks/sec and the approved 2.25-block square jump.
- `public/render.js`: Canvas 2D using the engine's geometry.
- `public/music.js`: synthesized per-level tracks and an audio controller.
- `public/library.js`: validated local levels, under the existing `clonedash.v1` save key.
- `public/app.js`: DOM construction, input, frame loop, editor, navigation and update logic
  coupled in one controller. this is the main shell/lifecycle migration boundary.

recommend **plain Svelte + strict TypeScript + Vite**, retaining Canvas 2D and Web Audio.
there is no demonstrated need for SvelteKit routes or a physics dependency yet. Svelte owns
menus, editor controls, settings, dialogs, accessible labels and lifecycle cleanup. typed
engine/render/audio controllers own fast-changing state and publish only useful UI changes.
do not animate the physical player with a Svelte transition and infer collisions from it.

this recommendation follows inspected code, not a benchmark. current source already has
fixed steps, pause/interruption handling and camera easing. migrating framework alone does
not prove those improve. profile on the target phone before choosing a new renderer or
rewriting physics.

## acceptance before implementation expands

1. capture the current build, all nine completion witnesses, mode/gravity/ring/ramp contact
   cases, editor transforms, level library, original music and save fixtures as the baseline.
2. port pure modules to strict types without silently changing collision geometry, input
   windows, jump height or speed. compare outcomes against the pinned implementation.
3. move the shell/editor controls to Svelte, with one disposable loop/input/audio owner.
   remount, pause, pointer cancellation, orientation changes and returning from a test run
   must not duplicate listeners or lose a level.
4. replace the copy-only build with Vite and artifact-based browser tests. preserve origin,
   manifest identity and save keys; prove a real installed old-to-new update and offline
   editor/play behavior. add save export/import if absent, independently of the shell port.
5. measure frame pacing, input-to-visible response, pause/retry music alignment and first
   interaction readiness with the same scenes before/after. make game-feel improvements as
   separately reviewed changes, then playtest with real controls and the intended audience.

the existing Playwright config already runs Chromium/WebKit against `dist/`: its command is
named `npm run dev`, but `scripts/serve.mjs` actually serves the built directory. preserve
that artifact-testing property after replacing the copy-only build with Vite. test names
and script labels alone are not evidence of what executes.

no source files, deployed builds or saves are changed by this recommendation.
