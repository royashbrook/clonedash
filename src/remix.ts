import { object as o } from "./engine.ts";
import type { Level, Piece, ObjectType } from "./types.ts";

// The Remix set (#71): modes, mechanics and a finale. Built from short phrases like the
// courses; every trail is replayed by tests/courses.test.mjs from its checked-in input timeline.
const row = (type: ObjectType, x: number, width: number, y = 0) =>
  Array.from({ length: width }, (_, i) => o(type, x + i, y));
const col = (type: ObjectType, x: number, height: number, y = 0) =>
  Array.from({ length: height }, (_, i) => o(type, x, y + i));
const down = (x: number, width = 1): Piece[] =>
  row("spike", x, width, 6).map((p) => ({ ...p, flipY: true }));
const gate = (x: number, bottom: number, top: number) => [
  ...col("grid", x, bottom),
  ...col("grid", x, 7 - top, top),
];
// A wave corridor for the angle: spikes on floor and ceiling, solid gates at the given columns.
const zigzag = (
  x: number,
  width: number,
  gates: [number, number, number][],
) => {
  const at = new Set(gates.map(([g]) => g));
  return [
    ...row("spike", x, width).filter((p) => !at.has(p.x)),
    ...down(x, width).filter((p) => !at.has(p.x)),
    ...gates.flatMap(([g, bottom, top]) => gate(g, bottom, top)),
  ];
};
// Rings: plain, purple (a one-block hop) and red (a five-block launch), as the editor presets.
const ring = (x: number, y: number, kind?: "purple" | "red"): Piece =>
  kind === "purple"
    ? { ...o("ring", x, y), color: "#c77dff", bounce: 1 }
    : kind === "red"
      ? { ...o("ring", x, y), color: "#ff5c7a", bounce: 5 }
      : o("ring", x, y);
const slopeDown = (type: ObjectType, x: number, from: number): Piece[] =>
  Array.from({ length: from }, (_, i) => ({
    ...o(type, x + i, from - 1 - i),
    flipX: true,
  }));
// One piece at a size or an angle, from the editor's pinch and rotate.
const big = (
  type: ObjectType,
  x: number,
  y: number,
  scale: number,
  rotation = 0,
): Piece => ({
  ...o(type, x, y),
  rotation,
  scale,
});
// A piece turned by some degrees, lifted so its lowest corner rests on the floor.
const turned = (type: ObjectType, x: number, size: number, degrees: number) => {
  const a = (degrees * Math.PI) / 180;
  return big(
    type,
    x,
    (size / 2) * (Math.cos(a) + Math.sin(a) - 1),
    size,
    degrees,
  );
};
const diamond = (x: number, size = 1) => turned("block", x, size, 45);
// A zone laid exactly over the pieces it changes: W stops a wall, R bumps a roof.
const zone = (type: "w-block" | "r-block", pieces: Piece[]): Piece[] =>
  pieces.map((p) => ({ ...p, type }));
// A portal tall enough that the run meets it at any height.
const tall = (type: ObjectType, x: number) => [
  o(type, x, 0),
  o(type, x, 2.25),
  o(type, x, 4.5),
];

export const REMIX: Level[] = [
  {
    name: "Shapeshifter",
    note: "Five shapes, one run",
    color: "#b9a0ff",
    length: 370,
    song: 113,
    objects: [
      // square
      o("spike", 10),
      ...row("spike", 16, 2),
      ...row("grid", 23, 3),
      ...row("spike", 28, 2),
      ...row("spike", 35, 3),
      // plane: gates, then a spiked tunnel
      o("plane", 44),
      ...gate(54, 0, 4),
      ...gate(64, 3, 7),
      ...gate(74, 1, 4),
      ...row("spike", 80, 8),
      ...[4, 5, 6].flatMap((y) => row("grid", 80, 8, y)),
      ...gate(94, 2, 5),
      // wheel
      ...tall("wheel", 102),
      ...row("spike", 112, 3),
      ...down(123, 3),
      ...row("spike", 134, 3),
      ...down(145, 3),
      ...row("spike", 156, 3),
      // pogo
      ...tall("gravity-down", 166),
      ...tall("pogo", 170),
      ...[178, 210].flatMap((x) => [
        ...row("outline", x, 7, 3),
        ...row("spike", x + 2, 6),
        o("quarter", x + 15),
        ...row("grid", x + 23, 2),
      ]),
      // angle: a spiked zigzag
      ...tall("angle", 242),
      ...zigzag(252, 36, [
        [256, 1, 3],
        [263, 4, 6],
        [270, 1, 3],
        [277, 4, 6],
        [284, 1, 3],
      ]),
      // square, then the ceiling
      ...tall("square", 296),
      o("gravity-up", 306),
      ...down(318),
      ...down(325, 2),
      ...down(333),
      o("gravity-down", 340, 4.5),
      o("spike", 352),
      ...row("spike", 358, 2),
    ],
  },
  {
    name: "Quick Change",
    note: "New shape every few seconds",
    color: "#ff8ac4",
    length: 350,
    song: 115,
    objects: [
      // square
      o("spike", 10),
      ...row("spike", 16, 2),
      // pogo
      o("pogo", 24),
      ...row("outline", 32, 6, 3),
      ...row("spike", 33, 5),
      o("quarter", 44),
      // pogo on the ceiling
      ...tall("gravity-up", 50),
      ...down(62),
      ...down(68, 2),
      // wheel, still upside down
      ...tall("wheel", 76),
      ...down(86, 3),
      ...row("spike", 97, 3),
      ...down(108, 3),
      // plane, right way up
      ...tall("gravity-down", 116),
      ...tall("plane", 120),
      ...gate(130, 3, 7),
      ...gate(140, 0, 4),
      ...gate(150, 2, 6),
      // angle
      ...tall("angle", 158),
      ...zigzag(166, 24, [
        [170, 1, 3],
        [177, 4, 6],
        [184, 1, 3],
      ]),
      // square with a trip across the ceiling
      ...tall("square", 196),
      o("spike", 206),
      o("gravity-up", 212),
      ...down(224),
      ...down(230, 2),
      o("gravity-down", 236, 4.5),
      ...row("spike", 248, 2),
      // wheel
      ...tall("wheel", 256),
      ...row("spike", 266, 3),
      ...down(277, 3),
      ...row("spike", 288, 3),
      // pogo, then fly home
      ...tall("gravity-down", 296),
      ...tall("pogo", 300),
      ...row("outline", 308, 6, 3),
      ...row("spike", 309, 5),
      ...tall("plane", 322),
      ...gate(332, 0, 4),
      ...gate(341, 3, 7),
    ],
  },
  {
    name: "Ring Road",
    note: "Bounce, climb, then speed up",
    color: "#ffd166",
    length: 340,
    song: 110,
    objects: [
      // a ledge with a ramp each end
      o("ramp", 10),
      ...row("grid", 11, 7),
      o("spike", 14, 1),
      ...slopeDown("ramp", 18, 1),
      ...row("spike", 24, 2),
      // a ring in the air over a tall wall
      ring(32, 2),
      ...col("grid", 35, 3),
      // purple hops under a low roof
      ...row("grid", 44, 12, 2),
      ring(45, 0, "purple"),
      o("half", 47),
      ring(50, 0, "purple"),
      o("half", 52),
      // red ring up to the high road, then slide down
      ring(61, 0, "red"),
      ...row("spike", 64, 9),
      ...row("grid", 64, 9, 3),
      ...slopeDown("ramp-grid", 73, 4),
      // fast
      o("speed-fast", 84),
      o("spike", 94),
      ...row("spike", 102, 2),
      o("ramp-black", 110),
      ...row("black", 111, 8),
      o("ramp-black", 113, 1),
      ...row("black", 114, 5, 1),
      o("spike", 117, 2),
      ...row("spike", 126, 7),
      ring(128, 2),
      // faster
      o("speed-faster", 142),
      o("spike", 154),
      o("spike", 164),
      ...row("spike", 174, 2),
      o("ramp", 184),
      ...row("spike", 187, 3),
      // slow and tight
      o("speed-slow", 196),
      ...row("spike", 204, 2),
      o("half", 208),
      ...row("grid", 212, 10, 2),
      ring(213, 0, "purple"),
      o("half", 215),
      ring(218, 0, "purple"),
      o("half", 220),
      // across the ceiling with a ring
      o("speed-normal", 228),
      o("gravity-up", 232),
      ...down(244),
      ...down(251, 6),
      ring(252, 4),
      o("gravity-down", 262, 4.5),
      // a red ring over a wall, a kicker, then fast to the end
      ring(274, 0, "red"),
      ...col("grid", 277, 4),
      o("ramp", 290),
      ...row("spike", 294, 2),
      o("speed-fast", 302),
      o("spike", 314),
      ...row("spike", 322, 2),
      o("spike", 331),
    ],
  },
  {
    name: "Block Party",
    note: "Walls wait, roofs bump, blocks grow",
    color: "#53e3ff",
    length: 340,
    song: 112,
    objects: [
      // big, tall and turned
      big("spike", 10, 0, 1.5),
      big("grid", 18, 0, 2),
      o("spike", 24),
      diamond(30),
      diamond(36),
      turned("grid", 43, 2, 20),
      // a low roof that bumps
      ...row("grid", 56, 16, 2),
      ...zone("r-block", row("grid", 56, 16, 2)),
      o("spike", 60),
      o("spike", 65),
      o("spike", 69),
      // fast: a big wall that waits, and a red ring
      o("speed-fast", 78),
      ring(90, 0, "red"),
      big("black", 92.5, 0, 3),
      ...zone("w-block", [big("black", 92.5, 0, 3)]),
      big("spike", 104, 0, 2),
      diamond(113, 1.5),
      // angle: squeeze low, then climb the wall
      o("speed-normal", 122),
      ...tall("angle", 128),
      ...row("spike", 138, 10),
      ...row("grid", 138, 10, 3),
      big("grid", 151, 0, 4),
      ...zone("w-block", [big("grid", 151, 0, 4)]),
      ...row("spike", 154, 6),
      ...down(160, 5),
      ...col("grid", 166, 4),
      // on the ceiling, the roof is the floor
      ...tall("square", 174),
      o("gravity-up", 182),
      ...row("grid", 194, 14, 4),
      ...zone("r-block", row("grid", 194, 14, 4)),
      ...down(198),
      ...down(203),
      ...down(207),
      o("gravity-down", 214, 4.5),
      // faster over big steps
      o("speed-faster", 226),
      big("grid", 240, 0, 2),
      big("grid", 249, 0, 2),
      ...row("spike", 245, 3),
      diamond(260),
      diamond(268, 1.5),
      big("spike", 278, 0, 1.5),
      // slow: walls that wait
      o("speed-slow", 288),
      ...col("grid", 298, 2),
      ...zone("w-block", col("grid", 298, 2)),
      o("spike", 304),
      ...col("grid", 312, 2),
      ...zone("w-block", col("grid", 312, 2)),
      ...row("spike", 318, 2),
      big("spike", 328, 0, 1.5),
    ],
  },
  {
    name: "Grand Finale",
    note: "Every shape and every trick",
    color: "#72f7dc",
    length: 380,
    song: 109,
    objects: [
      // ramps, small spikes and a ring
      o("ramp-grid", 10),
      ...row("plain-black", 11, 6),
      o("small", 14, 1),
      ...slopeDown("ramp-grid", 17, 1),
      ...row("quarter", 22, 2),
      ring(28, 2),
      ...col("block", 31, 3),
      // pogo shelves: a second tap, or the red ring, reaches the top one
      ...tall("pogo", 40),
      ...row("outline", 50, 6, 3),
      ...row("spike", 51, 5),
      ring(60, 0, "red"),
      ...row("outline", 63, 6, 4),
      ...row("spike", 63, 6),
      ...col("block", 69, 4),
      o("quarter", 76),
      // fast flight between turned blocks
      o("speed-fast", 82),
      ...tall("plane", 86),
      ...gate(98, 0, 4),
      big("grid", 106, 5, 1.5, 45),
      ...gate(114, 3, 7),
      big("grid", 122, 0.5, 1.5, 45),
      ...gate(130, 1, 5),
      // wheel, normal speed
      ...tall("speed-normal", 138),
      ...tall("wheel", 142),
      ...row("spike", 152, 3),
      ...down(162, 3),
      ...row("half", 172, 3),
      // angle, then climb the wall
      ...tall("gravity-down", 180),
      ...tall("angle", 184),
      ...zigzag(194, 18, [
        [198, 1, 3],
        [205, 4, 6],
      ]),
      ...row("spike", 212, 8),
      ...row("grid", 212, 8, 3),
      big("grid", 222.5, 0, 4),
      ...zone("w-block", [big("grid", 222.5, 0, 4)]),
      ...row("spike", 225, 6),
      // square on the ceiling, roofs that bump
      ...tall("square", 234),
      ...tall("gravity-up", 240),
      ...row("grid", 252, 12, 4),
      ...zone("r-block", row("grid", 252, 12, 4)),
      ...down(256),
      ...down(261),
      o("gravity-down", 268, 4.5),
      // faster over big blocks
      o("speed-faster", 278),
      big("grid", 292, 0, 2),
      ...row("spike", 297, 3),
      diamond(306),
      big("spike", 315, 0, 1.5),
      // slow: purple hops, then a red ring over the last wall
      o("speed-slow", 324),
      ...row("grid", 332, 10, 2),
      ring(333, 0, "purple"),
      o("half", 335),
      ring(338, 0, "purple"),
      o("half", 340),
      ring(351, 0, "red"),
      big("black", 353.5, 0, 3),
      ...zone("w-block", [big("black", 353.5, 0, 3)]),
      ...row("spike", 362, 2),
      o("spike", 370),
    ],
  },
];
