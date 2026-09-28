import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL('../src/procurement/components/QuotationScoreBreakdown.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
const { QuotationScoreBreakdown } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const breakdown = { missingFactors: [], appliedWeights: {delivery: .5, specification: .5}, deliveryScore: 0, specificationScore: 0, penalties: [], warnings: ['[납기 확인] RFQ보다 빠른 날짜 · 납기 0점', '[규격 확인] 제출 규격 없음 · 규격 0점', '일반 안내'] };
test('compact rows still expose red delivery and specification warnings', () => {
  const html = renderToStaticMarkup(createElement(QuotationScoreBreakdown, {breakdown, compact:true}));
  assert.match(html, /RFQ보다 빠른 날짜/);
  assert.match(html, /제출 규격 없음/);
  assert.match(html, /var\(--danger/);
  assert.doesNotMatch(html, /일반 안내/);
});
test('detail rows preserve ordinary warnings and excluded factor reasons', () => {
  const html = renderToStaticMarkup(createElement(QuotationScoreBreakdown, {breakdown: {...breakdown, missingFactors:[{factor:'specification', reason:'RFQ 규격 기준 없음'}]}}));
  assert.match(html, /일반 안내/);
  assert.match(html, /RFQ 규격 기준 없음/);
  assert.match(html, /규격 제외/);
});
