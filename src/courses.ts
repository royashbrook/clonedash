import { object as o } from "./engine.ts";
import type { Level, Piece, ObjectType } from "./types.ts";

// Authored phrases, not random obstacle soup. Replays in tests/courses.test.mjs
// prove the full runs on the same 120 Hz engine players use.
const row = (type: ObjectType, x: number, width: number, y = 0) =>
  Array.from({ length: width }, (_, i) => o(type, x + i, y));
const down = (x: number) => ({ ...o("spike", x, 6), flipY: true });
const gate = (x: number, bottom: number, top: number) => [
  ...Array.from({ length: bottom }, (_, y) => o("grid", x, y)),
  ...Array.from({ length: 7 - top }, (_, y) => o("grid", x, top + y)),
];
const phrase = (starts: number[], make: (x: number, i: number) => Piece[]) =>
  starts.flatMap(make);
const sequence = (start: number, end: number, gap: number) =>
  Array.from(
    { length: Math.floor((end - start) / gap) + 1 },
    (_, i) => start + i * gap,
  );

export const COURSES: Level[] = [
  {
    name: "Pulseway",
    note: "Single jumps become double beats",
    color: "#9aff6b",
    length: 240,
    song: 109,
    objects: [
      ...phrase([10, 22, 36, 48, 62], (x) => [o("spike", x)]),
      ...phrase([78, 92, 106, 120, 134], (x, i) =>
        row(i % 2 ? "half" : "spike", x, 2),
      ),
      ...phrase([152, 166, 180, 194, 208, 224], (x, i) => [
        o(i % 2 ? "spike" : "grid", x),
      ]),
    ],
  },
  {
    name: "Skyline",
    note: "Climb the rooftops, clear the gaps",
    color: "#53e3ff",
    length: 240,
    song: 110,
    objects: phrase([10, 34, 58, 82, 108, 134, 160, 186, 212], (x, i) => [
      o("ramp-grid", x),
      ...row("grid", x + 1, 3),
      o(i % 2 ? "spike" : "half", x + 10),
      ...row("grid", x + 17, i % 3 === 2 ? 2 : 1),
    ]),
  },
  {
    name: "Runway",
    note: "Broad gates, then a landing sprint",
    color: "#ffd166",
    length: 240,
    song: 111,
    objects: [
      o("plane", 3),
      ...phrase(sequence(18, 184, 18), (x, i) =>
        gate(x, i % 2 ? 0 : 2, i % 2 ? 4 : 7),
      ),
      o("square", 198, 2),
      o("square", 198),
      ...phrase([211, 223, 234], (x) => [o("spike", x)]),
    ],
  },
  {
    name: "Switchyard",
    note: "Double spikes and raised landings",
    color: "#ffb477",
    length: 300,
    song: 112,
    objects: phrase([10, 42, 74, 106, 138, 170, 202, 234, 266], (x, i) => [
      ...row("spike", x, 2),
      ...row("grid", x + 9, 3),
      o("half", x + 16),
      ...row(i % 2 ? "half" : "spike", x + 23, 2),
    ]),
  },
  {
    name: "Orbitworks",
    note: "Floor to ceiling. Land before you flip.",
    color: "#b9a0ff",
    length: 300,
    song: 113,
    objects: [
      o("wheel", 3),
      ...phrase(sequence(16, 280, 22), (x, i) =>
        i % 2 ? [down(x), down(x + 1), down(x + 2)] : row("spike", x, 3),
      ),
    ],
  },
  {
    name: "Airloom",
    note: "Tap again to thread the upper shelves",
    color: "#72f7dc",
    length: 300,
    song: 114,
    objects: [
      o("jumper", 3),
      ...phrase(sequence(16, 272, 32), (x) => [
        ...row("outline", x, 7, 3),
        ...row("spike", x + 2, 6),
        o("quarter", x + 15),
        ...row("grid", x + 23, 2),
      ]),
    ],
  },
  {
    name: "Overdrive",
    note: "Triple beats. Short recoveries.",
    color: "#ff8ac4",
    length: 360,
    song: 115,
    objects: phrase(sequence(10, 322, 26), (x, i) => [
      ...row("spike", x, 3),
      ...row("grid", x + 8, 2),
      ...row(i % 2 ? "spike" : "half", x + 16, 2),
    ]),
  },
  {
    name: "Polarity",
    note: "Fast gravity changes and a final flight",
    color: "#ffb477",
    length: 360,
    song: 116,
    objects: [
      o("wheel", 3),
      ...phrase(sequence(12, 240, 12), (x, i) =>
        i % 2 ? [down(x), down(x + 1), down(x + 2)] : row("spike", x, 3),
      ),
      o("gravity-down", 252, 4.5),
      o("gravity-down", 252),
      o("plane", 262),
      o("plane", 262, 3),
      ...phrase(sequence(276, 340, 16), (x, i) =>
        gate(x, i % 2 ? 0 : 3, i % 2 ? 3 : 7),
      ),
    ],
  },
  {
    name: "Afterburn",
    note: "Tight gates, a switch, then triple spikes",
    color: "#53e3ff",
    length: 360,
    song: 117,
    objects: [
      o("plane", 3),
      ...phrase(sequence(18, 242, 16), (x, i) =>
        gate(x, i % 2 ? 0 : 3, i % 2 ? 3 : 7),
      ),
      o("square", 258),
      o("square", 258, 2.5),
      ...phrase([272, 284, 296, 308, 320, 332, 346], (x) => row("spike", x, 3)),
    ],
  },
];
