# Loops (#121)

The loop maker lets a player write a short song loop, play it live, save it, and share it the way
skins and levels are shared. It plays the same instruments every synthesized song uses
(`src/voices.ts`), so a loop sounds like the game.

## A loop

`src/loop.ts` `validateLoop` is the one definition. Anything else is refused, never repaired.

| field | rule |
| --- | --- |
| `name` | string, at most 40 characters |
| `root` | integer 36..48, the key (MIDI note of the bass) |
| `wobble` | integer 1..8, bass wobbles per beat |
| `drop` | boolean, the brighter, harder sound |
| `notes` | 8, 16, 24 or 32 steps (whole bars), each a sorted list of distinct degrees from `0 3 5 7 10 12 15 17 19 22` |
| `kick` `snare` `hat` | sorted lists of distinct steps 0..7 |

A step is an eighth note (0.2 s at 150 BPM, `BEAT / 2`). One bar is 8 steps. The chord moves like a
song's, `[0, -5, 3, -2]` every two bars.

Presets start from any of the 109 synthesized songs (`music.ts trackFor`): its key, wobble and
melody, with the default drums. The 14 recorded songs are audio files, so they are not offered.

## Length (#140)

A new loop is 8 steps. TOOLS sets 8, 16, 24 or 32. Growing appends silent steps to the notes and
every drum row; the key, wobble, drop and every kept step stay as they were. Cutting asks first only
when the cut steps hold notes or drum hits, and KEEP IT leaves the draft exactly as it was. A bar is
still 8 steps, so the chords move the same way at any length: the pad sounds at each bar start, the
bass on even steps, and the loop position is the running step count modulo the length. PLAY and its
playhead wrap at the length. A loop level renders a whole number of loop passes and of the 64-step
chord cycle, at least 16 bars: 128 steps (25.6 s) for 8, 16 and 32, 192 (38.4 s) for 24.

The length is the notes array length. 1.0.120 and older require exactly 8, so they refuse a longer
loop (its code, link, file, save or level), never cut it short.

## On a phone (#140)

The editor is a fixed column: the header (back, name, PLAY, SAVE), one toolbar (TOOLS, SWIPE, HELP,
and a row of page tabs when the loop is longer than 8), then the grid in the space left above the
bottom bar. TOOLS (start from a song, key, wobble, length, drop, surprise, clear) and HELP open over
the grid and leave the draft as it is; a tool that replaces the notes or the length closes the panel.
The grid shows 8 steps, 10 note rows and 3 drum rows (hi-hat, snare, kick, top to bottom) with no
legend; cells grow to 44px and shrink to fit a phone held upright, never below 22px tall (a short
sideways screen scrolls the grid under the fixed toolbar). Narrow screens page eight steps at a time.

On a wider editor (#142), bars of eight sit side by side and can wrap onto a second row. The editor
measures the space above the dock, shows as many bars as fit, then favors larger pads. A partial
page uses the same step numbers and note positions. Resizing changes the view, not the loop or its
playback clock.

The bottom bar stays in the loop editor. A tab leaves through the editor's own ask: with changes it
asks "Leave without saving?", KEEP IT keeps everything, LEAVE goes to the tab that was tapped. MORE
silences a playing loop and opens over the draft.

## Saving

`localStorage` key `clonedash.loops.v1`: `{ version: 1, next, loops: [{ id, loop }] }`, at most
100 loops. It follows the skin store's rules: each write re-reads the stored loops, applies the
one change, writes, and reads back; a store it cannot read is never overwritten. The level save
and skins are never written by it.

## Sharing

A loop travels as a `cdm1.` code in the shared envelope (`transfer.ts packCode`): deflate-raw or
raw, base64url, the bounded reader and its five-second deadline, 8 KiB decoded, 192 KiB of text.
A link carries it as `#loop=<code>`. Import previews it (name, the grid, PLAY) and ADD only adds a
new loop. A copy of the game from before loops refuses both: a bare `cdm1.` code is not a level
code, and a `#loop=` link holds no level or skin.

`codeKind` sends text to one of four decoders. Text over the whole-save ceiling is refused before
any link is parsed; anything that is not a whole save is then held to the 192 KiB cap. A link with
two recognized fragments, or one twice, is refused.

## In a whole save

The `cdb1` save (`src/backup.ts`, #124) carries the loop store as an optional `loops` field, under
the same rules as the rest: known fields only at store, entry and loop level, checked on the raw
data before any reader can normalize it, and the reader's result must equal what arrived. Loading
a save REPLACES this device's loops: a save without `loops` removes them, a save with an empty
store keeps its `version` and `next`. The write, read-back, restore and marker steps cover the
third key the same way; it is best-effort recovery, not a transaction.

## A loop as a level's song

Only a custom level can play a loop; built-in courses and the recorded songs never change. A level
has one song source: its own `loop`, or a numbered `song` (or neither, which is its original). It
is never both: the level reader refuses that. In the editor's Song picker, MY LOOPS lists the saved
loops; picking one stores a copy of it in the level, so editing or deleting the saved loop later
never changes the level, and picking a song removes the level's loop. Copying a level (EDIT A COPY),
sharing it, and moving a save keep exactly one source too.

What the level plays is the loop exactly as PLAY plays it, through the same step function
(`loop-player.ts playLoopStep`): the same key, chords per bar, drop, drums and notes, rendered for
16 bars (25.6 s) and repeated by the looping source. Live PLAY runs on without a seam; the rendered
song repeats its 16 bars, so the echo tail at the end of the 16th bar does not carry into the first.
The soundtrack keeps a buffer under what it sounds like (a song's number, or the loop's whole
content), so two levels with different loops never share one. As before, one render runs at a time
and one buffer is kept. A render or a failure that finishes after the level changed only fills the
cache or tries the music now wanted; it never silences the new choice. Losing focus or hiding the
page drops the wish to play at once, so a render finishing while the page is hidden stays silent.

On the wire, a level with a loop is `cdl3`, with every piece the game knows. A loop under `cdl1` or
`cdl2` (even `null` or a damaged one) is refused on the raw data, before anything could drop it, and
`cdl3` without a valid loop is refused. Levels without a loop keep the exact `cdl1`/`cdl2` bytes
they always had. A copy of the game from before loops refuses `cdl3` code, link and file. A level's
loop is bounded to 8 KiB as it arrives, before its check can drop anything, inside the level's own
128 KiB. In a whole save, the loop's fields are checked one by one before any reader runs. Importing
a level never adds its loop to My loops. Old tabs editing the same device's save are not covered:
the guard is for reading what arrives, not for a copy of the game from before loops writing.

## Playing

One live player owns the sound on the LOOPS screen, and the share sheet has its own for an incoming
loop. A 25 ms timer schedules steps 120 ms ahead into the player's output chain; a tapped cell plays
through a second, small chain. STOP, leaving the screen, opening a sheet or the page hiding cuts
both chains at once, so voices already queued are not heard, retires every live wobble modulator,
and voids any wake (resume) still pending, so a tap or PLAY that finishes waking afterwards makes no
sound. PLAY first cuts a tapped cell's chain. In the share sheet, sound starts only on PLAY and is
cut when the input changes, another preview arrives, ADD runs or the sheet closes.

A stalled tab or a late timer never catches up: steps whose time has passed are skipped, keeping
their place in the bar and the chord, and none of their voices is built.

A bass beat's wobble modulator is never left running: the offline render zeroes its depth at the
beat's end (#122), and the live player also disconnects, then stops, each one shortly after its
beat ends, so a session holds only the beats in flight.

Replacing the notes (START FROM, SURPRISE ME, CLEAR NOTES) asks first whenever the draft has notes;
KEEP IT leaves the draft exactly as it was. A draft with no notes is not asked.

## Proof

- `tests/compose-graph.test.mjs`: every synthesized song still builds the same graph, schedule and
  noise as compose on main 6b7071e, taken from git and run in the same process (a frequency's last
  bit comes from the JS engine's maths and differs between Node versions, so hashes frozen on one
  runtime could not judge another). This is graph/schedule/buffer-input equality, not PCM equality.
- unit: the loop schema, the store, the code and its bounds, codeKind, the whole save with loops.
- `tests/loop-player.test.mjs`, on a recording context with a clock the test moves: a ten-second
  gap starts nothing in the past and keeps the phase, the last step wraps to the next bar, a STOP
  or a rejected resume during waking leaves no sound and no timer, a tapped cell is cut by STOP and
  by PLAY, and leaving cuts everything. It shows the schedule asked for, not how a browser renders.
- browser (`tests/loops.spec.js`, both engines): make, save, reload; replacing notes asks and KEEP
  IT changes nothing; a tapped cell is cut by a sheet, by PLAY and by the page hiding; live play
  over about eight bass beats keeps at most three modulators, each disconnected before it is
  stopped, and none after STOP or leaving; share by code, link and file, with the import preview
  silent until PLAY and silenced by an input change, ADD or closing the sheet; a save with loops
  replaces, one without removes; phone fit with 44 px targets.
- `tests/loop-level.test.mjs`: one song source; `cdl3` round trip; levels without a loop keep the
  1.0.96 writer's bytes; a loop under `cdl1`/`cdl2` refused raw and compressed; the pre-loop and
  1.0.96 readers (from git) refuse `cdl3`; save, selection and backup keep the loop.
- `tests/loop-song.test.mjs`, on the recording context: the 1.0.96 live player (from git) and this
  one log the same schedule; a loop level's rendered song is PLAY's events step for step for 16
  bars, after shifting PLAY's 60 ms start; a late render, a late failure and hiding obey the latest
  intent; the render uses the loop as asked for; the raw 8 KiB bound and a save's loop fields.
- browser (`tests/loop-level.spec.js`, both engines): pick a saved loop, the looping buffer that
  starts is that loop's render and 25.6 s long, kept after a reload, a song clears it; share as
  `cdl3`, import and ADD keep the loop without touching My loops; deleting the saved loop leaves the
  level's copy; EDIT A COPY adds no song; MOVE YOUR SAVE carries it.
