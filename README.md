# Clone Dash

A one-button, geometric platformer from a kid's idea. Nine hand-authored trails, square, plane, wheel and jumper modes, and a touch-friendly level editor. Original art and synthesized sound; no copied Geometry Dash assets.

**Play:** https://clonedash.royashbrook.com

Square: tap / Space to jump; hold to jump again on landing. Plane: hold to rise, release to fall. Portals switch modes. Land on blocks, avoid spikes and block sides. Landscape play uses the full screen. Pause freezes the run, including when backgrounded.

Editor: choose Blocks, Spikes, or Portals, tap the grid to place. SELECT picks an existing object. Move with the arrows in 1, 1/2, or 1/20-block steps; rotate either direction, flip either axis, delete, and scroll the timeline. TEST plays the draft and returns to the same editor. Draft and best scores stay on this device. Storage failures never prevent play and are surfaced.

## Develop

Node 22+. `npm ci`, `npm test`, `npm run build`, `npm run dev` (localhost:4191).
`npx playwright install chromium`, then `npm run test:browser`.
`npm run deploy` uses Cloudflare Workers static assets. Automatic deployment uses the configured `CLOUDFLARE_API_TOKEN` repository secret, only after main-branch physics and browser checks pass, and publishes that exact tested commit. Pull-request runs cannot deploy; superseded commits are refused. Manual deployment is main-only and repeats the checks.

No runtime dependencies. Engine uses 120 Hz fixed steps in block units. Speed is 5 blocks/sec. Gravity is 16 blocks/sec²; the square reaches 2.25 blocks, giving two-block ledges a quarter-block clearance margin. Plane contact with solid blocks, floor and ceiling is safe: land, slide underneath, or climb past a wall. Spikes remain lethal; square side collisions remain lethal. Transformed polygons are shared by rendering and collision. Build IDs come from asset content, not a manually bumped version constant. Service worker uses network-first fetches with offline fallback and a live-shell update toast.

## Music

Nine original instrumental electronic tracks, composed in `public/music.js`: half-time drums, resonant wobble bass, sub bass, pads and arpeggiated synth melodies. At 150 BPM, one block of travel equals an eighth note. Each trail has a distinct key and melody, with intro, drop and breakdown sections. Music renders on-device into an audio buffer, works offline, starts after a sound/play gesture, and follows run time through pauses and retries. No licensed samples or external music requests.

## Wheel and gravity

Wheel mode flips gravity once per tap or Space press while resting on a solid surface (block top, inverted block underside, floor or ceiling). Midair taps are ignored, not queued for landing. Holding does not repeat; keyboard auto-repeat is ignored. UP and DOWN portals set gravity without changing mode. Square jumps and plane controls mirror with gravity; inverted square/wheel landings use block undersides and the ceiling. Mode portals preserve gravity. Every new run resets to square and normal gravity.

The editor includes wheel portals, a separate GRAVITY tab, completely black outlined blocks, and spikes scaled to 2/3 in both width and height. Shapes, rotations and flips use the same geometry for painting and collision. The bonus Gravity Flip trail demonstrates the new objects; the original seven layouts and save format are unchanged.

## Jumper and Air Steps

Jumper mode behaves like square, but each fresh tap or Space press restarts the jump even in midair. There is no extra-jump limit. Holding only repeats on landing, not in the air; keyboard auto-repeat is ignored. Air jumps also work with inverted gravity. The jumper has a double-chevron icon and its own portal in the editor.

Outline blocks have a transparent interior and white outline, with the same solid collision as other blocks. Quarter-size spikes are 1/4 block wide and tall and remain lethal. Both support all editor transforms and saved drafts. The ninth trail, Air Steps, introduces air jumps onto a four-block-high outline shelf and has its own music. Existing trails and progress keep their indices and save format.

no ads, no lives, no timers, nothing to buy, no accounts, no cookies, nothing sold or shared.
