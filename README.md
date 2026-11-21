# Cube Dash

A one-button, geometric platformer from a kid's idea. It was called Clone Dash until the kid renamed it; the repository, domain, save key (`clonedash.v1`), worker cache names, `cdl1` share codes and `.clonedash.txt` level files keep the old name so saves, installs and shared levels keep working. Eighteen trails, square, plane, wheel and pogo modes, and a touch-friendly level editor. Original art, licensed electronic recordings and synthesized originals; no copied Geometry Dash assets.

**Play:** https://clonedash.royashbrook.com

Square: tap / Space to jump; hold to jump again on landing. Plane: hold to rise, release to fall. Portals switch modes. Land on blocks, avoid spikes and block sides. Landscape play uses the full screen. Pause freezes the run, including when backgrounded.

Editor: choose Blocks, Spikes, Portals or Gravity, then tap the grid to place. SELECT picks an existing object. COPY + PASTE duplicates the selection into free space to its right, preserving rotation and flips. DELETE removes the selection; DELETE ALL asks for confirmation before clearing only the draft's objects, not its name, length or completed trails. Move with the arrows in 1, 1/2, or 1/20-block steps; rotate either direction, flip either axis, and scroll the timeline. TEST plays the draft and returns to the same editor. Draft and best scores stay on this device. Storage failures never prevent play and are surfaced.

## Develop

The [release-stack migration](docs/migration.md) records the Svelte/TypeScript/Vite boundary and preservation checks. [Level sharing](docs/level-sharing.md) documents the separately tested portable-level format and import limits.

Node 22.18+. `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm run test:release`.
`npm run dev` runs Vite at localhost:4192; `npm run preview` serves the built artifact at localhost:4191.
`npx playwright install chromium webkit`, then `npm run test:browser`. The suite starts its own artifact server and refuses an occupied port. Set `PORT` for a separate review lane, or `GAME_URL` to test an already-owned server. Full git history is required for the pinned baseline oracle.
Deployment uses Cloudflare Workers static assets and the configured `CLOUDFLARE_API_TOKEN` repository secret. Trusted successful main pushes or manual main runs queue a deployment of the current main tip, repeat strict/unit/artifact/browser checks, and refuse a superseded checkout. A late successful check for an older commit cannot cancel the newer deploy. PR runs cannot deploy.

Releases require a clean checkout, complete history and an immutable `vMAJOR.MINOR` milestone on first-parent ancestry. Patch counts **all** commits since that milestone, including merged work. The UI shows that derived version; About also exposes source and content identity. `RELEASE_BUILD=1 npm run build` refuses missing prerequisites. Normal local builds are explicitly `-dev`, never silently published as a release.

Svelte is the UI runtime, with strict TypeScript and a Vite build. No game engine, router or physics dependency. `src/App.svelte` owns menus/editor/dialogs and a disposable frame/input lifetime; `src/run.ts` owns mutable simulation scheduling; `src/engine.ts`, `src/render.ts`, `src/music.ts` and `src/library.ts` stay independent of Svelte. The engine uses 120 Hz fixed steps in block units. Speed is 5 blocks/sec. Gravity is 16 blocks/sec²; the square reaches 2.25 blocks, giving two-block ledges a quarter-block clearance margin. Plane landings, floor and ceiling contact are safe. Wall impacts kill in every mode, including vertical ramp faces. Transformed polygons are shared by rendering and collision.

The worker precaches a complete emitted build, including dependency licences. It never mixes newly fetched HTML into an old offline snapshot. A foreground/60-second probe offers updates without interrupting the run; consent downloads and activates the new worker before reload. Failed downloads leave the current build playable. Old caches remain while another tab may need them; a lone current-build client releases them on a subsequent foreground/check. The pre-migration updater's direct reload is handled by matching the waiting worker to the already-loaded page. Origin, manifest identity and `clonedash.v1` are unchanged.

## Music

Nine self-hosted electronic recordings by Of Far Different Nature accompany the new courses, under CC BY 4.0. Credits are visible in About and packaged offline with the music. See [the soundtrack inventory](docs/soundtrack.md) for source, licence and encoding details. The nine original 150 BPM compositions and 100 custom-level originals remain available. Sound starts after a sound/play gesture and follows simulation time through pauses and retries. No third-party music requests at runtime.

## course progression

Easy: Pulseway, Skyline, Runway (48 seconds each). Medium: Switchyard, Orbitworks, Airloom (60 seconds). Hard: Overdrive, Polarity, Afterburn (72 seconds). Remix: Shapeshifter and Quick Change switch between every shape and gravity; Ring Road and Block Party bring rings, ramps, speed portals, wall and roof passes, and sized or turned blocks; Grand Finale mixes all of it (62 to 75 seconds). They come after every other trail, so saved bests keep their indices, and each one's witness replays its own input timeline (`tests/remix-inputs.mjs`, written by `scripts/remix-witness.mjs`). Explorer: Coin Canyon, Booster Bay, Blink Bridge, Door to Door, Orb Garden, Flipside and Last Lap each feature a newer piece (52 to 67 seconds), come after Remix for the same reason, and replay `tests/explorer-inputs.mjs` (`scripts/remix-witness.mjs --explorer`). The original nine short layouts remain under Warmups, with unchanged save indices. Difficulty labels are authored design judgements, not a measured comparison to another game's rankings. Each Easy, Medium, Hard, Remix and Explorer course has a completion witness using normal press/release controls through the shipped run loop. See `tests/courses.test.mjs`.

Challenger is the player-made collection. It appears when its first trail is published. New trails start at 31, after the original 30, so existing links and saves keep their meaning.

## Publish a submission

Add one file to this repo. Use the original share text as the entire file, without a Markdown wrapper:

| Item | Example path | Contents |
| --- | --- | --- |
| Challenger trail | `content/levels/challenger/0031-first-run.cdl` | Level share code. Use the next consecutive number; never renumber a released trail. |
| Pixel skin | `content/skins/star-cat.cds` | Skin share code |
| Music loop | `content/music/loops/night-beat.cdm` | Loop share code |
| Full song | `content/music/songs/night-drive.cdl` | Level share with an embedded full song. Only the arrangement is published. A standalone arrangement object in a `.json` file also works. |

Names come from the submission, not the filename. Skins, loops and songs show up as featured copies on their respective library screens. Opening one does not save, wear or replace anything. This path is for music made with the game, not uploaded audio recordings.

Run `npm run build` then `npm run test:content` to preview the checks. The build packages the validated data with the offline app. Only additions of regular files matching the paths above take the quick release path. Edits, removals, mixed changes, manual releases and uncertain comparisons keep the full checks. The deploy compares against what is actually live and verifies the published build afterward. A local save alone does not publish: merge the accepted file to main.

Pause any played level, or finish it, then choose **EDIT A COPY**. It saves a new independent entry and opens the editor. The source, prior draft and progress remain intact. Full or unavailable storage refuses the copy; nothing is replaced. This also works for imported levels. Copies preserve geometry and soundtrack and can be shared from My Levels.

## My levels

The block-and-spike **MY LEVELS** button opens a library of up to 100 custom levels. Create, name, edit and play each one independently. The old single draft becomes the first library entry without changing its objects or best scores. Saves stay on this device; malformed data and storage failures are reported without overwriting the old save.

**SHARE** sends just the selected level through the device share sheet, a QR, a copyable code or a file. Detailed levels use the complete code/file instead of an overly dense QR. On the receiving device, open the link or choose **IMPORT LEVEL** to paste the code or open the file. Preview it, then choose **ADD TO MY LEVELS**. Import adds a new entry without replacing existing levels, the active draft or progress; a full library refuses the addition. Geometry and the original selected song travel with the level. No account or level-data server is involved. Sharing sends only what you explicitly choose, not your save library.

While testing, **← MY LEVELS** at the top left returns directly to the library. The pause menu, completion panel and portrait rotation prompt also offer **MY LEVELS**. Returning leaves your saved level intact; **BACK TO EDITOR** remains available from pause and completion.

**LEVEL SETTINGS** sets how a run starts (shape and speed), lets you build outside the trail, sets world height from 7 to 1000 blocks and selects music, with a LISTEN toggle. Length can be 20–1000 blocks. Scroll moves across the trail; Up reaches the ceiling. Taller levels get a following vertical camera in play, not smaller artwork. Shrinking either dimension cannot cut off pieces or invalidate trigger moves. Each custom level starts with its own deterministic original song and riff; the picker can also choose a licensed recording, any built-in original or another level's original. Choosing a shared track is an explicit override of the unique default. One decoded song is retained, with one load/render in flight.

The **Layer** selector switches between PLAY and BACKGROUND. Background blocks paint behind playable pieces and never collide or support a landing. Both layers can occupy the same coordinates; selecting, moving and copying respects the active layer. All five block styles work as decoration. Spikes, portals, rings and ramps stay in the play layer.

## Coins and triggers

**ADV FOLLOW** moves a group with the player or another group. Pick **Both axes**, **X only** or **Y only** under **EDIT OBJECT**. Pieces keep their spacing. [Build a following group](docs/advanced-follow.md).

**COINS** places a coin; touch it in a run to pick it up. A level holds up to 10, the run shows how many you have, and your best is the most you picked up in one finished run. **EDIT OBJECT** gives any piece a GROUP ID (1 to 99). **TRIGGERS** places a MOVE or COLOR trigger: invisible in play, each fires once when you pass it and works on every piece with its group id, moving them some whole blocks or painting them a colour, instantly or over a time you set. Restarting puts everything back. The rules are in [coins and triggers](docs/coins-and-triggers.md).

## Wheel and gravity

Wheel mode flips gravity once per tap or Space press while resting on a solid surface (block top, inverted block underside, floor or ceiling). Midair taps are ignored, not queued for landing. Holding does not repeat; keyboard auto-repeat is ignored. UP and DOWN portals set gravity without changing mode. Square jumps and plane controls mirror with gravity; inverted square/wheel landings use block undersides and the ceiling. Mode portals preserve gravity. Every new run resets to square and normal gravity.

The editor includes wheel portals, a separate GRAVITY tab, completely black outlined blocks, and spikes scaled to 2/3 in both width and height. Shapes, rotations and flips use the same geometry for painting and collision. The bonus Gravity Flip trail demonstrates the new objects; the original seven layouts and save format are unchanged.

## Pogo and Air Steps

Pogo mode has square movement, but each fresh tap or Space press restarts the jump even in midair. There is no extra-jump limit. Holding only repeats on landing, not in the air; keyboard auto-repeat is ignored. Air jumps also work with inverted gravity. Like planes, pogos can land or bump a ceiling safely, but hitting a wall kills. Jump before impact to clear it. The pogo has a double-chevron icon and its own portal in the editor.

Hazard contact uses an inner 0.40-block player box, inset 0.12 blocks on each side of the visible 0.64-block body. This forgives small edge grazes without making direct spike hits safe. Landing, safe solid contact and portals still use the full body; jump reach and platform support are unchanged.

Outline blocks have a transparent interior and white outline, with the same solid collision as other blocks. Quarter-size spikes are 1/4 block wide and tall and remain lethal. Both support all editor transforms and saved drafts. The ninth trail, Air Steps, introduces air jumps onto a four-block-high outline shelf and has its own music. Existing trails and progress keep their indices and save format.

## Rings and ramps

RINGS contains a jump ring. Tap/click it (or press Space) as the player reaches its glow to jump in midair. A ring triggers once per run, dims after use, and resets on retry. Holding alone does not activate it, and distant taps cannot use it. The impulse follows gravity without changing gamemode; plane speed limits still apply.

RAMP contains gradient, grid and black solid 45-degree ramps. Only the diagonal slope edge has a white outline. Rotations/flips transform the actual triangle used for both drawing and contact. Players can climb, descend, land and jump from slopes, including inverted slopes; vertical ramp walls kill in every mode. BLOCKS also includes NO BORDER, a completely black solid block without a white outline, separately from the original outlined BLACK block. All new objects support editor copy/paste, transforms and persisted drafts. No existing trail or save index changed.

no ads, no lives, no timers, nothing to buy, no accounts, no cookies, nothing sold or shared.
