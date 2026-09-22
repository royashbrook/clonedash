import { validateLevel } from "./engine.ts";
import { SAVE, readSave, selectLevel } from "./library.ts";
import type { Level, SaveData } from "./types.ts";

export const MAX_CODE = 192 * 1024;
export const MAX_LEVEL_BYTES = 128 * 1024;
const PREFIX = "cdl1.";
const DECODE_MS = 5000;

// A level, never a save. Whitelist fields even when a valid level carries extras.
function portableLevel(input: unknown): Level {
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
    ...(level.height === undefined ? {} : { height: level.height }),
    song: level.song ?? 9,
    ...(level.note === undefined ? {} : { note: level.note }),
    ...(level.color === undefined ? {} : { color: level.color }),
    objects: level.objects.map(
      ({ type, x, y, rotation, flipX, flipY, layer, scale }) => ({
        type,
        x,
        y,
        rotation,
        flipX,
        flipY,
        ...(layer === undefined ? {} : { layer }),
        ...(scale === undefined ? {} : { scale }),
      }),
    ),
  };
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

async function boundedBytes(
  stream: ReadableStream<Uint8Array>,
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
          if (size > MAX_LEVEL_BYTES) throw Error("This level is too large.");
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
          () => reject(Error("Level decoding timed out.")),
          DECODE_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}

export async function encodeLevel(input: Level): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(portableLevel(input)));
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
  return PREFIX + flag + base64(payload);
}

export async function decodeLevel(text: string): Promise<Level> {
  if (text.length > MAX_CODE) throw Error("This level code is too large.");
  let code = text.trim();
  if (/^https?:\/\//i.test(code)) {
    const url = new URL(code),
      params = new URLSearchParams(url.hash.slice(1));
    if (params.getAll("level").length !== 1)
      throw Error("This link does not contain one level.");
    code = params.get("level")!;
  }
  if (!code.startsWith(PREFIX))
    throw Error("Use a Clone Dash level code or link (cdl1).");
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
  return portableLevel(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded)),
  );
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
