# width and height, turning in place, touch triggers and multi touch rings

a third play-test list (#117): any colour in a skin (skins.md), separate width and height for a
piece that grows from its middle, turning a sized piece in place, triggers that fire on touch and
again on every touch, and rings that work again once you have left them.

## the rules

1. **two sizes, two modes.** a piece with a body takes either the older single `scale` or the
   newer `scaleX` and `scaleY`, never both.
   1a. `scale` keeps its #106 meaning exactly: it grows from the piece's base in its own turned
       frame (ramps-and-boosters.md rule 5b). every built-in course, recording and saved level
       that uses it plays as it did.
   1b. `scaleX` and `scaleY` come together, each finite 0.25 to 4, never on a trigger. the piece
       grows from its middle along its own turned axes, so it stretches out both ways and a turn
       or flip only changes which way it faces. both equal to 1 is no field: at 1 the two modes are
       the same shape, so an unsized piece has one meaning.
   1c. one geometry for everything: drawing, collision, a ring's centre and reach, editor
       selection, the contact pass's broad reach and bounds all go through engine.ts `axes`,
       `centred` and `frame`.
   1d. a width and height ring reaches an ellipse in its own turned frame, tested against the
       player's whole box (engine.ts `inReach`). a single-scale ring keeps its circle test.
   1e. a width and height piece of any type must fit under the level's ceiling, like a sized
       ring, portal, coin or booster.
2. **converting a single-scale piece.** the first edit that really changes a single-scale piece's
   size or turn (a Width or Height slider, the Angle slider, a quarter turn, a flip, a pinch)
   converts it first: its middle is `pointOf(piece, w/2, h/2)`, its anchor becomes that middle
   minus half its unsized box, exactly, with no rounding, and both axes take the old scale. its
   shape does not move. then the edit applies.
   2a. a slider set to the value it already has, opening a sheet, or a pinch that ends unchanged
       converts nothing.
   2b. the anchor bounds are the same numbers for both modes: x from 3 to length minus 2, y from
       -0.5 to height minus 1. a conversion whose exact anchor falls outside them is refused like
       any other edit that breaks the level: the toast shows, the piece stays single-scale and
       unmoved, and the draft and storage keep what they had. nothing is clamped.
   2c. turns and flips never move the anchor. a converted anchor can sit off the twentieth grid;
       the first arrow nudge puts it back on the grid (at most 0.025 of a block), as every nudge
       always has. a group turn or flip sets the group back on the grid, as it always has.
3. **the size controls.** WIDTH and HEIGHT sliders, 0.25 to 4 in twentieths, each changes only
   its own axis.
   3a. a pinch scales both axes by one common factor, so the piece keeps its shape: 2 by 0.5
       pinched 1.2 times is 2.4 by 0.6. the factor is held so neither axis leaves 0.25 to 4.
   3b. snap off: each axis rounds to a twentieth. snap on: the factor is picked so the larger axis
       lands on a quarter and the other rounds to a twentieth, so a piece with equal axes snaps
       to quarters as before.
4. **touch triggers.** `touch: true` on a move or colour trigger fires it when the player's body
   overlaps the trigger's cell (the same edge tolerance as every overlap), not when the run passes
   its x and not on a tap.
   4a. it is sampled once a step, on the first contact-resolved body, in authored order, as pass
       triggers are. the second contact pass after an instant move neither fires nor re-arms it,
       so a trigger only that pass reaches waits for the next step.
   4b. a touch trigger fires once a run. `multi: true` (only with touch) fires it on every new
       touch: the body has to leave the cell before it can fire again, and frames spent inside do
       not restart its move or fade. the entry counts even when its group is empty.
   4c. a move or colour that replaces one still running starts from the pose or colour showing
       now, as before.
   4d. in the editor, TOUCH is a checkbox on the trigger's sheet and MULTI shows only while TOUCH
       is on. unchecking TOUCH clears MULTI.
5. **multi touch rings.** MULTI TOUCH in EDIT OBJECT sets `multi: true` on a ring, black ring or
   gray ring. a used multi ring re-arms at the start of a step, before that step picks a ring,
   once the player is out of the reach that fired it. while still inside it does nothing more,
   whatever is tapped. a plain ring still needs a fresh tap and a dash orb still needs a hold.
   5a. default rings still work once a run. a restart starts every ring fresh.
   5b. boosters already fire on every landing, so `multi` on a booster or any other piece is
       refused.
6. **sharing.** a level that uses `scaleX`, `scaleY`, `touch` or `multi` travels as a `cdl2`
   code; every other level is the same `cdl1` code, byte for byte, it always was. the code, link,
   file and QR are one string, so one prefix covers all four.
   6a. a copy of the game from before #117 refuses a cdl2 code at its prefix check, raw or
       compressed, instead of playing a different level.
   6b. this copy reads both. a cdl1 code that carries any of the new fields, or a cdl2 code that
       carries none, is refused as an invalid code. the byte, inflate and deadline bounds are the
       same for both.
   6c. this is a promise about codes. saves on the device are not versioned, so an older copy
       still open in another tab is not covered when it reads this copy's levels.

## how it is pinned

- `tests/width-height-touch-multi.test.mjs`: one test per rule above: both modes' geometry,
  exact conversion, the anchor bound, field checks, the ellipse reach, multi rings, touch and
  multi triggers with the second pass, and the cdl1/cdl2 boundary.
- `tests/gesture.test.mjs`: the common-factor pinch and its snap.
- `tests/parity.test.mjs` and the course witnesses: every single-scale and unsized level, as before.
- browser specs: `tests/scale.spec.js` (WIDTH and HEIGHT, conversion only on a real change),
  the pinch in `tests/boosters.spec.js`, and the trigger sheet and MULTI TOUCH.
