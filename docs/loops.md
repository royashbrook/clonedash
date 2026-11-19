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
| `notes` | 8 steps, each a sorted list of distinct degrees from `0 3 5 7 10 12 15 17 19 22` |
| `kick` `snare` `hat` | sorted lists of distinct steps 0..7 |

A step is an eighth note (0.2 s at 150 BPM, `BEAT / 2`). One bar is 8 steps. The chord moves like a
song's, `[0, -5, 3, -2]` every two bars.

Presets start from any of the 109 synthesized songs (`music.ts trackFor`): its key, wobble and
melody, with the default drums. The 14 recorded songs are audio files, so they are not offered.

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
