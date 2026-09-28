import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source = readFileSync(new URL('../src/procurement/utils/workProgress.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { progressAge, progressReason, needsProgressReview } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
test('elapsed refers to observed timestamps and handles invalid/future dates', () => {
  const now = Date.parse('2026-09-28T03:30:00Z');
  assert.equal(progressAge('2026-09-28T03:27:00Z', now), '3분');
  assert.equal(progressAge('', now), '확인 시각 없음');
  assert.equal(progressAge('2026-09-29T00:00:00Z', now), '확인 시각 없음');
});
test('old deadline reasons do not leak into PO stage', () => {
  const row = { stage: 'PO_CREATION', deadline_status: 'BLOCKED', waiting_reason: '과거 오류' };
  assert.equal(progressReason(row), undefined);
  assert.equal(needsProgressReview(row), false);
});
test('waiting is distinct from a blocked/uncertain execution', () => {
  const row = { stage: 'QUOTATION_COLLECTION', deadline_status: 'WAITING', waiting_reason: '규격 평가를 기다립니다.' };
  assert.equal(progressReason(row), '규격 평가를 기다립니다.');
  assert.equal(needsProgressReview(row), false);
  assert.equal(needsProgressReview({ ...row, deadline_status: 'UNCERTAIN' }), true);
});
