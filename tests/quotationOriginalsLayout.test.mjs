import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

// Guardrails supplement the browser fixture's real bounding-box checks.
test('attachment layout can shrink and clips only the filename, not the whole cell', () => {
  const css = read('../src/procurement/components/QuotationOriginals.css');
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.quotation-original-name\s*\{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;/);
  assert.match(css, /\.quotation-original-message\s*\{[^}]*overflow-wrap:\s*anywhere/);
});

test('full filename remains available to hover, assistive technology and download', () => {
  const source = read('../src/procurement/components/QuotationOriginals.tsx');
  assert.match(source, /title=\{file\.file_name\}/);
  assert.match(source, /aria-label=\{`\$\{file\.file_name\} 다운로드`\}/);
  assert.match(source, /a\.download = file\.file_name/);
  assert.match(source, /className="quotation-original-name">\{file\.file_name\}/);
  const view = read('../src/procurement/views/VendorSelectionView.tsx');
  assert.match(view, /title=\{f\}/);
  assert.match(view, /className="quotation-original-name">\{f\}/);
});
