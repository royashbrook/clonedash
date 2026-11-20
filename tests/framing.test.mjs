import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easeFraming } from '../src/framing.ts';

// the upright camera framing eases across a turn (#138, docs/portrait.md rule 6)
test('the framing moves toward its target, never past it, and settles in about a third of a second', () => {
  const to = { lead: 1.5, zoom: 1.2 };
  let f = { lead: 0, zoom: 1 }, t = 0;
  const first = easeFraming(f, to, 1 / 60);
  assert.ok(first.lead > 0 && first.lead < 0.5, `one frame moves part way: ${first.lead}`);
  while (f.lead !== to.lead || f.zoom !== to.zoom) {
    const next = easeFraming(f, to, 1 / 60);
    assert.ok(next.lead >= f.lead && next.lead <= to.lead, 'the lead never overshoots');
    assert.ok(next.zoom >= f.zoom && next.zoom <= to.zoom, 'the zoom never overshoots');
    f = next;
    t += 1 / 60;
    assert.ok(t < 1, 'it settles');
  }
  assert.ok(t > 0.2 && t < 0.45, `settled at ${t.toFixed(2)} s`);
  assert.deepEqual(easeFraming(to, { lead: 0, zoom: 1 }, 0), to, 'no time, no move');
});
