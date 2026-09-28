import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../src/procurement/utils/dashboardTasks.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { dashboardTasks, issuedPurchaseOrders } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const mr = (stage, status = 'WAITING_INPUT', extra = {}) => ({
  mrNo: 'MR-1', workflowStage: stage, workflowStatus: status, status: '승인',
  processStage: { quotationProgressPercent: 50 }, ...extra,
});
test('supplier and requester waits are not buyer actions', () => {
  for (const stage of ['SUBSTITUTE_DECISION', 'QUOTATION_COLLECTION', 'PR_RESPONSE_WAITING']) {
    assert.equal(dashboardTasks([mr(stage, 'WAITING_INPUT', { pendingTask: { description: 'reply' } })])[0].bucket, 'waiting');
  }
});
test('running quote analysis is execution, not external wait', () => {
  assert.equal(dashboardTasks([mr('QUOTATION_COLLECTION', 'RUNNING')])[0].bucket, 'processing');
});
test('delivery is external wait even with legacy RUNNING status', () => {
  assert.equal(dashboardTasks([mr('DELIVERY', 'RUNNING')])[0].bucket, 'waiting');
});
test('failed work takes priority over stage', () => {
  const result = dashboardTasks([mr('QUOTATION_COLLECTION', 'FAILED', { workflowError: '실패 사유' })])[0];
  assert.equal(result.bucket, 'blocked');
  assert.equal(result.detail, '실패 사유');
});
test('terminal work and duplicate MR rows are excluded', () => {
  for (const status of ['CANCELLED', 'COMPLETED', 'REJECTED']) assert.equal(dashboardTasks([mr('DELIVERY', status)]).length, 0);
  assert.equal(dashboardTasks([mr('MR_REVIEW'), mr('MR_REVIEW')]).length, 1);
});
test('actions link to existing workflow screens', () => {
  for (const [stage, tab] of [['MR_REVIEW','mr-list'], ['RFQ_TARGET_SELECTION','mr-list'], ['SUPPLIER_SELECTION','vendor-select'], ['PRE_PO_APPROVAL','po-manage']]) {
    const task = dashboardTasks([mr(stage)])[0];
    assert.equal(task.bucket, 'attention');
    assert.equal(task.tab, tab);
  }
});
test('unknown states stay visible instead of being fabricated as AI progress', () => {
  assert.equal(dashboardTasks([mr('UNKNOWN', 'NEW')])[0].bucket, 'other');
});
test('issued PO count excludes draft, cancelled and duplicate documents', () => {
  const rows = issuedPurchaseOrders([
    { id:'1', poCreated:true, poNo:'PO-1', totalAmount:10 },
    { id:'2', poCreated:true, poNo:'PO-1', totalAmount:10 },
    { id:'3', poCreated:false, totalAmount:10 },
    { id:'4', poCreated:true, backendStatus:'CANCELLED', totalAmount:10 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].totalAmount, 10);
});

const now = Date.parse('2026-09-28T10:00:00+09:00');
test('sorts blocked, due today, then ordinary approvals with stable tie breaks', () => {
  const rows = dashboardTasks([
    mr('MR_REVIEW', 'WAITING_INPUT', { mrNo: 'MR-3', dueDate: '2026-09-30' }),
    mr('QUOTATION_COLLECTION', 'WAITING_INPUT', { mrNo: 'MR-2', quotationDeadlineAt: '2026-09-28T13:00:00+09:00' }),
    mr('PR_REJECTED', 'WAITING_INPUT', { mrNo: 'MR-1', dueDate: '2026-10-10' }),
  ], [], now);
  assert.deepEqual(rows.map(r => r.priority), [0, 1, 2]);
  assert.deepEqual(rows.map(r => r.request.mrNo), ['MR-1', 'MR-2', 'MR-3']);
  assert.equal(rows[2].urgency, 'neutral');
  assert.match(rows[1].deadlineLabel, /3시간 남음/);
});
test('KST midnight, missing/invalid dates, overdue and later stages are explicit', () => {
  const today = dashboardTasks([mr('MR_REVIEW', 'WAITING_INPUT', { dueDate: '2026-09-28' })], [], Date.parse('2026-09-27T15:01:00Z'))[0];
  assert.equal(today.deadlineLabel, '납기 오늘');
  assert.equal(today.priority, 1);
  const past = dashboardTasks([mr('MR_REVIEW', 'WAITING_INPUT', { dueDate: '2026-09-27' })], [], now)[0];
  assert.equal(past.urgency, 'danger');
  for (const dueDate of ['', 'invalid', '2026-02-30']) {
    const row = dashboardTasks([mr('PRE_PO_APPROVAL', 'WAITING_INPUT', { dueDate, quotationDeadlineAt: '2026-09-26T00:00:00Z' })], [], now)[0];
    assert.equal(row.deadlineLabel, '기한 미지정');
    assert.equal(row.priority, 2);
  }
});
test('stale running gets a review flag, not an unproven stopped execution claim', () => {
  const updated = '2026-09-28T05:00:00+09:00';
  const row = dashboardTasks([mr('SUPPLIER_RECOMMENDATION', 'RUNNING', { workflowUpdatedAt: updated })], [], now)[0];
  assert.equal(row.bucket, 'blocked');
  assert.equal(row.urgencyLabel, '장시간 미갱신 · 점검 필요');
  assert.equal(row.elapsedLabel, '최근 갱신 후 5시간');
  assert.doesNotMatch(row.detail, /멈췄/);
  assert.equal(dashboardTasks([mr('DELIVERY', 'RUNNING', { workflowUpdatedAt: updated })], [], now)[0].bucket, 'waiting');
  assert.equal(dashboardTasks([mr('QUOTATION_COLLECTION', 'WAITING_INPUT', { workflowUpdatedAt: updated })], [], now)[0].bucket, 'waiting');
});
test('old progress from a different stage/status cannot mark a task blocked', () => {
  const request = mr('SUPPLIER_SELECTION', 'WAITING_INPUT', { id: '1' });
  const observed = { case_id: '1', stage: 'SUPPLIER_SELECTION', status: 'RUNNING', updated_at: '2026-09-28T05:00:00+09:00', deadline_status: 'BLOCKED' };
  assert.equal(dashboardTasks([request], [observed], now)[0].bucket, 'attention');
  assert.equal(dashboardTasks([request], [{ ...observed, status: 'WAITING_INPUT' }], now)[0].bucket, 'blocked');
});
test('minute boundary changes urgency without a backend refresh', () => {
  const request = mr('QUOTATION_COLLECTION', 'WAITING_INPUT', { quotationDeadlineAt: '2026-09-28T13:00:00+09:00' });
  assert.equal(dashboardTasks([request], [], now)[0].urgency, 'warning');
  assert.equal(dashboardTasks([request], [], now + 3 * 3600000)[0].urgency, 'danger');
});

test('legacy due-date fallback cannot invent urgency for an unset server date', () => {
  const row = dashboardTasks([mr('MR_REVIEW', 'WAITING_INPUT', { dueDate: '2026-09-28', requestedDueDate: '' })], [], now)[0];
  assert.equal(row.priority, 2);
  assert.equal(row.deadlineLabel, '기한 미지정');
});
