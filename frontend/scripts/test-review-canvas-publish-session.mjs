import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source=name=>readFileSync(new URL(`../src/features/canvas/${name}`,import.meta.url),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
const graph=id=>({version:1,nodes:[{id}],edges:[],viewport:{x:0,y:0,zoom:1}});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function compile(code,imports={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Error,Date,...globals,require:name=>{if(Object.hasOwn(imports,name))return imports[name];throw Error(`unstubbed ${name}`);}});return exports;}
function world(){
  const calls=[],events=[],queues=new Map();let seed=0,nextId=100;
  const invoke=async(kind,payload)=>{calls.push({kind,payload:copy(payload??{})});const gate=queues.get(kind)?.shift();return gate?await gate.promise:kind==='list'?[{id:11,title:'old template',category:'old'}]:{id:kind==='update'?payload.id:++nextId,title:payload?.title??'new template'};};
  const api={createAdminCanvasTemplate:p=>invoke('create',p),updateAdminCanvasTemplate:(id,p)=>invoke('update',{id,...p}),adminCanvasTemplates:()=>invoke('list')};
  const ids=compile(source('canvasId.ts'),{},{crypto:{getRandomValues(bytes){bytes.fill(++seed);return bytes;}}});
  return{api,calls,events,ids,hold(kind){const gate=deferred();if(!queues.has(kind))queues.set(kind,[]);queues.get(kind).push(gate);return gate;},async flush(){for(let i=0;i<50;i++)await Promise.resolve();}};
}
function dialog(w=world()){
  let cursor=0,dirty=false,mounted=true,tree,lateWrites=0,props;const slots=[],updates=[],effects=[];
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>{if(!mounted){lateWrites++;return;}updates.push({i,next});dirty=true;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useMemo(create,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={deps,value:create()};return slots[i].value;},useEffect(create,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){const next={deps};slots[i]=next;effects.push({layout:false,run(){old?.cleanup?.();next.cleanup=create();}});}}};
  react.useLayoutEffect=(create,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){const next={deps};slots[i]=next;effects.push({layout:true,run(){old?.cleanup?.();next.cleanup=create();}});}};
  const jsx=(type,props)=>({type,props});
  const module=compile(source('PublishCanvasTemplateDialog.tsx'),{react,'../../api':{api:w.api},'./canvasId':w.ids,'react/jsx-runtime':{jsx,jsxs:jsx}},{window:{confirm:()=>true}});
  function makeSession(id,title='A',g=graph(id),owner=7){return module.createCanvasPublishSession?module.createCanvasPublishSession(owner,id,`${owner}:${id}:view`,title,g):{id:`session-${id}`,source:{ownerId:owner,projectId:id,viewKey:`${owner}:${id}:view`,title,graph:copy(g)},phase:'editing',title,category:'',mode:'create'};}
  function callbacks(tag){return{onCreated:row=>w.events.push({kind:'created',tag,row}),onUpdated:row=>w.events.push({kind:'updated',tag,row}),onError:message=>w.events.push({kind:'error',tag,message}),onClose(){w.events.push({kind:'close',tag});props={...props,open:false};dirty=true;},onAbandon(){w.events.push({kind:'abandon',tag});props={...props,open:false};dirty=true;}};}
  props={open:true,defaultTitle:'A',graphJson:graph(1),session:makeSession(1),...callbacks('A')};
  function commit(){if(!mounted)return;for(let i=0;i<30;i++){for(const{i,next}of updates.splice(0))slots[i]=typeof next==='function'?next(slots[i]):next;cursor=0;dirty=false;tree=module.default(props);const pending=effects.splice(0);for(const effect of pending.filter(e=>e.layout))effect.run();for(const effect of pending.filter(e=>!e.layout))effect.run();if(!dirty)return;}throw Error('dialog did not settle');}
  async function flush(){for(let i=0;i<60;i++){await Promise.resolve();if(dirty&&mounted)commit();}}
  function elements(){const found=[];function visit(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(visit);return;}if(n.type)found.push(n);visit(n.props?.children);}visit(tree);return found;}
  const text=n=>{const c=n?.props?.children;if(typeof c==='string')return c;return Array.isArray(c)?c.map(x=>typeof x==='string'?x:text(x)).join(''):'';};
  function button(label){return elements().find(n=>n.type==='button'&&(text(n).trim()===label||n.props['aria-label']===label));}
  commit();return{w,makeSession,callbacks,commit,flush,elements,text,button,get props(){return props;},get lateWrites(){return lateWrites;},get title(){return elements().find(n=>n.type==='input')?.props.value;},submit(){const b=elements().find(n=>n.type==='button'&&n.props.className==='admin-primary-button');assert.ok(b);b.props.onClick();commit();},changeTitle(value){elements().find(n=>n.type==='input').props.onChange({target:{value}});commit();},update(next){props={...props,...next};commit();},discardedRender(next){const previous=props,oldSlots=slots.slice(),count=effects.length,oldDirty=dirty;props={...props,...next};cursor=0;module.default(props);effects.length=count;slots.length=0;slots.push(...oldSlots);props=previous;dirty=oldDirty;},unmount(){mounted=false;for(const slot of slots)slot?.cleanup?.();}};
}
async function projects(){
  const url=new URL('./test-review-canvas-project-save.mjs',import.meta.url),code=readFileSync(url,'utf8'),boundary=code.indexOf('test("normal auto-save debounces');assert.ok(boundary>0);
  const prefix=code.slice(0,boundary).replaceAll('import.meta.url',JSON.stringify(url.href)).replace('from "typescript"',`from ${JSON.stringify(import.meta.resolve('typescript'))}`);
  const {world,ready}=await import('data:text/javascript;base64,'+Buffer.from(prefix+'\nexport {world,ready};').toString('base64'));const w=world(),h=await ready(w);return{w,h};
}
function functions(names){const file=ts.createSourceFile('Workspace.tsx',source('CanvasWorkspace.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),found=[];function visit(n){if(ts.isFunctionDeclaration(n)&&names.includes(n.name?.text))found.push(n.getText(file));ts.forEachChild(n,visit);}visit(file);return found.join('\n');}
function parent(w,h){
  const events=[],refs={copyRunRef:{current:null},copyNavigationRef:{current:{ownerId:7,viewKey:h.result.viewKey,mounted:true}},publishSessionRef:{current:null},publishOpenRef:{current:false}};let publishing=null,applying=null,open=false;
  function make(){const deps={...refs,canvas:h.result,currentUser:{id:7},nodesRef:{current:h.result.activeProject?.graph_json.nodes??[]},edgesRef:{current:[]},viewportRef:{current:{x:0,y:0,zoom:1}},api:w.api,serializeCanvasGraph:(nodes,edges,viewport)=>({version:1,nodes,edges,viewport}),createCanvasPublishSession:(owner,id,key,title,g)=>({id:`publish-${id}`,source:{ownerId:owner,projectId:id,viewKey:key,title,graph:copy(g)},phase:'editing'}),setApplyingTemplateId:value=>applying=value,setBannerOk:value=>events.push({kind:'ok',value}),setBannerError:value=>events.push({kind:'error',value}),setPublishDialogOpen:value=>{open=value;refs.publishOpenRef.current=value;},setPublishSession:value=>publishing=value};
    return compile(`export function make(deps){const {${Object.keys(deps).join(',')}}=deps;${functions(['cancelCopyIntent','handleUseTemplate','handlePublishAsTemplate','handleOpenProject','handleCreateProject'])};return {handleUseTemplate,handlePublishAsTemplate,${source('CanvasWorkspace.tsx').includes('function handleOpenProject')?'handleOpenProject,handleCreateProject,':''}};}`).make(deps);}
  return{make,refs,events,setPublication(session){publishing=session;refs.publishSessionRef.current=session;},setOpen(value){open=value;refs.publishOpenRef.current=value;},get open(){return open;},get publishing(){return publishing;},get applying(){return applying;},sync(){refs.copyNavigationRef.current={ownerId:7,viewKey:h.result.viewKey,mounted:true};}};
}

test('source prop changes cannot reset an in-flight publication or replace its edited title',async t=>{
  const h=dialog(),gate=h.w.hold('create');t.after(()=>h.unmount());h.changeTitle('A edited');h.submit();await h.flush();h.update({defaultTitle:'B',graphJson:graph(2)});
  assert.equal(h.title,'A edited');assert.equal(h.button('发布中…')?.props.disabled,true);assert.equal(h.w.calls.filter(c=>c.kind==='create').length,1);gate.resolve({id:101,title:'A edited'});await h.flush();
});

test('a template GET that returns after publication opens cannot steal the current project selection',async t=>{
  const {w,h}=await projects();t.after(()=>h.unmount());const gate=deferred();w.api.getCanvasTemplate=()=>gate.promise;const p=parent(w,h),copying=p.make().handleUseTemplate(2);
  await p.make().handlePublishAsTemplate();gate.resolve({id:2,title:'B',graph_json:graph(2)});await copying;await h.flush();
  assert.equal(h.result.activeProject.id,1);assert.equal(w.calls.filter(c=>c.method==='create').length,0);assert.equal(p.open,true);
});

test('stable create uses the opening graph and draft fields once even for two same-render clicks',async t=>{
  const h=dialog(),original=graph(3),session=h.makeSession(3,'A',original),gate=h.w.hold('create');t.after(()=>h.unmount());h.update({session});h.changeTitle('custom A');
  const category=h.elements().filter(n=>n.type==='input')[1];category.props.onChange({target:{value:'category A'}});h.commit();original.nodes[0].id='mutated original';
  const button=h.elements().find(n=>n.type==='button'&&n.props.className==='admin-primary-button'),staleTitle=h.elements().find(n=>n.type==='input').props.onChange;
  button.props.onClick();button.props.onClick();staleTitle({target:{value:'late B'}});h.commit();assert.equal(h.title,'custom A');assert.equal(h.w.calls.length,1);
  const payload=h.w.calls[0].payload;assert.equal(payload.title,'custom A');assert.equal(payload.category,'category A');assert.equal(payload.graph_json.nodes[0].id,3);
  gate.resolve({id:101,title:'custom A'});await h.flush();assert.equal(h.w.events.filter(e=>e.kind==='created').length,1);assert.equal(h.w.events.filter(e=>e.kind==='close').length,1);
});

test('stable update captures the selected template and source graph without creating another template',async t=>{
  const h=dialog();t.after(()=>h.unmount());h.button('更新已有').props.onClick();h.commit();await h.flush();assert.equal(h.title,'old template');h.changeTitle('overwrite A');const gate=h.w.hold('update');h.submit();
  h.update({defaultTitle:'B',graphJson:graph(2)});assert.equal(h.w.calls.filter(c=>c.kind==='create').length,0);const payload=h.w.calls.find(c=>c.kind==='update').payload;assert.equal(payload.id,11);assert.equal(payload.title,'overwrite A');assert.equal(payload.graph_json.nodes[0].id,1);
  gate.resolve({id:11,title:'overwrite A'});await h.flush();assert.equal(h.w.events.filter(e=>e.kind==='updated').length,1);
});

test('closing and reopening a pending session preserves its title source and busy lock',async t=>{
  const h=dialog(),gate=h.w.hold('create');t.after(()=>h.unmount());h.changeTitle('retained A');h.submit();h.button('关闭').props.onClick();h.commit();assert.equal(h.props.open,false);
  h.update({open:true,defaultTitle:'same or B',graphJson:graph(2)});assert.equal(h.title,'retained A');assert.equal(h.props.session.source.projectId,1);assert.equal(h.button('发布中…').props.disabled,true);h.submit();assert.equal(h.w.calls.length,1);
  gate.resolve({id:101,title:'retained A'});await h.flush();assert.equal(h.w.events.filter(e=>e.kind==='created').length,1);
});

test('closed-session success is recorded without closing or navigating a later view',async t=>{
  const h=dialog(),gate=h.w.hold('create'),session=h.props.session;t.after(()=>h.unmount());h.submit();h.button('关闭').props.onClick();h.commit();const events=h.w.events.length;
  gate.resolve({id:101,title:'A'});await h.flush();assert.equal(session.result.id,101);assert.equal(session.phase,'succeeded');assert.equal(h.w.events.length,events);assert.equal(h.lateWrites,0);
});

test('explicitly ending A allows a same-named B session whose busy errors and close are untouched by old A',async t=>{
  for(const rejected of [false,true]){const h=dialog(),old=h.w.hold('create');t.after(()=>h.unmount());const a=h.makeSession(1,'same name');h.update({session:a});h.submit();h.button('结束本地会话').props.onClick();h.commit();assert.equal(a.phase,'abandoned');
    const b=h.makeSession(2,'same name'),next=h.w.hold('create');h.update({session:b,open:true,...h.callbacks('B')});h.submit();const count=h.w.events.length;
    if(rejected)old.reject(Object.assign(Error('old A failure'),{status:400}));else old.resolve({id:101,title:'same name'});await h.flush();assert.equal(h.w.events.length,count);assert.equal(h.props.open,true);assert.equal(b.phase,'submitting');assert.equal(h.button('发布中…').props.disabled,true);
    next.resolve({id:202,title:'same name'});await h.flush();assert.equal(h.w.events.filter(e=>e.kind==='created').length,1);assert.equal(h.w.events.find(e=>e.kind==='created').tag,'B');assert.equal(h.w.calls[1].payload.graph_json.nodes[0].id,2);
  }
});

test('a normal rejection retains the draft and permits an explicit corrected submission',async t=>{
  const h=dialog(),gate=h.w.hold('create');t.after(()=>h.unmount());h.changeTitle('draft A');h.submit();gate.reject(Object.assign(Error('known rejection'),{status:400}));await h.flush();assert.equal(h.props.session.phase,'rejected');assert.equal(h.title,'draft A');h.changeTitle('corrected A');h.submit();await h.flush();assert.equal(h.w.calls.filter(c=>c.kind==='create').length,2);assert.equal(h.w.calls[1].payload.title,'corrected A');
});

test('unknown network timeout server errors and malformed success never automatically reissue a create',async t=>{
  for(const failure of ['network',408,500,'bad id']){const h=dialog(),gate=h.w.hold('create');t.after(()=>h.unmount());h.submit();if(failure==='bad id')gate.resolve({id:null});else gate.reject(Object.assign(Error(String(failure)),typeof failure==='number'?{status:failure}:{}));await h.flush();
    assert.equal(h.props.session.phase,'uncertain');assert.equal(h.button('结果待核对').props.disabled,true);h.submit();h.update({defaultTitle:'B',graphJson:graph(2),open:false});h.update({open:true});h.submit();assert.equal(h.w.calls.filter(c=>c.kind==='create').length,1);
  }
});

test('read-only inspection cannot unlock unknown or turn a matching title into proof of non-admission',async t=>{
  const h=dialog(),gate=h.w.hold('create');t.after(()=>h.unmount());h.submit();gate.reject(Error('response lost'));await h.flush();const inspect=h.w.hold('list');h.button('只读核对模板库').props.onClick();h.commit();inspect.resolve([{id:101,title:'A'}]);await h.flush();
  assert.equal(h.props.session.phase,'uncertain');assert.equal(h.props.session.inspection[0].id,101);h.submit();assert.equal(h.w.calls.filter(c=>c.kind==='create').length,1);
});

test('mismatched update identity stays unknown with the selected target preserved',async t=>{
  const h=dialog();t.after(()=>h.unmount());h.button('更新已有').props.onClick();h.commit();await h.flush();const gate=h.w.hold('update');h.submit();gate.resolve({id:12,title:'wrong'});await h.flush();assert.equal(h.props.session.phase,'uncertain');assert.equal(h.props.session.selectedId,11);assert.equal(h.w.events.filter(e=>e.kind==='updated').length,0);
});

test('update list completion failure and finally belong to the newest mode and request',async t=>{
  const h=dialog(),old=h.w.hold('list');t.after(()=>h.unmount());h.button('更新已有').props.onClick();h.commit();h.button('新建').props.onClick();h.commit();const newest=h.w.hold('list');h.button('更新已有').props.onClick();h.commit();
  newest.resolve([{id:22,title:'newest list',category:'new'}]);await h.flush();old.reject(Error('old list failure'));await h.flush();assert.equal(h.props.session.selectedId,22);assert.equal(h.title,'newest list');assert.equal(h.props.session.loadingList,false);assert.equal(h.w.events.filter(e=>e.kind==='error').length,0);
});

test('reopening an edited update session does not overwrite its title when the selected row still exists',async t=>{
  const h=dialog();t.after(()=>h.unmount());h.button('更新已有').props.onClick();h.commit();await h.flush();h.changeTitle('custom overwrite');h.button('关闭').props.onClick();h.commit();h.update({open:true});await h.flush();assert.equal(h.title,'custom overwrite');assert.equal(h.props.session.selectedId,11);
});

test('unmounting a pending dialog records its own outcome without late React state writes or callbacks',async()=>{
  for(const error of [false,true]){const h=dialog(),gate=h.w.hold('create'),session=h.props.session;h.submit();h.unmount();if(error)gate.reject(Error('old network'));else gate.resolve({id:101,title:'A'});await h.flush();assert.equal(h.lateWrites,0);assert.equal(h.w.events.length,0);assert.equal(session.phase,error?'uncertain':'succeeded');}
});

test('healthy template copy creates and activates one private project with the template graph',async t=>{
  const {w,h}=await projects();t.after(()=>h.unmount());w.api.getCanvasTemplate=async()=>({id:2,title:'B',graph_json:graph(2)});const p=parent(w,h);await p.make().handleUseTemplate(2);await h.flush();assert.equal(h.result.activeProject.id,4);assert.equal(h.result.activeProject.graph_json.nodes[0].id,2);assert.equal(w.calls.filter(c=>c.method==='create').length,1);assert.equal(p.applying,null);assert.ok(p.events.some(e=>e.kind==='ok'&&e.value.includes('B')));
});

test('copy already in createProject cannot activate after publication supersedes its selection intent',async t=>{
  const {w,h}=await projects();t.after(()=>h.unmount());w.api.getCanvasTemplate=async()=>({id:2,title:'B',graph_json:graph(2)});const gate=w.hold('create',0),p=parent(w,h),running=p.make().handleUseTemplate(2);await h.flush();assert.equal(w.calls.filter(c=>c.method==='create').length,1);assert.equal(h.result.loading,true);
  p.sync();await p.make().handlePublishAsTemplate();gate.resolve();await running;await h.flush();assert.equal(h.result.activeProject.id,1);assert.equal(h.result.loading,false);assert.equal(w.records.has(4),true,'accepted copied project remains in storage');assert.equal(p.publishing.source.projectId,1);assert.equal(p.open,true);assert.equal(p.events.some(e=>e.kind==='ok'&&e.value.includes('创建私有项目')),false);
});

test('selecting C while a template copy is being created preserves C and the accepted copied project',async t=>{
  const {w,h}=await projects();t.after(()=>h.unmount());w.api.getCanvasTemplate=async()=>({id:2,title:'B',graph_json:graph(2)});const gate=w.hold('create',0),p=parent(w,h),running=p.make().handleUseTemplate(2);await h.flush();await p.make().handleOpenProject(3);await h.flush();p.sync();const count=p.events.length;gate.resolve();await running;await h.flush();assert.equal(h.result.activeProject.id,3);assert.equal(w.records.has(4),true);assert.equal(p.events.length,count);assert.equal(h.result.loading,false);
});

test('an obsolete GET or failure cannot create another project or release the newer copy busy marker',async t=>{
  const {w,h}=await projects();t.after(()=>h.unmount());const first=deferred(),last=deferred(),queue=[first,last];w.api.getCanvasTemplate=()=>queue.shift().promise;const p=parent(w,h),one=p.make().handleUseTemplate(2),two=p.make().handleUseTemplate(3);assert.equal(p.applying,3);first.reject(Error('old GET failed'));await one;assert.equal(p.applying,3);assert.equal(p.events.filter(e=>e.kind==='error'&&e.value).length,0);
  last.resolve({id:3,title:'C',graph_json:graph(3)});await two;await h.flush();assert.equal(w.calls.filter(c=>c.method==='create').length,1);assert.equal(h.result.activeProject.graph_json.nodes[0].id,3);
});

test('selecting another project or changing account before the GET response invalidates the copy',async t=>{
  for(const changed of ['project','account']){const {w,h}=await projects();t.after(()=>h.unmount());const gate=deferred();w.api.getCanvasTemplate=()=>gate.promise;const p=parent(w,h),running=p.make().handleUseTemplate(2);
    if(changed==='project'){await p.make().handleOpenProject(3);await h.flush();p.sync();}else p.refs.copyNavigationRef.current={ownerId:8,viewKey:'new-user',mounted:true};
    gate.resolve({id:2,title:'B',graph_json:graph(2)});await running;await h.flush();assert.equal(w.calls.filter(c=>c.method==='create').length,0);assert.equal(h.result.activeProject.id,changed==='project'?3:1);
  }
});

test('parent publish reopening after a source change retains the old session and graph until explicitly ended',async t=>{
  const {w,h}=await projects();t.after(()=>h.unmount());const p=parent(w,h);await p.make().handlePublishAsTemplate();const a=p.publishing;p.setOpen(false);await p.make().handleOpenProject(3);await h.flush();p.sync();await p.make().handlePublishAsTemplate();assert.equal(p.publishing,a);assert.equal(a.source.projectId,1);assert.equal(a.source.graph.nodes[0].id,'original-1');assert.equal(p.open,true);
  a.phase='abandoned';p.refs.publishSessionRef.current=null;p.setOpen(false);await p.make().handlePublishAsTemplate();assert.equal(p.publishing.source.projectId,3);assert.equal(p.publishing.source.graph.nodes[0].id,'original-3');
});

function parentDialogProps(p,session){
  const file=ts.createSourceFile('Workspace.tsx',source('CanvasWorkspace.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let node;
  function visit(n){if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(file)==='PublishCanvasTemplateDialog')node=n;ts.forEachChild(n,visit);}visit(file);assert.ok(node);
  const jsx=(type,props)=>({type,props}),deps={PublishCanvasTemplateDialog:()=>null,publishSession:session,publishSessionRef:p.refs.publishSessionRef,publishOpenRef:p.refs.publishOpenRef,copyNavigationRef:p.refs.copyNavigationRef,publishDialogOpen:p.open,setPublishDialogOpen:value=>p.setOpen(value),setPublishSession:value=>p.setPublication(value),setBannerOk:value=>p.events.push({kind:'ok',value}),setBannerError:value=>p.events.push({kind:'error',value}),navigate:url=>p.events.push({kind:'navigate',url})};
  return compile(`export function make(deps){const {${Object.keys(deps).join(',')}}=deps;return (${node.getText(file)}).props;}`,{'react/jsx-runtime':{jsx,jsxs:jsx}}).make(deps);
}

test('actual parent callbacks reject old sessions and A B A view generations while current publication may navigate',async t=>{
  const {w,h}=await projects();t.after(()=>h.unmount());const p=parent(w,h);await p.make().handlePublishAsTemplate();const a=p.publishing,old=parentDialogProps(p,a),b={id:'B',source:{ownerId:7,projectId:3,viewKey:'B-view'},phase:'submitting'};p.setPublication(b);p.setOpen(true);p.refs.copyNavigationRef.current={ownerId:7,viewKey:'B-view',mounted:true};const start=p.events.length;
  old.onCreated({id:101,title:'A'});old.onUpdated({id:101,title:'A'});old.onError('old A failure');old.onClose();assert.equal(p.events.length,start);assert.equal(p.open,true);
  p.setPublication(a);p.refs.copyNavigationRef.current={ownerId:7,viewKey:'new-A-generation',mounted:true};old.onCreated({id:101,title:'A'});assert.equal(p.events.length,start);
  p.setPublication(b);p.refs.copyNavigationRef.current={ownerId:7,viewKey:'B-view',mounted:true};parentDialogProps(p,b).onCreated({id:202,title:'B'});assert.equal(p.events.filter(e=>e.kind==='navigate').length,1);assert.match(p.events.at(-1).url,/202/);
});

test('an uncommitted B render cannot invalidate the still-visible A publication',async t=>{
  const h=dialog(),gate=h.w.hold('create');t.after(()=>h.unmount());h.submit();const b=h.makeSession(2,'B');h.discardedRender({session:b,...h.callbacks('B')});gate.resolve({id:101,title:'A'});await h.flush();
  assert.equal(h.w.events.filter(e=>e.kind==='created').length,1);assert.equal(h.w.events.find(e=>e.kind==='created').tag,'A');assert.equal(b.phase,'editing');
});

test('a user-created project supersedes a pending template GET without creating another copy',async t=>{
  const {w,h}=await projects();t.after(()=>h.unmount());const gate=deferred();w.api.getCanvasTemplate=()=>gate.promise;const p=parent(w,h),running=p.make().handleUseTemplate(2);await p.make().handleCreateProject();await h.flush();p.sync();gate.resolve({id:2,title:'B',graph_json:graph(2)});await running;await h.flush();assert.equal(w.calls.filter(c=>c.method==='create').length,1);assert.equal(h.result.activeProject.title,'未命名工作流');
});

test('copy create completion under another account does not trigger a list refresh for that new account',async t=>{
  const {w,h}=await projects();t.after(()=>h.unmount());w.api.getCanvasTemplate=async()=>({id:2,title:'B',graph_json:graph(2)});const gate=w.hold('create',0),p=parent(w,h),running=p.make().handleUseTemplate(2);await h.flush();const reads=w.calls.filter(c=>c.method==='list').length;
  p.refs.copyNavigationRef.current={ownerId:8,viewKey:'new-account',mounted:true};gate.resolve();await running;await h.flush();assert.equal(w.calls.filter(c=>c.method==='list').length,reads);assert.equal(h.result.activeProject.id,1);
});

test('deleting the selected project invalidates its older template GET before deletion returns',async t=>{
  const {w,h}=await projects();t.after(()=>h.unmount());const read=deferred(),remove=w.hold('delete',1);w.api.getCanvasTemplate=()=>read.promise;const p=parent(w,h),running=p.make().handleUseTemplate(2);
  const file=ts.createSourceFile('Workspace.tsx',source('CanvasWorkspace.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback;
  function visit(n){if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(file)==='CanvasProjectLibrary')callback=n.attributes.properties.find(a=>a.name?.text==='onDelete').initializer.expression;ts.forEachChild(n,visit);}visit(file);assert.ok(callback);
  const definitions=functions(['cancelCopyIntent','handleDeleteProject']);
  const onDelete=compile(`export function make(canvas,api,copyRunRef,setApplyingTemplateId,setBannerError){${definitions}return (${callback.getText(file)});}`).make(h.result,w.api,p.refs.copyRunRef,()=>undefined,()=>undefined);
  onDelete(1);await h.flush();read.resolve({id:2,title:'B',graph_json:graph(2)});await running;assert.equal(w.calls.filter(c=>c.method==='create').length,0);remove.resolve();await h.flush();
});
