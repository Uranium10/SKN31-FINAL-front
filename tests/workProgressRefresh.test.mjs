import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

// Exercise the hook's effect with deterministic timers, without React DOM,
// network, tokens, or a running API. Re-rendering is irrelevant to its refs.
const asModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const react = asModule(`export const useCallback=f=>f; export const useRef=v=>({current:v});
export const useState=v=>[v,()=>{}]; export const useEffect=f=>{const cleanup=f(); if(cleanup) globalThis.cleanups.push(cleanup)};`);
const api = asModule('export const listWorkProgress=()=>globalThis.fetchProgress()');
const source = readFileSync(new URL('../src/procurement/hooks/useWorkProgress.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
  .replace("from 'react'", `from '${react}'`).replace("from '../api/workProgress'", `from '${api}'`);
const { useWorkProgress } = await import(asModule(js));
const settle = () => new Promise(resolve => setImmediate(resolve));

test('SSE bursts coalesce, unchanged versions do not reload cases, failed reload retries, hidden tabs stop', async () => {
  let reads = 0, reloads = 0, version = 1, failReload = false;
  const timers = new Map(), intervals = new Map(), listeners = new Map();
  let id = 0;
  globalThis.cleanups = [];
  globalThis.window = {
    setTimeout: f => { timers.set(++id, f); return id; }, clearTimeout: n => timers.delete(n),
    setInterval: f => { intervals.set(++id, f); return id; }, clearInterval: n => intervals.delete(n),
    addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key),
  };
  globalThis.document = { visibilityState: 'visible', addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) };
  globalThis.fetchProgress = async () => { reads++; return { items: [{ case_id: '1', version, updated_at: 'now' }], truncated: false }; };
  const flush = async () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(f => f()); await settle(); };
  try {
    const progress = useWorkProgress(true, async () => { reloads++; if(failReload) throw new Error('offline'); });
    await settle();
    assert.equal(reads, 1); assert.equal(reloads, 0);
    for (let i=0; i<100; i++) progress.refresh();
    assert.equal(timers.size, 1);
    await flush(); assert.equal(reads, 2); assert.equal(reloads, 0);
    version++; progress.refresh(); await flush(); assert.equal(reloads, 1);
    progress.invalidateCases(); progress.invalidateCases(); await flush(); assert.equal(reloads, 2);
    failReload = true; version++; progress.refresh(); await flush(); assert.equal(reloads, 3);
    failReload = false; [...intervals.values()][0](); await flush(); assert.equal(reloads, 4);
    globalThis.document.visibilityState = 'hidden'; progress.refresh(); assert.equal(timers.size, 0);
    globalThis.document.visibilityState = 'visible'; listeners.get('visibilitychange')(); await flush();
    assert.equal(reloads, 4);
    globalThis.cleanups.forEach(f => f());
    assert.equal(timers.size, 0); assert.equal(intervals.size, 0);
  } finally {
    globalThis.cleanups.forEach(f => f());
    delete globalThis.window; delete globalThis.document; delete globalThis.fetchProgress; delete globalThis.cleanups;
  }
});
