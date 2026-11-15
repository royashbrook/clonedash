# coins, group ids and triggers

tracked in #101, from player feedback: coins (at most 10), triggers with their own
editor tab, group ids in EDIT OBJECT, a move trigger and a colour trigger, and the name cube dash.

## the pieces

- **coin**: placed from the COINS tab. a disc in the middle of its cell, picked up when the
  player's full body touches it, never solid, never lethal. a coin can never be NO TOUCH (every
  reader refuses it and EDIT OBJECT does not offer it) or on the background layer; a HIDDEN one is picked up but not drawn. the run HUD shows `picked up / in the level` on a level
  that has coins and nothing on one that doesn't.
- **group id**: `group`, a whole number 1 to 99 on any piece but a trigger, set in EDIT OBJECT
  (blank or 0 is none, stored as no field). ids are level-local: there is no registry across
  levels, and copy + paste, group copy, share codes and EDIT A COPY keep membership as it is.
- **move trigger** and **color trigger**: placed from the TRIGGERS tab, set in EDIT OBJECT.
  `target` is the group it works on; a move trigger has `moveX` and `moveY` (whole blocks,
  negative is left or down); a colour trigger has `color` (the ring palette, #rrggbb); both have
  `duration` (seconds, 0 or absent is instant). drawn in the editor and in TRY as a dashed cell
  with what it does and `G <target>`; never drawn and never touched in play.

## the rules

1. **authored data is immutable.** a run never writes the level it was given. coin pickups,
   fired triggers, running moves and colours live in per-run state (`GameState.fx`, built once by
   `effects()` in engine.ts). a level with a move trigger is played on the run's own shallow copy
   of its pieces (`state.level`); `Run.level` keeps the authored level, and a restart, a death,
   RESTART LEVEL, a replay or leaving test play builds a fresh state from it, so every moved
   position, colour and coin comes back. EDIT A COPY copies `Run.level`, never the moved copy.
   a level without coins or triggers gets no `fx` and plays its authored level, exactly as before.
2. **firing and contact, one step** (engine.ts `settle`, levels with coins or triggers only):
   2a. running moves are placed at this step's time, before any contact.
   2b. contact pass one, from the state the step had before contact.
   2c. every unfired trigger whose x the run's x from pass one has reached fires, in authored
       order, however many and wherever they are on screen. a run held short of a trigger (a wall)
       never fires it. that pre-effect reach is what fires a trigger, not where the step ends.
   2d. if a fired trigger moved a piece at once, contact runs again from the state before 2b
       (position, speed, gravity, mode, ground, wall, the portals already touched, and any coin
       pass one picked up), on the moved pose. that second pass is the step's result, so the
       collision of the step that fires a move and the pose drawn after it are the same.
   2e. the second pass fires nothing. a trigger only it reaches fires on the next step (a cascade
       waits a step), and a piece it moved into the way can hold the run back behind a trigger
       that already fired; that trigger stays fired.
   a timed move starts where the piece already is, and colour never touches contact, so neither
   needs a second pass.
3. **overlap.** a new move on a piece starts from where that piece is at that moment and replaces
   the move it had (the rest of the old move is dropped). a new colour starts from the colour
   showing at that moment and replaces the fade it had. in one step, a later trigger in authored
   order sees what an earlier one did.
4. **triggers cannot be grouped or moved.** `group` on a trigger is refused, so nothing can move
   a trigger and the order they fire in never changes.
5. **the run clock.** moves and fades are linear in the run's own time (`state.time`), never the
   wall clock, so pause freezes them, render cadence does not change them, and a recording of the
   held input replays a triggered level frame for frame.
6. **one pose.** collision and drawing read the same moved piece, so a piece moved into view from
   outside the first camera is drawn exactly where it collides. a colour is drawn over the piece:
   blocks, spikes and slopes get the colour filled over their own fill (the fade is how much of
   it covers them), rings, portals and coins mix it into their own colour.
7. **bounds at every reader.** `validateLevel` is the one check every reader goes through (a save,
   a library entry, a share code or file, EDIT A COPY, copy + paste of a piece or a group), and it
   refuses: an 11th coin, a group or target outside 1 to 99, a move that isn't a whole number of
   blocks or is further than the level is long (x) or tall (y), a time outside 0 to 30 seconds,
   NaN or Infinity anywhere, and trigger fields on pieces that aren't triggers. an invalid import
   is refused whole, before anything is written.
8. **best coins.** the best is the most coins picked up in one completed run, never a sum over
   tries; a run that dies keeps nothing. built-in trails keep it in `save.coins[index]` beside
   `save.best`; my levels keep it on their library entry (`customLevels[n].coins`), since custom
   levels have no best percentage. if a level is edited so it holds fewer coins, the best shown is
   clamped to what the level holds now (the stored number is left alone, it only ever shows as
   at most the count).
9. **old data.** every new field is optional and absent by default, so old saves read back byte
   for byte, old `cdl1` codes decode to the same level and re-encode to the same code, and the
   envelope is unchanged. an older copy of the game refuses a level with coins or triggers rather
   than dropping them silently.

## how it is pinned

- `tests/coins.test.mjs`: the cap at every reader, pickup, best coins, broken coin saves.
- `tests/triggers.test.mjs`: validation and bounds, round trips, instant, timed and negative
  moves, fire once, collisions on the moved pose, restart and death, overlap, ties and several
  triggers in one step, pause, colour targeting and fades, drawing on the moved pose, replay and
  render-cadence determinism, and that no built-in course changes.
- `tests/parity.test.mjs`: every built-in level against main (`bdf5958`) frame by frame through
  deaths and restarts, the Remix witness recordings, and share codes and saves captured on main
  (`tests/fixtures/main-bdf5958.json`). the older frame-by-frame oracle in
  `tests/migration.test.mjs` still runs unchanged.
- `tests/cube.spec.js`: the browser checks, both engines.
- `npm run test:mutations` breaks each rule above in turn and expects its test to fail.

## the name

players see cube dash: page title, header, install name, About, share text, share file name,
credits page and import error text. the repository, domain, worker cache names (`clonedash-`),
save key (`clonedash.v1`), `cdl1.` share codes, the `.clonedash.txt` file ending and the build
variables keep the old name so saves, installs and shared levels keep working. the seventh
warmup trail keeps its own name, Clone Dash, and its song name, since both are pinned content.
