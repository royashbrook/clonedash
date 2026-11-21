import { int, MAX_NAME, validateLoop, type Loop } from "./loop-schema.ts";

export type Section = { loop: Loop; repeats: number };
export type Arrangement = { name: string; bpm: number; sections: Section[] };
export const duration = (song: Arrangement) =>
  (song.sections.reduce((n, s) => n + s.loop.notes.length * s.repeats, 0) *
    30) /
  song.bpm;

export function arrangement(input: unknown): Arrangement {
  const s = input as Arrangement;
  if (
    !s ||
    typeof s.name !== "string" ||
    s.name.length > MAX_NAME ||
    !int(s.bpm, 60, 200) ||
    !Array.isArray(s.sections) ||
    !s.sections.length ||
    s.sections.length > 200
  )
    throw Error("A song needs a section and a tempo between 60 and 200 BPM.");
  const sections = s.sections.map((section) => {
    if (!section || !int(section.repeats, 1, 200))
      throw Error("Repeat a section 1 to 200 times.");
    return { loop: validateLoop(section.loop), repeats: section.repeats };
  });
  const checked = { name: s.name, bpm: s.bpm, sections };
  if (duration(checked) > 240)
    throw Error("This would take the song past 4:00.");
  return checked;
}

export const SONG_KEY = "clonedash.songs.v1";
export type SongBook = {
  next: number;
  entries: { id: number; song: Arrangement }[];
};
export function readSongs(raw: string | null): SongBook {
  if (raw === null) return { next: 1, entries: [] };
  const b = JSON.parse(raw) as SongBook;
  if (
    !b ||
    !int(b.next, 1, 1e9) ||
    !Array.isArray(b.entries) ||
    b.entries.length > 100
  )
    throw Error("Invalid song library.");
  const ids = new Set<number>();
  const entries = b.entries.map(({ id, song }) => {
    if (!int(id, 1, b.next - 1) || ids.has(id)) throw Error("Invalid song id.");
    ids.add(id);
    return { id, song: arrangement(song) };
  });
  return { next: b.next, entries };
}

export function writeSong(
  storage: Storage,
  id: number | null,
  song: Arrangement | null,
) {
  const book = readSongs(storage.getItem(SONG_KEY));
  const at = book.entries.findIndex((e) => e.id === id);
  if (!song) book.entries = book.entries.filter((e) => e.id !== id);
  else if (at >= 0) book.entries[at].song = arrangement(song);
  else {
    if (book.entries.length >= 100 || book.next >= 1e9)
      throw Error("Your song library is full.");
    id = book.next++;
    book.entries.push({ id, song: arrangement(song) });
  }
  const data = JSON.stringify(book);
  storage.setItem(SONG_KEY, data);
  if (storage.getItem(SONG_KEY) !== data)
    throw Error("Could not confirm the song was saved.");
  return { book, id };
}

// Only store the step order, never the audio for four minutes on a phone.
export function timeline(song: Arrangement) {
  return song.sections.flatMap(({ loop, repeats }, section) =>
    Array.from({ length: repeats * loop.notes.length }, (_, i) => ({
      loop,
      step: i % loop.notes.length,
      section,
    })),
  );
}
