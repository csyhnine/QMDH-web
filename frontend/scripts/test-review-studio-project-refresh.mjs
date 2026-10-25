import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';
const src=name=>readFileSync(new URL(`../src/features/studio/${name}`,import.meta.url),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
const project=(code,name=code)=>({id:code.charCodeAt(0),code,name,classification:'B',can_manage:true});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function compile(code,imports={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Error,Date,...globals,require:name=>{assert.ok(Object.hasOwn(imports,name),`unstubbed ${name}`);return imports[name];}});return exports;}
const {StudioProjectCollection}=compile(src('studioProjectCollection.ts'));
function harness({queued=false,integrated=false}={}){
  let cursor=0,result,operations,mounted=true,owner={name:'owner'},clock=1000000000,state={projects:[project('A'),project('B')],tasks:[],assets:[],providers:[],workflows:[],error:'',ready:true},lateWrites=0,form={projectCode:'A',classification:'B',prompt:'keep'};
  let server=[project('A'),project('B')];
  const slots=[],updates=[],effects=[],stateQueue=[],formQueue=[],gates=[],mutationGates=[],requests=[],mutations=[];
  function effect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){const next={deps};slots[i]=next;effects.push(()=>{old?.cleanup?.();next.cleanup=fn();});}}
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>{if(!mounted){lateWrites++;return;}updates.push({i,next});}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useMemo(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={deps,value:fn()};return slots[i].value;},useLayoutEffect:effect,useEffect(){cursor++;}};
  const api={projects:async()=>{requests.push('projects');const gate=gates.shift();return gate?await gate.promise:[...server];},health:async()=>({status:'ok'}),providers:async()=>[],workflows:async()=>[],tasks:async()=>[],promptTemplates:async()=>[],assets:async()=>{throw Error('unexpected asset read');},createProject:async name=>{mutations.push({kind:'create',name});const created=project('D',name);server.push(created);return created;},deleteProject:async code=>{mutations.push({kind:'delete',code});const gate=mutationGates.shift();if(gate)await gate.promise;server=server.filter(p=>p.code!==code);}};
  const setState=next=>{if(!mounted){lateWrites++;return;}if(queued)stateQueue.push(next);else state=typeof next==='function'?next(state):next;};
  const hook=compile(src('useStudioDataLoader.ts'),{react,'../../api':{api},'../../context/AuthContext':{useAuth:()=>({isGuest:false})},'./studioProjectCollection':{StudioProjectCollection}},{Date:class extends Date{static now(){return clock;}}}).useStudioDataLoader;
  const projectHook=compile(src('useStudioProjects.ts'),{react,'../../api':{api},'../../context/AuthContext':{useAuth:()=>({currentUser:owner,isGuest:false})}},{window:{confirm:()=>true}}).useStudioProjects;
  const optionsBuilder=compile(src('studioControllerDataOptions.ts')).buildStudioProjectsOptions;
  const setStudioForm=next=>{if(queued)formQueue.push(next);else form=typeof next==='function'?next(form):next;};
  function render(){cursor=0;effects.length=0;result=hook({currentUser:owner,projects:state.projects,tasks:[],setState,setPromptTemplates:()=>{}});if(integrated)operations=projectHook(optionsBuilder({controllerState:{state,studioForm:form,setStudioForm,setState},studioData:result}));for(const run of effects.splice(0))run();return result;}
  function flush(){for(const next of stateQueue.splice(0))state=typeof next==='function'?next(state):next;for(const next of formQueue.splice(0))form=typeof next==='function'?next(form):next;for(const {i,next} of updates.splice(0))slots[i]=typeof next==='function'?next(slots[i]):next;render();}
  render();
  return{get result(){return result;},get operations(){return operations;},get form(){return form;},get state(){return state;},get lateWrites(){return lateWrites;},requests,mutations,flush,hold(){const g=deferred();gates.push(g);return g;},holdMutation(){const g=deferred();mutationGates.push(g);return g;},advance(){clock+=6*60*1000;},changeOwner(){owner={name:'next'};render();},refreshOwnerRecord(){owner={...owner,display_name:'updated profile'};render();},unmount(){mounted=false;for(const s of slots)s?.cleanup?.();},discardOwnerRender(){const previousOwner=owner,saved=slots.slice();owner={name:'discarded'};cursor=0;effects.length=0;hook({currentUser:owner,projects:state.projects,tasks:[],setState,setPromptTemplates:()=>{}});slots.splice(0,slots.length,...saved);owner=previousOwner;effects.length=0;render();}};
}

test('a successful mutation is not reverted by an older dedicated project read',async()=>{
  const h=harness(),gate=h.hold(),pending=h.result.refreshProjects(()=>true);h.result.applyProjectMutation({type:'delete',code:'A'});gate.resolve([project('A'),project('B')]);await pending;h.flush();assert.deepEqual(copy(h.state.projects).map(p=>p.code),['B']);
});

test('out of order dedicated reads keep the latest list and current mutation records',async()=>{
  const h=harness(),a=h.hold(),b=h.hold(),old=h.result.refreshProjects(()=>true),current=h.result.refreshProjects(()=>true);b.resolve([project('C')]);await current;a.resolve([project('A')]);await old;h.flush();assert.deepEqual(copy(h.result.getProjects()).map(p=>p.code),['C']);
});

test('an old full load cannot restore deleted projects while still updating its unrelated data',async()=>{
  const h=harness(),gate=h.hold(),pending=h.result.loadData({force:true});h.result.applyProjectMutation({type:'delete',code:'A'});gate.resolve([project('A'),project('B')]);await pending;h.flush();assert.deepEqual(copy(h.state.projects).map(p=>p.code),['B']);assert.equal(h.state.health,'ok');
});

test('a queued full-load updater rechecks the project collection after a confirmed rename',async()=>{
  const h=harness({queued:true});await h.result.loadData({force:true});h.result.applyProjectMutation({type:'upsert',project:project('A','new name')});h.flush();assert.equal(h.state.projects.find(p=>p.code==='A').name,'new name');
});

test('the existing configuration refresh also cannot resurrect an older project list',async()=>{
  const h=harness(),gate=h.hold(),pending=h.result.loadData({mode:'poll',force:true});h.result.applyProjectMutation({type:'delete',code:'A'});gate.resolve([project('A'),project('B')]);await pending;h.flush();assert.deepEqual(copy(h.state.projects).map(p=>p.code),['B']);
});

test('refresh failure preserves the known successful mutation and remains a read-only retry',async()=>{
  const h=harness(),gate=h.hold();h.result.applyProjectMutation({type:'upsert',project:project('A','accepted')});const pending=h.result.refreshProjects(()=>true);gate.reject(Error('read failed'));await assert.rejects(pending,/read failed/);assert.equal(h.result.getProjects()[0].name,'accepted');const later=h.hold(),retry=h.result.refreshProjects(()=>true);later.resolve([project('A','accepted'),project('B')]);await retry;h.flush();assert.equal(h.state.projects[0].name,'accepted');assert.equal(h.requests.length,2);
});

test('account change invalidates dedicated results and queued mutations from the former account',async()=>{
  const h=harness({queued:true}),old=h.result,gate=h.hold(),pending=old.refreshProjects(()=>true);old.applyProjectMutation({type:'delete',code:'A'});h.changeOwner();gate.resolve([project('A'),project('B')]);await pending;h.flush();assert.deepEqual(copy(h.state.projects),[]);assert.deepEqual(copy(old.getProjects()),[]);
});

test('unmount discards a dedicated refresh without late state writes',async()=>{
  const h=harness(),gate=h.hold(),pending=h.result.refreshProjects(()=>true);h.unmount();gate.resolve([project('C')]);await pending;assert.equal(h.lateWrites,0);
});

test('a discarded account render leaves the visible project collection and request valid',async()=>{
  const h=harness(),gate=h.hold(),pending=h.result.refreshProjects(()=>true);h.discardOwnerRender();gate.resolve([project('C')]);await pending;h.flush();assert.deepEqual(copy(h.state.projects).map(p=>p.code),['C']);
});

test('confirmed deletion is filtered until acknowledged and an explicit new upsert may reuse its code',()=>{
  const c=new StudioProjectCollection([project('A'),project('B')]);c.active=true;c.mutate({type:'delete',code:'A'});assert.deepEqual(copy(c.accept(c.read(),[project('A'),project('B')])).map(p=>p.code),['B']);c.accept(c.read(),[project('B')]);assert.deepEqual(copy(c.accept(c.read(),[project('A','recreated'),project('B')])).map(p=>p.code),['A','B']);c.mutate({type:'delete',code:'A'});c.mutate({type:'upsert',project:project('A','explicit new')});assert.equal(c.items.find(p=>p.code==='A').name,'explicit new');
});

test('read tickets cannot be applied to another collection or an inactive collection',()=>{
  const a=new StudioProjectCollection([project('A')]),b=new StudioProjectCollection([project('B')]);a.active=b.active=true;const ticket=a.read();b.read();b.accept(ticket,[project('A')]);assert.deepEqual(copy(b.items).map(p=>p.code),['B']);a.active=false;a.accept(ticket,[project('C')]);assert.deepEqual(copy(a.items).map(p=>p.code),['A']);
});

test('the existing project defaults updater cannot replace an already queued user selection',()=>{
  const file=ts.createSourceFile('defaults.ts',src('useStudioDefaults.ts'),ts.ScriptTarget.Latest,true);let callback;
  function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(file)==='useEffect'&&n.getText(file).includes('const nextProject = projects[0]'))callback=n.arguments[0].getText(file);ts.forEachChild(n,visit);}visit(file);assert.ok(callback);
  let update;vm.runInNewContext(`(${ts.transpileModule(callback,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText.trim().replace(/;$/,'')})()`,{projects:[project('B'),project('C')],studioForm:{projectCode:'A'},setStudioForm:fn=>{update=fn;}});const current={projectCode:'C',classification:'C',prompt:'later'};assert.equal(update(current),current);const old={projectCode:'A',classification:'B',prompt:'keep'};assert.equal(update(old).projectCode,'B');
});

test('actual controller wiring joins project operations to the actual loader collection without changing a later selection',async()=>{
  const h=harness({integrated:true,queued:true});h.flush();h.operations.requestNewProject();h.flush();h.operations.setNewProjectName('created D');h.flush();await h.operations.createProject();h.flush();assert.ok(h.state.projects.some(p=>p.code==='D'));const gate=h.holdMutation(),pending=h.operations.deleteProject(project('A'));h.operations.selectProject(project('D'));h.flush();gate.resolve();await pending;h.flush();assert.equal(h.form.projectCode,'D');assert.equal(h.form.prompt,'keep');assert.deepEqual(copy(h.state.projects).map(p=>p.code),['B','D']);assert.deepEqual(h.mutations,[{kind:'create',name:'created D'},{kind:'delete',code:'A'}]);
});

test('the controller error callback checks its operation guard when the queued state updater actually executes',()=>{
  let current=true,update;const builder=compile(src('studioControllerDataOptions.ts')).buildStudioProjectsOptions;const options=builder({controllerState:{studioForm:{projectCode:'A'},setStudioForm:()=>{},setState:fn=>{update=fn;}},studioData:{getProjects:()=>[],applyProjectMutation:()=>{},refreshProjects:async()=>[]}});options.onError('old error',()=>current);current=false;const state={error:'later feedback',projects:[]};assert.equal(update(state),state);current=true;assert.equal(update(state).error,'old error');
});

test('a profile refresh for the same account does not clear projects or invalidate their read',async()=>{
  const h=harness(),gate=h.hold(),pending=h.result.refreshProjects(()=>true);h.refreshOwnerRecord();assert.deepEqual(copy(h.result.getProjects()).map(p=>p.code),['A','B']);gate.resolve([project('C')]);await pending;h.flush();assert.deepEqual(copy(h.state.projects).map(p=>p.code),['C']);
});
