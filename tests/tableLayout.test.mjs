import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../src/procurement/utils/tableLayout.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { normalizeColumnOrder, moveColumn, stickyHeaderOffset, formatDeliveryDateTime } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

test('stored order drops removed response column and duplicates, includes new columns', () => {
  assert.deepEqual(normalizeColumnOrder(['response', 'status', 'status', 'mr'], ['mr', 'status', 'date']), ['status', 'mr', 'date']);
  assert.deepEqual(normalizeColumnOrder(null, ['mr', 'status']), ['mr', 'status']);
});
test('drag before/after keeps every column exactly once in either direction', () => {
  assert.deepEqual(moveColumn(['mr', 'status', 'date'], 'date', 'mr'), ['date', 'mr', 'status']);
  assert.deepEqual(moveColumn(['mr', 'status', 'date'], 'mr', 'date', true), ['status', 'date', 'mr']);
  assert.deepEqual(moveColumn(['mr', 'status'], 'mr', 'mr'), ['mr', 'status']);
  assert.deepEqual(moveColumn(['mr', 'status'], 'unknown', 'mr'), ['mr', 'status']);
});
test('header starts naturally, pins at nested viewport top, stops at table bottom', () => {
  assert.equal(stickyHeaderOffset(200, 1000, 48, 80), 0);
  assert.equal(stickyHeaderOffset(-200, 1000, 48, 80), 280);
  assert.equal(stickyHeaderOffset(-500, 100, 48, 80), 552);
  assert.equal(stickyHeaderOffset(80, 128, 48, 80), 0);
});
test('date-only delivery is never assigned a fabricated midnight', () => {
  assert.equal(formatDeliveryDateTime('2026-10-03'), '2026-10-03');
  assert.equal(formatDeliveryDateTime(undefined), '—');
  assert.equal(formatDeliveryDateTime('2026-10-03 18:30:22'), '2026-10-03 18:30');
});
test('explicit UTC timestamps cross into the correct Korean date and hour', () => {
  assert.equal(formatDeliveryDateTime('2026-10-03T18:30:00Z'), '2026-10-04 03:30');
  assert.equal(formatDeliveryDateTime('2026-10-03T18:30:00+09:00'), '2026-10-03 18:30');
});
