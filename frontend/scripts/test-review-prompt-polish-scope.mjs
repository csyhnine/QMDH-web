import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const src=path=>readFileSync(new URL(`../src/${path}`,import.meta.url),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function compile(code,imports={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Error,Date,...globals,require:name=>{if(Object.hasOwn(imports,name))return imports[name];throw Error(`unstubbed ${name}`);}});return exports;}
const form=(prompt='A',creationMode='generate',other={})=>({prompt,creationMode,promptPolished:false,referenceImages:[],activeTemplateId:null,title:'draft',...other});
function promptChanger(){const file=ts.createSourceFile('builder.ts',src('features/studio/studioComposerCanvasPropsBuilder.ts'),ts.ScriptTarget.Latest,true);let value;function visit(n){if(ts.isPropertyAssignment(n)&&n.name.getText(file)==='onPromptChange')value=n.initializer.getText(file);ts.forEachChild(n,visit);}visit(file);assert.ok(value);return value;}
function harness(surface='studio'){
  let value=form(),owner={id:7},scope={},cursor=0,dirty=false,mounted=true,result,lateWrites=0,nextId=0;const slots=[],updates=[],effects=[],formUpdates=[],requests=[],gates=[],notifications=[];
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>{if(!mounted){lateWrites++;return;}updates.push({i,next});dirty=true;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useMemo(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={deps,value:fn()};return slots[i].value;},useCallback(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={deps,fn};return slots[i].fn;},useEffect(fn,deps){effect(fn,deps,false);},useLayoutEffect(fn,deps){effect(fn,deps,true);}};
  function effect(fn,deps,layout){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){const next={deps};slots[i]=next;effects.push({layout,run(){old?.cleanup?.();next.cleanup=fn();}});}}
  const ownership=existsSync(new URL('../src/lib/promptPolishOwnership.ts',import.meta.url))?compile(src('lib/promptPolishOwnership.ts')):{inheritPromptDraft:(_old,next)=>next,promptDraftFamily:value=>value};
  const history=compile(src('lib/promptPolishHistory.ts'),{},{crypto:{randomUUID:()=>`history-${++nextId}`}});
  const api={async polishPrompt(payload){requests.push(copy(payload));const gate=gates.shift();return gate?await gate.promise:{polished_prompt:`polished ${payload.prompt}`};}};
  const core=compile(src('lib/usePromptPolish.ts'),{react,'../api':{api},'./promptPolishHistory':history,'./promptPolishOwnership':ownership});
  const studio=compile(src('features/studio/useStudioPromptPolish.ts'),{react,'../../lib/usePromptPolish':core,'../../lib/promptPolishOwnership':ownership,'../../context/AuthContext':{useAuth:()=>({currentUser:owner})},'./studioReferenceUtils':{referenceUploadStoragePaths:items=>items.map(row=>row.storagePath).filter(Boolean)}});
  const jsx=(type,props)=>({type,props});
  const field=compile(src('features/canvas/CanvasPromptPolishField.tsx'),{react,'../../lib/usePromptPolish':core,'../../lib/promptPolishOwnership':ownership,'../../components/shared/PromptPolishButton':{default:'PolishButton'},'../../components/shared/PromptPolishHistoryPanel':{default:'HistoryPanel'},'./CanvasDraftField':{CanvasDraftTextarea:'DraftTextarea'},'./canvasNodeContext':{useCanvasNodeActions:()=>({promptPolishEnabled:true,promptScopeKey:scope})},'../studio/studioCanvasLinkage':{creationModeForNodeKind:kind=>kind==='video'?'video':'generate'},'./canvasGraphUtils':{resolveCanvasInputReferenceImages:(own,up)=>up.length?up:own},'react/jsx-runtime':{jsx,jsxs:jsx}});
  const setter=next=>{formUpdates.push(next);dirty=true;};
  const onPromptChange=compile(`export function make(setStudioForm,applyTemplateBindingGuard,promptTemplates,inheritPromptDraft,patchStudioForm){return (${promptChanger()});}`).make(setter,(current,patch)=>({...current,...patch}),[],ownership.inheritPromptDraft,patch=>setter(current=>({...current,...patch})));
  function render(){if(surface==='studio')return studio.useStudioPromptPolish({studioForm:value,referenceUploads:value.referenceImages.map(storagePath=>({storagePath})),onPromptChange,onPolished:()=>setter(current=>({...current,promptPolished:true}))});
    const expected=value;
    if(surface==='field'){
      const tree=field.default({nodeKind:value.creationMode==='video'?'video':'text2img',nodeId:value.nodeId??'node',draftIdentity:value,prompt:value.prompt,referenceImages:value.referenceImages,upstreamImages:[],onPromptChange:prompt=>setter(draft=>ownership.inheritPromptDraft(draft,{...draft,prompt,promptPolished:false})),onApplyPrompt:(prompt,polished,current)=>setter(draft=>draft===expected&&current()?ownership.inheritPromptDraft(draft,{...draft,prompt,promptPolished:polished},true):draft),onPolishingChange:busy=>notifications.push({nodeId:expected.nodeId??'node',busy})});
      const elements=[];function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;}if(n.type)elements.push(n);walk(n.props?.children);}walk(tree);
      const button=elements.find(n=>n.type==='PolishButton'),panel=elements.find(n=>n.type==='HistoryPanel'),feedback=elements.find(n=>n.type==='small');
      return{polishing:button.props.polishing,polishPrompt:button.props.onClick,history:panel.props.history,activeHistoryId:panel.props.activeEntryId,applyHistoryEntry:panel.props.onSelect,error:feedback&&!feedback.props.className.includes('is-notice')?feedback.props.children:'',notice:feedback?.props.className.includes('is-notice')?feedback.props.children:''};
    }
    return core.usePromptPolish({prompt:value.prompt,creationMode:value.creationMode,referenceImages:value.referenceImages,sourceSurface:'canvas',sourceKey:scope,draftIdentity:value,onPromptChange:prompt=>setter(current=>({...current,prompt})),onPolished:()=>setter(current=>({...current,promptPolished:true})),onApply:(prompt,polished,current)=>setter(draft=>draft===expected&&current()?ownership.inheritPromptDraft(draft,{...draft,prompt,promptPolished:polished},true):draft)});
  }
  function commit(){if(!mounted)return;for(let pass=0;pass<40;pass++){for(const next of formUpdates.splice(0))value=typeof next==='function'?next(value):next;for(const{i,next}of updates.splice(0))slots[i]=typeof next==='function'?next(slots[i]):next;cursor=0;dirty=false;result=render();const pending=effects.splice(0);for(const row of pending.filter(e=>e.layout))row.run();for(const row of pending.filter(e=>!e.layout))row.run();if(!dirty)return;}throw Error('hook did not settle');}
  async function flush(){for(let i=0;i<60;i++){await Promise.resolve();if(dirty&&mounted)commit();}}
  commit();return{commit,flush,ownership,requests,notifications,get result(){return result;},get value(){return value;},get lateWrites(){return lateWrites;},queueSet(next){setter(next);},hold(){const gate=deferred();gates.push(gate);return gate;},replace(next,renderNow=true){value=next;if(renderNow)commit();},queueReplace(next){formUpdates.push(next);dirty=true;},edit(prompt){onPromptChange(prompt);commit();},setScope(next){scope=next;commit();},changeOwner(next){owner=next;commit();},discardedRender(next){const old=value,before=slots.slice(),count=effects.length,wasDirty=dirty;value=next;cursor=0;render();effects.length=count;slots.length=0;slots.push(...before);value=old;dirty=wasDirty;},unmount(){mounted=false;for(const slot of slots)slot?.cleanup?.();}};
}

test('Studio A polish cannot overwrite the copied video B draft or mark it polished',async t=>{
  const h=harness(),gate=h.hold();t.after(()=>h.unmount());const pending=h.result.polishPrompt();h.replace(form('video B','video'));gate.resolve({polished_prompt:'polished A',reference_image_warning:'A warning'});await pending;await h.flush();assert.equal(h.value.prompt,'video B');assert.equal(h.value.creationMode,'video');assert.equal(h.value.promptPolished,false);assert.equal(h.result.history.length,0);assert.equal(h.result.notice,'');
});

test('a same-mode Canvas node change invalidates the previous result and feedback',async t=>{
  const h=harness('canvas'),gate=h.hold();t.after(()=>h.unmount());const pending=h.result.polishPrompt();h.replace(form('node B'));h.setScope({nodeId:'B'});gate.resolve({polished_prompt:'old node A',reference_image_warning:'old warning'});await pending;await h.flush();assert.equal(h.value.prompt,'node B');assert.equal(h.value.promptPolished,false);assert.equal(h.result.history.length,0);assert.equal(h.result.notice,'');
});

test('stable Studio polish applies prompt and flag once while preserving its own warning and active history',async t=>{
  const h=harness();t.after(()=>h.unmount());const gate=h.hold(),pending=h.result.polishPrompt();gate.resolve({polished_prompt:'  polished A  ',reference_image_warning:'source warning'});await pending;await h.flush();
  assert.equal(h.value.prompt,'polished A');assert.equal(h.value.promptPolished,true);assert.equal(h.result.notice,'source warning');assert.equal(h.result.history.length,1);assert.equal(h.result.activeHistoryId,h.result.history[0].id);assert.equal(h.requests.length,1);
});

test('ordinary edits keep confirmed history but invalidate the older in-flight version',async t=>{
  const h=harness();t.after(()=>h.unmount());await h.result.polishPrompt();await h.flush();const id=h.result.history[0].id;
  const gate=h.hold(),old=h.result.polishPrompt();h.edit('typed newer');assert.equal(h.result.history[0].id,id);assert.equal(h.result.polishing,false);
  gate.resolve({polished_prompt:'older version'});await old;await h.flush();assert.equal(h.value.prompt,'typed newer');assert.equal(h.value.promptPolished,false);assert.equal(h.result.history.length,1);
});

test('same-mode template replacement and identical-text new draft both invalidate old operations',async t=>{
  for(const prompt of ['template B','A']){const h=harness(),gate=h.hold();t.after(()=>h.unmount());const pending=h.result.polishPrompt();h.replace(form(prompt,'generate',{activeTemplateId:2}));gate.resolve({polished_prompt:'old A'});await pending;await h.flush();assert.equal(h.value.prompt,prompt);assert.equal(h.value.promptPolished,false);assert.equal(h.result.history.length,0);}
});

test('A B A draft and account changes never reactivate old request ownership',async t=>{
  for(const kind of ['draft','account']){const h=harness(),gate=h.hold(),original=h.value;t.after(()=>h.unmount());const pending=h.result.polishPrompt();if(kind==='draft'){h.replace(form('B'));h.replace(original);}else{h.changeOwner({id:8});h.changeOwner({id:7});}
    gate.resolve({polished_prompt:'stale A'});await pending;await h.flush();assert.equal(h.value.prompt,'A');assert.equal(h.value.promptPolished,false);assert.equal(h.result.history.length,0);
  }
});

test('old success failure and finally cannot overwrite a new request busy error notice or history',async t=>{
  for(const rejected of [false,true]){const h=harness(),one=h.hold();t.after(()=>h.unmount());const a=h.result.polishPrompt();h.replace(form('B'));const two=h.hold(),b=h.result.polishPrompt();await h.flush();assert.equal(h.result.polishing,true);
    if(rejected)one.reject(Error('A failure'));else one.resolve({polished_prompt:'A late',reference_image_warning:'A warning'});await a;await h.flush();assert.equal(h.result.polishing,true);assert.equal(h.result.error,'');assert.equal(h.result.notice,'');assert.equal(h.result.history.length,0);
    two.resolve({polished_prompt:'B polished',reference_image_warning:'B warning'});await b;await h.flush();assert.equal(h.value.prompt,'B polished');assert.equal(h.result.notice,'B warning');assert.equal(h.result.history.length,1);
  }
});

test('an already-queued video draft replacement rejects the old Studio functional apply before the next render',async t=>{
  const h=harness(),gate=h.hold();t.after(()=>h.unmount());const pending=h.result.polishPrompt();h.queueReplace(form('queued video B','video'));gate.resolve({polished_prompt:'old A'});await pending;h.commit();await h.flush();
  assert.equal(h.value.prompt,'queued video B');assert.equal(h.value.creationMode,'video');assert.equal(h.value.promptPolished,false);assert.equal(h.result.history.length,0);
});

test('mode and reference snapshots belong to the request and newer reference input blocks the response',async t=>{
  const h=harness(),refs=['ref A','', 'ref A'];t.after(()=>h.unmount());h.replace(form('with refs','edit',{referenceImages:refs}));const gate=h.hold(),pending=h.result.polishPrompt();h.replace(form('with refs','edit',{referenceImages:['ref B']}));
  assert.deepEqual(h.requests[0],{prompt:'with refs',creation_mode:'edit',reference_images:['ref A','ref A'],source_surface:'studio'});gate.resolve({polished_prompt:'old reference text'});await pending;await h.flush();assert.equal(h.value.prompt,'with refs');assert.equal(h.value.promptPolished,false);assert.equal(h.result.history.length,0);
});

test('confirmed history keeps its five-entry cap and source restoration clears the polished flag',async t=>{
  const h=harness();t.after(()=>h.unmount());for(let i=0;i<7;i++){await h.result.polishPrompt();await h.flush();}assert.equal(h.result.history.length,5);const entry=h.result.history[2];h.result.applyHistoryEntry(entry.id);h.commit();assert.equal(h.value.prompt,entry.polishedPrompt);assert.equal(h.value.promptPolished,true);assert.equal(h.result.history.length,5);
  h.result.applySourceEntry(entry.id);h.commit();assert.equal(h.value.prompt,entry.sourcePrompt);assert.equal(h.value.promptPolished,false);assert.equal(h.result.history.length,5);assert.equal(Object.keys(h.value).some(k=>k.includes('family')||k.includes('polishOwner')),false);
});

test('current failure or empty response keeps the original draft and does not mark it polished',async t=>{
  for(const bad of [Error('current fail'),{polished_prompt:'  '}]){const h=harness(),gate=h.hold();t.after(()=>h.unmount());const pending=h.result.polishPrompt();if(bad instanceof Error)gate.reject(bad);else gate.resolve(bad);await pending;await h.flush();assert.equal(h.value.prompt,'A');assert.equal(h.value.promptPolished,false);assert.equal(h.result.polishing,false);assert.ok(h.result.error);assert.equal(h.result.history.length,0);assert.equal(h.requests.length,1);}
});

test('same-tick callbacks share the in-flight operation and never automatically retry after failure',async t=>{
  const h=harness(),gate=h.hold();t.after(()=>h.unmount());const action=h.result.polishPrompt,a=action(),b=action();assert.equal(h.requests.length,1);gate.reject(Error('failed'));await Promise.all([a,b]);await h.flush();assert.equal(h.requests.length,1);assert.equal(h.result.polishing,false);
});

test('unmount discards late success and failure without local writes or draft changes',async()=>{
  for(const rejected of [false,true]){const h=harness(),gate=h.hold(),pending=h.result.polishPrompt();h.unmount();if(rejected)gate.reject(Error('late'));else gate.resolve({polished_prompt:'late'});await pending;await h.flush();assert.equal(h.value.prompt,'A');assert.equal(h.value.promptPolished,false);assert.equal(h.lateWrites,0);}
});

test('an uncommitted draft render cannot invalidate the visible operation',async t=>{
  const h=harness(),gate=h.hold();t.after(()=>h.unmount());const pending=h.result.polishPrompt();h.discardedRender(form('uncommitted B'));gate.resolve({polished_prompt:'visible A'});await pending;await h.flush();assert.equal(h.value.prompt,'visible A');assert.equal(h.value.promptPolished,true);assert.equal(h.result.history.length,1);
});

test('actual Canvas field starts a new node scope and old finally cannot clear the new field busy',async t=>{
  const h=harness('field'),one=h.hold();t.after(()=>h.unmount());h.replace(form('A','generate',{nodeId:'A'}));h.result.polishPrompt();h.commit();h.replace(form('B','generate',{nodeId:'B'}));const two=h.hold();h.result.polishPrompt();h.commit();assert.equal(h.result.polishing,true);
  one.reject(Error('A old failure'));await h.flush();assert.equal(h.result.polishing,true);assert.equal(h.notifications.at(-1).nodeId,'B');assert.equal(h.notifications.at(-1).busy,true);two.resolve({polished_prompt:'polished B',reference_image_warning:'B warning'});await h.flush();assert.equal(h.value.prompt,'polished B');assert.equal(h.value.promptPolished,true);assert.equal(h.result.notice,'B warning');
});

test('actual Canvas field keeps normal same-node history across its own successful apply',async t=>{
  const h=harness('field');t.after(()=>h.unmount());h.result.polishPrompt();await h.flush();assert.equal(h.value.prompt,'polished A');assert.equal(h.result.history.length,1);const id=h.result.history[0].id;h.result.applyHistoryEntry(id);h.commit();assert.equal(h.result.history.length,1);
});

async function canvasFixture(){
  const url=new URL('./test-review-canvas-async-scope.mjs',import.meta.url),text=readFileSync(url,'utf8'),boundary=text.indexOf("test('a poll response from A");assert.ok(boundary>0);
  const prefix=text.slice(0,boundary).replaceAll('import.meta.url',JSON.stringify(url.href)).replace("from 'typescript'",`from ${JSON.stringify(import.meta.resolve('typescript'))}`);
  return import('data:text/javascript;base64,'+Buffer.from(prefix+'\nexport {fixture,workspace,node};').toString('base64'));
}
function nodeApply(name,patchNode,data,scopeCurrent=()=>true){const file=ts.createSourceFile(name,src(`features/canvas/${name}`),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback;function visit(n){if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(file)==='CanvasPromptPolishField')callback=n.attributes.properties.find(p=>p.name?.text==='onApplyPrompt')?.initializer.expression;ts.forEachChild(n,visit);}visit(file);assert.ok(callback);
  return compile(`export function make(patchNode,id,node,data,isPromptScopeCurrent){return (${callback.getText(file)});}`).make(patchNode,'same',{id:'same'},data,scopeCurrent);
}

test('both actual node consumers reject replaced source data before history state or persistence',async t=>{
  const {fixture,workspace,node}=await canvasFixture();for(const name of ['GenerateNode.tsx','CanvasNodeInspector.tsx']){const w=fixture(),h=workspace(w);t.after(()=>h.dispose());const source=h.nodes[0].data,apply=nodeApply(name,h.handlers().patchNode,source);h.setNodes([node('same',null,'upload')]);h.nodes[0].data.prompt='B';const saved=h.saved.length;apply('A late',true,()=>true);assert.equal(h.nodes[0].data.prompt,'B');assert.equal(h.saved.length,saved);}
});

test('a queued node replacement rejects the expected-data updater and performs no save',async t=>{
  const {fixture,workspace,node}=await canvasFixture(),w=fixture(),h=workspace(w,{deferredState:true});t.after(()=>h.dispose());const apply=nodeApply('GenerateNode.tsx',h.handlers().patchNode,h.nodes[0].data);apply('A late',true,()=>true);assert.equal(h.saved.length,0);const b=node('same',null,'upload');b.data.prompt='queued B';h.setNodes([b]);h.flushState();assert.equal(h.nodes[0].data.prompt,'queued B');assert.equal(h.saved.length,0);
});

test('actual current Canvas apply merges prompt and flag while preserving other data and lineage',async t=>{
  const {fixture,workspace}=await canvasFixture(),w=fixture(),h=workspace(w);t.after(()=>h.dispose());const original=h.nodes[0].data,family=w.ownership.promptDraftFamily(original);nodeApply('CanvasNodeInspector.tsx',h.handlers().patchNode,original)('polished current',true,()=>true);assert.equal(h.nodes[0].data.prompt,'polished current');assert.equal(h.nodes[0].data.promptPolished,true);assert.equal(h.nodes[0].data.nodeKind,original.nodeKind);assert.equal(w.ownership.promptDraftFamily(h.nodes[0].data),family);assert.equal(h.saved.length,1);
});

test('an already-activated Project invalidates the old view guard before the next UI render',async t=>{
  const url=new URL('./test-review-canvas-project-save.mjs',import.meta.url),text=readFileSync(url,'utf8'),boundary=text.indexOf('test("normal auto-save debounces');const prefix=text.slice(0,boundary).replaceAll('import.meta.url',JSON.stringify(url.href)).replace('from "typescript"',`from ${JSON.stringify(import.meta.resolve('typescript'))}`);const {ready}=await import('data:text/javascript;base64,'+Buffer.from(prefix+'\nexport {ready};').toString('base64'));
  const project=await ready();t.after(()=>project.unmount());const old=project.result;assert.equal(old.isCurrentView(),true);await old.openProject(2);assert.equal(old.isCurrentView(),false);
  const {fixture,workspace}=await canvasFixture(),w=fixture(),h=workspace(w);t.after(()=>h.dispose());nodeApply('GenerateNode.tsx',h.handlers().patchNode,h.nodes[0].data,old.isCurrentView)('old project text',true,()=>true);assert.equal(h.saved.length,0);assert.notEqual(h.nodes[0].data.prompt,'old project text');
});

test('both Canvas widgets reset local polishing state for a different node kind or scope',()=>{
  for(const name of ['GenerateNode.tsx','CanvasNodeInspector.tsx']){const file=ts.createSourceFile(name,src(`features/canvas/${name}`),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let effect;function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(file)==='useLayoutEffect'&&n.arguments[0]?.getText(file).includes('setPolishingPrompt(false)'))effect=n;ts.forEachChild(n,visit);}visit(file);assert.ok(effect);assert.ok(effect.arguments[1].getText(file).includes('promptScopeKey'));assert.ok(effect.arguments[1].getText(file).includes('nodeKind'));let value=true;compile(`export function run(setPolishingPrompt){(${effect.arguments[0].getText(file)})();}`).run(next=>value=next);assert.equal(value,false);}
});

test('the actual task-copy setter pipeline replaces the draft while its prior polish is pending',async t=>{
  const h=harness(),gate=h.hold();t.after(()=>h.unmount());const pending=h.result.polishPrompt(),file=ts.createSourceFile('copy.ts',src('features/studio/studioTaskActionUtils.ts'),ts.ScriptTarget.Latest,true);const fn=file.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='applyTaskToComposerState');assert.ok(fn);const video=form('copied video B','video');let replaced=false;
  const apply=compile(fn.getText(file),{}, {buildStudioFormFromTask:()=>({nextForm:video,nextUploads:[]}),window:{requestAnimationFrame:()=>0}}).applyTaskToComposerState;
  apply({studioForm:h.value,task:{id:2},providers:[],buildUploadsFromPaths:()=>[],composerToolbarRef:{current:null},replaceReferenceUploads:()=>replaced=true,setActiveComposerMenu(){},setComposerCollapsed(){},setStudioForm:next=>h.queueSet(next)});
  gate.resolve({polished_prompt:'old A'});await pending;h.commit();assert.equal(replaced,true);assert.equal(h.value.prompt,'copied video B');assert.equal(h.value.creationMode,'video');assert.equal(h.value.promptPolished,false);assert.equal(h.result.history.length,0);
});

test('ordinary builder field updates preserve confirmed history while invalidating their in-flight object version',async t=>{
  const h=harness();t.after(()=>h.unmount());await h.result.polishPrompt();await h.flush();const file=ts.createSourceFile('builder.ts',src('features/studio/studioComposerCanvasPropsBuilder.ts'),ts.ScriptTarget.Latest,true);let expr;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(file)==='patchStudioForm')expr=n.initializer.getText(file);ts.forEachChild(n,visit);}visit(file);assert.ok(expr);
  const patch=compile(`export function make(setStudioForm,applyTemplateBindingGuard,promptTemplates,inheritPromptDraft){return (${expr});}`).make(next=>h.queueSet(next),(current,value)=>({...current,...value}),[],h.ownership.inheritPromptDraft);
  const id=h.result.history[0].id,gate=h.hold(),old=h.result.polishPrompt();patch({aspectRatio:'16:9'});h.commit();assert.equal(h.result.history[0].id,id);gate.resolve({polished_prompt:'old version'});await old;await h.flush();assert.equal(h.value.aspectRatio,'16:9');assert.notEqual(h.value.prompt,'old version');assert.equal(h.result.history.length,1);
});
