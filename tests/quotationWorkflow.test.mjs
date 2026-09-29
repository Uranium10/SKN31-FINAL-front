import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Exercise real DTO mapping with network access forbidden in this offline suite.
const source = readFileSync(new URL('../src/procurement/api/cases.ts', import.meta.url), 'utf8')
  .replace("import { fetchWithAuth } from '../../utils/auth';", "const fetchWithAuth = () => { throw new Error('Network forbidden'); };")
  .replace("import { normalizeSpecificationText } from '../utils/itemSpecifications';", 'const normalizeSpecificationText = value => value;');
const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const {caseToVendorSelectionGroup, caseToPOItem} = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const entry = (values = {}) => ({case_id:'CASE', mr_name:'MR', stage:'QUOTATION_COLLECTION', status:'WAITING_INPUT', workflow_snapshot:{values}, pending_tasks:[]});

test('case-specific stop survives fresh DTO mapping (new tab/reload)', () => {
  assert.equal(caseToVendorSelectionGroup({...entry(), automation_paused:true}).automationPaused, true);
  assert.equal(caseToVendorSelectionGroup(entry()).automationPaused, false);
});

test('automatic selection marker reaches PO screen and never labels manual choice auto', () => {
  assert.equal(caseToPOItem(entry({selection_mode:'auto'})).selectionMode, 'auto');
  assert.equal(caseToPOItem(entry({selection_mode:'manual'})).selectionMode, 'manual');
  assert.equal(caseToPOItem(entry()).selectionMode, 'manual');
});
