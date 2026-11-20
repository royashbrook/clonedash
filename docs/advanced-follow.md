# Advanced follow

To make a row of lights travel above the player, give each light the same group ID. Place **TRIGGERS → ADV FOLLOW** where the motion should start. Under **EDIT OBJECT**, choose the lights’ group, **Player**, then **X only**. The lights stay at their original height when the player jumps.

- Choose **Group** instead of **Player** to follow a moving object. Enter its group ID. If the source group has several pieces, the first one placed supplies the motion.
- **Both axes** copies horizontal and vertical movement. **X only** and **Y only** copy just one. The followers keep their positions when the trigger fires and copy movement from then on. No snapping or stacking.
- A later follow trigger can change the source or axes for the same group. A missing source, self-follow or a chain that would loop does nothing. Chains without a loop work. A move trigger on a follower adds its own motion.
- Player follow samples the last completed physics step. Object follow uses the moved objects before collision checks. A solid or hazard still collides where it is drawn; a NO TOUCH piece is decoration.
- Restart restores the original positions. Saving and sharing keeps the setup, not the positions from a run. Older game versions refuse a level containing the new piece.
