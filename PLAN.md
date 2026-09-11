# Clone Dash

Release scope: seven hand-authored, increasing-difficulty levels; 2.5 blocks/second auto-run; exact two-block square jump; hold-to-rise plane; both portals; two blocks and two spikes; collision follows editor transforms. Touch/keyboard, full-screen landscape gameplay, pause on background, brief death animation and quick retry.

Editor: Blocks / Spikes / Portals palette, select/place/delete, movement at 1 / 0.5 / 0.05 blocks, both quarter-turns and flips, pan, local draft, test and return. No server or user uploads.

House shell: seven-level selection, how-to, about/maker mark, install help, local progress, safe storage failures, offline shell, update toast. Original geometric art and audio; no borrowed game assets.

Verification: engine assertions for physics/collisions/transforms; executable completion witnesses for all seven authored levels; browser checks for touch, layout, editor, pause, completion, persistence, offline and updates. Then publish and check the live origin. Physical-device installation and child fun feedback remain human checks.

Progress: published at https://clonedash.royashbrook.com. Twelve engine checks include seven complete-level witnesses. Chromium and WebKit cover real keyboard/touch, editor transforms and persistence, pause/rotation, malformed saves, original music, and actual-server offline/update behavior. Original 150 BPM instrumental electronic music added on request. Preview port is 4191: WebKit blocks 4190. Offline and update tests now change an actual disposable server, because WebKit's offline/route emulation produced failures even with a minimal constant-response worker.

Automatic CI deployment remains unconfigured: provisioning a repository secret from the existing fleet-wide token requires specific approval. The deployment workflow is manual-only until that approval; publishing this release can use the existing local Cloudflare login.

The host injects Cloudflare's analytics beacon. The restrictive CSP currently blocks it, generating a console error. Adding the reviewed host to CSP was denied pending explicit permission; CSP was left unchanged. Gameplay and music do not depend on that script. The shared house checker found this and undersized maker links; maker links are now corrected. Physical-device installation and whether the music/game are fun remain playtest questions, not automated claims.
