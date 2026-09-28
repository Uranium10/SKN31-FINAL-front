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
  assert.equal(result.bucket, 'attention');
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
