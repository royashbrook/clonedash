# skins

tracked in #107, from player feedback: "a skin creator. doesn't have to be the same size as
default, can be different x and y sizes. should be able to save and share the skins same as
levels." this is a first pass, expected to be corrected after players try it.

## what a skin is

pixel art for the player in cube (square) mode. it is cosmetic only: the physics body (`SIZE`,
0.64 blocks), `step`, the player's collision polygon, input and recordings never see a skin, so
no level gets easier or harder and every recording replays frame for frame. the green procedural
cube stays the default and is always pickable; the 8x8 picture a new skin starts from is only a
template. pogo, wheel, croissant, angle and plane keep their drawings (a skin per mode is a later
ask).

## the data

a skin is pure data, the same shape in storage and in a share code:

```json
{ "name": "Robot", "width": 16, "height": 8, "palette": ["#9aff6b", "#101825"], "pixels": "1121…" }
```

- `name`: a string of at most 40 characters (empty shows as "Untitled skin").
- `width`, `height`: whole numbers 4 to 100, each on its own (a 100x4 skin is fine). Type
  the size, or step by one. Beyond 32 on either side, tap the whole picture to open up to
  12 by 12 pixels for drawing; WHOLE SKIN picks a different spot. The first tap only zooms.
- `palette`: at most 16 distinct colours, each `#rrggbb` in lowercase hex. empty is not a colour.
- `pixels`: exactly `width * height` characters, rows top to bottom, left to right. each is a
  palette index from `0123456789abcdefg`: `0` is empty (see-through), `1` is `palette[0]`,
  through `g` for `palette[15]`. an index past the palette is refused.
- nothing else: no images, SVG, HTML or URLs. `validateSkin` (src/skin.ts) is the one check every
  reader goes through (local storage, a code, a file, a link, the creator) and it rebuilds the skin
  from these five fields, so extra fields are dropped. NaN, Infinity, fractions and unknown colour
  forms are refused. an invalid skin is refused whole, never half-loaded.

## storage (the contract)

skins live under their own localStorage key, `clonedash.skins.v1`, never inside the level save
(`clonedash.v1`). that is the storage contract:

```json
{ "version": 1, "next": 3, "skins": [{ "id": 1, "skin": { … } }, { "id": 2, "skin": { … } }], "selected": 2 }
```

- `next` is the id the next new skin gets. ids are never reused, so a stale tab saving skin 2
  can never land on a different skin that took a freed id.
- at most 100 skins. `selected` is optional: absent means the default green cube. it must name a
  stored skin that has at least one coloured pixel.
- the key is written only when the player does something with skins, so a save from before skins
  does not grow and the level save is never touched by a skin write. level and progress writes
  never touch the skins key, so they can never erase a skin.
- every skin write (save, rename, copy, delete, use, import) re-reads the key, applies its one
  change to what is stored now (by id), writes, and reads the write back. a new skin's id comes
  from that fresh read (`next`), never from what the editor or the tab saw when it opened.
- that gives **stale-tab preservation**: a tab that has been open a while, and still shows an
  old list, cannot erase skins another tab saved earlier, because it never writes its own old
  copy. it is not simultaneous-write safety. web storage has no locking, so two tabs whose
  read-change-write steps overlap can still lose one change, and unique ids do not prevent
  that. the readback only confirms this tab's own write landed. there is no lock or
  compare-and-swap layer, by choice.
- a refused or unconfirmed write reports the failure and the app keeps the last confirmed
  state. stored skin data that does not validate is never replaced by fallback data: the app
  shows the default cube, says the skins could not be read, and refuses every skin write rather
  than overwrite the raw value.

## the rules

1. **save and use.** a blank skin (no coloured pixel) may be SAVED as a draft. USE needs at least
   one coloured pixel, and a skin that is being worn cannot be saved blank. CLEAR, and any resize
   that would drop coloured pixels, asks first. resizing keeps the top-left pixels. deleting the
   skin being worn goes back to the default cube. nothing in the creator is saved or worn until
   SAVE or USE says so; leaving without saving keeps the stored skins as they were.
2. **drawing.** a skin is drawn nearest-neighbour (no smoothing) at its own aspect, fitted inside
   the same one-block box the cube is drawn in (`AVATAR` in render.ts): the longer side is one
   block. transparent margins are not cropped. the fitted rectangle keeps the cube's anchoring:
   its bottom on the body's bottom edge (feet on the floor), or its top on the body's top edge when
   gravity is flipped (head on the ceiling), and its right edge on a W wall's face when a W holds
   the run. so a 16x8 skin sits on the floor, not floating in the middle of the box, and 4x32 and
   32x4 skins behave the same way. the turn (`src/spin.ts`, #120), the gravity flip and reduced
   motion follow the cube exactly. resting on its side, the turned picture stands in the swapped
   box (a 16x8 skin stands 8 wide and 16 tall), anchored the same way, so its feet stay on the
   floor; landing slides the anchor over with the turn's own ease. the hook is guarded by square mode alone: pogo, every other mode, and the default
   (no skin) path keep their exact draw commands.
3. **the drawn footprint is not the hitbox.** the creator preview draws the skin with the real
   renderer, outlines the drawn footprint, and draws the unchanged collision box, with the kid
   words "the dashed box is what bumps into things. it never changes. your picture only changes
   the look." transparent pixels do not shrink the hitbox and a big picture does not grow it.
4. **cost.** a skin is turned into a tiny canvas once and kept in a small cache (at most 8);
   each frame draws that canvas once. no per-frame pixel rebuild, no PNG encoding, no image
   dependency.

## sharing

the same ways as levels: SHARE on a skin gives a code, a link, a file and (when it fits) a QR;
IMPORT, from Skins or from My Levels, takes any of them.

- **code**: `cds1.` marks skin format 1. the next character is `0` for UTF-8 JSON or `1` for
  deflate-raw, then unpadded base64url, exactly like `cdl1.` levels. `cdl1.` stays a level exactly
  as before. an older copy of the game refuses a `cds1.` code as "not a level code".
- **link**: `#skin=<code>`. a link with both `level` and `skin`, or either one twice, is refused
  as ambiguous. level links (`#level=`), `?level=<n>` and the `.clonedash.txt` file ending keep
  their contracts.
- **file**: `cube-dash-skin.clonedash.txt`, holding the code.
- **import** reads the text once, looks at the prefix (or the link's one parameter) and hands it
  to the skin decoder or the level decoder. The separate whole-save importer uses the same skin
  validator. The skin decoder bounds input at 192 KiB like levels and the decoded JSON at
  11 KiB (10,000 pixels plus metadata), counts bytes while inflating
  and cancels at that bound, has the same five-second deadline, and refuses a compressed code on
  a browser without decompression. a raw (`0`) code always works.
- Small skins keep their original bytes. A copy limited to 32 per side refuses bigger skins
  instead of cropping them. Whole saves still use their separate 5 MiB bound.
- **preview first.** an import shows the skin, its size and name, then ADD TO MY SKINS adds a new
  skin with a new id. it never replaces a skin with the same name and never starts wearing it, and
  a link only opens the preview. the export carries the five skin fields only: no local id,
  selection, levels, progress or settings.
- **QR**: the same policy as levels: medium error correction, at most version 15, link at most
  2000 characters, else no QR and the complete code and file instead. small skins fit; a
  worst-case 32x32 skin of 16-colour noise does not (measured in `tests/skin.test.mjs`), so not
  every skin has a phone QR.

## how it is pinned

- `tests/skin.test.mjs`: the schema and every bound at every reader, stale-tab preservation,
  refused and unconfirmed writes, invalid stored data left alone, the codec (compressed
  and raw), bounded inflation, deadline, ambiguous links, prefix dispatch, the QR measurement,
  the editor's pure helpers (resize, fill, contiguous strokes), the drawn rectangle and its
  anchoring, square-only drawing, and that the body never changes.
- `tests/parity.test.mjs` and `tests/migration.test.mjs` (unchanged): the default drawing and
  physics, old saves and old level codes.
- `tests/skins.spec.js`: touch drawing, resize, save, reload, use, delete, the stale-tab journey
  (both tabs open, A adds, B adds and changes the selection, both reloaded), every share
  path, and 320-wide and phone-landscape layouts, in both engines.
- `npm run test:mutations` breaks a bound, the re-read before a write, the anchoring, the
  square-only guard and the body size in turn and expects these tests to fail.
