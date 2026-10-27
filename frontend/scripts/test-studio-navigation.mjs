import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);

function load(file, navigations, canvasEnabled = false, role = 'admin') {
  const exports = {};
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, window: { location: { set href(value) { navigations.push(value); } } }, require(name) {
      if (name.endsWith('/studioNavigation')) return load('features/studio/studioNavigation.ts', navigations, canvasEnabled);
      if (name.endsWith('/StudioSectionTabs')) return load('features/studio/StudioSectionTabs.tsx', navigations, canvasEnabled);
      if (name.endsWith('/adminNavigation')) return load('features/admin/adminNavigation.ts', navigations, canvasEnabled, role);
      if (name.endsWith('/AdminSectionTabs')) return load('features/admin/AdminSectionTabs.tsx', navigations, canvasEnabled, role);
      if (name.endsWith('.css')) return {};
      if (name.endsWith('/featureFlags')) return { isStudioCanvasEnabled: canvasEnabled };
      if (name === 'react-router-dom') return { useNavigate: () => href => navigations.push(href), Link: ({to,children,...props})=>require('react').createElement('a',{...props,href:to},children) };
      if (name.endsWith('/AuthContext')) return { useAuth: () => ({ currentUser: { name: 'test', role }, isGuest: false, canUseOpsViews: true }) };
      if (name.endsWith('/roleAccess')) return load('features/access/roleAccess.ts', navigations, canvasEnabled, role);
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

test('admin groups retain each module once and filter every child by its existing permission', () => {
  const {adminNavigation,ADMIN_NAV_GROUPS}=load('features/admin/adminNavigation.ts',[]);
  const access=load('features/access/roleAccess.ts',[]);
  const keys=ADMIN_NAV_GROUPS.flatMap(g=>g.items.map(i=>i.key));
  assert.equal(keys.length,15);assert.equal(new Set(keys).size,15);
  assert.deepEqual(JSON.parse(JSON.stringify(adminNavigation('admin').map(g=>g.label))),['看板','数据','内容','创作','系统']);
  for(const role of ['admin','ops','designer']) {
    const allowed=adminNavigation(role).flatMap(g=>g.items);
    assert.deepEqual(allowed.map(i=>i.key).sort(),keys.filter(k=>access.canAccessAdminModule(role,k)).sort());
    for(const item of allowed)assert.ok(item.path.startsWith('/admin/'));
  }
  assert.equal(adminNavigation('ops').flatMap(g=>g.items).length,6);
});

test('admin shell shows five groups, only the active group children and original destination paths', () => {
  for(const [active,selected,expected] of [['models','创作',['模型','生成模板','画布模板','助手能力']],['feedback','内容',['灵感','反馈','公告','工具导航']],['settings','系统',['账号','设置']]]) {
    const html=renderToStaticMarkup(load('components/shared/AppShell.tsx',[],true).default({kind:'admin',active}));
    const rail=html.match(/<nav class="rail-nav">([\s\S]*?)<\/nav>/)[1];
    assert.equal((rail.match(/<button/g)||[]).length,5);assert.ok(new RegExp(`class="rail-item active"[^>]*><span>${selected}</span>`).test(rail));
    const children=html.match(/<nav class="admin-section-tabs admin-workspace-nav"[\s\S]*?<\/nav>/)[0];
    for(const name of expected)assert.ok(children.includes(`>${name}<`));
    assert.equal((children.match(/<button/g)||[]).length,expected.length);
  }
  const html=renderToStaticMarkup(load('components/shared/AppShell.tsx',[],true,'ops').default({kind:'admin',active:'templates'}));
  assert.ok(!html.includes('>模型<'));assert.ok(!html.includes('>助手能力<'));assert.ok(html.includes('>画布模板<'));
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
