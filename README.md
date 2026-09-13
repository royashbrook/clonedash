# Clone Dash

A one-button, geometric platformer from a kid's idea. Nine hand-authored trails, square, plane, wheel and jumper modes, and a touch-friendly level editor. Original art and synthesized sound; no copied Geometry Dash assets.

**Play:** https://clonedash.royashbrook.com

Square: tap / Space to jump; hold to jump again on landing. Plane: hold to rise, release to fall. Portals switch modes. Land on blocks, avoid spikes and block sides. Landscape play uses the full screen. Pause freezes the run, including when backgrounded.

Editor: choose Blocks, Spikes, Portals or Gravity, then tap the grid to place. SELECT picks an existing object. COPY + PASTE duplicates the selection into free space to its right, preserving rotation and flips. DELETE removes the selection; DELETE ALL asks for confirmation before clearing only the draft's objects, not its name, length or completed trails. Move with the arrows in 1, 1/2, or 1/20-block steps; rotate either direction, flip either axis, and scroll the timeline. TEST plays the draft and returns to the same editor. Draft and best scores stay on this device. Storage failures never prevent play and are surfaced.

## Develop

Node 22+. `npm ci`, `npm test`, `npm run build`, `npm run dev` (localhost:4191).
`npx playwright install chromium`, then `npm run test:browser`.
`npm run deploy` uses Cloudflare Workers static assets. Automatic deployment uses the configured `CLOUDFLARE_API_TOKEN` repository secret, only after main-branch physics and browser checks pass, and publishes that exact tested commit. Pull-request runs cannot deploy; superseded commits are refused. Manual deployment is main-only and repeats the checks.

No runtime dependencies. Engine uses 120 Hz fixed steps in block units. Speed is 5 blocks/sec. Gravity is 16 blocks/sec²; the square reaches 2.25 blocks, giving two-block ledges a quarter-block clearance margin. Plane landings, floor and ceiling contact are safe. Wall impacts kill in every mode: square, plane, wheel and jumper, including vertical ramp faces. Spikes remain lethal. Transformed polygons are shared by rendering and collision. Build IDs come from asset content, not a manually bumped version constant. Service worker uses network-first fetches with offline fallback and a live-shell update toast.

## Music

Nine original instrumental electronic tracks, composed in `public/music.js`: half-time drums, resonant wobble bass, sub bass, pads and arpeggiated synth melodies. At 150 BPM, one block of travel equals an eighth note. Each trail has a distinct key and melody, with intro, drop and breakdown sections. Music renders on-device into an audio buffer, works offline, starts after a sound/play gesture, and follows run time through pauses and retries. No licensed samples or external music requests.

## My levels

The block-and-spike **MY LEVELS** button opens a library of up to 100 custom levels. Create, name, edit and play each one independently. The old single draft becomes the first library entry without changing its objects or best scores. Saves stay on this device; malformed data and storage failures are reported without overwriting the old save.

While testing, **← MY LEVELS** at the top left returns directly to the library. The pause menu, completion panel and portrait rotation prompt also offer **MY LEVELS**. Returning leaves your saved level intact; **BACK TO EDITOR** remains available from pause and completion.

**HEIGHT / SONG** sets world height from 7 to 40 blocks and selects music, with a LISTEN toggle. Taller levels get an Up scrollbar in the editor and a following vertical camera in play, not smaller artwork. Lowering the ceiling cannot cut off placed objects. Each custom level starts with its own deterministic original song and riff; the picker can also choose any built-in track or another level's original. Choosing a shared track is an explicit override of the unique default. Only three rendered songs are cached, with one render in flight.

The **Layer** selector switches between PLAY and BACKGROUND. Background blocks paint behind playable pieces and never collide or support a landing. Both layers can occupy the same coordinates; selecting, moving and copying respects the active layer. All five block styles work as decoration. Spikes, portals, rings and ramps stay in the play layer.

## Wheel and gravity

Wheel mode flips gravity once per tap or Space press while resting on a solid surface (block top, inverted block underside, floor or ceiling). Midair taps are ignored, not queued for landing. Holding does not repeat; keyboard auto-repeat is ignored. UP and DOWN portals set gravity without changing mode. Square jumps and plane controls mirror with gravity; inverted square/wheel landings use block undersides and the ceiling. Mode portals preserve gravity. Every new run resets to square and normal gravity.

The editor includes wheel portals, a separate GRAVITY tab, completely black outlined blocks, and spikes scaled to 2/3 in both width and height. Shapes, rotations and flips use the same geometry for painting and collision. The bonus Gravity Flip trail demonstrates the new objects; the original seven layouts and save format are unchanged.

## Jumper and Air Steps

Jumper mode has square movement, but each fresh tap or Space press restarts the jump even in midair. There is no extra-jump limit. Holding only repeats on landing, not in the air; keyboard auto-repeat is ignored. Air jumps also work with inverted gravity. Like planes, jumpers can land or bump a ceiling safely, but hitting a wall kills. Jump before impact to clear it. The jumper has a double-chevron icon and its own portal in the editor.

Hazard contact uses an inner 0.40-block player box, inset 0.12 blocks on each side of the visible 0.64-block body. This forgives small edge grazes without making direct spike hits safe. Landing, safe solid contact and portals still use the full body; jump reach and platform support are unchanged.

Outline blocks have a transparent interior and white outline, with the same solid collision as other blocks. Quarter-size spikes are 1/4 block wide and tall and remain lethal. Both support all editor transforms and saved drafts. The ninth trail, Air Steps, introduces air jumps onto a four-block-high outline shelf and has its own music. Existing trails and progress keep their indices and save format.

## Rings and ramps

RINGS contains a jump ring. Tap/click it (or press Space) as the player reaches its glow to jump in midair. A ring triggers once per run, dims after use, and resets on retry. Holding alone does not activate it, and distant taps cannot use it. The impulse follows gravity without changing gamemode; plane speed limits still apply.

RAMP contains gradient, grid and black solid 45-degree ramps. Only the diagonal slope edge has a white outline. Rotations/flips transform the actual triangle used for both drawing and contact. Players can climb, descend, land and jump from slopes, including inverted slopes; vertical ramp walls kill in every mode. BLOCKS also includes NO BORDER, a completely black solid block without a white outline, separately from the original outlined BLACK block. All new objects support editor copy/paste, transforms and persisted drafts. No existing trail or save index changed.

no ads, no lives, no timers, nothing to buy, no accounts, no cookies, nothing sold or shared.
