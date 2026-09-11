# Clone Dash

A one-button, geometric platformer from a kid's idea. Seven hand-authored trails, square and plane modes, and a touch-friendly level editor. Original art and synthesized sound; no copied Geometry Dash assets.

**Play:** https://clonedash.royashbrook.com

Square: tap / Space to jump; hold to jump again on landing. Plane: hold to rise, release to fall. Portals switch modes. Land on blocks, avoid spikes and block sides. Landscape play uses the full screen. Pause freezes the run, including when backgrounded.

Editor: choose Blocks, Spikes, or Portals, tap the grid to place. SELECT picks an existing object. Move with the arrows in 1, 1/2, or 1/20-block steps; rotate either direction, flip either axis, delete, and scroll the timeline. TEST plays the draft and returns to the same editor. Draft and best scores stay on this device. Storage failures never prevent play and are surfaced.

## Develop

Node 22+. `npm ci`, `npm test`, `npm run build`, `npm run dev` (localhost:4190).
`npx playwright install chromium`, then `npm run test:browser`.
`npm run deploy` uses Cloudflare Workers static assets. CI checks physics and all seven completion witnesses before publishing. Configure the repository's `CLOUDFLARE_API_TOKEN` secret for automated deploys.

No runtime dependencies. Engine uses 120 Hz fixed steps in block units. Speed 2.5 blocks/sec, gravity 16 blocks/sec² and jump speed 8 blocks/sec give a two-block apex. Transformed polygons are shared by rendering and collision. Build IDs come from asset content, not a manually bumped version constant. Service worker uses network-first fetches with offline fallback and a live-shell update toast.

## Music

Seven original instrumental electronic tracks, composed in `public/music.js`: half-time drums, resonant wobble bass, sub bass, pads and arpeggiated synth melodies. At 150 BPM, one block of travel equals one beat. Each trail has a distinct key and melody, with intro, drop and breakdown sections. Music renders on-device into an audio buffer, works offline, starts after a sound/play gesture, and follows run time through pauses and retries. No licensed samples or external music requests.

no ads, no lives, no timers, nothing to buy, no accounts, no cookies, nothing sold or shared.
