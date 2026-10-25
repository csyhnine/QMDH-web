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
const circulation = {};
const preparationDrafts = {};
vm.runInNewContext(ts.transpile(readFileSync(new URL('../src/features/studio/cadPreparationDrafts.ts', import.meta.url), 'utf8'), { module: ts.ModuleKind.CommonJS }), { exports: preparationDrafts });
vm.runInNewContext(ts.transpile(readFileSync(new URL('../src/features/studio/cadCirculation.ts', import.meta.url), 'utf8'), { module: ts.ModuleKind.CommonJS }), { exports: circulation });
vm.runInNewContext(ts.transpile(source, { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS }), {
  exports, require: name => name === './cadPreparationDrafts' ? preparationDrafts : name === './cadCirculation' ? circulation : name.endsWith('.css') || name === '../../api' ? {} : require(name),
});

test('layout preparation asks for explicit function, real length and reserved routes before saving', () => {
  const floor = { floor_index: 1, label: '平面 1', line_path: '/test.png', rooms: [
    { room_id: 'r1', marker: '1', area_ratio: 1, proposal: '接待或开放办公' },
  ] };
  const html = renderToStaticMarkup(createElement(exports.CadPreparationPanel, { record: { extract_id: 'test' }, floor, busy: false, onUpdated() {}, onPendingChange() {} }));
  for (const label of ['两点实际长度（米）', '请选择明确功能', '保留空白', '系统生成通路建议', '在图上指定起点', '新增通路', '通路预留宽度（米）', '保存本层布置条件', '墙体连通、门洞、楼梯电梯及疏散要求仍需人工核验']) {
    assert.ok(html.includes(label));
  }
  assert.match(html, /<button[^>]*disabled=""[^>]*>保存本层布置条件/);
  assert.match(html, /<option value="" selected="">请选择明确功能/);
});

test('adopting new suggestions preserves legacy/manual and user-modified routes, replacing only unedited system routes', () => {
  const legacy = { points: [{ x: .1, y: .1 }, { x: .2, y: .2 }], width_m: 1.2 };
  const manual = { ...legacy, origin: 'manual' };
  const oldSystem = { ...legacy, origin: 'system' };
  const suggested = { ...legacy, width_m: 1.6, origin: 'system' };
  const previous = [legacy, manual, oldSystem];
  const merged = circulation.mergeSuggestedRoutes(previous, [suggested]);
  assert.equal(merged.length, 3);
  assert.equal(merged[0], legacy); assert.equal(merged[1], manual);
  assert.equal(merged[2].width_m, 1.6);
  assert.equal(previous.length, 3);
  assert.throws(() => circulation.mergeSuggestedRoutes(Array(12).fill(manual), [suggested]), /超过 12 条/);
});

test('component previews suggestions without replacing manual routes, then supports width/vertex editing and cancellation', async () => {
  const slots = []; let cursor = 0, effects = [], changed = false;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [slots[index].value, value => {
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; changed = true; }
      }];
    },
    useRef(initial) { const index = cursor++; return (slots[index] ??= { current: initial }); },
    useEffect(effect, deps) {
      const index = cursor++, old = slots[index];
      if (!old || deps.some((value, i) => value !== old.deps[i])) {
        slots[index] = { deps }; effects.push(() => { old?.cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const manual = { points: [{ x: .1, y: .2 }, { x: .1, y: .7 }], width_m: 1.2, origin: 'manual' };
  const system = { points: [{ x: .2, y: .5 }, { x: .8, y: .5 }], width_m: 1.2, origin: 'system' };
  const floor = { floor_index: 1, line_path: '/fixture.png', rooms: [{ room_id: 'r1', marker: '1', area_ratio: 1, function: '办公', layout_kind: 'office' }],
    preparation: { calibration: { points: [{ x: .1, y: .1 }, { x: .9, y: .1 }], meters: 10 }, routes: [manual], confirmed_proposals: { r1: '办公' } } };
  let saved;
  const api = {
    suggestCadRoutes: async () => ({ routes: [system], entry: { x: .2, y: .5 }, warnings: [], unreachable_room_ids: [], status: 'ok' }),
    saveCadPreparation: async (_, value) => { saved = value; return { extract_id: 'test' }; },
  };
  const module = {};
  vm.runInNewContext(ts.transpile(source, { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS }), {
    exports: module, require: name => name === 'react' ? hooks : name === '../../api' ? { api } : name === './cadPreparationDrafts' ? preparationDrafts : name === './cadCirculation' ? circulation : name.endsWith('.css') ? {} : require(name),
  });
  const props = { record: { extract_id: 'test' }, floor, busy: false, onUpdated() {}, onPendingChange() {} };
  let tree;
  function render() {
    do { cursor = 0; effects = []; changed = false; tree = module.CadPreparationPanel(props); effects.forEach(fn => fn()); } while (changed);
  }
  function nodes(element) {
    if (!arguments.length) element = tree;
    if (!element || typeof element !== 'object') return [];
    return [element, ...[element.props?.children].flat(Infinity).flatMap(child => nodes(child))];
  }
  function text(element) {
    if (typeof element === 'string' || typeof element === 'number') return String(element);
    if (!element || typeof element !== 'object') return '';
    return [element?.props?.children].flat(Infinity).map(child => text(child)).join('');
  }
  const button = label => nodes().find(n => n.type === 'button' && text(n) === label);
  const svg = () => nodes().find(n => n.type === 'svg');
  render(); nodes().find(n => n.type === 'img').props.onLoad({ currentTarget: { naturalWidth: 600, naturalHeight: 500 } }); render();
  assert.equal(button('系统生成通路建议').props.disabled, false);
  button('系统生成通路建议').props.onClick(); await new Promise(resolve => setImmediate(resolve)); render();
  assert.ok(button('采用建议，保留手画通路'));
  assert.equal(nodes().filter(n => n.type === 'button' && text(n).startsWith('修改通路')).length, 1);
  button('采用建议，保留手画通路').props.onClick(); render();
  assert.equal(nodes().filter(n => n.type === 'button' && text(n).startsWith('修改通路')).length, 2);
  button('修改通路 2').props.onClick(); render();
  const widthInput = nodes().find(n => n.type === 'label' && text(n).startsWith('通路预留宽度')).props.children.find(n => n?.type === 'input');
  widthInput.props.onChange({ target: { value: '1.6' } }); render();
  nodes().find(n => n.props?.['aria-label'] === '通路折点 1').props.onPointerDown({ stopPropagation() {}, pointerId: 1, currentTarget: { ownerSVGElement: { setPointerCapture() {} } } }); render();
  svg().props.onPointerMove({ clientX: 180, clientY: 300, currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 500 }) } }); render();
  svg().props.onPointerUp(); render();
  button('完成修改').props.onClick(); render();
  button('保存本层布置条件').props.onClick(); await new Promise(resolve => setImmediate(resolve)); render();
  assert.equal(saved.routes.length, 2);
  assert.equal(saved.routes[0], manual);
  assert.equal(saved.routes[1].origin, 'manual');
  assert.equal(saved.routes[1].width_m, 1.6);
  assert.equal(saved.routes[1].points[0].x, .3);
  assert.equal(saved.routes[1].points[0].y, .6);
  button('修改通路 2').props.onClick(); render();
  button('结束点选').props.onClick(); render();
  assert.equal(button('完成修改'), undefined);
});
