import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);

function load(file, navigations, canvasEnabled = false) {
  const exports = {};
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, window: { location: { set href(value) { navigations.push(value); } } }, require(name) {
      if (name.endsWith('/studioNavigation')) return load('features/studio/studioNavigation.ts', navigations, canvasEnabled);
      if (name.endsWith('/StudioSectionTabs')) return load('features/studio/StudioSectionTabs.tsx', navigations, canvasEnabled);
      if (name.endsWith('.css')) return {};
      if (name.endsWith('/featureFlags')) return { isStudioCanvasEnabled: canvasEnabled };
      if (name === 'react-router-dom') return { useNavigate: () => href => navigations.push(href), Link: ({to,children,...props})=>require('react').createElement('a',{...props,href:to},children) };
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

test('primary rails collapse utilities and canvas while highlighting their parent sections', () => {
  for (const active of ['inspiration','feedback','nav','canvas','other','library']) {
    const html=renderToStaticMarkup(load('components/shared/AppShell.tsx',[],true).default({kind:'studio',active}));
    const rail=html.match(/<nav class="rail-nav">([\s\S]*?)<\/nav>/)[1];
    for(const label of ['灵感','反馈','导航','无限画布']) assert.ok(!rail.includes(`>${label}<`));
    for(const label of ['生成','其他','资产库','对话']) assert.ok(rail.includes(`>${label}<`));
    const parent=['inspiration','feedback','nav','other'].includes(active)?'其他':active==='canvas'?'生成':'资产库';
    assert.ok(rail.includes(`class="rail-item active"><span>${parent}</span>`));
  }
});

test('other tabs retain every old destination and canvas respects its feature flag', () => {
  const other=renderToStaticMarkup(load('features/studio/StudioSectionTabs.tsx',[]).default({group:'other',active:'feedback'}));
  for(const path of ['other','inspiration','feedback','nav','cad','gif']) assert.ok(other.includes(`href="/studio/${path}"`));
  assert.ok(other.includes('aria-current="page" href="/studio/feedback"'));
  for(const enabled of [true,false]) {
    const html=renderToStaticMarkup(load('features/studio/StudioSectionTabs.tsx',[],enabled).default({group:'generate',active:'generate'}));
    assert.ok(html.includes('/studio/generate'));assert.equal(html.includes('/studio/canvas'),enabled);
  }
});
