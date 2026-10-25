import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
const fixtureUrl=new URL('./test-review-canvas-async-scope.mjs',import.meta.url),original=readFileSync(fixtureUrl,'utf8');
const boundary=original.indexOf("test('a poll response from A");assert.ok(boundary>0);
let prefix=original.slice(0,boundary).replaceAll('import.meta.url',JSON.stringify(fixtureUrl.href)).replace("from 'typescript'",`from ${JSON.stringify(import.meta.resolve('typescript'))}`);
const graphBoundary="function fixture(startSeed=0)";
const realGraphCode=`const graphFile=ts.createSourceFile('graph.ts',source('canvasGraphUtils.ts'),ts.ScriptTarget.Latest,true);
const graphFunctions=graphFile.statements.filter(n=>ts.isFunctionDeclaration(n)&&['looksLikeVideoUrl','uniqueImagePaths','resolveCanvasInputReferenceImages','collectUpstreamDeliverables'].includes(n.name?.text)).map(n=>n.getText(graphFile)).join('\\n');
const actualGraph=compile(graphFunctions,{}, {isGenerateNode:n=>n.data.kind==='generate'});`;
assert.ok(prefix.includes(graphBoundary));prefix=prefix.replace(graphBoundary,realGraphCode+'\n'+graphBoundary);
const graphMock="'./canvasGraphUtils':{collectUpstreamDeliverables:()=>({images:[]}),resolveCanvasInputReferenceImages:(own,up)=>own?.length?own:up}";
assert.ok(prefix.includes(graphMock));prefix=prefix.replace(graphMock,"'./canvasGraphUtils':actualGraph").replace('payload:{prompt:form.prompt}','payload:{prompt:form.prompt,reference_images:form.referenceImages}');
const {fixture,workspace,node,task,defer,compile,variable,clone}=await import('data:text/javascript;base64,'+Buffer.from(prefix+'\nexport {fixture,workspace,node,task,defer,compile,variable,clone};').toString('base64'));
const hook=(w,h)=>w.generate.useCanvasNodeGenerate([{provider_name:'offline'}],h.nodes,[],h.handlers().patchNodeSilent,h.scope);
const creates=w=>w.calls.filter(c=>c.kind==='create');

test('an existing running task is awaited without creating a replacement task',async t=>{
  const w=fixture(),h=workspace(w),gate=defer();t.after(()=>h.dispose());const n=node('same',21);n.data.status='running';h.setNodes([n]);w.getQueue.push(gate);
  const running=hook(w,h)('same',n.data);await w.flush();assert.equal(creates(w).length,0);assert.equal(h.nodes[0].data.taskId,21);
  gate.resolve(task(21));await running;assert.equal(h.nodes[0].data.status,'completed');
});

test('two same-tick node callbacks share one submission before React renders again',async t=>{
  const w=fixture(),h=workspace(w),one=defer(),two=defer();t.after(()=>h.dispose());const n=node('same',null);n.data.status='idle';h.setNodes([n]);w.createQueue.push(one,two);
  const run=hook(w,h),a=run('same',n.data),b=run('same',n.data);await w.flush();assert.equal(creates(w).length,1);
  one.resolve(task(101,'pending'));await Promise.all([a,b]);assert.equal(h.nodes[0].data.taskId,101);
});

test('every active state with a task id attaches to that task and waits for its terminal result',async t=>{
  for(const status of ['pending','running','submitting','awaiting_result','failed']){const w=fixture(),h=workspace(w),gate=defer();t.after(()=>h.dispose());const n=node('same',21);n.data.status=status;if(status==='failed')n.data.errorMessage='等待超时';h.setNodes([n]);w.getQueue.push(gate);
    let done=false;const running=hook(w,h)('same',n.data).then(()=>done=true);await w.flush();assert.equal(done,false);assert.equal(creates(w).length,0);gate.resolve(task(21));await running;
    assert.equal(h.nodes[0].data.taskId,21);assert.deepEqual(clone(h.nodes[0].data.assetUrls),['output-21']);
  }
});

test('active states missing their accepted id remain unknown across repeated callbacks',async t=>{
  for(const status of ['submitting','pending','running','awaiting_result']){const w=fixture(),h=workspace(w);t.after(()=>h.dispose());const n=node('same',null);n.data.status=status;h.setNodes([n]);
    await hook(w,h)('same',n.data);assert.equal(creates(w).length,0);assert.equal(h.scope.recoveries().length,1);
    await hook(w,h)('same',h.nodes[0].data);assert.equal(creates(w).length,0);assert.match(h.nodes[0].data.errorMessage,/核对/);
  }
});

test('different nodes with identical input receive independent stable operation keys',async t=>{
  const w=fixture(),h=workspace(w),a=node('a',null),b=node('b',null);t.after(()=>h.dispose());a.data.label=b.data.label='same input';h.setNodes([a,b]);
  const run=hook(w,h);await Promise.all([run('a',a.data),run('b',b.data)]);assert.equal(creates(w).length,2);
  assert.ok(creates(w)[0].payload.submission_key);assert.notEqual(creates(w)[0].payload.submission_key,creates(w)[1].payload.submission_key);
});

test('the stable operation key exists in its source journal before the POST starts',async t=>{
  const w=fixture(),h=workspace(w),n=node('same',null);t.after(()=>h.dispose());h.setNodes([n]);let observed;
  w.api.createTask=async payload=>{observed=payload;assert.ok([...w.stored.values()].some(raw=>JSON.parse(raw).id===payload.submission_key));return task(101,'pending');};
  await hook(w,h)('same',n.data);assert.ok(observed.submission_key);assert.equal(w.stored.size,0);
});

test('unknown response loss server errors and malformed admission never cause an automatic second POST',async t=>{
  for(const response of ['network',408,500,'malformed']){const w=fixture(),h=workspace(w),gate=defer(),n=node('same',null);t.after(()=>h.dispose());h.setNodes([n]);w.createQueue.push(gate);const running=hook(w,h)('same',n.data);await w.flush();
    if(response==='malformed')gate.resolve({id:null});else gate.reject(Object.assign(Error(String(response)),typeof response==='number'?{status:response}:{}));await running;
    assert.equal(creates(w).length,1);const rows=h.scope.recoveries();assert.equal(rows.length,1);assert.equal(rows[0].id,creates(w)[0].payload.submission_key);
    await hook(w,h)('same',h.nodes[0].data);assert.equal(creates(w).length,1);assert.match(h.nodes[0].data.errorMessage,/核对/);
  }
});

test('a reopened unknown submission blocks creation until the user explicitly discards that original record',async t=>{
  const w=fixture(),h=workspace(w),gate=defer(),n=node('same',null);t.after(()=>h.dispose());h.setNodes([n]);w.createQueue.push(gate);const running=hook(w,h)('same',n.data);await w.flush();gate.reject(Error('unknown'));await running;const oldKey=creates(w)[0].payload.submission_key;
  h.switch('project:2');h.switch('project:1',[node('same',null)]);await hook(w,h)('same',h.nodes[0].data);assert.equal(creates(w).length,1);
  h.handlers().discardAsyncResult(h.scope.recoveries()[0]);await hook(w,h)('same',h.nodes[0].data);assert.equal(creates(w).length,2);assert.notEqual(creates(w)[1].payload.submission_key,oldKey);
});

test('a definite rejection permits a corrected new intent and receives a new key',async t=>{
  const w=fixture(),h=workspace(w),gate=defer(),n=node('same',null);t.after(()=>h.dispose());h.setNodes([n]);w.createQueue.push(gate);const running=hook(w,h)('same',n.data);await w.flush();gate.reject(Object.assign(Error('rejected'),{status:400}));await running;
  assert.equal(h.scope.recoveries().length,0);const key=creates(w)[0].payload.submission_key;await hook(w,h)('same',h.nodes[0].data);
  assert.equal(creates(w).length,2);assert.notEqual(creates(w)[1].payload.submission_key,key);
});

test('explicit regeneration invalidates the old observation while a default click would only attach',async t=>{
  const w=fixture(),h=workspace(w),gate=defer(),n=node('same',21);t.after(()=>h.dispose());n.data.status='awaiting_result';h.setNodes([n]);w.getQueue.push(gate);const patches=h.handlers().patchNodeSilent;
  const old=h.scope.observeTask('same',21,c=>w.generate.pollTaskUntilDone(21,'same',patches,'image',c));await hook(w,h)('same',n.data,{regenerate:true});assert.equal(creates(w).length,1);assert.equal(h.nodes[0].data.taskId,101);
  gate.resolve(task(21));await old;assert.equal(h.nodes[0].data.taskId,101);assert.deepEqual(clone(h.nodes[0].data.assetUrls),['output-101']);
});

test('an old observation finally cannot release the mutex for a replacement still being submitted',async t=>{
  const w=fixture(),h=workspace(w),read=defer(),create=defer(),n=node('same',21);t.after(()=>h.dispose());n.data.status='awaiting_result';h.setNodes([n]);w.getQueue.push(read);const run=hook(w,h);
  const old=run('same',n.data);await w.flush();w.createQueue.push(create);const next=run('same',h.nodes[0].data,{regenerate:true});await w.flush();assert.equal(creates(w).length,1);
  read.resolve(task(21));await old;const duplicate=run('same',h.nodes[0].data);await w.flush();assert.equal(creates(w).length,1);create.resolve(task(101,'pending'));await Promise.all([next,duplicate]);assert.equal(h.nodes[0].data.taskId,101);
});

function batch(w,h,edges=[],shared={busy:{current:false},token:{current:null},events:[]}){
  h.scope.graphEdges=()=>edges;
  const deps={useCallback:fn=>fn,asyncScope:h.scope,sessionLoading:false,isTemplateMode:false,edges,selectedNodeIds:[],runningAllRef:shared.busy,workflowRunRef:shared.token,
    nodesRef:{get current(){return h.nodes;}},nodeDefaults:{imageProvider:'offline',videoProvider:'offline',upscaleProvider:'offline'},projectCode:'QMDH-001',runGenerate:hook(w,h),
    isGenerateNode:n=>n.data.kind==='generate',isRunnableCanvasNode:n=>['text2img','img2img','upscale','video'].includes(n.data.nodeKind),listRunnableNodeIdsInTopoOrder:()=>({order:h.nodes.map(n=>n.id),cycle:false}),listRunnableNodeIdsForSelection:()=>({order:h.nodes.map(n=>n.id),cycle:false}),
    setRunningAll:value=>shared.events.push({kind:'busy',value,board:h.scope.board}),setBannerOk:value=>shared.events.push({kind:'ok',value,board:h.scope.board}),setBannerError:value=>shared.events.push({kind:'error',value,board:h.scope.board})};
  const made=compile(`export function make(deps){const {${Object.keys(deps).join(',')}}=deps;const handleGenerate=${variable('handleGenerate')};const runWorkflow=${variable('runWorkflow')};return runWorkflow;}`).make(deps);
  return{run:made,shared,reset(){
    const file=ts.createSourceFile('Workspace.tsx',readFileSync(new URL('../src/features/canvas/CanvasWorkspace.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback;
    function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(file)==='useLayoutEffect'&&n.arguments[0]?.getText(file).includes('workflowRunRef.current=null'))callback=n.arguments[0];ts.forEachChild(n,visit);}visit(file);assert.ok(callback);
    compile(`export function reset(workflowRunRef,runningAllRef,setRunningAll){return (${callback.getText(file)})();}`).reset(shared.token,shared.busy,deps.setRunningAll);
  }};
}

test('the actual batch waits for its existing upstream task then passes that delivered image to the downstream submission',async t=>{
  const w=fixture(),h=workspace(w),gate=defer(),up=node('up',21),down=node('down',null,'img2img');t.after(()=>h.dispose());h.setNodes([up,down]);w.getQueue.push(gate);
  const running=batch(w,h,[{source:'up',target:'down'}]).run('all');await w.flush();assert.equal(creates(w).length,0);gate.resolve(task(21));await running;
  assert.equal(creates(w).length,1);assert.deepEqual(clone(creates(w)[0].payload.payload.reference_images),['output-21']);assert.equal(h.nodes[1].data.status,'completed');
});

test('a completed upstream is skipped while a failed live upstream stops the downstream without creating work',async t=>{
  for(const failed of [false,true]){const w=fixture(),h=workspace(w),up=node('up',21),down=node('down',null,'img2img');t.after(()=>h.dispose());if(!failed){up.data.status='completed';up.data.assetUrls=['known-output'];}else w.api.getTask=async id=>task(id,'failed',{error:'original failed'});h.setNodes([up,down]);
    const b=batch(w,h,[{source:'up',target:'down'}]);await b.run('all');assert.equal(creates(w).length,failed?0:1);
    if(failed)assert.ok(b.shared.events.some(e=>e.kind==='error'&&e.value.includes('失败')));else assert.deepEqual(clone(creates(w)[0].payload.payload.reference_images),['known-output']);
  }
});

test('a node click and the actual batch join the same pending create and wait for its result',async t=>{
  const w=fixture(),h=workspace(w),gate=defer(),n=node('same',null);t.after(()=>h.dispose());h.setNodes([n]);w.createQueue.push(gate);
  const single=hook(w,h)('same',n.data);await w.flush();const b=batch(w,h),all=b.run('all');await w.flush();assert.equal(creates(w).length,1);assert.equal(b.shared.busy.current,true);
  gate.resolve(task(101,'pending'));await Promise.all([single,all]);assert.equal(creates(w).length,1);assert.ok(b.shared.events.some(e=>e.kind==='ok'&&e.value.includes('完成')));
});

test('an old batch success or failure cannot submit later nodes clear a new batch busy state or change its feedback',async t=>{
  for(const reject of [false,true]){const w=fixture(),h=workspace(w),old=defer(),next=defer();t.after(()=>h.dispose());h.setNodes([node('a',null),node('later-a',null)]);w.createQueue.push(old);const a=batch(w,h),runningA=a.run('all');await w.flush();
    h.switch('project:2',[node('b',null)]);const b=batch(w,h,[],a.shared);b.reset();w.createQueue.push(next);const runningB=b.run('all');await w.flush();assert.equal(creates(w).length,2);assert.equal(b.shared.busy.current,true);const events=b.shared.events.length;
    if(reject)old.reject(Error('A unknown'));else old.resolve(task(101,'pending'));await runningA;assert.equal(b.shared.events.length,events);assert.equal(b.shared.busy.current,true);assert.equal(creates(w).length,2);
    next.resolve(task(202,'pending'));await runningB;assert.equal(h.nodes[0].data.taskId,202);assert.equal(b.shared.busy.current,false);
  }
});

test('an unknown upstream submission stops the actual selected batch before it creates downstream work',async t=>{
  const w=fixture(),h=workspace(w),gate=defer();t.after(()=>h.dispose());h.setNodes([node('up',null),node('down',null)]);w.createQueue.push(gate);const b=batch(w,h),running=b.run('selection');await w.flush();gate.reject(Error('response lost'));await running;
  assert.equal(creates(w).length,1);assert.equal(h.scope.recoveries().length,1);assert.ok(b.shared.events.some(e=>e.kind==='error'&&e.value.includes('核对')));assert.equal(b.shared.busy.current,false);
});

test('a completed task without deliverables stops downstream work and is not reported as a finished batch',async t=>{
  const w=fixture(),h=workspace(w);t.after(()=>h.dispose());h.setNodes([node('up',21),node('down',null)]);w.api.getTask=async id=>task(id,'completed',{});const b=batch(w,h),running=b.run('all');
  for(let i=0;i<5;i++){await w.flush();await w.tick();}await running;
  assert.equal(creates(w).length,0);assert.ok(b.shared.events.some(e=>e.kind==='error'&&e.value.includes('没有可用产物')));assert.equal(b.shared.events.some(e=>e.kind==='ok'&&e.value.includes('完成：')),false);
});

test('unknown admission remains blocked in a fresh runtime that has only its original journal',async t=>{
  const first=fixture(),h=workspace(first),gate=defer();h.setNodes([node('same',null)]);first.createQueue.push(gate);const old=hook(first,h)('same',h.nodes[0].data);await first.flush();gate.reject(Error('unknown'));await old;h.dispose();
  const second=fixture(100);for(const[k,v]of first.stored)second.stored.set(k,v);const reopened=workspace(second);t.after(()=>reopened.dispose());reopened.setNodes([node('same',null)]);await hook(second,reopened)('same',reopened.nodes[0].data);
  assert.equal(creates(second).length,0);assert.equal(reopened.scope.recoveries().length,1);
});

test('failure of an explicit new submission preserves the accepted old task for subsequent observation',async t=>{
  const w=fixture(),h=workspace(w),gate=defer(),n=node('same',21);t.after(()=>h.dispose());n.data.status='awaiting_result';h.setNodes([n]);w.createQueue.push(gate);const running=hook(w,h)('same',n.data,{regenerate:true});await w.flush();gate.reject(Object.assign(Error('new request refused'),{status:400}));await running;
  assert.equal(h.nodes[0].data.taskId,21);assert.equal(h.nodes[0].data.status,'awaiting_result');await hook(w,h)('same',h.nodes[0].data);assert.equal(creates(w).length,1);assert.deepEqual(clone(h.nodes[0].data.assetUrls),['output-21']);
});

test('stale callbacks cannot create a later intent while a fresh completed node can explicitly start one',async t=>{
  const w=fixture(),h=workspace(w),n=node('same',null);t.after(()=>h.dispose());h.setNodes([n]);const run=hook(w,h);await run('same',n.data);const first=creates(w)[0].payload.submission_key;await run('same',n.data);assert.equal(creates(w).length,1);
  await hook(w,h)('same',h.nodes[0].data);assert.equal(creates(w).length,2);assert.notEqual(creates(w)[1].payload.submission_key,first);
});

test('both actual regenerate buttons explicitly pass the new-intent option',()=>{
  for(const name of ['GenerateNode.tsx','CanvasNodeInspector.tsx']){const text=readFileSync(new URL(`../src/features/canvas/${name}`,import.meta.url),'utf8'),file=ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let button;
    function visit(n){if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(file)==='button'&&n.children.some(c=>ts.isJsxText(c)&&c.text.trim()==='重新生成'))button=n;ts.forEachChild(n,visit);}visit(file);assert.ok(button);const onClick=button.openingElement.attributes.properties.find(p=>p.name?.text==='onClick').initializer.expression;
    let received;const callback=compile(`export function make(generateNode,onGenerate,id,node,data){return (${onClick.getText(file)});}`).make((...args)=>received=args,(...args)=>received=args,'n',{id:'n'},{status:'awaiting_result'});callback();assert.equal(received[0],'n');assert.equal(received[2].regenerate,true);
  }
});

test('local regeneration validation failure keeps the original active task attachable',async t=>{
  const w=fixture(),h=workspace(w),n=node('same',21);t.after(()=>h.dispose());n.data.status='awaiting_result';h.setNodes([n]);
  const invalid=w.generate.useCanvasNodeGenerate([],h.nodes,[],h.handlers().patchNodeSilent,h.scope);await invalid('same',n.data,{regenerate:true});
  assert.equal(creates(w).length,0);assert.equal(h.nodes[0].data.taskId,21);assert.equal(h.nodes[0].data.status,'awaiting_result');assert.match(h.nodes[0].data.errorMessage,/模型/);
  await hook(w,h)('same',h.nodes[0].data);assert.equal(creates(w).length,0);assert.deepEqual(clone(h.nodes[0].data.assetUrls),['output-21']);
});
