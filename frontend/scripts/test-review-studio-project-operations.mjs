import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';
const src=name=>readFileSync(new URL(`../src/features/studio/${name}`,import.meta.url),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
function compile(code,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Error,Promise,window:{confirm:()=>true},require:name=>{assert.ok(Object.hasOwn(imports,name),`unstubbed ${name}`);return imports[name];}});return exports;}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
const project=(code,name=code)=>({id:code.charCodeAt(0),code,name,classification:code==='C'?'C':'B',can_manage:true});
function harness({queued=false}={}){
  let cursor=0,mounted=true,dirty=false,result,form={projectCode:'A',classification:'B',prompt:'keep draft'},owner={name:'owner',id:7},server=['A','B','C'].map(c=>project(c)),collection,lateWrites=0;
  const slots=[],updates=[],effects=[],formQueue=[],errors=[],requests=[],gates={create:[],rename:[],delete:[],refresh:[]};
  const module=existsSync(new URL('../src/features/studio/studioProjectCollection.ts',import.meta.url))?compile(src('studioProjectCollection.ts')):null;
  function freshCollection(){if(module){collection=new module.StudioProjectCollection(server);collection.active=true;}else collection={items:[...server],active:true,read(){return{};},accept(_ticket,items){this.items=items;return items;},mutate(change){this.items=change.type==='delete'?this.items.filter(p=>p.code!==change.code):[...this.items.filter(p=>p.code!==change.project.code),change.project];return this.items;}};}
  freshCollection();
  function effect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){const next={deps};slots[i]=next;effects.push(()=>{old?.cleanup?.();next.cleanup=fn();});}}
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>{if(!mounted){lateWrites++;return;}updates.push({i,next});dirty=true;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useMemo(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={deps,value:fn()};return slots[i].value;},useCallback(fn,deps){return react.useMemo(()=>fn,deps);},useLayoutEffect:effect,useEffect:effect};
  function mutate(change){collection.mutate(change);}
  async function refreshProjects(isCurrent=()=>true){const source=collection,ticket=source.read(),gate=gates.refresh.shift();requests.push({kind:'refresh'});const incoming=gate?await gate.promise:[...server];if(!mounted||source!==collection||!isCurrent())return[];return source.accept(ticket,incoming);}
  const api={async createProject(name){requests.push({kind:'create',name});const gate=gates.create.shift(),row=gate?await gate.promise:project('D',name);server=[...server.filter(p=>p.code!==row.code),row];return row;},async renameProject(code,name){requests.push({kind:'rename',code,name});const gate=gates.rename.shift(),row=gate?await gate.promise:project(code,name);server=server.map(p=>p.code===code?row:p);return row;},async deleteProject(code){requests.push({kind:'delete',code});const gate=gates.delete.shift();if(gate)await gate.promise;server=server.filter(p=>p.code!==code);}};
  const hook=compile(src('useStudioProjects.ts'),{react,'../../api':{api},'../../context/AuthContext':{useAuth:()=>({currentUser:owner,isGuest:false})}}).useStudioProjects;
  const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  const newForm=compile(src('StudioNewProjectForm.tsx'),{'react/jsx-runtime':jsx}).default;
  const utils=compile(src('studioWorkspaceProjectUtils.ts'));
  const renameForm=compile(src('StudioWorkspaceProjectRenameForm.tsx'),{'react/jsx-runtime':jsx,'./studioWorkspaceProjectUtils':utils}).default;
  const item=compile(src('StudioWorkspaceProjectItem.tsx'),{'react/jsx-runtime':jsx,'./StudioWorkspaceProjectActions':{default:'actions'},'./StudioWorkspaceProjectRenameForm':{default:'rename'}}).default;
  const setStudioForm=change=>{if(!mounted){lateWrites++;return;}if(queued)formQueue.push(change);else form=typeof change==='function'?change(form):change;};
  function render(commit=true){cursor=0;effects.length=0;result=hook({loadData:()=>refreshProjects(),onError:message=>errors.push(message),projects:collection.items,selectedProjectCode:form.projectCode,setStudioForm,getProjects:()=>collection.items,applyProjectMutation:mutate,refreshProjects});if(commit)for(const run of effects.splice(0))run();return result;}
  function flush(){for(const {i,next} of updates.splice(0))slots[i]=typeof next==='function'?next(slots[i]):next;for(const next of formQueue.splice(0))form=typeof next==='function'?next(form):next;dirty=false;render();}
  function nodes(n,out=[]){if(Array.isArray(n))n.forEach(x=>nodes(x,out));else if(n&&typeof n==='object'){out.push(n);nodes(n.props?.children,out);}return out;}
  render();
  return{get result(){return result;},get form(){return form;},get rows(){return collection.items;},get lateWrites(){return lateWrites;},errors,requests,project,render,flush,copy,
    hold(kind){const gate=deferred();gates[kind].push(gate);return gate;},
    async settle(p){await p;for(let i=0;i<3;i++){await Promise.resolve();if(dirty)flush();}},
    openNew(){result.requestNewProject();flush();},typeNew(value){const tree=newForm({newProjectName:result.newProjectName,onCancelNewProject:result.resetNewProjectDraft,onCreateProject:result.createProject,onNewProjectNameChange:result.setNewProjectName});nodes(tree).find(n=>n.type==='input').props.onChange({target:{value}});flush();},
    cancelNew(){result.resetNewProjectDraft();flush();},create(){return result.createProject();},
    rename(code){result.startProjectRename(project(code));flush();},typeRename(value){const tree=renameForm({projectCode:result.renamingProjectCode,renameValue:result.renameValue,onRenameCancel:result.cancelProjectRename,onRenameCommit:result.commitProjectRename,onRenameValueChange:result.setRenameValue});nodes(tree).find(n=>n.type==='input').props.onChange({target:{value}});flush();},commitRename(code){return result.commitProjectRename(code);},
    select(code){const tree=item({project:project(code),renaming:false,selected:false,onProjectSelect:result.selectProject});nodes(tree).find(n=>n.props?.className==='workspace-item-btn').props.onClick();if(!queued)flush();},
    replaceForm(next){form=next;flush();},replaceRows(rows){server=rows;collection.items=rows;flush();},
    changeOwner(){owner={name:'next-owner',id:8};collection.active=false;freshCollection();flush();},
    refreshOwnerRecord(){owner={...owner,display_name:'updated profile'};flush();},
    discardOwnerRender(){const saved=slots.slice(),previousOwner=owner;owner={name:'discarded'};render(false);slots.splice(0,slots.length,...saved);owner=previousOwner;effects.length=0;render();},
    unmount(){mounted=false;for(const slot of slots)slot?.cleanup?.();collection.active=false;},
  };
}

test('delete A then select C through the real item callback preserves C after A succeeds',async()=>{
  const h=harness(),gate=h.hold('delete'),pending=h.result.deleteProject(project('A'));h.select('C');gate.resolve();await h.settle(pending);assert.equal(h.form.projectCode,'C');assert.equal(h.form.classification,'C');assert.deepEqual(h.requests.filter(r=>r.kind==='delete'),[{kind:'delete',code:'A'}]);
});

test('rename A cannot close or clear the later B rename draft',async()=>{
  const h=harness();h.rename('A');h.typeRename('sent A');const gate=h.hold('rename'),pending=h.commitRename('A');h.rename('B');h.typeRename('unsent B');gate.resolve(project('A','sent A'));await h.settle(pending);assert.equal(h.result.renamingProjectCode,'B');assert.equal(h.result.renameValue,'unsent B');
});

test('create A cannot close a cancelled and reopened B creation draft',async()=>{
  const h=harness();h.openNew();h.typeNew('sent A');const gate=h.hold('create'),pending=h.create();h.cancelNew();h.openNew();h.typeNew('new B');gate.resolve(project('D','sent A'));await h.settle(pending);assert.equal(h.result.showNewProjectForm,true);assert.equal(h.result.newProjectName,'new B');
});

test('stable create and rename still close only their accepted original editors',async()=>{
  const h=harness();h.openNew();h.typeNew('  D name  ');await h.settle(h.create());assert.equal(h.result.showNewProjectForm,false);assert.equal(h.result.newProjectName,'');assert.equal(h.rows.find(p=>p.code==='D').name,'D name');assert.equal(h.form.projectCode,'A');h.rename('A');h.typeRename('  A renamed  ');await h.settle(h.commitRename('A'));assert.equal(h.result.renamingProjectCode,null);assert.equal(h.rows.find(p=>p.code==='A').name,'A renamed');assert.deepEqual(h.requests.filter(r=>r.kind!=='refresh'),[{kind:'create',name:'D name'},{kind:'rename',code:'A',name:'A renamed'}]);
});

test('a stable deletion falls back to a current valid project without losing the rest of the form',async()=>{
  const h=harness();await h.settle(h.result.deleteProject(project('A')));assert.equal(h.form.projectCode,'B');assert.equal(h.form.classification,'B');assert.equal(h.form.prompt,'keep draft');assert.equal(h.rows.some(p=>p.code==='A'),false);
});

test('queued selection updates are rechecked by a late deletion fallback',async()=>{
  const h=harness({queued:true}),gate=h.hold('delete'),pending=h.result.deleteProject(project('A'));h.select('C');gate.resolve();await h.settle(pending);h.flush();assert.equal(h.form.projectCode,'C');assert.equal(h.form.classification,'C');
});

test('a pending deletion is excluded from another deletion fallback',async()=>{
  const h=harness(),b=h.hold('delete'),removeB=h.result.deleteProject(project('B')),a=h.hold('delete'),removeA=h.result.deleteProject(project('A'));a.resolve();await h.settle(removeA);assert.equal(h.form.projectCode,'C');assert.ok(h.result.deletingProjectCodes.includes('B'));b.resolve();await h.settle(removeB);assert.equal(h.form.projectCode,'C');assert.deepEqual(copy(h.result.deletingProjectCodes),[]);
});

test('deletion fallback uses the current list rather than the request-time list including after ABA selection',async()=>{
  const h=harness(),gate=h.hold('delete'),pending=h.result.deleteProject(project('A'));h.select('B');h.select('A');h.replaceRows([project('A'),project('C'),project('D')]);gate.resolve();await h.settle(pending);assert.equal(h.form.projectCode,'C');assert.equal(h.form.classification,'C');
});

test('deleting the last project clears only its code instead of leaving a deleted selection',async()=>{
  const h=harness();h.replaceRows([project('A')]);await h.settle(h.result.deleteProject(project('A')));assert.equal(h.form.projectCode,'');assert.equal(h.form.prompt,'keep draft');assert.equal(h.form.classification,'B');
});

test('deleting A never cancels a later B rename draft',async()=>{
  const h=harness(),gate=h.hold('delete'),pending=h.result.deleteProject(project('A'));h.rename('B');h.typeRename('B draft');gate.resolve();await h.settle(pending);assert.equal(h.result.renamingProjectCode,'B');assert.equal(h.result.renameValue,'B draft');
});

test('same-editor text changes including ABA keep the newer version after an old create or rename succeeds',async()=>{
  for(const kind of ['create','rename']){const h=harness();if(kind==='create'){h.openNew();h.typeNew('same');}else{h.rename('A');h.typeRename('same');}const gate=h.hold(kind),pending=kind==='create'?h.create():h.commitRename('A');if(kind==='create'){h.typeNew('changed');h.typeNew('same');}else{h.typeRename('changed');h.typeRename('same');}gate.resolve(project(kind==='create'?'D':'A','same'));await h.settle(pending);assert.equal(kind==='create'?h.result.newProjectName:h.result.renameValue,'same');assert.equal(kind==='create'?h.result.showNewProjectForm:h.result.renamingProjectCode==='A',true);}
});

test('an A to B to A rename session does not reuse the original A observation',async()=>{
  const h=harness();h.rename('A');h.typeRename('old A');const gate=h.hold('rename'),pending=h.commitRename('A');h.rename('B');h.typeRename('B');h.rename('A');h.typeRename('new A');gate.resolve(project('A','old A'));await h.settle(pending);assert.equal(h.result.renamingProjectCode,'A');assert.equal(h.result.renameValue,'new A');
});

test('synchronous in-flight gates suppress duplicate create rename and delete requests',async()=>{
  for(const kind of ['create','rename','delete']){const h=harness();if(kind==='create'){h.openNew();h.typeNew('D');}if(kind==='rename'){h.rename('A');h.typeRename('renamed');}const gate=h.hold(kind),action=kind==='create'?()=>h.create():kind==='rename'?()=>h.commitRename('A'):()=>h.result.deleteProject(project('A')),a=action(),b=action();assert.equal(h.requests.filter(r=>r.kind===kind).length,1);gate.resolve(project(kind==='create'?'D':'A','accepted'));await h.settle(Promise.all([a,b]));assert.equal(h.requests.filter(r=>r.kind===kind).length,1);}
});

test('independent rename operations may proceed while old finally cannot clear the later busy state',async()=>{
  const h=harness();h.rename('A');h.typeRename('A sent');const a=h.hold('rename'),old=h.commitRename('A');h.rename('B');h.typeRename('B sent');const b=h.hold('rename'),current=h.commitRename('B');h.flush();assert.equal(h.result.renamingProject,true);a.resolve(project('A','A sent'));await h.settle(old);assert.equal(h.result.renamingProjectCode,'B');assert.equal(h.result.renamingProject,true);b.resolve(project('B','B sent'));await h.settle(current);assert.equal(h.result.renamingProject,false);assert.equal(h.result.renamingProjectCode,null);assert.equal(h.requests.filter(r=>r.kind==='rename').length,2);
});

test('a cancelled create may be replaced by a new create without old finally clearing its pending state',async()=>{
  const h=harness();h.openNew();h.typeNew('old A');const a=h.hold('create'),old=h.create();h.cancelNew();h.openNew();h.typeNew('new B');const b=h.hold('create'),current=h.create();h.flush();assert.equal(h.result.creatingProject,true);a.reject(Error('old failure'));await h.settle(old);assert.equal(h.result.newProjectName,'new B');assert.equal(h.result.creatingProject,true);assert.deepEqual(h.errors,[]);b.resolve(project('E','new B'));await h.settle(current);assert.equal(h.result.showNewProjectForm,false);assert.equal(h.result.creatingProject,false);
});

test('current mutation failure preserves its draft and releases busy without an automatic retry',async()=>{
  const h=harness();h.openNew();h.typeNew('keep name');const gate=h.hold('create'),pending=h.create();gate.reject(Error('server rejected'));await h.settle(pending);assert.equal(h.result.showNewProjectForm,true);assert.equal(h.result.newProjectName,'keep name');assert.equal(h.result.creatingProject,false);assert.match(h.errors[0],/server rejected/);assert.equal(h.requests.filter(r=>r.kind==='create').length,1);await h.settle(h.create());assert.equal(h.requests.filter(r=>r.kind==='create').length,2);assert.equal(h.result.showNewProjectForm,false);
});

test('old rename and deletion errors do not replace later context feedback',async()=>{
  const h=harness();h.rename('A');h.typeRename('A');const rename=h.hold('rename'),r=h.commitRename('A');h.rename('B');h.typeRename('B draft');rename.reject(Error('old rename'));await h.settle(r);assert.deepEqual(h.errors,[]);const remove=h.hold('delete'),d=h.result.deleteProject(project('A'));h.select('C');remove.reject(Error('old delete'));await h.settle(d);assert.deepEqual(h.errors,[]);assert.equal(h.form.projectCode,'C');assert.equal(h.result.renameValue,'B draft');
});

test('successful writes survive refresh failure with an accurate message and no repeated mutation',async()=>{
  for(const kind of ['create','rename','delete']){const h=harness();if(kind==='create'){h.openNew();h.typeNew('D');}if(kind==='rename'){h.rename('A');h.typeRename('renamed');}const refresh=h.hold('refresh'),pending=kind==='create'?h.create():kind==='rename'?h.commitRename('A'):h.result.deleteProject(project('A'));await Promise.resolve();refresh.reject(Error('GET failed'));await h.settle(pending);assert.equal(h.requests.filter(r=>r.kind===kind).length,1);assert.match(h.errors[0],/已成功.*刷新失败/);if(kind==='create')assert.ok(h.rows.some(p=>p.code==='D'));if(kind==='rename')assert.equal(h.rows.find(p=>p.code==='A').name,'renamed');if(kind==='delete'){assert.equal(h.rows.some(p=>p.code==='A'),false);assert.equal(h.form.projectCode,'B');}}
});

test('a refresh failure from accepted A is silent after the user opens a new B editor',async()=>{
  const h=harness();h.openNew();h.typeNew('A');const refresh=h.hold('refresh'),pending=h.create();await Promise.resolve();await Promise.resolve();h.flush();h.openNew();h.typeNew('new B');refresh.reject(Error('old read failed'));await h.settle(pending);assert.deepEqual(h.errors,[]);assert.equal(h.result.newProjectName,'new B');assert.equal(h.result.showNewProjectForm,true);
});

test('unmount and account change discard each late mutation result without follow-up reads or writes',async()=>{
  for(const kind of ['create','rename','delete'])for(const account of [false,true]){const h=harness();if(kind==='create'){h.openNew();h.typeNew('D');}if(kind==='rename'){h.rename('A');h.typeRename('A');}const gate=h.hold(kind),pending=kind==='create'?h.create():kind==='rename'?h.commitRename('A'):h.result.deleteProject(project('A'));if(account)h.changeOwner();else h.unmount();gate.resolve(project(kind==='create'?'D':'A','accepted'));await pending;if(account)h.flush();assert.equal(h.lateWrites,0);assert.deepEqual(h.errors,[]);assert.equal(h.requests.some(r=>r.kind==='refresh'),false);}
});

test('an abandoned account render does not invalidate the original visible create session',async()=>{
  const h=harness();h.openNew();h.typeNew('D');const gate=h.hold('create'),pending=h.create();h.discardOwnerRender();gate.resolve(project('D','D'));await h.settle(pending);assert.equal(h.result.showNewProjectForm,false);assert.equal(h.rows.some(p=>p.code==='D'),true);
});

test('a profile refresh for the same account preserves its editor and pending mutation',async()=>{
  const h=harness();h.openNew();h.typeNew('D');const gate=h.hold('create'),pending=h.create();h.refreshOwnerRecord();assert.equal(h.result.newProjectName,'D');assert.equal(h.result.creatingProject,true);gate.resolve(project('D','D'));await h.settle(pending);assert.equal(h.result.showNewProjectForm,false);assert.ok(h.rows.some(p=>p.code==='D'));
});
