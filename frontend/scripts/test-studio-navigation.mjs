import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);

function load(file, navigations) {
  const exports = {};
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, window: { location: { set href(value) { navigations.push(value); } } }, require(name) {
      if (name.endsWith('/studioNavigation')) return load('features/studio/studioNavigation.ts', navigations);
      if (name.endsWith('/featureFlags')) return { isStudioCanvasEnabled: false };
      if (name === 'react-router-dom') return { useNavigate: () => href => navigations.push(href) };
      if (name.endsWith('/AuthContext')) return { useAuth: () => ({ currentUser: { name: 'test', role: 'admin' }, isGuest: false, canUseOpsViews: true }) };
      if (name.endsWith('/roleAccess')) return { defaultAdminHomePath: () => '/admin/dashboard', canAccessAdminModule: () => true };
      if (name.endsWith('/useAdminFeedbackPendingCount')) return { useAdminFeedbackPendingCount: () => 0 };
      if (name.endsWith('/GuestLoginBanner')) return { default: () => null };
      if (name === './Brand') return { BrandIcon: () => null };
      return require(name);
    }
  });
  return exports;
}
function textOf(node) { return Array.isArray(node) ? node.map(textOf).join('') : typeof node === 'string' ? node : textOf(node?.props?.children ?? []); }
function findButton(node) {
  if (Array.isArray(node)) return node.map(findButton).find(Boolean);
  if (node?.type === 'button' && textOf(node) === '其他') return node;
  return node?.props ? findButton(node.props.children) : null;
}

test('generation rail and routed shell show Other and open the same tools entry', () => {
  for (const [file, props] of [
    ['features/studio/StudioGlobalRailNav.tsx', { activeView: 'studio', isAdminView: false }],
    ['components/shared/AppShell.tsx', { kind: 'studio', active: 'other' }],
  ]) {
    const navigations = [];
    const tree = load(file, navigations).default(props);
    const html = renderToStaticMarkup(tree);
    assert.ok(html.includes('>其他<'));
    assert.ok(!html.includes('>图纸<'));
    findButton(tree).props.onClick();
    assert.deepEqual(navigations, ['/studio/other']);
  }
});
