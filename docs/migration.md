# Clone Dash: release-stack migration

status: shipped. #13 is closed and the migrated build is live; #17 fixed a host-only
canonical-navigation defect found by the live pass and is live and verified.
level sharing follows independently in #14. this is not a measured performance claim.
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

## implementation record

The original artifact passed 43 unit tests and 62 browser tests on Chromium/WebKit.
The port now compiles the actual UI with Svelte and strict TypeScript, bundles with Vite,
and keeps the fixed-step engine, drawing and synthesized music separate from reactivity.
The save key and PWA identity are unchanged. There is no SvelteKit or added physics engine.

`tests/migration.test.mjs` reads the original modules from the pinned git objects, not a
second copy of the new code. It compares authored levels, thousands of per-step states,
all transformed object shapes, saved-data cases and every original song recipe.
The old editor/game browser assertions are retained. New tests cover lifecycle teardown,
an actual legacy-to-new installed update, failed candidate downloads, open-tab cache
retention, offline play/editor access, milestone versioning and emitted runtime licences.

Release gates passed and independent review is complete: hosted checks green, a real-origin
old-to-new update verified on both engines, and the served worker, bundle, headers and bundled
licence checked at the origin. Do not describe it as child-playtested, faster, or proof that every possible
physics path is identical.

### measurement scope

`npm run measure:migration` compares the pinned original and built candidate in fresh
desktop Chromium contexts on the same empty custom trail (932×430, sound off). A local
smoke run measured 0.10 ms median / 0.20 ms p95 synchronous frame-callback work for both;
first interaction ready was about 41 ms for each. Pointer-event-to-player-draw was 0.5 ms
original / 1.7 ms candidate in that single run. These small samples are diagnostics, not
a speedup claim: they exclude actual display scanout and asynchronous UI work, ran on a
desktop, and do not establish iPhone performance. Real phone playtesting remains required.

The release tests intentionally break speed and ground height in disposable copies and
require the pinned physics/drawing oracles to fail. They run in CI, not just this receipt.
Browser teardown also completes an in-flight music render after unmount and checks that
it starts no playback; the remount owns one frame loop and one canvas. The new update
interaction is reachable inside the native pause dialog, not inert behind its backdrop.

### independent boundary oracle

An independent pre-migration capture was recorded from the shipped game at
`d95ab9d60ec6b0fadc34f22dc692591ac00b98a0` before any port work existed, then replayed against
the migrated engine. Every recorded value matched: the physical constants, the exact membership
and order of the type vocabularies, transformed geometry for every object type across the four
valid rotations and both flips, the landing and ramp contact results, the whole `clonedash.v1`
save contract including each refusal message, and per-step trajectories for all nine authored
trails. The comparison was verified to be capable of failing before that result was accepted:
deliberately shifting the run speed in the candidate moved the compared values.

Most of that capture duplicated what `tests/migration.test.mjs` already proves against the pinned
original, which rebuilds its baseline from git objects on every run rather than trusting a stored
snapshot. Only the cases the existing suite could not reach were kept, so the repository gains
tests rather than a recorded blob that would drift:

- **contact epsilon.** `intersects` separates touching polygons with a `0.00001` tolerance.
  Nothing previously exercised that threshold, so a widened or removed tolerance changed no test.
- **ramp span collapse.** `rampSurface` discards spans narrower than the same tolerance and
  reports no surface. The transition between reporting a height and reporting none was unpinned.
- **ceiling tolerance.** `validateLevel` admits an object whose transformed top exceeds the world
  height by up to that tolerance and refuses it beyond. Reaching this needs a tall shape in a tall
  world, because the per-object vertical bound rejects a one-high block before the ceiling check
  runs.
- **input isolation.** `validateLevel` returns a deep copy. Mutating the returned level must not
  reach the caller's object, which no assertion covered because the difference is invisible until
  something writes to the result.

`scripts/check-mutations.mjs` carries one deliberate mutation for each of these, so a future change
that loosens a tolerance or returns a shallow copy fails the suite instead of passing quietly.

A fifth candidate was dropped rather than added: `polygon` rounds its rotation cosine, which only
matters off the ninety-degree grid. Objects are created at zero, rotated only in ninety-degree
steps, and validation refuses any other angle, so no reachable state depends on it. A test there
would pin a path the app cannot enter.
