import { usesNew, validateLevel } from "./engine.ts";
import { SAVE, readSave, selectLevel } from "./library.ts";
import type { Level, SaveData } from "./types.ts";

export const MAX_CODE = 192 * 1024;
export const MAX_LEVEL_BYTES = 128 * 1024;
// A whole save (#124, src/backup.ts) has its own explicit transfer ceiling, far above a level's:
// 5 MiB of save, and the longest text (code or link) that could carry it.
export const MAX_SAVE_BYTES = 5 * 1024 * 1024,
  MAX_SAVE_TEXT = Math.ceil((MAX_SAVE_BYTES * 4) / 3) + 1024;
// A level that uses width and height, touch triggers or multi touch (#117) travels as cdl2, which a
// copy of the game from before them refuses instead of playing a different level. Every other
// level is the same cdl1 code it always was. A level that carries its own loop (#121) is cdl3,
// whatever else it uses: a copy from before loops refuses cdl3, where a cdl1 or cdl2 reader would
// quietly drop the loop and play another song.
const PREFIX = "cdl1.",
  PREFIX2 = "cdl2.",
  PREFIX3 = "cdl3.",
  PREFIX4 = "cdl4."; // Older readers must not discard starting settings or off-map pieces.
const hasSetup = (value: object) => "startMode" in value || "startSpeed" in value || "offMap" in value;
const DECODE_MS = 5000;

// A level, never a save. Whitelist fields even when a valid level carries extras. A whole save
// (src/backup.ts) holds every level to this same list.
export function portableLevel(input: unknown): Level {
  const level = validateLevel(input);
  if (
    (level.height !== undefined && typeof level.height !== "number") ||
    (level.note !== undefined &&
      (typeof level.note !== "string" || level.note.length > 160)) ||
    (level.color !== undefined &&
      (typeof level.color !== "string" || !/^#[\da-f]{6}$/i.test(level.color)))
  )
    throw Error("Invalid level details.");
  return {
    name: level.name,
    length: level.length,
    ...(level.startMode === undefined ? {} : { startMode: level.startMode }),
    ...(level.startSpeed === undefined ? {} : { startSpeed: level.startSpeed }),
    ...(level.offMap ? { offMap: true as const } : {}),
    ...(level.height === undefined ? {} : { height: level.height }),
    // one song source: its own loop, or a numbered song (the original when none was picked)
    ...(level.loop ? { loop: level.loop } : { song: level.song ?? 9 }),
    ...(level.note === undefined ? {} : { note: level.note }),
    ...(level.color === undefined ? {} : { color: level.color }),
    objects: level.objects.map(
      ({ type, x, y, rotation, flipX, flipY, layer, scale, scaleX, scaleY, color, bounce, flipsGravity, boost, dash, noTouch, hidden, wallPass, roofPass, edges, group, target, moveX, moveY, duration, touch, multi }) => ({
        type,
        x,
        y,
        rotation,
        flipX,
        flipY,
        ...(layer === undefined ? {} : { layer }),
        ...(scale === undefined ? {} : { scale }),
        ...(color === undefined ? {} : { color }),
        ...(bounce === undefined ? {} : { bounce }),
        ...(flipsGravity === undefined ? {} : { flipsGravity }),
        ...(boost === undefined ? {} : { boost }),
        ...(dash === undefined ? {} : { dash }),
        ...(noTouch === undefined ? {} : { noTouch }),
        ...(hidden === undefined ? {} : { hidden }),
        ...(wallPass === undefined ? {} : { wallPass }),
        ...(roofPass === undefined ? {} : { roofPass }),
        ...(edges === undefined ? {} : { edges }),
        // coins and triggers (2026-11): new optional fields, so a cdl1 code made before them
        // decodes exactly as it did, and the envelope did not change
        ...(group === undefined ? {} : { group }),
        ...(target === undefined ? {} : { target }),
        ...(moveX === undefined ? {} : { moveX }),
        ...(moveY === undefined ? {} : { moveY }),
        ...(duration === undefined ? {} : { duration }),
        // cdl2 only (#117), see PREFIX2
        ...(scaleX === undefined ? {} : { scaleX, scaleY }),
        ...(touch === undefined ? {} : { touch }),
        ...(multi === undefined ? {} : { multi }),
      }),
    ),
  };
}

export function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

// a skin code (src/skin.ts) reads through this same bounded reader, with its own byte bound
export async function boundedBytes(
  stream: ReadableStream<Uint8Array>,
  limit = MAX_LEVEL_BYTES,
  kind = "level",
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          // Bound inflation while reading, not after allocating its entire output.
          if (size > limit) throw Error(`This ${kind} is too large.`);
          chunks.push(value);
        }
        const result = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return result;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(Error(`${kind[0].toUpperCase()}${kind.slice(1)} decoding timed out.`)),
          DECODE_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}

// The share envelope a skin (cds1) and a whole save (cdb1) travel in: prefix, a flag (0 raw,
// 1 deflate-raw), then base64url. Both ends hold one byte bound, through the same bounded reader
// and deadline as levels. `kind` names the thing in every message.
export async function packCode(prefix: string, raw: Uint8Array, limit: number, kind: string) {
  if (raw.byteLength > limit) throw Error(`This ${kind} is too large.`);
  let payload = raw,
    flag = "0";
  let compressor: CompressionStream | undefined;
  if (typeof CompressionStream !== "undefined") {
    try {
      compressor = new CompressionStream("deflate-raw");
    } catch {
      /* Older browsers may implement gzip but not deflate-raw. */
    }
  }
  if (compressor) {
    const compressed = await boundedBytes(
      new Blob([raw as Uint8Array<ArrayBuffer>]).stream().pipeThrough(compressor),
      limit,
      kind,
    );
    if (compressed.length < raw.length) {
      payload = compressed;
      flag = "1";
    }
  }
  return prefix + flag + base64(payload);
}

// The text inside a code the caller has already checked starts with `prefix`.
export async function unpackCode(code: string, prefix: string, limit: number, kind: string) {
  const flag = code[prefix.length],
    encoded = code.slice(prefix.length + 1);
  if (!/[01]/.test(flag ?? "") || !/^[\w-]+$/.test(encoded)) throw Error(`Invalid ${kind} code.`);
  // a code longer than the largest one could ever encode to is refused before decoding it
  if (encoded.length > Math.ceil((limit * 4) / 3)) throw Error(`This ${kind} is too large.`);
  const bytes = Uint8Array.from(atob(encoded.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
  if (base64(bytes) !== encoded) throw Error(`Invalid ${kind} code.`);
  if (bytes.length > limit) throw Error(`This ${kind} is too large.`);
  let decoded = bytes;
  if (flag === "1") {
    if (typeof DecompressionStream === "undefined")
      throw Error(`Update your browser to open compressed ${kind}s.`);
    decoded = await boundedBytes(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")),
      limit,
      kind,
    );
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(decoded);
}

export async function encodeLevel(input: Level): Promise<string> {
  const level = portableLevel(input),
    raw = new TextEncoder().encode(JSON.stringify(level));
  if (raw.byteLength > MAX_LEVEL_BYTES) throw Error("This level is too large.");
  let payload = raw,
    flag = "0";
  // Raw codes keep sharing available on browsers without the compression API.
  let compressor: CompressionStream | undefined;
  if (typeof CompressionStream !== "undefined") {
    try {
      compressor = new CompressionStream("deflate-raw");
    } catch {
      /* Older browsers may implement gzip but not deflate-raw. */
    }
  }
  if (compressor) {
    const compressed = await boundedBytes(
      new Blob([raw]).stream().pipeThrough(compressor),
    );
    if (compressed.length < raw.length) {
      payload = compressed;
      flag = "1";
    }
  }
  const legacy = (level.loop ? PREFIX3 : level.objects.some(usesNew) ? PREFIX2 : PREFIX);
  return (hasSetup(level) ? PREFIX4 : legacy) + flag + base64(payload);
}

export async function decodeLevel(text: string): Promise<Level> {
  if (text.length > MAX_CODE) throw Error("This level code is too large.");
  let code = text.trim();
  if (/^https?:\/\//i.test(code)) {
    const url = new URL(code),
      params = new URLSearchParams(url.hash.slice(1));
    if (params.getAll("level").length !== 1 || params.has("skin"))
      throw Error("This link does not contain one level.");
    code = params.get("level")!;
  }
  const second = code.startsWith(PREFIX2),
    third = code.startsWith(PREFIX3), fourth = code.startsWith(PREFIX4);
  if (!code.startsWith(PREFIX) && !second && !third && !fourth)
    throw Error("Use a Cube Dash level code or link (cdl1 through cdl4).");
  const flag = code[PREFIX.length],
    encoded = code.slice(PREFIX.length + 1);
  if (!/[01]/.test(flag ?? "") || !/^[\w-]+$/.test(encoded))
    throw Error("Invalid level code.");
  const bytes = Uint8Array.from(
    atob(encoded.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
  if (base64(bytes) !== encoded) throw Error("Invalid level code.");
  if (bytes.length > MAX_LEVEL_BYTES) throw Error("This level is too large.");
  let decoded = bytes;
  if (flag === "1") {
    if (typeof DecompressionStream === "undefined")
      throw Error("Update your browser to open compressed levels.");
    decoded = await boundedBytes(
      new Blob([bytes])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw")),
    );
  }
  const raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded));
  // a loop is checked on the raw data, before the whitelist could drop it: cdl1 and cdl2 never
  // carry one (null or malformed included), and cdl3 always does
  if (!raw || typeof raw !== "object" || hasSetup(raw) !== fourth) throw Error("Invalid level code.");
  if (!fourth && (raw !== null && typeof raw === "object" && "loop" in raw) !== third) throw Error("Invalid level code.");
  const level = portableLevel(raw);
  // cdl3: the raw check above already required the loop, and validateLevel bounds and checks it
  if (third || fourth) return level;
  // each prefix means one thing: a cdl1 never carries the #117 fields, a cdl2 always does
  if (level.objects.some(usesNew) !== second) throw Error("Invalid level code.");
  return level;
}

// Import takes one text and hands it to one domain decoder: a cds1 code or a #skin= link is a
// skin (src/skin.ts decodeSkin), a cdb1 code or a #save= link a whole save (src/backup.ts, #124),
// anything else goes to decodeLevel exactly as before. A link must carry exactly one of them;
// two kinds, or one twice, is ambiguous and refused before choosing.
export type CodeKind = "level" | "skin" | "save" | "loop";
export function codeKind(text: string): CodeKind {
  // nothing is parsed past the largest whole save, and only a save may pass a level's cap
  if (text.length > MAX_SAVE_TEXT) throw Error("This code is too large.");
  const kind = kindOf(text.trim());
  if (kind !== "save" && text.length > MAX_CODE) throw Error("This code is too large.");
  return kind;
}
const ONE = "This link does not contain one level, skin, loop or save.";
function kindOf(code: string): CodeKind {
  if (/^https?:\/\//i.test(code)) {
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(new URL(code).hash.slice(1));
    } catch {
      throw Error(ONE);
    }
    const counts = (["level", "skin", "save", "loop"] as const).map((k) => [k, params.getAll(k).length] as const);
    const found = counts.filter(([, n]) => n > 0);
    if (found.length !== 1 || found[0][1] !== 1) throw Error(ONE);
    return found[0][0];
  }
  return code.startsWith("cdb") ? "save" : code.startsWith("cdm") ? "loop" : code.startsWith("cds1.") ? "skin" : "level";
}

export function levelLink(code: string, address: string): string {
  const url = new URL(address);
  url.search = "";
  url.hash = new URLSearchParams({ level: code }).toString();
  return url.href;
}

export function appendLevel(save: SaveData, input: Level): SaveData {
  if (save.customLevels.length >= 100)
    throw Error("Your library is full (100 levels). Nothing was replaced.");
  const level = portableLevel(input);
  let id = 1;
  while (save.customLevels.some((entry) => entry.id === id)) id++;
  return {
    ...structuredClone(save),
    customLevels: [...structuredClone(save.customLevels), { id, level }],
  };
}

export function importLevel(
  storage: Pick<Storage, "getItem" | "setItem">,
  fallback: SaveData,
  input: Level,
  trailCount: number,
  openInEditor = false,
): SaveData {
  // Re-read at confirmation: a second tab may have saved since this sheet opened.
  const latest = readSave(
    storage.getItem(SAVE) ?? JSON.stringify(fallback),
    trailCount,
  );
  const next = appendLevel(latest, input);
  if (openInEditor) selectLevel(next, next.customLevels.at(-1)!.id);
  const raw = JSON.stringify(next);
  storage.setItem(SAVE, raw);
  if (storage.getItem(SAVE) !== raw)
    throw Error(
      "Storage could not confirm the import. Reload and check My Levels before trying again.",
    );
  return next;
}
