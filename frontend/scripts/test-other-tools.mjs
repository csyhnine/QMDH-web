import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);

function load(file, states = []) {
  let i = 0, lazyIndex = 0;
  const exports = {};
  const source = readFileSync(new URL(`../src/pages/studio/${file}.tsx`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    if (name === 'react') return { lazy: () => { const label = lazyIndex++ === 0 ? 'CAD parser' : 'GIF tool'; return () => label; }, Suspense: ({ children }) => children, useEffect() {}, useRef: () => ({ current: 0 }), useState(initial) { return [states[i++] ?? initial, () => {}]; } };
    if (name === 'react-router-dom') return { NavLink: ({ to, children }) => require('react').createElement('a', { href: to }, children) };
    if (name.endsWith('/components/shared')) return { AppShell: ({ children }) => children };
    if (name.endsWith('AuthContext')) return { useAuth: () => ({ isGuest: false }) };
    if (name.endsWith('/uploads')) return { formatUploadSize: x => `${x} bytes` };
    if (name === 'react/jsx-runtime') return require(name);
    return {};
  } });
  return exports;
}

test('GIF page exposes upload, adjustable target/options, and initial empty state', () => {
  const html = renderToStaticMarkup(load('GifCompressPage').default());
  for (const label of ['上传 GIF', '目标大小（KB）', '压缩选项', '初始最长边', '初始帧率上限', '初始颜色数', '开始压缩']) assert.ok(html.includes(label));
  assert.match(html, /value="500"/);
  assert.ok(html.includes('disabled=""'));
});

test('GIF results distinguish reached and missed targets and expose both downloads', () => {
  const result = { file_name: 'sample.gif', storage_path: '/media/out.gif', original_storage_path: '/media/in.gif', compression: { original_bytes: 900000, output_bytes: 450000, target_bytes: 500000, target_met: true, compressed: true } };
  const render = r => renderToStaticMarkup(load('GifCompressPage', [{ name: 'sample.gif' }, 'blob:original', 500, 0, 0, 128, true, true, r]).default());
  const html = render(result);
  for (const label of ['已达到目标体积', '50.0%', '下载 GIF', '下载原文件', '原始 GIF 动画', '处理后的 GIF 动画']) assert.ok(html.includes(label));
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
