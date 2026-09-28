import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../src/procurement/utils/itemSpecifications.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { normalizeSpecificationText, parseSpecificationText, getItemSpecificationFields } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const notice = '[자동생성 - 품목분류 필수 규격, 값을 채워주세요]';
test('old HTML descriptions lose only the entry notice', () => {
  assert.equal(normalizeSpecificationText(`<p>${notice}</p><p>재질: SUS304</p><p>두께: 2mm</p>`), '재질: SUS304\n두께: 2mm');
});
test('inline labels and empty mandatory fields survive', () => {
  assert.equal(normalizeSpecificationText(`${notice}재질: SUS304, 두께: `), '재질: SUS304, 두께:');
  assert.equal(normalizeSpecificationText('자동생성 - 품목분류 필수 규격, 값을 채워주세요'), '');
});
test('HTML entities and split formatting in the notice are supported', () => {
  assert.equal(normalizeSpecificationText('[자동생성&nbsp;- <b>품목분류 필수 규격</b>, 값을 채워주세요]<br>전압: 220V'), '전압: 220V');
});
test('unrelated bracketed specifications are preserved', () => {
  assert.equal(normalizeSpecificationText('[필수 규격] 전압: 220V'), '[필수 규격] 전압: 220V');
});
test('notice-only content does not create a fake specification', () => {
  assert.deepEqual(parseSpecificationText(notice), []);
  const fields = getItemSpecificationFields({ specifications: [{key:'notice',label:'설명',value:notice}] });
  assert.deepEqual(fields, []);
});
