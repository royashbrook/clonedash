# Starting settings and off-map building (#149)

In the editor, open **Level settings** to pick a starting mode and speed. These apply on the first simulation step, including after a crash or retry. Portals still change the current run. Old levels start as a square at 1×.

Turn on **Build outside the trail** to get 32 blocks of working space on each side. Scroll across or up, or use the coordinate inputs in settings. The outline shows the playable area: placing a piece does not move the spawn, finish, floor or ceiling. Pieces outside the outline are normal pieces and may be moved into play by a trigger. Move outside pieces back inside before turning this option off; the switch never deletes them.

Levels using these settings share as `cdl4` so old games refuse them instead of silently playing a different trail. Levels without the new fields keep their existing share format, including levels with custom music.
