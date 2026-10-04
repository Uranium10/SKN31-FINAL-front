import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ASSISTANT_TARGETS, assistantNavigationCommand } from '../src/components/assistant/assistantNavigation.js';

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
  assert.equal(assistantNavigationCommand({ ...action, search_query: 'monitor' }).searchQuery, 'monitor');
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
