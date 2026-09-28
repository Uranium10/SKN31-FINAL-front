import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../src/procurement/utils/tableResize.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { resizeAdjacentColumns } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const widths = [320, 460, 210, 170];
const minimums = [100, 140, 85, 85];
test('internal divider keeps total width and unrelated columns fixed', () => {
  assert.deepEqual(resizeAdjacentColumns(widths, minimums, 1, 100), [320, 560, 110, 170]);
  assert.deepEqual(widths, [320, 460, 210, 170]);
});
test('both directions clamp at the adjacent minimum width', () => {
  assert.deepEqual(resizeAdjacentColumns(widths, minimums, 0, -9999), [100, 680, 210, 170]);
  assert.deepEqual(resizeAdjacentColumns(widths, minimums, 0, 9999), [640, 140, 210, 170]);
});
test('outermost edge cannot be dragged', () => {
  assert.deepEqual(resizeAdjacentColumns(widths, minimums, 3, 100), widths);
});
test('fractional rendered widths preserve table span', () => {
  const rendered = [350.25, 420.5, 200.25, 170];
  for (const delta of [-1000, -30.5, 0, 100.25, 1000]) {
    const result = resizeAdjacentColumns(rendered, minimums, 2, delta);
    assert.equal(result.reduce((a, b) => a + b, 0), 1141);
    assert.ok(result.every((width, i) => width >= minimums[i]));
  }
});

test('RFQ stretched columns change only the dragged pair and retain the outer edges', () => {
  const stored = [260, 165, 185, 175, 90, 220, 52];
  const minimum = [190, 140, 145, 135, 70, 170, 52];
  const rendered = stored.map(width => width * 1.4);
  const resized = resizeAdjacentColumns(rendered, minimum, 0, 60);
  assert.equal(resized[0], rendered[0] + 60);
  assert.equal(resized[1], rendered[1] - 60);
  assert.deepEqual(resized.slice(2), rendered.slice(2));
  assert.ok(Math.abs(resized.reduce((a,b) => a+b, 0) - rendered.reduce((a,b) => a+b, 0)) < .001);
  const back = resizeAdjacentColumns(resized, minimum, 0, -60);
  back.forEach((width, i) => assert.ok(Math.abs(width - rendered[i]) < .001));
});
