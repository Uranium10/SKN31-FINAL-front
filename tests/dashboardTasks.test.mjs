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
// 백엔드 auto_progress 판정 모양. blocked 한 건이라도 있으면 사람 결정으로 넘어간다.
const now = Date.parse('2026-09-28T10:00:00+09:00');
const verdict = (checks, summary) => ({
  allowed: false, mode: 'manual', node: 'quotation_analysis', summary,
  checks: checks.map(([code, label, detail, status = 'blocked']) => ({ code, label, detail, status })),
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
test('a failed run is breakage even at an external wait stage', () => {
  const result = dashboardTasks([mr('QUOTATION_COLLECTION', 'FAILED', { workflowError: '실패 사유' })])[0];
  assert.equal(result.bucket, 'blocked');
  assert.equal(result.detail, '실패 사유');
});
test('an error left on an external wait stage is not breakage', () => {
  // 회신 대기 중에 남은 지난 실행의 오류 문구 때문에 '막힘'으로 보이면 안 된다.
  const row = dashboardTasks([mr('QUOTATION_COLLECTION', 'WAITING_INPUT', { workflowError: '지난 판정 메모' })])[0];
  assert.equal(row.bucket, 'waiting');
});
test('auto-progress condition blocks are decisions, not breakage', () => {
  const row = dashboardTasks([mr('QUOTATION_COLLECTION', 'WAITING_INPUT', {
    workflowError: '자동 진행 조건 미달',
    autoProgress: verdict([
      ['new_supplier', '신규 협력사 포함', '가온정밀은 거래 이력이 없습니다.'],
      ['score_gap', '1·2위 점수차 부족', '점수차 12.4점 (기준 30점).'],
      ['rebid_history', '재비딩 기록 있음', '2차 비딩 건입니다.'],
    ], '조건 3건이 회사 정책 기준에 미달합니다.'),
  })], [], now)[0];
  assert.equal(row.bucket, 'attention');
  assert.equal(row.priority, 1);
  assert.equal(row.urgencyLabel, '조건 미달 · 확인 필요');
  assert.equal(row.detail, '조건 3건이 회사 정책 기준에 미달합니다.');
  assert.deepEqual(row.autoBlockers.map(b => b.code), ['new_supplier', 'score_gap', 'rebid_history']);
});
test('only blocked checks are shown, and a failed run overrides the verdict', () => {
  const checks = verdict([['passed_one', '예산 한도', '한도 안입니다.', 'passed'],
    ['new_supplier', '신규 협력사 포함', '거래 이력이 없습니다.']], '조건 1건 미달');
  const held = dashboardTasks([mr('SUPPLIER_SELECTION', 'WAITING_INPUT', { autoProgress: checks })], [], now)[0];
  assert.deepEqual(held.autoBlockers.map(b => b.code), ['new_supplier']);
  // 실행 자체가 실패했으면 판정 내용이 아니라 고장으로 봐야 한다.
  const failed = dashboardTasks([mr('SUPPLIER_SELECTION', 'FAILED', { autoProgress: checks, workflowError: '실패' })], [], now)[0];
  assert.equal(failed.bucket, 'blocked');
  assert.deepEqual(failed.autoBlockers, []);
});
test('PO approval is my work only with the approver role', () => {
  const request = mr('PRE_PO_APPROVAL', 'WAITING_INPUT');
  const staff = dashboardTasks([request], [], now)[0];
  assert.equal(staff.bucket, 'waiting');
  assert.equal(staff.detail, '발주 승인 권한자의 확인을 기다립니다.');
  const manager = dashboardTasks([request], [], now, { canApprovePO: true })[0];
  assert.equal(manager.bucket, 'attention');
});
test('supplier rejection is a prompt decision, not a system failure', () => {
  const row = dashboardTasks([mr('PR_REJECTED', 'WAITING_INPUT', { dueDate: '2026-12-31' })], [], now)[0];
  assert.equal(row.bucket, 'attention');
  assert.equal(row.priority, 1);
  assert.equal(row.urgencyLabel, '공급사 반려 · 확인 필요');
});
test('quotation reply warning fires only when the round is actually at risk', () => {
  const at = (deadline, responded, recipients = 5) => dashboardTasks([mr('QUOTATION_COLLECTION', 'WAITING_INPUT', {
    quotationDeadlineAt: deadline, quotationRecipientCount: recipients, quotationRespondedCount: responded,
  })], [], now)[0];
  const risky = at('2026-09-28T20:00:00+09:00', 2);
  assert.equal(risky.urgencyLabel, '회신 부족 · 마감 임박');
  assert.match(risky.detail, /3곳이 미회신/);
  // 마감이 이틀 뒤면 독촉 메일이 알아서 나가므로 알리지 않는다.
  assert.notEqual(at('2026-09-30T20:00:00+09:00', 2).urgencyLabel, '회신 부족 · 마감 임박');
  // 회신율이 7할이면 위험이 아니다.
  assert.notEqual(at('2026-09-28T20:00:00+09:00', 4).urgencyLabel, '회신 부족 · 마감 임박');
  // 한 곳만 비면 굳이 부르지 않는다.
  assert.notEqual(at('2026-09-28T20:00:00+09:00', 1, 2).urgencyLabel, '회신 부족 · 마감 임박');
  // 8/10은 회신율 8할이라 위험이 아니다(미회신 2곳 조건만으로 부르면 안 된다).
  assert.notEqual(at('2026-09-28T20:00:00+09:00', 8, 10).urgencyLabel, '회신 부족 · 마감 임박');
  // 마감이 이미 지난 건은 마감 판정이 다루므로 회신 부족으로 다시 부르지 않는다.
  assert.notEqual(at('2026-09-28T09:00:00+09:00', 2).urgencyLabel, '회신 부족 · 마감 임박');
  // 수신자 수를 모르면 회신율을 꾸며내지 않는다.
  assert.notEqual(at('2026-09-28T20:00:00+09:00', 0, 0).urgencyLabel, '회신 부족 · 마감 임박');
});
test('processing names the stage instead of saying only "in progress"', () => {
  const row = dashboardTasks([mr('SUPPLIER_RECOMMENDATION', 'RUNNING')], [], now)[0];
  assert.equal(row.bucket, 'processing');
  assert.match(row.detail, /공급사 탐색 진행 중/);
  assert.equal(dashboardTasks([mr('SUPPLIER_RECOMMENDATION', 'QUEUED')], [], now)[0].detail, '실행 순서를 기다리고 있습니다.');
});
test('terminal work and duplicate MR rows are excluded', () => {
  for (const status of ['CANCELLED', 'COMPLETED', 'REJECTED']) assert.equal(dashboardTasks([mr('DELIVERY', status)]).length, 0);
  assert.equal(dashboardTasks([mr('MR_REVIEW'), mr('MR_REVIEW')]).length, 1);
});
test('actions link to existing workflow screens', () => {
  for (const [stage, tab] of [['MR_REVIEW','mr-list'], ['RFQ_TARGET_SELECTION','mr-list'], ['SUPPLIER_SELECTION','vendor-select'], ['PRE_PO_APPROVAL','po-manage']]) {
    const task = dashboardTasks([mr(stage)], [], undefined, { canApprovePO: true })[0];
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

test('sorts breakage, then pressing decisions, then ordinary approvals', () => {
  const rows = dashboardTasks([
    mr('MR_REVIEW', 'WAITING_INPUT', { mrNo: 'MR-3', dueDate: '2026-09-30' }),
    mr('QUOTATION_COLLECTION', 'WAITING_INPUT', { mrNo: 'MR-2', quotationDeadlineAt: '2026-09-28T13:00:00+09:00' }),
    mr('PO_CREATION', 'FAILED', { mrNo: 'MR-1', dueDate: '2026-10-10', workflowError: '발주서 생성 실패' }),
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
    const row = dashboardTasks([mr('PRE_PO_APPROVAL', 'WAITING_INPUT', { dueDate, quotationDeadlineAt: '2026-09-26T00:00:00Z' })], [], now, { canApprovePO: true })[0];
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
