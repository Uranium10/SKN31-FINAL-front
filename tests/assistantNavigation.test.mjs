import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ASSISTANT_TARGETS, assistantNavigationCommand, focusedMRReference } from '../src/components/assistant/assistantNavigation.js';

test('all known screens including admin guides only produce navigation commands', () => {
  for (const target of ASSISTANT_TARGETS) {
    assert.deepEqual(assistantNavigationCommand({ type: 'navigate', target }), {
      type: 'navigate', value: target, searchQuery: '',
    });
  }
  assert.ok(ASSISTANT_TARGETS.includes('company-policy'));
  assert.ok(ASSISTANT_TARGETS.includes('ai-decision-log'));
});

test('existing MR shortcuts keep their search and reference fallback', () => {
  const action = { type: 'navigate_with_filters', target: 'vendor-select', highlight_reference: 'MAT-MR-2026-00322' };
  assert.equal(assistantNavigationCommand(action).searchQuery, action.highlight_reference);
  assert.equal(assistantNavigationCommand(action).focusedMrNo, action.highlight_reference);
  assert.equal(assistantNavigationCommand({ ...action, search_query: 'monitor' }).searchQuery, 'monitor');
});

test('exact MR focus is shared by all three task screens, never by policy or item pages', () => {
  for (const target of ['mr-list', 'vendor-select', 'po-manage']) {
    assert.equal(focusedMRReference(target, ' mat-mr-2026-00196 '), 'MAT-MR-2026-00196');
    assert.equal(assistantNavigationCommand({ type: 'navigate', target, search_query: 'MAT-MR-2026-00196' }).focusedMrNo, 'MAT-MR-2026-00196');
    assert.equal(focusedMRReference(target, '무선 마우스'), null);
  }
  for (const target of ['company-policy', 'item-register', 'dashboard', 'javascript:alert(1)']) {
    assert.equal(focusedMRReference(target, 'MAT-MR-2026-00196'), null);
  }
});

test('search and chatbot use existing single-MR filters without modifying purchase actions', () => {
  const workspace = readFileSync(new URL('../src/procurement/ProcurementWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(workspace, /focusedMRReference\(assistantCommand.value/);
  assert.match(workspace, /focusedMRReference\(result.targetTab, result.searchValue\)/);
  assert.equal((workspace.match(/focusedMrNo=\{taskFocus\?\.tab === currentTab/g) || []).length, 3);
  assert.match(workspace, /setTaskFocus\(null\); setSearchQuery\(''\)/);
  assert.match(workspace, /taskFocusBanner.current\?\.scrollIntoView/);
});

test('unknown screens, script URLs and business mutations never become commands', () => {
  for (const action of [null, {}, { type: 'navigate', target: 'https://example.com' },
    { type: 'navigate', target: 'javascript:alert(1)' }, { type: 'approve_po', target: 'po-manage' },
    { type: 'delete', target: 'company-policy' }]) {
    assert.equal(assistantNavigationCommand(action), null);
  }
  assert.equal(assistantNavigationCommand({ type: 'navigate', target: 'mr-list', search_query: {} }).searchQuery, '');
});

test('admin guide destinations retain the existing workspace permission gates', () => {
  const workspace = readFileSync(new URL('../src/procurement/ProcurementWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(workspace, /canManagePolicy && <div hidden=\{currentTab !== 'company-policy'\}/);
  assert.match(workspace, /canManagePolicy && <div hidden=\{currentTab !== 'ai-decision-log'\}/);
  assert.match(workspace, /!canManagePolicy && currentTab === 'company-policy'/);
  assert.match(workspace, /!canManagePolicy && currentTab === 'ai-decision-log'/);
});
