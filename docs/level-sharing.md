# saved-level sharing

tracked in #14, separately from the architecture migration in #13.
implemented for review; not yet a shipped-feature claim.

## interaction

- each saved level offers SHARE; My Levels offers IMPORT.
- the share sheet prepares one level, then opens native sharing from a fresh tap.
  native cancellation is normal. copyable code/link and a downloadable file remain available.
- a QR contains the same self-contained link. show it only when the complete payload fits;
  otherwise offer the code/file. never truncate a level to fit a QR.
- links carry data in a fragment, not a query or server upload. opening one previews the
  level name and object count and requires confirmation before adding it.
- importing appends an independent entry. it must not change the active draft, any existing
  level, sound preference or earned progress. a full library or failed storage write is an error,
  not permission to overwrite an entry.

## boundaries

- a small typed codec owns the versioned envelope and size limits; the existing engine
  validator remains the authority on playable object types, geometry, height and songs.
- export only level fields, never a save object or arbitrary extra properties.
- bound encoded input, file size, decompressed output and stream-read duration. count bytes while
  consuming decompression output and cancel at the limit, before collecting a giant buffer.
- prepare the next save separately and verify its storage write before updating the UI.
  read current storage at confirmation so another tab's saved entries are not silently replaced.
- reuse the existing Svelte dialog and visual language. keep forms in a dedicated component;
  no new game loop, physics dependency, account or level-data service.

## proof before release

round-trip every object/transform/layer and song; reject corrupt, unknown-version and oversized
inputs without mutation; preserve an existing library and draft; handle full/blocked storage;
cancel native sharing/import without errors; pass sender-to-receiver browser flows, offline
import, QR decoding and phone-sized layout checks. add the QR dependency's emitted licence to
the existing bundled/offline licence checks.

## format and limits

`cdl1.` marks format 1. the next character is `0` for UTF-8 JSON or `1` for native
deflate-raw compression, followed by unpadded base64url. links put that entire code in
`#level=...`. no level payload is uploaded by the app. the selected share target receives
what the user chooses to send.

input is capped at 192 KiB (characters for pasted text; bytes for files); decoded JSON at
128 KiB. the decompression reader stops at the output bound and has a five-second deadline.
the engine's existing limits still apply: 600 objects, 20–600 blocks long, 7–40 blocks high,
known object types, transforms, layers and song IDs. the code whitelist excludes progress,
other levels and arbitrary extra fields. old levels retain an implicit height; their source
song is made explicit so the recipient hears the same track under a different local ID.
recipients need the current app to open levels longer than 200 blocks or using the new
recorded soundtracks; older versions reject those values rather than silently changing them.

QR codes use medium error correction and at most version 15 for phone readability. larger
payloads keep the complete code/file alternatives. native sharing uses a self-contained link
up to 4096 characters, otherwise a text file if the platform supports it. clipboard and native
share failures leave selectable code and a download. native share cancellation is not an error.

import reads current storage, validates, appends an independent lowest-unused ID, then confirms
the write before changing the UI. this is not a cross-tab transaction/lock; simultaneous writes
from other tabs are not made atomic by localStorage. an unconfirmed write asks the user to reload
and inspect rather than silently retrying or rolling back over another tab.

## verification scope

the browser suite decodes the actual rendered QR, opens its link in a second isolated browser
context, cancels then confirms import, checks every prior save field, and plays the received
level. file proof reads the actual download and imports it after disconnecting the HTTP origin.
WebKit's simulated offline flag refused local file I/O, so it is not used as that proof.
native sharing and clipboard APIs are stubbed to verify data/cancellation; physical phone
share sheets, camera scanning and receiving apps still need human device testing.
