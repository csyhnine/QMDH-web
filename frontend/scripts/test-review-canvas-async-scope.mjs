import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source=name=>readFileSync(new URL(`../src/features/canvas/${name}`,import.meta.url),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const node=(id='same',taskId=21,kind='text2img')=>({id,type:'generate',position:{x:0,y:0},data:{kind:'generate',nodeKind:kind,taskId,status:taskId==null?'idle':'pending',assetUrls:[],referenceImages:[],annotationStrokes:[{points:[{x:1,y:1}]}],label:id,prompt:'prompt'}});
const task=(id=21,status='completed',result={storage_path:`output-${id}`})=>({id,status,result,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
function compile(code,imports={},globals={}) { const exports={}; vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Error,AbortController,Date,...globals,require:name=>{if(Object.hasOwn(imports,name))return imports[name];throw Error(`unmocked ${name}`);}});return exports; }
function fixture(startSeed=0){
  let seed=startSeed,timerId=0,storageFails=false;const stored=new Map(),timers=new Map(),getQueue=[],uploadQueue=[],createQueue=[],calls=[];
  const window={localStorage:{get length(){if(storageFails)throw Error('storage off');return stored.size;},key:i=>[...stored.keys()][i]??null,getItem:k=>stored.get(k)??null,setItem(k,v){if(storageFails)throw Error('storage off');stored.set(k,v);},removeItem(k){if(storageFails)throw Error('storage off');stored.delete(k);}},setTimeout(fn,ms){timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),confirm:()=>true};
  const api={async getTask(id){calls.push({kind:'get',id});return getQueue.length?await getQueue.shift().promise:task(id);},async tasks(){calls.push({kind:'list'});return[task()];},async assets(){calls.push({kind:'assets'});return[];},async uploadReferenceImage(payload){calls.push({kind:'upload',payload});return uploadQueue.length?await uploadQueue.shift().promise:{storage_path:'uploaded'};},async createTask(payload){calls.push({kind:'create',payload});return createQueue.length?await createQueue.shift().promise:task(101,'pending');}};
  const ids=compile(source('canvasId.ts'),{},{crypto:{getRandomValues(bytes){bytes.fill(++seed);return bytes;}}});
  const scopeModule=compile(source('canvasAsyncScope.ts'),{'./canvasId':ids},{window});
  const ownership=compile(readFileSync(new URL('../src/lib/promptPolishOwnership.ts',import.meta.url),'utf8'));
  const imports={react:{useRef:value=>({current:value}),useEffect:fn=>fn(),useCallback:fn=>fn},'../../api':{api},'./canvasAsyncScope':scopeModule,
    '../studio/studioConstants':{defaultStudioForm:{projectCode:'QMDH-001'},IMAGE_UPSCALE_WORKFLOW_KEY:'upscale'},'../studio/studioCanvasLinkage':{creationModeForNodeKind:()=> 'image',defaultAspectRatioFor:()=> '1:1',resolveAspectRatioForSurface:()=> '1:1'},'../studio/studioUpscaleActions':{findUpscaleProvider:rows=>rows[0]},'../studio/studioTaskFormUtils':{resolveStudioProviderForForm:rows=>rows[0]},'../studio/studioTaskSubmissionActions':{buildTaskSubmissionPayload:({form})=>({payload:{title:form.title,payload:{prompt:form.prompt}}})},'./canvasGraphUtils':{collectUpstreamDeliverables:()=>({images:[]}),resolveCanvasInputReferenceImages:(own,up)=>own?.length?own:up},'./canvasTypes':{isGenerateNode:n=>n.data.kind==='generate'}};
  const generate=compile(source('useCanvasNodeGenerate.ts'),imports,{window});
  const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
  return{window,api,stored,timers,calls,getQueue,uploadQueue,createQueue,scopeModule,ownership,generate,flush,set storageFails(v){storageFails=v;},async tick(){for(const[id,{fn}]of[...timers]){timers.delete(id);fn();}await flush();}};
}
function variable(name){const file=ts.createSourceFile('CanvasWorkspace.tsx',source('CanvasWorkspace.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(file)===name)found=n.initializer.getText(file);ts.forEachChild(n,visit);}visit(file);assert.ok(found,`${name} actual source`);return found;}
function workspace(w,options={}){
  let board='project:1',owner=7,nodes=[node('same',null,'upload')],banners=[],selected=[],saved=[],applied=[],upstream=['base-image'];const setters=[];
  const nodesRef={get current(){return nodes;},set current(value){nodes=value;}},edgesRef={current:[]},viewportRef={current:{x:0,y:0,zoom:1}};
  const makeScope=()=>{const s=new w.scopeModule.CanvasAsyncScope(owner,board,true,()=>nodes);s.activate();return s;};let scope=makeScope();
  function handlers(){
    const deps={inheritPromptDraft:w.ownership.inheritPromptDraft,window:w.window,useCallback:fn=>fn,asyncScope:scope,asyncBoard:board,currentUser:{id:owner},nodesRef,edgesRef,viewportRef,patchNodeRef:{},isGenerateNode:n=>n?.data.kind==='generate',isDebouncedGeneratePatch:()=>false,isStatusOnlyGeneratePatch:()=>true,armContentHistory(){},flushContentHistorySession(){},history:{push(){}},setNodes(next){if(options.deferredState)setters.push(next);else nodes=typeof next==='function'?next(nodes):next;},persistGraph(ns){saved.push({board,nodes:clone(ns)});},setBannerError:value=>banners.push(value),setSelectedNodeIds:value=>selected.push(value),prepareReferenceUploadFiles:files=>({acceptedFiles:files,errors:[]}),uploadReferenceFiles:async(files,upload)=>Promise.all(files.map(async file=>{const row=await upload(file);return{storagePath:row.storage_path,fileName:file.name};})),api:w.api,nodeDefaults:{},applyGraph(ns){nodes=ns;applied.push({board,nodes:clone(ns)});},createUploadImageNode:(pos,defaults,path,name)=>({...node(`new-${path}`,null,'upload'),position:pos,data:{...node().data,nodeKind:'upload',assetUrls:[path],referenceImages:[path],label:name}}),collectUpstreamDeliverables:()=>({images:upstream}),exportAnnotatedDataUrl:async(...args)=>{options.exportArgs?.push(clone(args));return options.exportGate?await options.exportGate.promise:{fileName:'annotated.png',dataUrl:'data:image/png;base64,eA=='};},canvasNodeInput:w.scopeModule.canvasNodeInput};
    const names=['nodeAsyncInput','patchNode','patchNodeSilent','uploadNodeImage','saveAnnotation','onDropImages','recoverAsyncResult','discardAsyncResult'];
    const declarations=names.map(name=>`const ${name}=${variable(name)};${name==='patchNode'?'patchNodeRef.current=patchNode;':''}`).join('\n');
    return compile(`export function make(deps){const {${Object.keys(deps).join(',')}}=deps;${declarations}return {${names.join(',')}};}`).make(deps);
  }
  return{handlers, get scope(){return scope;},get nodes(){return nodes;},get saved(){return saved;},get applied(){return applied;},get banners(){return banners;},get selected(){return selected;},setNodes(ns){nodes=ns;},setUpstream(value){upstream=value;},flushState(){for(const next of setters.splice(0))nodes=typeof next==='function'?next(nodes):next;},switch(next,nextNodes=[node('same',22,'upload')],nextOwner=owner){scope.dispose();board=next;owner=nextOwner;nodes=nextNodes;scope=makeScope();},dispose(){scope.dispose();}};
}

test('a poll response from A cannot overwrite B with the same node id or save its task id',async t=>{
  const w=fixture();let board='A',nodes=[node()],writes=[];const gate=defer();w.getQueue.push(gate);
  const controller=new AbortController(),observation={signal:controller.signal,current:()=>board==='A'&&nodes[0].data.taskId===21};
  const polling=w.generate.pollTaskUntilDone(21,'same',(id,patch)=>{nodes[0].data={...nodes[0].data,...patch};writes.push({board,patch});},'image',observation);
  board='B';nodes=[node('same',22)];gate.resolve(task());await polling;
  assert.equal(nodes[0].data.taskId,22);assert.deepEqual(nodes[0].data.assetUrls,[]);assert.equal(writes.length,0);
});

test('a drop upload begun in A never adds nodes or changes selection and banners in B',async t=>{
  const w=fixture(),h=workspace(w);t.after(()=>h.dispose());const gate=defer();w.uploadQueue.push(gate);
  const dropping=h.handlers().onDropImages([{name:'one.png'}],{x:2,y:3});h.switch('project:2',[node('different',null,'upload')]);
  gate.resolve({storage_path:'from-A'});await dropping;await w.flush();
  assert.equal(h.nodes.length,1);assert.equal(h.nodes[0].id,'different');assert.equal(h.applied.length,0);assert.equal(h.selected.length,0);assert.equal(h.banners.length,0);
});

function scoped(w,nodes,board='project:1',owner=7){const scope=new w.scopeModule.CanvasAsyncScope(owner,board,true,()=>nodes.current);scope.activate();return scope;}
function taskPatch(scope,nodes,writes){return(id,patch,options)=>{if(!scope.active||options?.isCurrent&&!options.isCurrent())return;nodes.current=nodes.current.map(n=>n.id===id?{...n,data:{...n.data,...patch}}:n);writes.push(clone(patch));};}

test('returning A B A resumes the original task after cancelling the old observer',async t=>{
  const w=fixture(),nodes={current:[node()]},a=scoped(w,nodes),gate=defer(),writes=[];w.getQueue.push(gate);t.after(()=>a.dispose());
  const old=a.observeTask('same',21,c=>w.generate.pollTaskUntilDone(21,'same',taskPatch(a,nodes,writes),'image',c));
  a.dispose();nodes.current=[node('same',22)];gate.resolve(task());await old;assert.equal(writes.length,0);
  nodes.current=[node()];const again=scoped(w,nodes);t.after(()=>again.dispose());
  w.generate.resumeCanvasNodeTaskPolls(nodes.current,taskPatch(again,nodes,writes),again);await w.flush();
  assert.equal(nodes.current[0].data.status,'completed');assert.deepEqual(clone(nodes.current[0].data.assetUrls),['output-21']);
  assert.equal(w.calls.filter(c=>c.kind==='create').length,0);
});

test('replacing a task id prevents its older poll from writing to the same node',async t=>{
  const w=fixture(),nodes={current:[node()]},scope=scoped(w,nodes),gate=defer(),writes=[];t.after(()=>scope.dispose());w.getQueue.push(gate);
  const old=scope.observeTask('same',21,c=>w.generate.pollTaskUntilDone(21,'same',taskPatch(scope,nodes,writes),'image',c));
  nodes.current=[node('same',22)];scope.reconcile();gate.resolve(task());await old;assert.equal(writes.length,0);
  await scope.observeTask('same',22,c=>w.generate.pollTaskUntilDone(22,'same',taskPatch(scope,nodes,writes),'image',c));
  assert.deepEqual(clone(nodes.current[0].data.assetUrls),['output-22']);
});

test('two scopes can observe the same task independently and old cleanup cannot release the new scope',async t=>{
  const w=fixture(),nodesA={current:[node()]},nodesB={current:[node()]},a=scoped(w,nodesA),b=scoped(w,nodesB,'project:2'),ga=defer(),gb=defer(),wa=[],wb=[];
  t.after(()=>{a.dispose();b.dispose();});w.getQueue.push(ga,gb);
  const one=a.observeTask('same',21,c=>w.generate.pollTaskUntilDone(21,'same',taskPatch(a,nodesA,wa),'image',c));
  const two=b.observeTask('same',21,c=>w.generate.pollTaskUntilDone(21,'same',taskPatch(b,nodesB,wb),'image',c));
  assert.equal(w.calls.length,2);a.dispose();ga.reject(Object.assign(Error('401 old'),{status:401}));await one;
  gb.resolve(task());await two;assert.equal(wa.length,0);assert.equal(nodesB.current[0].data.status,'completed');assert.ok(wb.length>0);
});

test('repeated resume in one scope deduplicates the observer without pretending it has completed',async t=>{
  const w=fixture(),nodes={current:[node()]},scope=scoped(w,nodes),gate=defer(),writes=[];t.after(()=>scope.dispose());w.getQueue.push(gate);
  const patch=taskPatch(scope,nodes,writes);w.generate.resumeCanvasNodeTaskPolls(nodes.current,patch,scope);w.generate.resumeCanvasNodeTaskPolls(nodes.current,patch,scope);
  assert.equal(w.calls.length,1);let done=false;const waiting=scope.observeTask('same',21,()=>{throw Error('duplicate observer');}).then(()=>done=true);
  await w.flush();assert.equal(done,false);gate.resolve(task());await waiting;assert.equal(done,true);assert.equal(nodes.current[0].data.status,'completed');
});

test('disposing during polling sleep clears the timer and prevents any further GET',async t=>{
  const w=fixture(),nodes={current:[node()]},scope=scoped(w,nodes),writes=[];w.api.getTask=async id=>{w.calls.push({kind:'get',id});return task(id,'running',null);};
  const waiting=scope.observeTask('same',21,c=>w.generate.pollTaskUntilDone(21,'same',taskPatch(scope,nodes,writes),'image',c));await w.flush();
  assert.equal(w.timers.size,1);const count=w.calls.length;scope.dispose();await waiting;
  assert.equal(w.timers.size,0);await w.tick();assert.equal(w.calls.length,count);
});

test('a late asset-list response cannot write completed paths into another view',async t=>{
  const w=fixture(),nodes={current:[node()]},scope=scoped(w,nodes),assets=defer(),writes=[];t.after(()=>scope.dispose());
  w.api.getTask=async id=>task(id,'completed',{});w.api.assets=async()=>assets.promise;
  const waiting=scope.observeTask('same',21,c=>w.generate.pollTaskUntilDone(21,'same',taskPatch(scope,nodes,writes),'image',c));await w.flush();
  const count=writes.length;scope.dispose();nodes.current=[node('same',22)];assets.resolve([{source_task_id:21,asset_type:'image',storage_path:'old-asset'}]);await waiting;
  assert.equal(writes.length,count);assert.deepEqual(clone(nodes.current[0].data.assetUrls),[]);assert.equal(w.timers.size,0);
});

test('manual sync completion and failure after switching never patch or start a fallback observer',async t=>{
  for(const rejected of [false,true]){const w=fixture(),nodes={current:[node()]},scope=scoped(w,nodes),gate=defer(),writes=[];w.getQueue.push(gate);
    const waiting=w.generate.syncCanvasNodeTask('same',nodes.current[0].data,taskPatch(scope,nodes,writes),scope);scope.dispose();nodes.current=[node('same',22)];
    if(rejected)gate.reject(Object.assign(Error('unauthorized old'),{status:401}));else gate.resolve(task());await waiting;
    assert.equal(writes.length,0);assert.equal(w.calls.length,1);assert.equal(w.timers.size,0);
  }
});

test('a current-view temporary single-task failure falls back to the original task without creating another',async t=>{
  const w=fixture(),nodes={current:[node()]},scope=scoped(w,nodes),bad=defer(),writes=[];t.after(()=>scope.dispose());
  w.getQueue.push(bad);const waiting=w.generate.syncCanvasNodeTask('same',nodes.current[0].data,taskPatch(scope,nodes,writes),scope);bad.reject(Object.assign(Error('401'),{status:401}));await waiting;
  assert.equal(nodes.current[0].data.taskId,21);assert.equal(nodes.current[0].data.status,'completed');assert.equal(w.calls.filter(c=>c.kind==='create').length,0);
});

test('stable node upload applies and clears only its own recovery record',async t=>{
  const w=fixture(),h=workspace(w);t.after(()=>h.dispose());await h.handlers().uploadNodeImage('same',{name:'new.png'});
  assert.deepEqual(clone(h.nodes[0].data.assetUrls),['uploaded']);assert.equal(h.nodes[0].data.status,'completed');assert.equal(w.stored.size,0);assert.equal(h.saved.at(-1).board,'project:1');
});

test('late node upload success or failure cannot change same-id B and the original result remains recoverable',async t=>{
  for(const reject of [false,true]){const w=fixture(),h=workspace(w),gate=defer();t.after(()=>h.dispose());w.uploadQueue.push(gate);
    const old=h.handlers().uploadNodeImage('same',{name:'one.png'});h.switch('project:2');const saves=h.saved.length;
    if(reject)gate.reject(Error('old upload failed'));else gate.resolve({storage_path:'A-image'});await old;
    assert.equal(h.nodes[0].data.taskId,22);assert.deepEqual(clone(h.nodes[0].data.assetUrls),[]);assert.equal(h.saved.length,saves);assert.equal(h.banners.length,0);
    assert.equal(h.scope.recoveries().length,0);h.switch('project:1',[node('same',null,'upload')]);const rows=h.scope.recoveries();assert.equal(rows.length,1);
    assert.equal(rows[0].phase,reject?'failed':'ready');if(!reject){h.handlers().recoverAsyncResult(rows[0]);assert.deepEqual(clone(h.nodes[0].data.assetUrls),['A-image']);assert.equal(w.stored.size,0);}
  }
});

test('a second node upload wins while the older success remains a visible conflict record',async t=>{
  const w=fixture(),h=workspace(w),first=defer(),second=defer();t.after(()=>h.dispose());w.uploadQueue.push(first,second);const handlers=h.handlers();
  const a=handlers.uploadNodeImage('same',{name:'old.png'}),b=handlers.uploadNodeImage('same',{name:'new.png'});second.resolve({storage_path:'new'});await b;first.resolve({storage_path:'old'});await a;
  assert.deepEqual(clone(h.nodes[0].data.assetUrls),['new']);const rows=h.scope.recoveries();assert.equal(rows.length,1);handlers.recoverAsyncResult(rows[0]);
  assert.deepEqual(clone(h.nodes[0].data.assetUrls),['new']);assert.match(h.banners.at(-1),/已变化/);assert.equal(w.stored.size,1);
});

test('queued state updates from an old scope are rechecked after switching',async t=>{
  const w=fixture(),h=workspace(w,{deferredState:true});t.after(()=>h.dispose());await h.handlers().uploadNodeImage('same',{name:'one.png'});
  h.switch('project:2',[node('same',22,'upload')]);const count=h.saved.length;h.flushState();assert.equal(h.nodes[0].data.taskId,22);assert.deepEqual(clone(h.nodes[0].data.assetUrls),[]);assert.equal(h.saved.length,count);
});

test('stable annotation exports its captured base and immutable strokes then applies the upload',async t=>{
  const w=fixture(),args=[],h=workspace(w,{exportArgs:args});t.after(()=>h.dispose());h.setNodes([node('same',null,'annotate')]);await h.handlers().saveAnnotation('same');
  assert.equal(args[0][0],'base-image');assert.deepEqual(clone(h.nodes[0].data.assetUrls),['uploaded']);assert.equal(w.stored.size,0);
});

test('annotation upload completion after A to B same-id switch is retained only for A',async t=>{
  const w=fixture(),h=workspace(w),gate=defer();t.after(()=>h.dispose());h.setNodes([node('same',null,'annotate')]);w.uploadQueue.push(gate);
  const old=h.handlers().saveAnnotation('same');await w.flush();h.switch('project:2',[node('same',22,'annotate')]);const count=h.saved.length;
  gate.resolve({storage_path:'A-annotation'});await old;assert.equal(h.saved.length,count);assert.deepEqual(clone(h.nodes[0].data.assetUrls),[]);assert.equal(h.banners.length,0);
  h.switch('project:1',[node('same',null,'annotate')]);const rows=h.scope.recoveries();assert.equal(rows.length,1);h.handlers().recoverAsyncResult(rows[0]);assert.deepEqual(clone(h.nodes[0].data.assetUrls),['A-annotation']);
});

test('changing annotation strokes or the upstream base during export prevents its stale upload',async t=>{
  for(const changed of ['strokes','base']){const w=fixture(),gate=defer(),h=workspace(w,{exportGate:gate});t.after(()=>h.dispose());h.setNodes([node('same',null,'annotate')]);
    const old=h.handlers().saveAnnotation('same');if(changed==='strokes')h.nodes[0].data.annotationStrokes.push({points:[{x:3,y:3}]});else h.setUpstream(['changed-base']);
    gate.resolve({fileName:'old.png',dataUrl:'old-export'});await old;assert.equal(w.calls.filter(c=>c.kind==='upload').length,0);assert.equal(h.scope.recoveries().length,1);assert.equal(h.scope.recoveries()[0].phase,'failed');
  }
});

test('concurrent stable drops append into the latest graph and preserve each other',async t=>{
  const w=fixture(),h=workspace(w),one=defer(),two=defer();t.after(()=>h.dispose());w.uploadQueue.push(one,two);const handlers=h.handlers();
  const a=handlers.onDropImages([{name:'a.png'}],{x:0,y:0}),b=handlers.onDropImages([{name:'b.png'}],{x:1,y:1});two.resolve({storage_path:'b'});await b;one.resolve({storage_path:'a'});await a;
  assert.deepEqual(h.nodes.map(n=>n.id).sort(),['new-a','new-b','same']);assert.equal(w.stored.size,0);
});

test('a stale drop is explicitly recoverable on A and is never offered to a different owner',async t=>{
  const w=fixture(),h=workspace(w),gate=defer();t.after(()=>h.dispose());w.uploadQueue.push(gate);const old=h.handlers().onDropImages([{name:'a.png'}],{x:0,y:0});
  h.switch('project:2');gate.resolve({storage_path:'a'});await old;h.switch('project:1',[node('same',null,'upload')],8);assert.equal(h.scope.recoveries().length,0);
  h.switch('project:1',[node('same',null,'upload')],7);const rows=h.scope.recoveries();assert.equal(rows.length,1);h.handlers().recoverAsyncResult(rows[0]);assert.equal(h.nodes.length,2);assert.equal(w.stored.size,0);
});

test('storage failure is visible while stale successful uploads remain recoverable in this runtime',async t=>{
  const w=fixture(),h=workspace(w),gate=defer();t.after(()=>h.dispose());w.storageFails=true;w.uploadQueue.push(gate);
  const old=h.handlers().uploadNodeImage('same',{name:'a.png'});assert.match(h.scope.backupError,/备份不可用/);h.switch('project:2');gate.resolve({storage_path:'a'});await old;
  h.switch('project:1',[node('same',null,'upload')]);assert.equal(h.scope.recoveries().length,1);assert.match(h.scope.backupError,/备份不可用/);
});

test('an accepted generation id returned after leaving is journaled for its original node without polling B',async t=>{
  const w=fixture(),h=workspace(w),gate=defer();t.after(()=>h.dispose());h.setNodes([node('same',null)]);w.createQueue.push(gate);
  const run=w.generate.useCanvasNodeGenerate([{provider_name:'offline'}],h.nodes,[],h.handlers().patchNodeSilent,h.scope);
  const old=run('same',h.nodes[0].data);h.switch('project:2',[node('same',22)]);const saves=h.saved.length;gate.resolve(task(101,'pending'));await old;
  assert.equal(h.nodes[0].data.taskId,22);assert.equal(h.saved.length,saves);assert.equal(w.calls.filter(c=>c.kind==='get').length,0);
  h.switch('project:1',[node('same',null)]);const rows=h.scope.recoveries();assert.equal(rows.length,1);assert.equal(rows[0].patch.taskId,101);
  h.handlers().recoverAsyncResult(rows[0]);assert.equal(h.nodes[0].data.taskId,101);w.generate.resumeCanvasNodeTaskPolls(h.nodes,h.handlers().patchNodeSilent,h.scope);await w.flush();
  assert.deepEqual(clone(h.nodes[0].data.assetUrls),['output-101']);assert.equal(w.calls.filter(c=>c.kind==='create').length,1);
});

test('a current generation and upscale both attach their accepted ids and complete within their own scope',async t=>{
  for(const kind of ['text2img','upscale']){const w=fixture(),h=workspace(w);t.after(()=>h.dispose());const n=node('same',null,kind);n.data.referenceImages=['reference'];h.setNodes([n]);
    const run=w.generate.useCanvasNodeGenerate([{provider_name:'offline'}],h.nodes,[],h.handlers().patchNodeSilent,h.scope);await run('same',n.data);
    assert.equal(h.nodes[0].data.taskId,101);assert.equal(h.nodes[0].data.status,'completed');assert.deepEqual(clone(h.nodes[0].data.assetUrls),['output-101']);assert.equal(w.stored.size,0);
  }
});

test('actual scope activation refuses a project loaded under another account and graph loading occurs in layout',()=>{
  const w=fixture(),make=compile(`export function make(useMemo,CanvasAsyncScope,currentUser,asyncBoard,sessionLoading,isTemplateMode,canvas,boardKey,nodesRef,templateEditor={blocked:false}){return ${variable('asyncScope')};}`).make;
  const common=[fn=>fn(),w.scopeModule.CanvasAsyncScope,{id:8},'project:1',false,false];
  const old=make(...common,{activeProject:{id:1},activeOwnerId:7,viewKey:'7:1:1'},1,{current:[node()]});old.activate();assert.equal(old.active,false);
  const current=make(...common,{activeProject:{id:1},activeOwnerId:8,viewKey:'8:1:2'},1,{current:[node()]});current.activate();assert.equal(current.active,true);current.dispose();
  const blocked=make(fn=>fn(),w.scopeModule.CanvasAsyncScope,{id:8},'template:1',false,true,{viewKey:'unused'},'template-view',{current:[node()]},{blocked:true});blocked.activate();assert.equal(blocked.active,false,'unselected template drafts cannot receive async recovery writes');
  const file=ts.createSourceFile('CanvasWorkspace.tsx',source('CanvasWorkspace.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let effect;
  function visit(n){if(ts.isCallExpression(n)&&n.arguments[0]?.getText(file).includes('const graph = graphFromTemplate'))effect=n;ts.forEachChild(n,visit);}visit(file);
  assert.equal(effect.expression.getText(file),'useLayoutEffect');assert.ok(effect.arguments[1].getText(file).includes('canvas.viewKey'));
  assert.ok(variable('asyncScope').includes('canvas.activeOwnerId'));assert.ok(variable('asyncScope').includes('canvas.viewKey'));
});

test('the actual project hook exposes a loaded owner and changes view key only when a view is activated',async t=>{
  const url=new URL('./test-review-canvas-project-save.mjs',import.meta.url),original=readFileSync(url,'utf8'),boundary=original.indexOf('test("normal auto-save debounces');assert.ok(boundary>0);
  const prefix=original.slice(0,boundary).replaceAll('import.meta.url',JSON.stringify(url.href)).replace('from "typescript"',`from ${JSON.stringify(import.meta.resolve('typescript'))}`);
  const {ready}=await import('data:text/javascript;base64,'+Buffer.from(prefix+'\nexport {ready};').toString('base64'));
  const h=await ready();t.after(()=>h.unmount());assert.equal(h.result.activeOwnerId,7);const key=h.result.viewKey;
  h.result.queueSaveGraph({nodes:[{id:'updated'}],edges:[],viewport:{x:0,y:0,zoom:1}});await h.tick();assert.equal(h.result.viewKey,key,'ACK does not create a new loaded view');
  await h.open(1);assert.equal(h.result.activeOwnerId,7);assert.notEqual(h.result.viewKey,key,'same-id reload is a new committed view');
});

test('a successful upload is recoverable in a fresh module from storage alone without another POST',async t=>{
  const first=fixture(),h=workspace(first),gate=defer();first.uploadQueue.push(gate);const old=h.handlers().onDropImages([{name:'old.png'}],{x:2,y:2});
  h.dispose();gate.resolve({storage_path:'persisted-path'});await old;
  const second=fixture(100);for(const[k,v]of first.stored)second.stored.set(k,v);const reopened=workspace(second);t.after(()=>reopened.dispose());
  const rows=reopened.scope.recoveries();assert.equal(rows.length,1);reopened.handlers().recoverAsyncResult(rows[0]);
  assert.ok(reopened.nodes.some(n=>n.data.assetUrls.includes('persisted-path')));assert.equal(second.calls.length,0);assert.equal(second.stored.size,0);
});

test('bad JSON or malformed recovery media metadata is preserved without breaking valid records',()=>{
  const w=fixture(),h=workspace(w);const prefix='qmdh:canvas-async:v1:7:project:1:';
  w.stored.set(prefix+'broken','{broken');w.stored.set(prefix+'wrong',JSON.stringify({version:1,id:'wrong',ownerId:7,board:'project:1',session:'old',updatedAt:1,kind:'upload',input:'old',phase:'ready',patch:{assetUrls:'bad-array'}}));
  assert.equal(h.scope.recoveries().length,0);assert.equal(w.stored.size,2);assert.match(h.scope.backupError,/无法读取/);h.dispose();
});

test('late annotation and drop failures never change B banners or content and remain attributed to A',async t=>{
  for(const kind of ['annotate','drop']){const w=fixture(),h=workspace(w),gate=defer();t.after(()=>h.dispose());h.setNodes([node('same',null,'annotate')]);w.uploadQueue.push(gate);
    const handlers=h.handlers(),old=kind==='annotate'?handlers.saveAnnotation('same'):handlers.onDropImages([{name:'a.png'}],{x:0,y:0});await w.flush();
    h.switch('project:2',[node('same',22,'annotate')]);const count=h.saved.length;gate.reject(Error('original failed'));await old;
    assert.equal(h.banners.length,0);assert.equal(h.saved.length,count);assert.equal(h.nodes[0].data.taskId,22);
    h.switch('project:1',[node('same',null,'annotate')]);assert.equal(h.scope.recoveries()[0].phase,'failed');
  }
});

test('removing the original node during upload preserves its path but refuses recovery onto a different node',async t=>{
  const w=fixture(),h=workspace(w),gate=defer();t.after(()=>h.dispose());w.uploadQueue.push(gate);const old=h.handlers().uploadNodeImage('same',{name:'a.png'});
  h.setNodes([node('different',null,'upload')]);gate.resolve({storage_path:'original-path'});await old;assert.equal(h.nodes[0].id,'different');
  const rows=h.scope.recoveries();assert.equal(rows.length,1);h.handlers().recoverAsyncResult(rows[0]);assert.match(h.banners.at(-1),/已变化/);assert.equal(w.stored.size,1);
});

test('the current source failure is visible and no accepted task is recreated',async t=>{
  const w=fixture(),h=workspace(w);t.after(()=>h.dispose());h.setNodes([node('same',21)]);
  w.api.getTask=async id=>task(id,'failed',{error:'original failure'});
  await h.scope.observeTask('same',21,c=>w.generate.pollTaskUntilDone(21,'same',h.handlers().patchNodeSilent,'image',c));
  assert.equal(h.nodes[0].data.status,'failed');assert.equal(h.nodes[0].data.errorMessage,'original failure');assert.equal(h.nodes[0].data.taskId,21);
  assert.equal(w.calls.filter(c=>c.kind==='create').length,0);
});

test('returning A receives a late original result notification while B has no notification or automatic replay',async t=>{
  const w=fixture(),h=workspace(w),gate=defer();t.after(()=>h.dispose());w.uploadQueue.push(gate);const old=h.handlers().onDropImages([{name:'a.png'}],{x:0,y:0});
  h.switch('project:2');let b=0,a=0;const stopB=w.scopeModule.subscribeCanvasAsync(7,'project:2',()=>b++);
  h.switch('project:1',[node('same',null,'upload')]);const stopA=w.scopeModule.subscribeCanvasAsync(7,'project:1',()=>a++);t.after(()=>{stopA();stopB();});
  gate.resolve({storage_path:'late-original'});await old;assert.equal(b,0);assert.ok(a>0);assert.equal(h.nodes.length,1);assert.equal(h.scope.recoveries().length,1);assert.equal(w.calls.filter(c=>c.kind==='upload').length,1);
});

test('the actual recovery button explicitly restores its local record without another upload',async t=>{
  const w=fixture(),h=workspace(w),gate=defer();t.after(()=>h.dispose());w.uploadQueue.push(gate);const old=h.handlers().onDropImages([{name:'a.png'}],{x:0,y:0});h.switch('project:2');gate.resolve({storage_path:'recover'});await old;
  h.switch('project:1',[node('same',null,'upload')]);const row=h.scope.recoveries()[0],handlers=h.handlers();
  const file=ts.createSourceFile('CanvasWorkspace.tsx',source('CanvasWorkspace.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let restore;
  function visit(n){if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(file)==='button'&&n.children.some(c=>ts.isJsxText(c)&&c.text==='核对后恢复到原画布'))restore=n;ts.forEachChild(n,visit);}visit(file);assert.ok(restore);
  const jsx=(type,props)=>({type,props}),ui=compile(`export function make(record,recoverAsyncResult,sessionLoading=false){return (${restore.getText(file)});}`,{'react/jsx-runtime':{jsx,jsxs:jsx}});
  const button=ui.make(row,handlers.recoverAsyncResult);assert.equal(button.props.disabled,false);assert.equal(h.nodes.length,1);button.props.onClick();assert.equal(h.nodes.length,2);assert.equal(w.stored.size,0);
});

test('changing the node kind while keeping its task id invalidates the old observation',async t=>{
  const w=fixture(),nodes={current:[node()]},scope=scoped(w,nodes),gate=defer(),writes=[];t.after(()=>scope.dispose());w.getQueue.push(gate);
  const waiting=scope.observeTask('same',21,c=>w.generate.pollTaskUntilDone(21,'same',taskPatch(scope,nodes,writes),'image',c));
  nodes.current=[node('same',21,'annotate')];gate.resolve(task());await waiting;
  assert.equal(writes.length,0);assert.equal(nodes.current[0].data.nodeKind,'annotate');assert.deepEqual(clone(nodes.current[0].data.assetUrls),[]);
});

test('the actual discard button removes only the selected record without deleting any media or cancelling tasks',async t=>{
  const w=fixture(),h=workspace(w),one=defer(),two=defer();t.after(()=>h.dispose());w.uploadQueue.push(one,two);const callbacks=h.handlers();
  const a=callbacks.onDropImages([{name:'a.png'}],{x:0,y:0}),b=callbacks.onDropImages([{name:'b.png'}],{x:2,y:2});h.switch('project:2');one.resolve({storage_path:'a'});two.resolve({storage_path:'b'});await Promise.all([a,b]);
  h.switch('project:1',[node('same',null,'upload')]);const rows=h.scope.recoveries();assert.equal(rows.length,2);
  const file=ts.createSourceFile('CanvasWorkspace.tsx',source('CanvasWorkspace.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let button;
  function visit(n){if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(file)==='button'&&n.children.some(c=>ts.isJsxText(c)&&c.text==='放弃这条本地恢复记录'))button=n;ts.forEachChild(n,visit);}visit(file);assert.ok(button);
  const jsx=(type,props)=>({type,props}),ui=compile(`export function make(record,discardAsyncResult){return (${button.getText(file)});}`,{'react/jsx-runtime':{jsx,jsxs:jsx}});
  const calls=w.calls.length;ui.make(rows[0],h.handlers().discardAsyncResult).props.onClick();assert.equal(h.scope.recoveries().length,1);assert.equal(h.scope.recoveries()[0].id,rows[1].id);
  assert.equal(w.calls.length,calls);assert.equal(h.nodes.length,1);
});

test('recovering a successful source upload clears its older failure message',async t=>{
  const w=fixture(),h=workspace(w),gate=defer();t.after(()=>h.dispose());w.uploadQueue.push(gate);const old=h.handlers().uploadNodeImage('same',{name:'a.png'});
  h.switch('project:2');gate.resolve({storage_path:'a'});await old;const original=node('same',null,'upload');original.data.status='failed';original.data.errorMessage='previous error';h.switch('project:1',[original]);
  h.handlers().recoverAsyncResult(h.scope.recoveries()[0]);assert.equal(h.nodes[0].data.status,'completed');assert.equal(h.nodes[0].data.errorMessage,undefined);
});
