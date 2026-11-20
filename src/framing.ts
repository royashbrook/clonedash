// The camera framing a phone held upright adds to a run: a lead (blocks further ahead) and a zoom.
// Across a turn it eases to the new framing instead of jumping (#138); everything else snaps.
export interface Framing {
  lead: number;
  zoom: number;
}
const TAU = 0.06; // seconds: a 1.5 block lead settles in about a third of a second
export function easeFraming(from: Framing, to: Framing, dt: number): Framing {
  const k = 1 - Math.exp(-dt / TAU);
  const step = (a: number, b: number) => (Math.abs(b - a) < 0.005 ? b : a + (b - a) * k);
  return { lead: step(from.lead, to.lead), zoom: step(from.zoom, to.zoom) };
}
