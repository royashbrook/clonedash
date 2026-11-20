# Playing with the phone held upright (#138)

1. The shape is the window's, read fresh: `innerHeight > innerWidth`, checked on every resize and at
   the top of every frame. A phone that skips a resize, or sends it before the sizes change, cannot
   leave the game on the old shape.
2. Only the level editor asks to turn the phone ("Turn sideways to build"). Home, My Levels, skins,
   loops, a run and every sheet work upright. The prompt's one button goes to My Levels.
3. Turning the phone during a run pauses it. The run stays exactly where it was, the music stops, a
   held jump is let go and any finger that was down is forgotten, so nothing waits on a touch from
   before the turn. RESUME carries on from the same spot. An editor test run is a run, so it pauses
   too, and BACK TO EDITOR returns to the editor, which then asks to turn.
4. In the editor a turn ends every gesture where it stands: a SWIPE stroke keeps only what it painted
   before the turn, a pinch keeps and saves its last good shape, a MULTI box is dropped, and a finger
   from before the turn counts again only when it comes down fresh, even if its moves still reach
   the canvas.
5. Turning while the pause sheet is open rebuilds it, so the zoom buttons follow the shape. Turning
   under any other sheet leaves it alone. A finished run is never paused.
6. Upright, the run looks up to 1.5 blocks further ahead, never so far that the cube sits closer than
   a block to the left edge: at the start line the look-ahead is nothing and it grows as the run gets
   going, so the cube is on screen from the first frame. The pause sheet holds ZOOM OUT and ZOOM IN
   (0.7 to 1.5, in tenths), upright only, where a tap can never be a jump. The zoom holds through
   resume, restart and turning sideways and back. Sideways always draws at 1 with no look-ahead.
7. Across a turn the look-ahead and zoom ease to their new values (exponential, settled in about a
   third of a second), with no extra spin of the screen. Reduced motion snaps. Starting a run, a zoom
   tap and anything else that is not a turn snap too.

## Proof

- `tests/portrait-play.spec.js`, both engines: upright from a cold start (menus take taps, a run plays,
  zoom in the pause sheet, zoom holds on resume), a turn mid-run both ways (paused, progress frozen,
  no prompt, zoom buttons follow, resume plays on, exit to a library that takes taps), a turn with the
  game's resize listener gone, the editor prompt and its exits, and the framing easing (snapping with
  reduced motion), read from `data-framing` on the canvas.
- `tests/portrait-input.spec.js`, both engines: a SWIPE stroke held across a turn (a real mouse, and a
  captured finger whose moves still reach the canvas), a pinch held across a turn (saved at the turn,
  later moves ignored), a MULTI box held across a turn, and the look-ahead at the start line.
- `tests/framing.test.mjs`: the easing moves toward its target, never past it, and settles.
- Not proven: a real phone's rotation. The tests resize the window, the way a turn reaches the page.
  A MULTI box kept past a turn would only leave its outline drawn until the next box; no test sees it.
