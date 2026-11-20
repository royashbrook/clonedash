import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../src/engine.ts';
const { createState, step, object, validateLevel, duplicateObject, BLOCKS } = engine;
import { render } from '../src/render.ts';
import { encodeLevel, decodeLevel } from '../src/transfer.ts';
// spelled out here, not imported, so this file runs (and fails) against a tree without them
const OUTLINED = ['block', 'grid', 'black', 'outline'], EDGES = ['edge', 'parallel', 'outer', 'inner', 'three', 'none'];
const level = (objects) => ({ name: 'Edges', length: 40, height: 10, objects });

test('edges validate: outlined blocks only, one of the six values', () => {
  for (const type of OUTLINED)
    for (const edges of EDGES) {
      const ok = level([{ ...object(type, 10, 1), edges, rotation: 90 }]);
      assert.doesNotThrow(() => assert.deepEqual(validateLevel(ok), ok), `${type} ${edges}`);
    }
  for (const edges of ['', 'top', 'EDGE', 1, null, ['edge']])
    assert.throws(() => validateLevel(level([{ ...object('block', 10, 1), edges }])), /Invalid block edges/);
  for (const type of ['plain-black', 'spike', 'ring', 'ramp', 'w-block', 'plane'])
    assert.throws(() => validateLevel(level([{ ...object(type, 10, 1), edges: 'edge' }])), /Invalid block edges/, type);
  assert.deepEqual(engine.OUTLINED, OUTLINED); assert.deepEqual(engine.EDGES, EDGES);
  assert.deepEqual(OUTLINED, BLOCKS.filter((t) => t !== 'plain-black'), 'every bordered block, not NO BORDER');
});

test('the share code and a copy keep edges; a plain block stays without the field', async () => {
  const pieces = level([{ ...object('grid', 10, 1), edges: 'outer', rotation: 270 }, object('black', 12, 1)]);
  const back = await decodeLevel(await encodeLevel(pieces));
  assert.equal(back.objects[0].edges, 'outer');
  assert.equal('edges' in back.objects[1], false, 'absent stays absent, so old codes are byte-identical');
  const copy = duplicateObject(pieces, 0);
  assert.equal(copy.edges, 'outer'); assert.equal(copy.x, 11);
});

test('edges are drawing only: the run is the same with or without them', () => {
  const stairs = [object('block', 8, 0), object('block', 9, 0), object('block', 9, 1), object('block', 12, 0)];
  const plain = createState(level(stairs)),
    edged = createState(level(stairs.map((o, i) => ({ ...o, edges: EDGES[i % EDGES.length] }))));
  for (let i = 0; i < 600; i++) { step(plain, i % 40 < 6); step(edged, i % 40 < 6); }
  assert.deepEqual({ ...edged, level: null }, { ...plain, level: null });
});

// Record the canvas calls for one piece (the chunk that differs from an empty trail) and return
// the line segments each white stroke paints, in block units.
function strokes(piece) {
  Object.assign(globalThis, { innerWidth: 932, innerHeight: 430, devicePixelRatio: 1 });
  const draw = (objects) => {
    const log = [];
    const ctx = new Proxy({}, {
      set(t, k, v) { t[k] = v; log.push(['set', k, v]); return true; },
      get(t, k) { if (k in t) return t[k]; return (...a) => { log.push([k, ...a]); if (k === 'createLinearGradient') return { addColorStop() {} }; }; },
    });
    const view = render({ width: 932, height: 430, getContext: () => ctx }, { state: null, level: level(objects), editing: true });
    return { log, view };
  };
  const empty = draw([]).log, { log, view } = draw([piece]);
  let start = 0, end = 0;
  while (JSON.stringify(log[start]) === JSON.stringify(empty[start])) start++;
  while (JSON.stringify(log.at(-1 - end)) === JSON.stringify(empty.at(-1 - end))) end++;
  const chunk = log.slice(start, log.length - end);
  const round = (v) => Math.round(v * 1000) / 1000,
    at = (x, y) => [round(view.x(x)), round(view.y(y))];
  const painted = [];
  let path = [], pen, first, style;
  for (const [k, ...a] of chunk) {
    if (k === 'set' && a[0] === 'strokeStyle') style = a[1];
    if (k === 'beginPath') path = [];
    if (k === 'moveTo') pen = first = at(...a);
    if (k === 'lineTo') { const next = at(...a); path.push([pen, next]); pen = next; }
    if (k === 'closePath') path.push([pen, first]);
    if (k === 'stroke' && style === '#ffffff') painted.push(...path);
  }
  // one segment either way round is the same line
  return painted.map((s) => JSON.stringify(s.sort())).sort();
}
const lines = (...pairs) => pairs.map((s) => JSON.stringify(s.sort())).sort();

test('a variant strokes only its own sides, turned with the block', () => {
  const at = (o) => ({ ...object('block', 10, 1), ...o });
  // the control: no field is the full outline, all four sides
  assert.deepEqual(strokes(at({})), lines([[10, 1], [11, 1]], [[11, 1], [11, 2]], [[11, 2], [10, 2]], [[10, 2], [10, 1]]));
  assert.deepEqual(strokes(at({ edges: 'edge' })), lines([[10, 2], [11, 2]]), 'edge: the top');
  assert.deepEqual(strokes(at({ edges: 'parallel' })), lines([[10, 2], [11, 2]], [[10, 1], [11, 1]]), 'parallel: top and bottom');
  assert.deepEqual(strokes(at({ edges: 'outer' })), lines([[10, 1], [10, 2]], [[10, 2], [11, 2]]), 'outer: left and top');
  assert.deepEqual(strokes(at({ edges: 'inner' })), lines([[10, 1.75], [10, 2]], [[10, 2], [10.25, 2]]), 'inner: a short L at the top left');
  assert.deepEqual(strokes(at({ edges: 'three' })), lines([[10, 1], [10, 2]], [[10, 2], [11, 2]], [[11, 2], [11, 1]]), 'three: left, top and right, the bottom open');
  assert.deepEqual(strokes(at({ edges: 'none' })), [], 'none: no line at all');
  // rotation and flips turn the outline with the block
  assert.deepEqual(strokes(at({ edges: 'edge', rotation: 90 })), lines([[10, 2], [10, 1]]), 'edge turned a quarter: the left side');
  assert.deepEqual(strokes(at({ edges: 'edge', rotation: 180 })), lines([[10, 1], [11, 1]]), 'edge turned over: the bottom');
  assert.deepEqual(strokes(at({ edges: 'parallel', rotation: 270 })), lines([[10, 1], [10, 2]], [[11, 1], [11, 2]]), 'parallel turned: the two walls');
  assert.deepEqual(strokes(at({ edges: 'outer', flipX: true })), lines([[11, 1], [11, 2]], [[11, 2], [10, 2]]), 'outer flipped: right and top');
  assert.deepEqual(strokes(at({ edges: 'inner', flipY: true })), lines([[10, 1.25], [10, 1]], [[10, 1], [10.25, 1]]), 'inner flipped: the bottom left corner');
  assert.deepEqual(strokes(at({ edges: 'edge', scale: 2 })), lines([[9.5, 3], [11.5, 3]]), 'a scaled edge spans its whole top');
  assert.deepEqual(strokes(at({ edges: 'three', rotation: 180 })), lines([[11, 2], [11, 1]], [[11, 1], [10, 1]], [[10, 1], [10, 2]]), 'three turned over: open at the top');
  assert.deepEqual(strokes(at({ edges: 'three', rotation: 90 })), lines([[10, 1], [11, 1]], [[10, 1], [10, 2]], [[10, 2], [11, 2]]), 'three turned a quarter: open on the right');
  assert.deepEqual(strokes(at({ edges: 'three', flipY: true })), lines([[10, 2], [10, 1]], [[10, 1], [11, 1]], [[11, 1], [11, 2]]), 'three flipped: open at the top');
  // every outlined type takes them, the transparent outline block too
  for (const type of OUTLINED)
    assert.deepEqual(strokes({ ...object(type, 10, 1), edges: 'edge' }), lines([[10, 2], [11, 2]]), type);
});

// #139: a copy of the game from before the three-sided outline refuses a level with one, rather
// than drawing it some other way
test('a copy of the game from before three sides refuses a level with one', async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'cube-153f4a9-'));
  await writeFile(join(dir, 'src.tar'), execFileSync('git', ['archive', '--format=tar', '153f4a923e29a2e20e769a0ee1336be33329983e', 'src']));
  execFileSync('tar', ['-xf', join(dir, 'src.tar'), '-C', dir]);
  const old = await import(join(dir, 'src', 'engine.ts'));
  const three = level([{ ...object('block', 10, 1), edges: 'three' }]);
  assert.doesNotThrow(() => old.validateLevel(level([{ ...object('block', 10, 1), edges: 'outer' }])));
  assert.throws(() => old.validateLevel(three), /Invalid block edges/);
  assert.deepEqual(validateLevel(three), three);
});
