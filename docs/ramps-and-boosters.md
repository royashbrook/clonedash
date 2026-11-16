# angle contact, swipe, boosters, size and two new rings

tracked in #106, from player feedback: the angle dies when it touches a block or a ramp, a swipe
option for placing blocks, boosters (flat pads that bounce you with no tap, one for each ring), a
size for every object, and two new rings, a black one with a down arrow and a gray one with a "-".

## the pieces

- **black ring** (`drop-ring`): a tap sends you down fast, as if you had been falling from high
  for a while. **gray ring** (`stop-ring`): a tap stops your rise or fall, as if you were neither
  falling nor bouncing. Both act like rings (tapped, once per run, any ring colour) but are pieces
  of their own, not fields on `ring`, so an older copy of the game refuses them (rule 7).
- **booster** (a pad): a flat strip along the bottom of its cell. Touch it and it fires, no tap.
  Seven kinds, one for each ring effect: `yellow-pad` (the yellow ring's bounce), `pink-pad` (a
  one block hop, the small ring's bounce), `red-pad` (a five block launch), `blue-pad` (gravity
  flip), `green-pad` (gravity flip and bounce), `black-pad` (drop) and `gray-pad` (stop). There is
  no dash booster and no custom one. Placed from the BOOSTERS tab.
- **size**: every piece with a body takes `scale`, 0.25 to 4, from the Size slider or a pinch.
- **swipe**: a SWIPE switch in the editor, off at first.

## the rules

1. **angle contact.** solid-object contact is deadly; world floor and ceiling remain safe.
   1a. in angle mode, touching any block, ramp or curve kills: landing on it, its underside, its
       side, a turned block, in either gravity. the angle's whole body is the contact box, and the
       check runs before any support snap, so nothing lands it on a face first. the floor and the
       level's ceiling are not pieces and stay safe to slide along.
   1b. the explicit overrides keep the meaning they have in every mode. while a W (zone or WALL
       PASS) applies to a piece, the angle meets that piece with the same hazard box every mode
       uses at a wall, a side hit stops it at the same face, and it can climb that face and carry
       on over the top; any other entry into that box (landing on it) kills. an R (zone or ROOF
       PASS) turns a head hit on a block into a bump, the head being the side gravity points away
       from (the top face when upside down), as the R works in every mode; the feet meeting it, or
       its side, still kill.
   1c. background and NO TOUCH pieces are never touched; a HIDDEN piece still is. spikes kill as
       before. the angle stays a riding mode for the world edges only (engine.ts `SOFT`).
   1d. old levels load unchanged, without rewriting, but an angle that rode a block there now
       crashes on it. that is the request.
2. **built-in courses.** four Remix trails have angle sections whose recorded witness rode block
   faces (Shapeshifter, Quick Change, Block Party, Grand Finale). none needed new geometry: every
   built-in course is still finished, under the new rule, by input alone. only those four witness
   timelines (`tests/remix-inputs.mjs`) were re-recorded, each from its angle portal on
   (`scripts/remix-witness.mjs "<trail>@<x>"`, x 240, 156, 126 and 182), keeping every flip before
   it. the search keeps the angle 0.01 clear of every solid it is not held against by a W, so a
   recorded path never rests on the contact tolerance. the new timelines replay frame for frame
   on main too, so the parity oracle compares every built-in and every Remix witness exactly as
   before. the old timelines are kept as the control: each still finishes on main, and today it
   parts from main in angle mode inside that section and dies there against a solid. no-input and
   always-held runs still fail every Remix trail.
3. **drop and stop.** `DROP_SPEED` is 24 blocks a second (1.5 seconds of the level's gravity), a
   speed set once in the current gravity's direction; it is not a new fall limit, there is none.
   stop sets the vertical speed to 0 once; gravity carries on at once.
   3a. where: a black or gray ring sets the speed where the yellow ring sets its bounce, at the
       start of the step it is tapped in. a booster fires at the end of the step's contact, after
       every portal, so it is the last word in that step.
   3b. the same step: a drop or stop ring that fires skips that step's square or pogo jump, and
       ends a dash in progress (a booster of any kind ends a dash too). in angle mode a black or
       gray ring is not ready (not drawn lit, the tap is not used) and every booster is inert
       (it neither fires nor counts as touched). a plane's speed limit (4 blocks a second up or
       down) applies after, as it does to every ring, so a black ring in a plane is a dive at that
       limit. a booster that fires in a plane is held to the same limit in the step it fires
       (the limit is applied again after it), so a black booster dives at 4 and a yellow one
       climbs at 4, never at their full speed for a step. a gravity or plane portal touched
       later in the same step sets its own speed over the ring's, as it does over the yellow ring.
   3c. old rings are untouched: the yellow, coloured, gravity, green and dash rings keep exactly
       the order they had.
   3d. refused by every reader: a black or gray ring with `bounce`, `flipsGravity`, `boost` or
       `dash` (those are the plain ring's fields), or turned off a quarter turn. a ring cannot be
       both, since each is its own piece.
4. **boosters.**
   4a. the active face is the strip: the bottom quarter of the cell, inset a tenth at each side.
       it turns with the piece, so a booster turned 180 degrees hugs the top of its cell, for a
       ceiling. it fires when the player's body overlaps the strip, wherever it is: on the floor,
       on a block, on a ceiling or in the air (a booster needs nothing under it). the overlap is
       read from the final pose, after every portal and support of the step, so a portal that
       moves the run off a booster first means it was not touched, whichever was authored first.
   4b. fire once per touch: a booster fires when the body first overlaps it, not again while it
       stays overlapped, and again after the body has left it and comes back. this is not a
       ring's once per run.
   4c. one booster per step: if several start touching in the same step, the first in authored
       order fires and the rest count as touched. a ring tapped in that step fired first, so the
       booster's effect is the one that stands.
   4d. it uses the real pose: a booster a trigger moves, a scaled one, a HIDDEN one (it fires but
       is not drawn) all fire where they really are; a NO TOUCH booster never fires.
   4e. the yellow, pink and red boosters bounce you away from gravity like their rings; the blue
       and green ones flip gravity like theirs; black and gray do what their rings do and do not
       bounce you up.
   4f. touch bookkeeping is run state (`GameState.fx.pads`, like coins), so a level with no
       booster has exactly the state it always had. when a trigger moves a piece instantly and
       contact runs again (docs/coins-and-triggers.md rule 2), the boosters touched before the step
       and the speed, gravity and dash are put back too, so the second pass fires a booster
       exactly when it really touches it: never twice, never lost.
5. **size.** every piece with a body takes a size: blocks, spikes, ramps and curves, zones, rings,
   portals, coins and boosters. triggers have no body and refuse it.
   5a. a size is finite, 0.25 to 4, and size 1 is no field, so an unsized piece reads and writes
       exactly as before.
   5b. one shape: a sized piece grows from its own base in its own turned frame (engine.ts
       `polygon` and `pointOf`), and that one shape is what is drawn, what a tap picks, what the
       player touches and how far the contact pass looks. a ring's centre rises with its size and
       its reach grows with it; a portal, coin and booster scale the same way.
   5c. every reader checks it: a save, a library entry, a share code or file, EDIT A COPY, copy
       and paste and group moves. a sized ring, portal, coin or booster must fit under the level's
       ceiling, the default 7 included. other pieces keep the ceiling check they had (only when the
       level sets a height), so an old level still loads.
   5d. the angle slider stays on the pieces it was on (blocks, spikes, ramps, zones and the dash
       orb); everything else still turns in quarter turns.
6. **swipe.**
   6a. off (the default): the editor is exactly as before. a tap places or selects, MULTI sweeps a
       box, two fingers size and turn the selection, and the Scroll slider moves the view; a one
       finger drag does nothing else.
   6b. on: one finger dragged across the grid places the chosen piece in every empty cell its
       path crosses, or with ERASE, removes every piece on the layer its path crosses. cells
       between two touch samples are walked exactly, so a fast drag leaves no gap. a cell already
       holding that kind of piece is left alone, so going back over a cell neither doubles it nor
       removes it. SELECT and MULTI behave as they do with swipe off.
   6c. a stroke keeps every rule a tap has: the start and finish margins, the ceiling, the
       background layer (blocks only) and `validateLevel`. at the 600 object cap or the 10 coin cap
       it stops placing, shows the same message a tap shows, and keeps what it placed. the level is
       saved once, when the stroke ends; an invalid level is never saved.
   6d. a stroke ends when its finger lifts, on pointercancel, when the page loses its pointer
       capture, when the window loses focus or the page is hidden, and when a sheet opens. a second
       finger ends it before a pinch starts.
   6e. UNDO and REDO (shown with SWIPE on) step through strokes: one stroke that changed something
       is one step, a stroke that changed nothing is none. undo puts back the pieces and the
       selection from before the stroke; redo puts back the stroke. a new stroke after an undo
       drops what could have been redone. any other edit (a tap, a move, a size, a setting, another
       level) clears the history, so an older stroke can never undo it. at most 30 strokes are kept.
7. **old data.** every new field and type is optional and new, so old saves read back as they
   did, old `cdl1` codes decode to the same level, and an old level encodes as main encodes it.
   an older copy of the game refuses a level that uses anything new rather than playing it as
   something else: a booster or a black or gray ring is a piece it does not know, and a sized
   ring, portal or coin is a size it refuses. (its reader drops fields it does not know, which is
   why the black and gray rings are pieces, not fields.)

## how it is pinned

- `tests/angle.test.mjs`: each contact case in both gravities, the W and R overrides, background,
  NO TOUCH and HIDDEN, the world edges.
- `tests/parity.test.mjs`: every built-in and every Remix witness against main (`bdf5958`), and
  the old angle timelines as the control.
- `tests/courses.test.mjs`: every course finished at human rate, with its no-input and held
  controls.
- `tests/boosters.test.mjs`: drop and stop, priority, validation, boosters, settle.
- `tests/size.test.mjs`: sized geometry, ring reach, the ceiling, readers and transforms.
- `tests/swipe.test.mjs`: the cells a stroke covers, painting and erasing, caps, the history.
- `tests/boosters.spec.js`: the browser side, both engines, with real pointer input.
- `npm run test:mutations` breaks each rule above and expects its test to fail.
