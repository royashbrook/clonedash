# Teleports (#139)

Two pieces send you somewhere else on the trail: the **TELEPORT trigger** (TRIGGERS tab), which
fires like any trigger when you pass it (or touch it, with TOUCH and MULTI), and the violet
**TELEPORT RING** (RINGS tab), which fires when you tap in its reach, once a run unless MULTI TOUCH.
How they fire is their own; where they send you is one shared rule (`destination` in engine.ts).

1. Each aims at a group id 1 to 99 (EDIT OBJECT: "Group id it works on" on the trigger, "Group id
   it sends you to" on the ring). The landing spot is any piece given that group id; a NO TOUCH piece
   is the usual marker, so nothing is in the way when you arrive.
2. The destination is the group's piece furthest left, then the lowest, then the first one placed,
   where it stands at that moment, after any move trigger has moved it.
3. You land in that piece's cell (its x and y). You keep your speed, shape, gravity and size, with no
   rise or fall; a held Door lift, a dash and a jump in progress end. Landing in a solid block is the
   level's own crash.
4. A teleport with nowhere to go (no group id, or no piece with it) does nothing. The trigger still
   counts as fired. The ring is not a ring at all: it never lights, the tap does what it would have
   done without it, and nothing is spent.
5. Arriving is not crossing. Passing triggers the jump went over do not fire; each counts again once
   you are behind it, so a backward teleport lets them fire when you pass them for real. A touch
   trigger you land inside counts as already touched until you leave it. One teleport happens a step
   at most: a teleport trigger at the landing spot fires on a later step, and since a passing trigger
   fires once a run, a pair that sends you back and forth stops after one round.
6. A trigger teleport happens at the end of its step, from where the step really ended; a ring
   teleport happens when you tap, and the step runs on from the landing. The camera follows at once.
7. Restart puts everything back, like any restart: fired triggers, used rings, moved pieces.
8. In the editor a selected teleport draws a dashed line to its landing cell, or NO DESTINATION.
9. A copy of the game from before teleports refuses a level with either piece instead of dropping it.

## Proof

- `tests/teleport.test.mjs`: the destination rule and its ties, a forward trigger teleport, triggers
  jumped over firing only when crossed after a jump back, the landing trigger firing a step later and
  the back-and-forth pair ending, nowhere to go (trigger spent, ring skipped and the tap jumps), the
  ring landing at once and the step running on, a moved destination, a touch trigger at the landing,
  restart, validation, and an older copy refusing both.
- `tests/teleport.spec.js`: the pieces in the editor, their landing control and status line, and a
  played teleport, in Chromium and WebKit.
