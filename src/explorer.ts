import { object as o } from "./engine.ts";
import { col, down, gate, ring, row, tall } from "./remix.ts";
import type { Level, Piece } from "./types.ts";

// The Explorer set: one newer piece per trail, then a lap of all of them. Each trail is replayed
// by tests/courses.test.mjs from its checked-in input timeline (tests/explorer-inputs.mjs).
const every = (start: number, count: number, gap: number) =>
  Array.from({ length: count }, (_, i) => start + i * gap);
// A wall nothing gets past, and the empty cell behind it that a teleport lands in: a marker
// nobody sees or hits.
const wall = (x: number) => col("grid", x, 7);
const landing = (x: number, group: number): Piece => ({
  ...o("block", x),
  noTouch: true,
  hidden: true,
  group,
});
const blink = (x: number, group: number, tapped: boolean): Piece[] => [
  tapped
    ? { ...o("teleport-ring", x), target: group }
    : { ...o("teleport-trigger", x), target: group },
  ...wall(x + 4),
  landing(x + 8, group),
];

export const EXPLORER: Level[] = [
  {
    name: "Coin Canyon",
    note: "Ten coins. Grab them all.",
    color: "#ffd166",
    length: 262,
    song: 40,
    objects: every(12, 20, 12).flatMap((x, i) => [
      ...(i % 4 === 0
        ? [o("spike", x)]
        : i % 4 === 1
          ? row("spike", x, 2)
          : i % 4 === 2
            ? [o("grid", x)]
            : [o("half", x)]),
      ...(i % 2 ? [] : [o("coin", x + 7)]),
    ]),
  },
  {
    name: "Booster Bay",
    note: "Pads launch you. Spikes do not.",
    color: "#ff8ac4",
    length: 280,
    song: 47,
    objects: every(12, 11, 24).flatMap((x, i) => [
      o("spike", x),
      o(i % 2 ? "red-pad" : "yellow-pad", x + 7),
      ...row("spike", x + 9, i % 2 ? 4 : 2),
      ...row("spike", x + 19, 2),
    ]),
  },
  {
    name: "Blink Bridge",
    note: "Walls ahead. Tap the violet ring.",
    color: "#c77dff",
    length: 340,
    song: 53,
    objects: every(12, 10, 32).flatMap((x, i) => [
      o("spike", x),
      ...blink(x + 8, i + 1, i % 2 === 1),
      ...row("spike", x + 24, 2),
    ]),
  },
  {
    name: "Door to Door",
    note: "Hold longer, jump higher",
    color: "#72f7dc",
    length: 280,
    song: 58,
    objects: [
      o("door", 3),
      ...every(12, 13, 20).flatMap((x, i) => [
        ...col("grid", x, i % 3 === 2 ? 4 : 3),
        ...row("spike", x + 10, 2),
      ]),
    ],
  },
  {
    name: "Orb Garden",
    note: "Yellow, purple, red. Tap them all.",
    color: "#9aff6b",
    length: 300,
    song: 64,
    objects: every(12, 9, 32).flatMap((x, i) =>
      i % 3 === 0
        ? [ring(x + 2, 2), ...col("grid", x + 5, 3), ...row("spike", x + 16, 2)]
        : i % 3 === 1
          ? [
              ...row("grid", x, 12, 2),
              ring(x + 1, 0, "purple"),
              o("half", x + 3),
              ring(x + 6, 0, "purple"),
              o("half", x + 8),
              ...row("spike", x + 19, 2),
            ]
          : [
              ring(x + 2, 0, "red"),
              ...row("spike", x + 5, 6),
              ...row("grid", x + 5, 6, 3),
              ...row("spike", x + 21, 2),
            ],
    ),
  },
  {
    name: "Flipside",
    note: "Run the roof, then drop back down",
    color: "#53e3ff",
    length: 310,
    song: 71,
    objects: every(12, 6, 48).flatMap((x) => [
      o("gravity-up", x),
      ...down(x + 12),
      ...down(x + 19, 2),
      o("gravity-down", x + 26, 4.5),
      o("spike", x + 36),
      ...row("spike", x + 42, 2),
    ]),
  },
  {
    name: "Last Lap",
    note: "Every shape, then full speed",
    color: "#ffb477",
    length: 360,
    song: 88,
    objects: [
      o("spike", 10),
      ...row("spike", 18, 2),
      ...row("grid", 26, 3),
      ...row("spike", 34, 2),
      ...tall("plane", 44),
      ...gate(56, 0, 4),
      ...gate(68, 3, 7),
      ...gate(80, 1, 5),
      ...tall("wheel", 92),
      ...row("spike", 102, 3),
      ...down(113, 3),
      ...row("spike", 124, 3),
      ...tall("gravity-down", 134),
      ...tall("pogo", 138),
      ...row("outline", 146, 7, 3),
      ...row("spike", 148, 5),
      o("quarter", 162),
      ...tall("door", 172),
      ...col("grid", 182, 3),
      ...col("grid", 196, 4),
      ...tall("square", 208),
      o("speed-fast", 214),
      ...every(226, 8, 14).flatMap((x, i) => row("spike", x, (i % 2) + 1)),
      o("speed-normal", 338),
      o("spike", 348),
    ],
  },
];
