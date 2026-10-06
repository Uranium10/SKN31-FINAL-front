import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, initialSessionState, sessionReducer, MAX_SESSIONS, MAX_MESSAGES } from '../src/components/assistant/assistantSessions.js';

const make = () => ({ sessions: [createSession('a')], activeId: 'a', pendingId: null });
const reduce = sessionReducer;
test('start in a session and switch to list, then a separate new session', () => {
  let state = make();
  state = reduce(state, { type: 'list' });
  assert.equal(state.activeId, null);
  state = reduce(state, { type: 'create', session: createSession('b') });
  assert.equal(state.activeId, 'b');
  assert.equal(state.sessions.length, 2);
  assert.equal(state.sessions[0].dialogue, null);
});
test('initial state waits for account-owned server sessions', () => {
  assert.deepEqual(initialSessionState(), { sessions: [], activeId: null, pendingId: null });
});
test('delete clears selected/pending conversation and late response cannot recreate it', () => {
  let state = reduce(make(), { type: 'send', id: 'a', text: '질문', at: 'now' });
  state = reduce(state, { type: 'delete', id: 'a' });
  assert.equal(state.activeId, null);
  assert.equal(state.pendingId, null);
  assert.deepEqual(state.sessions, []);
  assert.equal(reduce(state, { type: 'receive', id: 'a', text: '늦은 답변' }), state);
});
test('hydrate restores server history, dialogue and version', () => {
  const state = reduce(initialSessionState(), { type: 'hydrate', session: { ...createSession('db'), version: 3, dialogue: { filters: { keyword: '마우스' } }, messages: [{ text: '저장된 답변' }] } });
  assert.equal(state.activeId, 'db');
  assert.equal(state.sessions[0].version, 3);
  assert.equal(state.sessions[0].messages[0].text, '저장된 답변');
});
test('reentering pending session keeps its in-flight question', () => {
  let state = reduce(make(), { type: 'send', id: 'a', text: '진행 중 질문', at: 'now' });
  state = reduce(state, { type: 'hydrate', session: { ...createSession('a'), version: 0 } });
  assert.equal(state.sessions[0].messages[0].text, '진행 중 질문');
});
test('late history fetch cannot overwrite a newer reply', () => {
  let state = reduce(make(), { type: 'send', id: 'a', text: '질문', at: 'now' });
  state = reduce(state, { type: 'receive', id: 'a', text: '답변', response: { meta: { session_version: 2 } }, at: 'now' });
  state = reduce(state, { type: 'hydrate', session: { ...createSession('a'), version: 1 } });
  assert.equal(state.sessions[0].version, 2);
  assert.equal(state.sessions[0].messages.length, 2);
});
test('session drafts remain separate', () => {
  let state = reduce(make(), { type: 'draft', id: 'a', text: '아직 보내지 않은 질문' });
  state = reduce(state, { type: 'create', session: createSession('b') });
  assert.equal(state.sessions[0].draft, '');
  state = reduce(state, { type: 'select', id: 'a' });
  assert.equal(state.sessions.find(s => s.id === state.activeId).draft, '아직 보내지 않은 질문');
});
test('late answer lands only in original session while another session is open', () => {
  let state = reduce(make(), { type: 'send', id: 'a', text: '외부 응답 대기', at: 'now' });
  state = reduce(state, { type: 'create', session: createSession('b') });
  state = reduce(state, { type: 'receive', id: 'a', text: '3건', response: { dialogue: { filters: { waiting_for: 'external' } } }, at: 'now' });
  assert.equal(state.activeId, 'b');
  assert.equal(state.sessions[0].messages.length, 0);
  assert.equal(state.sessions[0].dialogue, null);
  assert.equal(state.sessions[1].messages.length, 2);
  assert.equal(state.sessions[1].dialogue.filters.waiting_for, 'external');
});
test('answer while list open does not reopen a conversation', () => {
  let state = reduce(make(), { type: 'send', id: 'a', text: '목록', at: 'now' });
  state = reduce(state, { type: 'list' });
  state = reduce(state, { type: 'receive', id: 'a', text: '답변', at: 'now' });
  assert.equal(state.activeId, null);
  assert.equal(state.pendingId, null);
});
test('unknown session / stale answer cannot create messages', () => {
  const state = make();
  assert.equal(reduce(state, { type: 'select', id: 'x' }), state);
  assert.equal(reduce(state, { type: 'receive', id: 'x', text: 'stale' }), state);
  assert.equal(reduce(state, { type: 'send', id: 'x', text: 'stale' }), state);
});
test('duplicate in-flight send is blocked', () => {
  const state = reduce(make(), { type: 'send', id: 'a', text: 'first', at: 'now' });
  assert.equal(reduce(state, { type: 'send', id: 'a', text: 'second', at: 'now' }), state);
});
test('failed request retains query context for retry', () => {
  let state = make();
  state.sessions[0].dialogue = { filters: { keyword: '마우스' } };
  state = reduce(state, { type: 'send', id: 'a', text: '그중 승인 대기', at: 'now' });
  state = reduce(state, { type: 'receive', id: 'a', text: '오류', isError: true, at: 'now' });
  assert.equal(state.sessions[0].dialogue.filters.keyword, '마우스');
  assert.equal(state.pendingId, null);
});
test('session capacity is bounded without silently deleting prior work', () => {
  let state = make();
  for (let i = 1; i < MAX_SESSIONS; i++) state = reduce(state, { type: 'create', session: createSession(String(i)) });
  assert.equal(reduce(state, { type: 'create', session: createSession('extra') }), state);
});
test('message retention is bounded', () => {
  let state = make();
  for (let i = 0; i < 60; i++) {
    state = reduce(state, { type: 'send', id: 'a', text: String(i), at: 'now' });
    state = reduce(state, { type: 'receive', id: 'a', text: '답변', at: 'now' });
  }
  assert.equal(state.sessions[0].messages.length, MAX_MESSAGES);
});
