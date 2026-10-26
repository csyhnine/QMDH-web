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
test('quick creation accepts name only, untouched close is silent and conflicts preserve stage edits', async () => {
  const slots=[];let cursor=0,effects=[],changed=false,tree,fail=false,saved,confirms=0;
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
  const Page=load('pages/management/ManagementProjectsPage.tsx',{'react':hooks,'../../api':{managementRequest:request},'../../context/AuthContext':{useAuth:()=>({currentUser:user})},'./planning':planning,'./ManagementOverview':{default:()=>null},'./ProjectLedger':{default:()=>null},'./ProjectPlan':{default:()=>null},'./PeopleSchedule':{default:()=>null},'./PeoplePlanner':{default:()=>null}},{structuredClone,crypto:{randomUUID:()=> 'stage-1'},window:{confirm:()=>{confirms++;return true;}},Error}).default;
  const render=()=>{do{cursor=0;effects=[];changed=false;tree=Page();effects.forEach(fn=>fn());}while(changed);};
  const nodes=n=>{if(!n||typeof n!=='object')return[];return[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];};
  const text=n=>typeof n==='string'||typeof n==='number'?String(n):n&&typeof n==='object'?[n.props?.children].flat(Infinity).map(text).join(''):'';
  const find=(type,label)=>nodes(tree).find(n=>n.type===type&&text(n)===label);
  const button=label=>find('button',label);
  render();await new Promise(r=>setImmediate(r));render();
  const editor=()=>nodes(tree).find(n=>n.type==='form'&&n.props['aria-label']==='编辑项目');
  button('＋ 新建项目').props.onClick();render();
  button('关闭').props.onClick();render();assert.equal(confirms,0);assert.equal(editor(),undefined);
  button('＋ 新建项目').props.onClick();render();
  nodes(find('label','项目名称')).find(n=>n.type==='input').props.onChange({target:{value:'   '}});render();
  await editor().props.onSubmit({preventDefault(){}});render();assert.equal(saved,undefined);
  nodes(find('label','项目名称')).find(n=>n.type==='input').props.onChange({target:{value:'只填名称'}});render();
  await editor().props.onSubmit({preventDefault(){}});render();
  assert.equal(saved.name,'只填名称');assert.equal(saved.stages.length,0);assert.equal(saved.design_fee,null);assert.equal(saved.deadline,null);assert.equal(saved.team.coordinator.length,0);
  button('＋ 新建项目').props.onClick();render();
  const projectName=nodes(find('label','项目名称')).find(n=>n.type==='input');
  projectName.props.onChange({target:{value:'真实安排'}});render();
  button('＋ 添加阶段').props.onClick();render();
  const stageName=nodes(tree).find(n=>n.type==='section'&&n.props.className==='mp-stage');
  nodes(stageName).find(n=>n.type==='input').props.onChange({target:{value:'方案设计'}});render();
  fail=true;await editor().props.onSubmit({preventDefault(){}});render();
  assert.ok(renderToStaticMarkup(tree).includes('项目已被他人修改'));
  assert.equal(nodes(editor()).find(n=>n.type==='input'&&n.props.value==='真实安排').props.value,'真实安排');
  fail=false;await editor().props.onSubmit({preventDefault(){}});render();
  assert.equal(saved.name,'真实安排'); assert.equal(saved.stages[0].name,'方案设计');assert.equal(saved.stages[0].id,'stage-1');
  assert.equal(editor(),undefined);
});


test('overview counts unfinished weekly nodes and overdue stages, excludes archived and totals money exactly', () => {
  const p={...makeProject(1,[{...stage('a','2026-10-12','2026-10-15'),progress:0},{...stage('b','2026-10-15','2026-10-18'),progress:50},{...stage('c','2026-10-13','2026-10-14'),progress:100}]),invoiced_pending:'999999999999.99'};
  const second={...makeProject(2,[]),invoiced_pending:'0.01'};
  const hidden={...makeProject(3,[stage('hidden','2026-10-12','2026-10-13')]),archived:true,invoiced_pending:'999.00'};
  const data=planning.planningOverview([p,second,hidden],[{id:1,name:'A'}],'2026-10-16');
  assert.equal(data.week.start,'2026-10-12');assert.equal(data.week.end,'2026-10-18');assert.equal(data.active.length,2);
  assert.equal(data.due.length,2);assert.equal(data.overdue.length,1);assert.equal(data.invoiced,'1000000000000.00');assert.equal(data.unscheduled.length,1);
  assert.equal(planning.matchesStatus(p,'overdue','2026-10-16'),true);
  assert.equal(planning.matchesStatus(second,'unscheduled','2026-10-16'),true);
});
test('chart adapter preserves inclusive dates, milestones, stable IDs and escapes every external text', () => {
  const p={...makeProject(8,[{...stage('s_1','2026-12-30','2026-12-31'),name:'<img src=x onerror=alert(1)>',progress:25}]),name:'<script>name</script>'};
  const data=planning.ganttData([p],[{id:1,name:'<unsafe>'}],'2026-12-01');
  assert.equal(data[1].end_date,'2027-01-01 00:00');assert.equal(data[1].id,'s:8:s_1');
  assert.ok(data[0].text.includes('&lt;script&gt;'));assert.ok(data[1].people.includes('&lt;unsafe&gt;'));assert.ok(!data[1].text.includes('<img'));
  const updated=planning.stageFromGantt(p.stages[0],{start_date:new Date(2027,0,2),end_date:new Date(2027,0,5),progress:0.76});
  assert.equal(updated.start,'2027-01-02');assert.equal(updated.end,'2027-01-04');assert.equal(updated.progress,76);assert.equal(updated.assignees,p.stages[0].assignees);
  const milestone=planning.stageFromGantt({...p.stages[0],milestone:true},{start_date:new Date(2027,0,2),end_date:new Date(2027,0,3),progress:0});
  assert.equal(milestone.start,milestone.end);
});
test('community chart blocks parent/archived drags, edits through drawer and disables dependency writes', () => {
  const listeners={},config={},templates={};let changed,edited;
  const chart={config,templates,i18n:{setLocale(){}},attachEvent:(name,fn)=>{listeners[name]=fn;},init(){},
    getTask:id=>id==='parent'?{projectId:1,readonly:true}:{projectId:1,stageId:'stage',readonly:id==='archived',start_date:new Date(2026,9,16),end_date:new Date(2026,9,18),progress:0.3}};
  const bridge=load('pages/management/ganttBridge.ts',{'./planning':planning});
  bridge.initializePlanningGantt(chart,{}, {canDrag:()=>true,onChange:(...args)=>changed=args,onEdit:id=>edited=id});
  assert.equal(listeners.onBeforeTaskDrag('parent'),false);assert.equal(listeners.onBeforeTaskDrag('archived'),false);assert.equal(listeners.onBeforeTaskDrag('normal'),true);
  listeners.onAfterTaskDrag('normal');assert.equal(changed[0],1);assert.equal(changed[1],'stage');
  assert.equal(listeners.onTaskDblClick('normal'),false);assert.equal(edited,1);assert.equal(config.drag_links,false);
});

test('saving several changed projects acknowledges only committed writes and preserves failed/unattempted work', async () => {
  const queue={1:makeProject(1,[]),2:makeProject(2,[]),3:makeProject(3,[])};const attempted=[];
  const failure=await planning.savePlanQueue(Object.values(queue),async project=>{attempted.push(project.id);if(project.id===2)throw Error('conflict');return {...project,version:2};},id=>delete queue[id]);
  assert.deepEqual(attempted,[1,2]);assert.equal(failure.message,'conflict');assert.deepEqual(Object.keys(queue),['2','3']);
  const result=await planning.savePlanQueue(Object.values(queue),async p=>({...p,version:2}),id=>delete queue[id]);
  assert.equal(result,null);assert.deepEqual(Object.keys(queue),[]);
});
