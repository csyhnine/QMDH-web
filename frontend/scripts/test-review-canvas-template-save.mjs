import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source=name=>readFileSync(new URL(`../src/features/canvas/${name}`,import.meta.url),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const graph=id=>({version:1,nodes:[{id,type:'note',position:{x:0,y:0},data:{kind:'note',label:id,body:id}}],edges:[],viewport:{x:0,y:0,zoom:1}});
const record=(id,extra={})=>({id,title:`template-${id}`,graph_json:graph(`server-${id}`),updated_at:'original',created_at:'original',description:'',category:'',is_featured:false,preview_image_path:'',...extra});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function compile(code,imports={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Error,TypeError,structuredClone,...globals,require(name){if(Object.hasOwn(imports,name))return imports[name];throw Error(`Unstubbed import: ${name}`);}});return exports;}
function world(){
  const saved=new Map(),records=new Map([1,2,3].map(id=>[id,record(id)])),calls=[],gates=new Map();let nextId=0,storageFails=false;
  const storage={get length(){if(storageFails)throw Error('storage unavailable');return saved.size;},key(i){return [...saved.keys()][i]??null;},getItem(k){if(storageFails)throw Error('storage unavailable');return saved.get(k)??null;},setItem(k,v){if(storageFails)throw Error('storage unavailable');saved.set(k,v);},removeItem(k){if(storageFails)throw Error('storage unavailable');saved.delete(k);}};
  async function invoke(kind,id,payload){calls.push({kind,id,payload:payload?clone(payload):undefined});const queue=gates.get(`${kind}:${id}`),gate=queue?.shift();const reply=gate?await gate.promise:undefined;
    if(kind==='get')return clone(reply??records.get(id));const updated={...records.get(id),...clone(payload),updated_at:`saved-${calls.length}`};records.set(id,updated);return clone(reply??updated);
  }
  return{saved,records,calls,storage,api:{getCanvasTemplate:id=>invoke('get',id),updateAdminCanvasTemplate:(id,p)=>invoke('patch',id,p)},crypto:{getRandomValues(bytes){bytes.fill(++nextId);return bytes;}},set storageFails(v){storageFails=v;},hold(kind,id){const key=`${kind}:${id}`,gate=deferred();if(!gates.has(key))gates.set(key,[]);gates.get(key).push(gate);return gate;},writes(){return calls.filter(c=>c.kind==='patch');}};
}
function harness(w=world(),id=1,owner=7){
  let cursor=0,dirty=false,mounted=true,result,lateWrites=0,timerId=0;const slots=[],updates=[],effects=[],timers=new Map(),listeners=new Map();
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>{if(!mounted){lateWrites++;return;}updates.push({i,next});dirty=true;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useCallback(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={deps,fn};return slots[i].fn;},useEffect(create,deps){const i=cursor++,old=slots[i];if(!old||!deps||deps.some((v,j)=>!Object.is(v,old.deps[j]))){const next={deps};slots[i]=next;effects.push(()=>{old?.cleanup?.();next.cleanup=create();});}}};
  react.useMemo=(create,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={deps,value:create()};return slots[i].value;};react.useLayoutEffect=react.useEffect;
  const window={localStorage:w.storage,sessionStorage:w.storage,confirm:()=>true,setTimeout(fn,delay){timers.set(++timerId,{fn,delay});return timerId;},clearTimeout(i){timers.delete(i);},addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener(name,fn){listeners.get(name)?.delete(fn);}};
  const imports={react,'../../api':{api:w.api},'./canvasGraphUtils':{parseCanvasGraph:clone},'./canvasTypes':{emptyCanvasGraph:()=>({version:1,nodes:[],edges:[],viewport:{x:0,y:0,zoom:1}})},'./canvasId':compile(source('canvasId.ts'),{},{crypto:w.crypto})};
  if(existsSync(new URL('../src/features/canvas/canvasTemplateDrafts.ts',import.meta.url))){w.draftModule??=compile(source('canvasTemplateDrafts.ts'),{'./canvasId':imports['./canvasId']},{window});imports['./canvasTemplateDrafts']=w.draftModule;}
  const hook=compile(source('useCanvasTemplateEditor.ts'),imports,{window}).useCanvasTemplateEditor;
  function commit(){if(!mounted)return;for(let pass=0;pass<30;pass++){for(const{i,next}of updates.splice(0))slots[i]=typeof next==='function'?next(slots[i]):next;cursor=0;dirty=false;result=hook(id,owner);effects.splice(0).forEach(fn=>fn());if(!dirty)return;}throw Error('Hook did not settle');}
  async function flush(){for(let i=0;i<45;i++){await Promise.resolve();if(dirty&&mounted)commit();}}
  commit();return{w,window,commit,flush,discardedRender(nextId){const oldId=id,before=slots.slice(),effectCount=effects.length;id=nextId;cursor=0;hook(id,owner);effects.length=effectCount;slots.length=0;slots.push(...before);id=oldId;},get result(){return result;},get lateWrites(){return lateWrites;},get timerCount(){return timers.size;},async switch(next,nextOwner=owner){id=next;owner=nextOwner;commit();await flush();},queue(g){result.queueSaveGraph(g);commit();},async tick(ms=700){for(const[i,timer]of[...timers]){if(timer.delay<=ms){timers.delete(i);timer.fn();}else timer.delay-=ms;}await flush();},unmount(){if(!mounted)return;mounted=false;slots.forEach(slot=>slot?.cleanup?.());},beforeUnload(){const e={prevented:false,returnValue:undefined,preventDefault(){this.prevented=true;}};for(const fn of listeners.get('beforeunload')??[])fn(e);return e;}};
}
async function ready(w=world(),id=1,owner=7){const h=harness(w,id,owner);await h.flush();return h;}
const nodeId=record=>record.graph_json.nodes[0]?.id;

test('a graph queued less than 700ms before unmount remains recoverable without a cleanup PATCH',async t=>{
  const h=await ready();t.after(()=>h.unmount());h.queue(graph('pending-before-exit'));h.unmount();assert.equal(h.w.writes().length,0);assert.ok(h.w.saved.size>0,'pending graph must have a durable local backup');assert.ok([...h.w.saved.values()].some(raw=>raw.includes('pending-before-exit')));
});

test('late rename A cannot rebind the current B template or redirect its next graph PATCH',async t=>{
  const h=await ready();t.after(()=>h.unmount());const gate=h.w.hold('patch',1),rename=h.result.renameTitle('renamed A');await h.flush();await h.switch(2);gate.resolve();await rename;await h.flush();assert.equal(h.result.template.id,2);h.queue(graph('B graph'));await h.tick();assert.equal(h.w.writes().at(-1).id,2);assert.equal(nodeId(h.w.records.get(2)),'B graph');
});

test('normal debounce snapshots immutable graph data and marks pending before the 700ms timer',async t=>{
  const h=await ready();t.after(()=>h.unmount());const draft=graph('submitted');h.queue(draft);draft.nodes[0].id='mutated outside';assert.equal(h.result.hasUnsavedChanges,true);assert.equal(h.result.statusLabel,'未同步');assert.equal(h.beforeUnload().prevented,true);await h.tick(699);assert.equal(h.w.writes().length,0);await h.tick(1);assert.equal(nodeId(h.w.records.get(1)),'submitted');assert.equal(h.result.hasUnsavedChanges,false);assert.equal(h.result.statusLabel,'已同步');assert.equal(h.w.saved.size,0);
});

test('explicit leave before debounce drains the graph and waits for server confirmation exactly once',async t=>{
  const h=await ready();t.after(()=>h.unmount());const gate=h.w.hold('patch',1);let exits=0;h.queue(graph('leave-now'));const leaving=h.result.leave(()=>exits++);await h.flush();assert.equal(h.w.writes().length,1);assert.equal(exits,0);assert.equal(h.result.saving,true);assert.equal(await h.result.leave(()=>exits++),false);gate.resolve();assert.equal(await leaving,true);assert.equal(exits,1);assert.equal(nodeId(h.w.records.get(1)),'leave-now');assert.equal(h.w.saved.size,0);
});

test('ordinary rejection blocks leave but retains the graph and allows an explicit corrected retry',async t=>{
  const h=await ready();t.after(()=>h.unmount());const gate=h.w.hold('patch',1);let exits=0;h.queue(graph('rejected'));const leaving=h.result.leave(()=>exits++);await h.flush();gate.reject(Object.assign(Error('ordinary refusal'),{status:422}));assert.equal(await leaving,false);await h.flush();assert.equal(exits,0);assert.equal(h.result.phase,'rejected');assert.equal(nodeId(h.result.template),'rejected');assert.ok(h.w.saved.size>0);h.queue(graph('corrected'));await h.tick();assert.equal(h.w.writes().length,1,'edits after rejection do not retry by themselves');assert.equal(await h.result.leave(()=>exits++),true);assert.equal(nodeId(h.w.records.get(1)),'corrected');assert.equal(exits,1);
});

test('permanent failure still permits leaving with the existing durable draft',async t=>{
  const h=await ready();t.after(()=>h.unmount());const gate=h.w.hold('patch',1);h.queue(graph('keep-for-later'));await h.tick();gate.reject(Object.assign(Error('persistent refusal'),{status:400}));await h.flush();let exits=0;assert.equal(h.result.leaveWithDraft(()=>exits++),true);assert.equal(exits,1);assert.ok([...h.w.saved.values()].some(v=>v.includes('keep-for-later')));assert.equal(h.w.writes().length,1);
});

test('explicit local discard can exit a pending request without a later callback exiting twice',async t=>{
  const h=await ready();t.after(()=>h.unmount());const gate=h.w.hold('patch',1);let exits=0;h.queue(graph('abandoned'));const leaving=h.result.leave(()=>exits++);await h.flush();assert.equal(h.result.discardAndLeave(()=>exits++),true);assert.equal(exits,1);assert.equal(h.w.saved.size,0);gate.resolve();await leaving;await h.flush();assert.equal(exits,1);assert.equal(h.w.writes().length,1);
});

test('return drains a newer graph queued while the previous version is in flight',async t=>{
  const h=await ready();t.after(()=>h.unmount());const gate=h.w.hold('patch',1);h.queue(graph('first'));await h.tick();h.queue(graph('latest'));let exits=0;const leaving=h.result.leave(()=>exits++);gate.resolve();await leaving;await h.flush();assert.equal(h.w.writes().length,2);assert.equal(nodeId(h.w.records.get(1)),'latest');assert.equal(exits,1);assert.equal(h.w.saved.size,0);
});

test('network unknown pauses further automatic graph and title writes until read-only inspection and manual confirmation',async t=>{
  const h=await ready();t.after(()=>h.unmount());const gate=h.w.hold('patch',1);h.queue(graph('uncertain-first'));await h.tick();gate.reject(Error('network disappeared'));await h.flush();assert.equal(h.result.phase,'uncertain');h.queue(graph('newer-local'));await h.tick();await assert.rejects(h.result.renameTitle('local title'));await h.flush();assert.equal(h.w.writes().length,1);assert.equal(h.result.template.title,'local title');assert.equal(nodeId(h.result.template),'newer-local');await h.result.inspectServer();await h.flush();assert.equal(h.w.writes().length,1);assert.equal(nodeId(h.result.template),'newer-local');await h.result.confirmInspectedSave();await h.flush();assert.equal(h.w.writes().length,2);assert.equal(nodeId(h.w.records.get(1)),'newer-local');assert.equal(h.w.records.get(1).title,'local title');assert.equal(h.result.statusLabel,'已同步');
});

test('server failures timeout and mismatched success versions remain uncertain without automatic replay',async t=>{
  for(const failure of [Object.assign(Error('server'),{status:500}),Object.assign(Error('timeout'),{status:408}),record(2),record(1,{graph_json:graph('wrong response')})]){const h=await ready();t.after(()=>h.unmount());const gate=h.w.hold('patch',1);h.queue(graph('desired'));await h.tick();if(failure instanceof Error)gate.reject(failure);else gate.resolve(failure);await h.flush();assert.equal(h.result.phase,'uncertain');h.queue(graph('new desired'));await h.tick();assert.equal(h.w.writes().length,1);assert.equal(nodeId(h.result.template),'new desired');}
});

test('remount shows recovery options and never automatically posts the stored graph',async t=>{
  const w=world(),first=await ready(w);first.queue(graph('recover-after-close'));first.unmount();const second=await ready(w);t.after(()=>second.unmount());assert.equal(second.result.phase,'recovery');assert.equal(nodeId(second.result.template),'server-1');assert.equal(second.result.recoveryDrafts.length,1);assert.equal(second.w.writes().length,0);second.result.restoreDraft(second.result.recoveryDrafts[0].draftId);await second.flush();assert.equal(nodeId(second.result.template),'recover-after-close');assert.equal(second.result.phase,'restored');await second.tick();assert.equal(w.writes().length,0);await second.result.inspectServer();await second.flush();await second.result.confirmInspectedSave();await second.flush();assert.equal(nodeId(w.records.get(1)),'recover-after-close');assert.equal(w.saved.size,0);
});

test('a changed server creates a visible conflict and restore never overwrites it without confirmation',async t=>{
  const w=world(),first=await ready(w);first.queue(graph('local-conflict'));first.unmount();w.records.set(1,record(1,{graph_json:graph('other-client')}));const h=await ready(w);t.after(()=>h.unmount());h.result.restoreDraft(h.result.recoveryDrafts[0].draftId);await h.flush();assert.equal(h.result.phase,'conflict');assert.equal(nodeId(h.result.template),'local-conflict');await assert.rejects(h.result.flushSave());await h.flush();assert.equal(nodeId(w.records.get(1)),'other-client');assert.equal(w.writes().length,0);await h.result.inspectServer();await h.flush();assert.equal(nodeId(h.result.inspection),'other-client');await h.result.confirmInspectedSave();await h.flush();assert.equal(nodeId(w.records.get(1)),'local-conflict');
});

test('switch before debounce preserves A separately while B edits go only to B',async t=>{
  const h=await ready();t.after(()=>h.unmount());h.queue(graph('A pending'));await h.switch(2);h.queue(graph('B pending'));await h.tick();assert.equal(h.w.writes().length,1);assert.equal(h.w.writes()[0].id,2);assert.equal(nodeId(h.w.records.get(1)),'server-1');assert.ok([...h.w.saved.values()].some(v=>v.includes('A pending')));await h.switch(1);assert.equal(h.result.phase,'recovery');h.result.restoreDraft(h.result.recoveryDrafts[0].draftId);await h.flush();assert.equal(nodeId(h.result.template),'A pending');
});

test('late A success and finally cannot clear pending B or its error state',async t=>{
  const h=await ready();t.after(()=>h.unmount());const a=h.w.hold('patch',1),b=h.w.hold('patch',2);h.queue(graph('A'));await h.tick();await h.switch(2);h.queue(graph('B'));await h.tick();a.resolve();await h.flush();assert.equal(h.result.template.id,2);assert.equal(nodeId(h.result.template),'B');assert.equal(h.result.saving,true);b.reject(Object.assign(Error('B refusal'),{status:400}));await h.flush();assert.match(h.result.error,/B refusal/);assert.equal(h.result.phase,'rejected');
});

test('late A rename failure cannot display an error in B or clear its graph',async t=>{
  const h=await ready();t.after(()=>h.unmount());const gate=h.w.hold('patch',1),renaming=h.result.renameTitle('A late').catch(()=>undefined);await h.flush();await h.switch(2);h.queue(graph('B latest'));gate.reject(Object.assign(Error('A obsolete error'),{status:400}));await renaming;await h.flush();assert.equal(h.result.template.id,2);assert.equal(nodeId(h.result.template),'B latest');assert.doesNotMatch(h.result.error,/A obsolete error/);
});

test('A B A reentry rejects old callbacks and preserves the selected recovery view',async t=>{
  const h=await ready();t.after(()=>h.unmount());const gate=h.w.hold('patch',1),oldQueue=h.result.queueSaveGraph,rename=h.result.renameTitle('old A').catch(()=>undefined);await h.flush();await h.switch(2);await h.switch(1);const key=h.result.viewKey;oldQueue(graph('stale A callback'));gate.resolve();await rename;await h.flush();assert.equal(h.result.viewKey,key);assert.equal(h.result.phase,'recovery');assert.notEqual(nodeId(h.result.template),'stale A callback');
});

test('rename response cannot replace a newer graph and serialized graph save retains the title',async t=>{
  const h=await ready();t.after(()=>h.unmount());const first=h.w.hold('patch',1),second=h.w.hold('patch',1);const rename=h.result.renameTitle('new title');await h.flush();h.queue(graph('new graph'));first.resolve();await h.flush();assert.equal(h.w.writes().length,2);assert.equal(nodeId(h.result.template),'new graph');assert.equal(h.result.template.title,'new title');assert.equal(h.result.saving,true);second.resolve();await rename;await h.flush();assert.equal(nodeId(h.w.records.get(1)),'new graph');assert.equal(h.w.records.get(1).title,'new title');
});

test('graph save and two title changes are serialized and latest title remains current',async t=>{
  const h=await ready();t.after(()=>h.unmount());const gate=h.w.hold('patch',1);h.queue(graph('graph-first'));await h.tick();const a=h.result.renameTitle('title one'),b=h.result.renameTitle('title two');await h.flush();assert.equal(h.w.writes().length,1);gate.resolve();await Promise.all([a,b]);await h.flush();assert.equal(h.result.template.title,'title two');assert.equal(h.w.records.get(1).title,'title two');assert.equal(nodeId(h.result.template),'graph-first');assert.equal(h.w.writes().length,2);
});

test('remount serializes its restored revision behind the previous instance and old ack cannot delete its backup',async t=>{
  const w=world(),old=await ready(w),first=w.hold('patch',1),second=w.hold('patch',1);old.queue(graph('old-inflight'));await old.tick();old.queue(graph('new backup'));old.unmount();const h=await ready(w);t.after(()=>h.unmount());h.result.restoreDraft(h.result.recoveryDrafts[0].draftId);await h.flush();await h.result.inspectServer();await h.flush();const saving=h.result.confirmInspectedSave();await h.flush();assert.equal(w.writes().length,1);first.resolve();await h.flush();assert.equal(w.writes().length,2);assert.ok([...w.saved.values()].some(v=>v.includes('new backup')));second.resolve();await saving;await h.flush();assert.equal(nodeId(w.records.get(1)),'new backup');assert.equal(w.saved.size,0);assert.equal(old.lateWrites,0);
});

test('unknown failure in the previous instance propagates without issuing a remount replay',async t=>{
  const w=world(),old=await ready(w),gate=w.hold('patch',1);old.queue(graph('old'));await old.tick();old.unmount();const h=await ready(w);t.after(()=>h.unmount());h.result.restoreDraft(h.result.recoveryDrafts[0].draftId);await h.flush();await h.result.inspectServer();await h.flush();const save=h.result.confirmInspectedSave().catch(()=>undefined);gate.reject(Error('unknown original'));await save;await h.flush();assert.equal(w.writes().length,1);assert.equal(h.result.phase,'uncertain');assert.ok(w.saved.size>0);assert.equal(old.lateWrites,0);
});

test('storage failure is visible and prevents claiming that an unsent draft was backed up on leave',async t=>{
  const h=await ready();t.after(()=>h.unmount());h.w.storageFails=true;h.queue(graph('memory only'));assert.match(h.result.backupError,/备份不可用/);let exits=0;assert.equal(h.result.leaveWithDraft(()=>exits++),false);assert.equal(exits,0);assert.equal(h.beforeUnload().prevented,true);assert.equal(await h.result.leave(()=>exits++),true);assert.equal(exits,1);assert.equal(nodeId(h.w.records.get(1)),'memory only');
});

test('corrupt backup stays untouched while valid records and server data remain usable',async t=>{
  const w=world();w.saved.set('qmdh:canvas-template-draft:v1:7:1:corrupt','{broken');const h=await ready(w);t.after(()=>h.unmount());assert.match(h.result.backupError,/无法读取/);assert.equal(h.result.template.id,1);assert.equal(w.saved.values().next().value,'{broken');h.queue(graph('separate good draft'));assert.equal(w.saved.size,2);await h.tick();assert.equal(w.saved.size,1);assert.equal(w.saved.values().next().value,'{broken');
});

test('separate owners and separate draft sessions never overwrite or recover each others backup',async t=>{
  const w=world(),a=await ready(w,1,7);a.queue(graph('owner-seven'));a.unmount();const b=await ready(w,1,8);t.after(()=>b.unmount());assert.equal(b.result.recoveryDrafts.length,0);b.queue(graph('owner-eight'));b.unmount();const c=await ready(w,1,7);t.after(()=>c.unmount());assert.equal(c.result.recoveryDrafts.length,1);assert.ok(JSON.stringify(c.result.recoveryDrafts).includes('owner-seven'));assert.ok(!JSON.stringify(c.result.recoveryDrafts).includes('owner-eight'));assert.equal(w.saved.size,2);
});

test('unmount before save error or success never writes state after cleanup',async t=>{
  for(const succeed of [true,false]){const h=await ready();t.after(()=>h.unmount());const gate=h.w.hold('patch',1);h.queue(graph('leaving-inflight'));await h.tick();h.unmount();if(succeed)gate.resolve();else gate.reject(Error('late failure'));await h.flush();assert.equal(h.lateWrites,0);if(!succeed)assert.ok(h.w.saved.size>0);}
});

test('out of order inspection success or failure cannot replace the latest inspected server snapshot',async t=>{
  const h=await ready();t.after(()=>h.unmount());const save=h.w.hold('patch',1);h.queue(graph('unknown'));await h.tick();save.reject(Error('network'));await h.flush();const first=h.w.hold('get',1),last=h.w.hold('get',1),one=h.result.inspectServer(),two=h.result.inspectServer();last.resolve(record(1,{title:'latest inspected'}));await two;await h.flush();first.reject(Error('obsolete inspection failure'));await one;await h.flush();assert.equal(h.result.inspection.title,'latest inspected');assert.doesNotMatch(h.result.error,/obsolete inspection failure/);assert.equal(h.w.writes().length,1);
});

function workspaceButton(label,editor,onExit,draft){const file=ts.createSourceFile('CanvasWorkspace.tsx',source('CanvasWorkspace.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;function visit(node){if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(file)==='button'&&node.children.some(c=>ts.isJsxText(c)&&c.text.trim()===label))found=node;ts.forEachChild(node,visit);}visit(file);assert.ok(found,`actual ${label} button exists`);const jsx=(type,props)=>({type,props});return compile(`export function make(templateEditor,onExit,draft,sessionLoading=false){return (${found.getText(file)});}`,{'react/jsx-runtime':{jsx,jsxs:jsx}}).make(editor,onExit,draft);}

test('both actual workspace return buttons wait for the queued template PATCH',async t=>{
  for(const label of ['返回','返回模板库']){const h=await ready();t.after(()=>h.unmount());const gate=h.w.hold('patch',1);let exits=0;h.queue(graph('actual back'));const button=workspaceButton(label,h.result,()=>exits++);button.props.onClick();await h.flush();assert.equal(exits,0);assert.equal(h.w.writes().length,1);gate.resolve();await h.flush();assert.equal(exits,1);assert.equal(nodeId(h.w.records.get(1)),'actual back');}
});

test('actual keep-draft and discard return controls retain or remove only the selected local draft',async t=>{
  for(const label of ['保留本地草稿并离开','放弃本地草稿并返回']){const h=await ready();t.after(()=>h.unmount());h.queue(graph('actual local choice'));let exits=0;const button=workspaceButton(label,h.result,()=>exits++);button.props.onClick();await h.flush();assert.equal(exits,1);assert.equal(h.w.saved.size,label.startsWith('保留')?1:0);assert.equal(h.w.writes().length,0);}
});

test('late load error cannot change another template loading state or data',async t=>{
  const w=world(),a=w.hold('get',1),h=harness(w);t.after(()=>h.unmount());await h.switch(2);a.reject(Error('old A read'));await h.flush();assert.equal(h.result.template.id,2);assert.equal(h.result.loading,false);assert.doesNotMatch(h.result.error,/old A read/);
});

test('a stale graph callback after owner or template switch never writes to the current target',async t=>{
  const h=await ready();t.after(()=>h.unmount());const old=h.result.queueSaveGraph;await h.switch(2,8);old(graph('wrong target'));await h.tick();assert.equal(h.w.writes().length,0);assert.equal(h.result.template.id,2);
});

test('template mode disabled creates no draft API or timer side effects',async t=>{
  const h=await ready(world(),null);t.after(()=>h.unmount());h.queue(graph('ignored'));await h.tick();assert.equal(h.w.calls.length,0);assert.equal(h.w.saved.size,0);assert.equal(h.timerCount,0);
});

test('reopening with a fresh module and only localStorage still recovers the graph without a replay',async t=>{
  const old=await ready();old.queue(graph('after-browser-close'));const backup=[...old.w.saved];old.unmount();const w=world();w.crypto=crypto;for(const[k,v]of backup)w.saved.set(k,v);const h=await ready(w);t.after(()=>h.unmount());assert.equal(h.result.recoveryDrafts.length,1);h.result.restoreDraft(h.result.recoveryDrafts[0].draftId);await h.flush();assert.equal(nodeId(h.result.template),'after-browser-close');assert.equal(w.writes().length,0);assert.ok(w.saved.size>0);
});

test('a backup already matching the server is recoverable without falsely labeling a version conflict',async t=>{
  const w=world(),old=await ready(w);old.queue(graph('already saved'));const raw=[...w.saved];await old.tick();old.unmount();for(const[k,v]of raw)w.saved.set(k,v);const h=await ready(w);t.after(()=>h.unmount());h.result.restoreDraft(h.result.recoveryDrafts[0].draftId);await h.flush();assert.equal(h.result.phase,'restored');assert.equal(nodeId(h.result.template),'already saved');assert.equal(w.writes().length,1);
});

test('actual recovery and inspection controls restore locally then save only after explicit confirmation',async t=>{
  const w=world(),old=await ready(w);old.queue(graph('from actual recovery controls'));old.unmount();const h=await ready(w);t.after(()=>h.unmount());workspaceButton('恢复这份本地草稿',h.result,()=>{},h.result.recoveryDrafts[0]).props.onClick();await h.flush();assert.equal(w.writes().length,0);workspaceButton('只读核对服务器模板',h.result,()=>{}).props.onClick();await h.flush();assert.equal(w.writes().length,0);workspaceButton('我已核对并确认原请求结束，保存当前草稿',h.result,()=>{}).props.onClick();await h.flush();assert.equal(w.writes().length,1);assert.equal(nodeId(w.records.get(1)),'from actual recovery controls');
});

test('actual template status and graph initialization dependency stay dirty and stable through rename acknowledgements',async t=>{
  const h=await ready();t.after(()=>h.unmount());const file=ts.createSourceFile('CanvasWorkspace.tsx',source('CanvasWorkspace.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let span,deps;function visit(node){if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(file)==='span'&&node.getText(file).includes('templateEditor.statusLabel'))span=node;if(ts.isCallExpression(node)&&node.expression.getText(file)==='useLayoutEffect'&&node.arguments[0]?.getText(file).includes('graphFromTemplate'))deps=node.arguments[1];ts.forEachChild(node,visit);}visit(file);assert.ok(span);assert.ok(deps);const jsx=(type,props)=>({type,props}),ui=compile(`export function status(templateEditor,isTemplateMode=true,sessionSaving=false,sessionLoading=false){return (${span.getText(file)});} export function dependencies(templateEditor,history,isTemplateMode=true,canvas={activeProject:null}){return ${deps.getText(file)};}`,{'react/jsx-runtime':{jsx,jsxs:jsx}});const history={clear(){}};h.queue(graph('dirty UI'));assert.equal(ui.status(h.result).props.children,'未同步');const key=ui.dependencies(h.result,history)[2];await h.result.renameTitle('renamed safely');await h.flush();assert.equal(ui.dependencies(h.result,history)[2],key);assert.equal(nodeId(h.result.template),'dirty UI');assert.equal(ui.status(h.result).props.children,'已同步');
});

test('an uncommitted template render cannot deactivate the editor still visible to the user',async t=>{
  const h=await ready();t.after(()=>h.unmount());const visible=h.result;h.discardedRender(2);visible.queueSaveGraph(graph('still editing committed A'));h.commit();await h.tick();assert.equal(h.result.template.id,1);assert.equal(nodeId(h.w.records.get(1)),'still editing committed A');assert.equal(h.w.writes().length,1);assert.equal(h.w.writes()[0].id,1);
});
