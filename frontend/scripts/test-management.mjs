import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
function load(file, overrides = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, require: name => overrides[name] ?? (name.endsWith('.css') ? {} : require(name)), ...globals });
  return exports;
}
const planning = load('pages/management/planning.ts');
function makeProject(id, stages) { return { ...planning.newProject(id), id, name: `Project ${id}`, stages }; }
const stage = (id, start, end, assignees = [1], allocation = 100) => ({ id, name: id, start, end, assignees, allocation, progress: 0 });

test('Gantt includes end date and clips cross-month stages and ignores out-of-range work', () => {
  const entries = planning.ganttEntries([makeProject(1, [stage('a','2026-09-29','2026-10-02'),stage('b','2026-10-30','2026-11-04'),stage('c','2026-11-01','2026-11-02')])], '2026-10-01', 31);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].left, 0); assert.equal(entries[0].width, 2);
  assert.equal(entries[1].left, 29); assert.equal(entries[1].width, 2);
  assert.equal(planning.addDays('2026-12-31',1),'2027-01-01');
});
test('employee load sums simultaneous projects, supports fractional allocations and keeps others independent', () => {
  const projects = [makeProject(1,[stage('a','2026-10-01','2026-10-03',[1,2],50)]),makeProject(2,[stage('b','2026-10-02','2026-10-02',[1],60)])];
  const entries = planning.ganttEntries(projects,'2026-10-01',7);
  assert.equal(Array.from(planning.overloadedDays(entries,1,7)).join(','),'1');
  assert.equal(planning.overloadedDays(entries,2,7).length,0);
});
test('CSV protects formulas and quotes, money keeps exact decimal text and payload excludes server metadata', () => {
  const p = { ...makeProject(3,[]), name:' =HYPERLINK("evil")', investment:'1234567890.12', notes:'hello,\nworld', team:{...planning.newProject(1).team,coordinator:[1]}, year:2026, unit:'test',updated_at:'x',updated_by:1 };
  const csv = planning.ledgerCsv([p],[{id:1,name:'+Formula'}]);
  assert.ok(csv.startsWith('\ufeff')); assert.ok(csv.includes("' =HYPERLINK")); assert.ok(csv.includes("'+Formula")); assert.ok(csv.includes('""evil""')); assert.ok(csv.includes('1234567890.12'));
  const body = planning.projectPayload(p); assert.equal(body.id,undefined);assert.equal(body.year,undefined);assert.equal(body.updated_by,undefined);
});
test('both navigation systems expose management only to company managers regardless of website role', () => {
  for (const allowed of [false,true]) for (const role of ['admin','ops','designer']) {
    const user = { name:'test',role,company_management:allowed };
    const overrides = {
      '../../context/AuthContext':{useAuth:()=>({currentUser:user})},
      'react-router-dom':{useNavigate:()=>()=>{}},
      '../../features/studio/GuestLoginBanner':{default:()=>null},
      '../../features/access/roleAccess':{defaultAdminHomePath:()=>'/admin/dashboard',canAccessAdminModule:()=>true},
      '../../lib/useAdminFeedbackPendingCount':{useAdminFeedbackPendingCount:()=>0},
      './Brand':{BrandIcon:()=>null},
      '../../features/studio/studioNavigation':{OTHER_TOOLS_NAV:{key:'other',label:'其他',path:'/studio/other'}},
      './studioNavigation':{OTHER_TOOLS_NAV:{label:'其他',path:'/studio/other'}},
      '../../lib/featureFlags':{isStudioCanvasEnabled:false},
    };
    for(const [file,props] of [['components/shared/AppShell.tsx',{kind:'studio',active:'management'}],['features/studio/StudioGlobalRailNav.tsx',{activeView:'studio',isAdminView:false,currentUser:user}]]) {
      const html = renderToStaticMarkup(load(file,overrides).default(props));
      assert.equal(html.includes('>项目管理<'),allowed);
    }
  }
});
test('editor interactions create project, assign a stage and save; stale edit keeps input visible', async () => {
  const slots=[];let cursor=0,effects=[],changed=false,tree,fail=false,saved;
  const hooks={
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;changed=true;}];},
    useMemo(fn){return fn();},
    useEffect(fn,deps){const i=cursor++;const old=slots[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
  };
  const report={unit:'二分院',year:2026,compiler:'编制人',data_as_of:'2026-10-12',version:1};
  const user={company_management:true,company_unit:'二分院',company_position:'院长'};
  const request=async(path,body)=>{
    if(body){if(fail)throw Error('项目已被他人修改'); saved=body;return {...body,id:1};}
    return path==='/staff'?[{id:1,name:'设计师',is_active:true}]:path.startsWith('/reports')?report:[];
  };
  const Page=load('pages/management/ManagementProjectsPage.tsx',{'react':hooks,'../../api':{managementRequest:request},'../../context/AuthContext':{useAuth:()=>({currentUser:user})},'./planning':planning},{structuredClone,crypto:{randomUUID:()=> 'stage-1'},window:{confirm:()=>true},Error}).default;
  const render=()=>{do{cursor=0;effects=[];changed=false;tree=Page();effects.forEach(fn=>fn());}while(changed);};
  const nodes=n=>{if(!n||typeof n!=='object')return[];return[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];};
  const text=n=>typeof n==='string'||typeof n==='number'?String(n):n&&typeof n==='object'?[n.props?.children].flat(Infinity).map(text).join(''):'';
  const find=(type,label)=>nodes(tree).find(n=>n.type===type&&text(n)===label);
  const button=label=>find('button',label);
  render();await new Promise(r=>setImmediate(r));render();
  button('＋ 新建项目').props.onClick();render();
  const projectName=nodes(find('label','项目名称')).find(n=>n.type==='input');
  projectName.props.onChange({target:{value:'真实安排'}});render();
  button('＋ 添加阶段').props.onClick();render();
  const stageName=nodes(tree).find(n=>n.type==='section'&&n.props.className==='mp-stage');
  nodes(stageName).find(n=>n.type==='input').props.onChange({target:{value:'方案设计'}});render();
  const editor=()=>nodes(tree).find(n=>n.type==='form'&&n.props['aria-label']==='编辑项目');
  fail=true;await editor().props.onSubmit({preventDefault(){}});render();
  assert.ok(renderToStaticMarkup(tree).includes('项目已被他人修改'));
  assert.equal(nodes(editor()).find(n=>n.type==='input'&&n.props.value==='真实安排').props.value,'真实安排');
  fail=false;await editor().props.onSubmit({preventDefault(){}});render();
  assert.equal(saved.name,'真实安排'); assert.equal(saved.stages[0].name,'方案设计');assert.equal(saved.stages[0].id,'stage-1');
  assert.equal(editor(),undefined);
});
