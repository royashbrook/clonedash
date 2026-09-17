import { SPIKES, BLOCKS, bounds } from "../src/engine.ts";

// Only input is returned. No teleporting, object removal, invincibility, or physics edits.
// Decisions are sampled every 50 ms by the witness; flight hysteresis avoids 120 Hz tapping.
export function courseInput(s) {
  const ahead = s.level.objects.filter(
    (o) => o.layer !== "background" && o.x > s.x - 0.5,
  );
  if (s.mode === "plane") {
    const x = ahead.find(
      (o) => BLOCKS.includes(o.type) && o.x > s.x && o.x - s.x < 10,
    )?.x;
    const column = ahead.filter((o) => o.x === x && BLOCKS.includes(o.type));
    let target = 2.5;
    if (column.some((o) => o.y === 0))
      target = Math.max(...column.map((o) => o.y)) + 1.65;
    else if (column.length) target = Math.min(...column.map((o) => o.y)) - 1.3;
    const error = target - (s.y + s.vy * 0.35);
    return Math.abs(error) < 0.65 ? s.inputHeld : error > 0;
  }
  if (s.mode === "wheel")
    return (
      s.grounded &&
      ahead.some(
        (o) =>
          SPIKES.includes(o.type) &&
          ((s.gravity < 0 && o.y === 0) || (s.gravity > 0 && o.y === 6)) &&
          o.x - s.x < 6 &&
          o.x - s.x > 3,
      )
    );
  if (s.mode === "jumper") {
    const shelf = ahead.find(
      (o) => o.type === "outline" && o.x - s.x > 0 && o.x - s.x < 5,
    );
    if (shelf && s.y < 3.2) return !s.inputHeld && (s.grounded || s.vy < 4);
  }
  if (!s.grounded) return false;
  return ahead.some((o) => {
    if (!SPIKES.includes(o.type) && !BLOCKS.includes(o.type)) return false;
    const b = bounds(o),
      lead = SPIKES.includes(o.type) ? 1.8 : 2.1;
    return (
      b.top > s.y + 0.05 &&
      b.bottom < s.y + 1.1 &&
      b.left - s.x > lead - 0.5 &&
      b.left - s.x < lead
    );
  });
}
