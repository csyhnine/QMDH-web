import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/features/studio/CadPreparationPanel.tsx', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpile(source, { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS }), {
  exports, require: name => name.endsWith('.css') || name === '../../api' ? {} : require(name),
});

test('layout preparation asks for explicit function, real length and reserved routes before saving', () => {
  const floor = { floor_index: 1, label: '平面 1', line_path: '/test.png', rooms: [
    { room_id: 'r1', marker: '1', area_ratio: 1, proposal: '接待或开放办公' },
  ] };
  const html = renderToStaticMarkup(createElement(exports.CadPreparationPanel, { record: { extract_id: 'test' }, floor, busy: false, onUpdated() {}, onPendingChange() {} }));
  for (const label of ['两点实际长度（米）', '请选择明确功能', '保留空白', '新增通路', '通路预留宽度（米）', '保存本层布置条件', '墙体连通、门洞、楼梯电梯及疏散要求仍需人工核验']) assert.ok(html.includes(label));
  assert.match(html, /<button[^>]*disabled=""[^>]*>保存本层布置条件/);
  assert.match(html, /<option value="" selected="">请选择明确功能/);
});
