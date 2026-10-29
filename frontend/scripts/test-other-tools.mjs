import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);

function shared(name) {
  const exports={};
  const code=ts.transpileModule(readFileSync(new URL(`../src/features/studio/${name}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,require(n){
    if(n.endsWith('/studioNavigation'))return shared('studioNavigation.ts');
    if(n.endsWith('.css'))return {};
    if(n.endsWith('/featureFlags'))return {isStudioCanvasEnabled:true};
    if(n==='react-router-dom')return {Link:({to,children,...props})=>require('react').createElement('a',{...props,href:to},children)};
    return require(n);
  }});return exports;
}

// Static render fixtures retain the old history preset through the actual new Hook.
function gifDisplayFixture(args, historyPreset) {
  let cursor = 0;
  const slots = [], layouts = [];
  const react = {
    useState: initial => { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, () => {}]; },
    useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo: (factory, deps) => { const i = cursor++; if (!slots[i] || deps.some((value, j) => value !== slots[i].deps[j])) slots[i] = { deps, value: factory() }; return slots[i].value; },
    useLayoutEffect: (setup, deps) => { const i = cursor++; if (!slots[i] || deps.some((value, j) => value !== slots[i].deps[j])) { slots[i] = { deps }; layouts.push(setup); } },
    useEffect() {},
  };
  const exports = {}, code = ts.transpileModule(readFileSync(new URL('../src/pages/studio/useGifDisplay.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, require(name) { if (name === 'react') return react; if (name === '../../api') return { api: {} }; throw new Error(`undeclared display fixture import ${name}`); } });
  const render = () => { cursor = 0; return exports.useGifDisplay(args[0], args[1], args[2], false); };
  const first = render();
  for (const setup of layouts.splice(0)) setup();
  if (historyPreset) first.showHistory(historyPreset);
  return render();
}

function load(file, states = []) {
  let i = 0, lazyIndex = 0;
  const exports = {};
  const source = readFileSync(new URL(`../src/pages/studio/${file}.tsx`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    if(name.endsWith('/StudioSectionTabs'))return shared('StudioSectionTabs.tsx');
    if(name.endsWith('/studioNavigation'))return shared('studioNavigation.ts');
    if (name === 'react') return { lazy: () => { const label = lazyIndex++ === 0 ? 'CAD parser' : 'GIF tool'; return () => label; }, Suspense: ({ children }) => children, useEffect() {}, useLayoutEffect() {}, useRef: () => ({ current: 0 }), useState(initial) { return [states[i++] ?? initial, () => {}]; } };
    if (name === 'react-router-dom') return { useNavigate: () => () => {}, useSearchParams: () => [new URLSearchParams()], Link: ({ to, children }) => require('react').createElement('a', { href: to }, children), NavLink: ({ to, children }) => require('react').createElement('a', { href: to }, children) };
    if (name.endsWith('/components/shared')) return { AppShell: ({ children }) => children };
    if (name.endsWith('AuthContext')) return { useAuth: () => ({ isGuest: false }) };
    if (name.endsWith('/datetime')) return { formatChinaMonthDayTime: () => '10/15 12:00' };
    if (name === './useGifDisplay') return { useGifDisplay: (...args) => gifDisplayFixture(args, states[i++]) };
    if (name === './GifMediaDetails') return load('GifMediaDetails');
    if (name.endsWith('/gifToolBatch')) return {};
    if (name.endsWith('/uploads')) return { formatUploadSize: x => `${x} bytes` };
    if (name === 'react/jsx-runtime') return require(name);
    return {};
  } });
  return exports;
}

test('GIF page exposes upload, adjustable target/options, and initial empty state', () => {
  const html = renderToStaticMarkup(load('GifCompressPage').default());
  for (const label of ['上传 GIF', '目标大小（KB）', '压缩选项', '初始最长边', '初始帧率上限', '初始颜色数', '开始压缩', '压缩历史', '前往资产库']) assert.ok(html.includes(label));
  assert.match(html, /value="500"/);
  for (const value of [344, 12.5, 96]) assert.ok(html.includes(`value="${value}"`));
  assert.ok(html.includes('multiple=""'));
  assert.ok(html.includes('Lanczos'));
  assert.ok(html.includes('Bayer'));
  assert.ok(html.includes('disabled=""'));
});

test('GIF results distinguish reached and missed targets and expose both downloads', () => {
  const result = { file_name: 'sample.gif', storage_path: '/media/out.gif', original_storage_path: '/media/in.gif', compression: { original_bytes: 900000, output_bytes: 450000, target_bytes: 500000, target_met: true, compressed: true } };
  const render = r => renderToStaticMarkup(load('GifCompressPage', [[{ name: 'sample.gif' }], [{ status: 'done', result: r }], 0, 'blob:original', 500, 344, 12.5, 96, true, true, null]).default());
  const html = render(result);
  for (const label of ['已达到目标体积', '50.0%', '下载 GIF', '下载原文件', '复制到压缩区', '原始 GIF 动画', '处理后的 GIF 动画']) assert.ok(html.includes(label));
  const missed = render({ ...result, compression: { ...result.compression, target_met: false } });
  assert.ok(missed.includes('未达到目标体积'));
});

test('other module keeps CAD and GIF tabs and mounts only the selected tool', () => {
  const cad = renderToStaticMarkup(load('OtherToolsPage').default({ tool: 'cad' }));
  assert.ok(cad.includes('href="/studio/cad"'));
  assert.ok(cad.includes('href="/studio/gif"'));
  assert.ok(cad.includes('CAD parser'));
  assert.ok(!cad.includes('GIF tool'));
  const gif = renderToStaticMarkup(load('OtherToolsPage').default({ tool: 'gif' }));
  assert.ok(gif.includes('GIF tool'));
  assert.ok(!gif.includes('CAD parser'));
});

test('Other landing page exposes all five tools without mounting CAD or GIF',()=>{
  const html=renderToStaticMarkup(load('OtherToolsPage').default({}));
  for(const route of ['inspiration','feedback','nav','cad','gif'])assert.ok(html.includes(`/studio/${route}`));
  assert.ok(!html.includes('CAD parser'));assert.ok(!html.includes('GIF tool'));
});


test('saved GIF history opens original and output after files are no longer selected', () => {
  const result = { record_id: 42, created_at: '2026-10-15T04:00:00Z', file_name: 'saved.gif', storage_path: '/media/saved.gif', original_storage_path: '/media/original.gif', compression: { original_bytes: 900000, output_bytes: 450000, target_bytes: 500000, target_met: true, compressed: true } };
  const html = renderToStaticMarkup(load('GifCompressPage', [[], [], 0, '', 500, 344, 12.5, 96, true, true, result, false, '', false, [result], '']).default());
  for (const value of ['src="/media/original.gif"', 'src="/media/saved.gif"', 'saved.gif', '已保存到资产库', 'href="/studio/library"']) assert.ok(html.includes(value));
  assert.ok(renderToStaticMarkup(load('AssetLibraryPage').default()).includes('GIF 压缩'));
});


test('actual GIF parameters show measured dimensions, variable FPS, colors and loop', () => {
  const info = { width: 720, height: 344, frames: 50, duration_ms: 2000, average_fps: 25, variable_fps: true, colors: 256, loop: 0, transparent: true };
  const render = next => renderToStaticMarkup(load('GifMediaDetails').default({ info: next, title: '原始 GIF 参数' }));
  const html = render(info);
  for (const value of ['720 × 344 px', '25 fps（可变）', '256 色', '50 帧', '2.00 秒', '无限循环']) assert.ok(html.includes(value));
  assert.ok(render({ ...info, loop: null }).includes('不循环'));
  assert.ok(render({ ...info, loop: 2 }).includes('重复 2 次'));
  assert.ok(render({ ...info, colors: null }).includes('超过 256 色'));
  assert.ok(render({ ...info, frames: 1 }).includes('静态'));
  assert.ok(render(null).includes('暂无参数'));
});
