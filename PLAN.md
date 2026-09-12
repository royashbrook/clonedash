# Clone Dash

Release scope: seven hand-authored, increasing-difficulty levels; 5 blocks/second auto-run; two-block ledge jumps with quarter-block clearance; hold-to-rise plane with nonfatal solid contact; both portals; two blocks and two spikes; collision follows editor transforms. Touch/keyboard, full-screen landscape gameplay, pause on background, brief death animation and quick retry.

Editor: Blocks / Spikes / Portals palette, select/place/delete, movement at 1 / 0.5 / 0.05 blocks, both quarter-turns and flips, pan, local draft, test and return. No server or user uploads.

House shell: seven-level selection, how-to, about/maker mark, install help, local progress, safe storage failures, offline shell, update toast. Original geometric art and audio; no borrowed game assets.

Verification: engine assertions for physics/collisions/transforms; executable completion witnesses for all seven authored levels; browser checks for touch, layout, editor, pause, completion, persistence, offline and updates. Then publish and check the live origin. Physical-device installation and child fun feedback remain human checks.

Progress: published at https://clonedash.royashbrook.com. Twelve engine checks include seven complete-level witnesses. Chromium and WebKit cover real keyboard/touch, editor transforms and persistence, pause/rotation, malformed saves, original music, and actual-server offline/update behavior. Original 150 BPM instrumental electronic music added on request. Preview port is 4191: WebKit blocks 4190. Offline and update tests now change an actual disposable server, because WebKit's offline/route emulation produced failures even with a minimal constant-response worker.

Automatic CI deployment is approved and configured with a repository secret. Successful main-branch push checks trigger deployment of the exact tested commit; pull-request runs cannot deploy. Manual deployment is main-only and runs browser checks too. Superseded commits are refused before publishing.

The host injects Cloudflare's analytics beacon. Explicit approval now permits its script and reporting hosts in CSP; other directives remain restrictive. Gameplay and music do not depend on that script. Maker links meet the shared house checker's target size. Physical-device installation and whether the music/game are fun remain playtest questions, not automated claims.
