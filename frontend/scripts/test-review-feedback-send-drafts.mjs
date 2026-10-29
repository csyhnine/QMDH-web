import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';
const src=name=>readFileSync(new URL(`../src/pages/studio/${name}`,import.meta.url),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function compile(code,imports={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Error,Promise,queueMicrotask,...globals,require:name=>{assert.ok(Object.hasOwn(imports,name),`unstubbed ${name}`);return imports[name];}});return exports;}
const record=id=>({id,title:`thread ${id}`,status:'open',updated_at:'2026-10-24',messages:[]});
function harness({queuedErrors=false}={}){
  let cursor=0,tree,mounted=true,dirty=false,owner={id:7,name:'owner'},guest=false,items=[record(1),record(2)],error='',refreshes=0,nextUrl=0,lateWrites=0,refreshImpl;
  const slots=[],updates=[],effects=[],requests=[],gates={main:[],follow:[],upload:[],refresh:[]},revoked=[],created=[],errorUpdates=[],errorQueue=[];
  function effect(fn,deps){const i=cursor++,old=slots[i];if(!old||!deps||deps.some((v,j)=>!Object.is(v,old.deps?.[j]))){const next={deps,setup:fn};slots[i]=next;effects.push(()=>{old?.cleanup?.();next.cleanup=fn();});}}
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>{if(!mounted){lateWrites++;return;}updates.push({i,next});dirty=true;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useMemo(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={deps,value:fn()};return slots[i].value;},useLayoutEffect:effect,useEffect:effect};
  const api={async createFeedback(payload){requests.push({kind:'main',payload:copy(payload)});const gate=gates.main.shift();return gate?await gate.promise:record(3);},async appendFeedbackMessage(id,payload){requests.push({kind:'follow',id,payload:copy(payload)});const gate=gates.follow.shift();return gate?await gate.promise:record(id);},async uploadReferenceImage(payload){requests.push({kind:'upload',payload:copy(payload)});const gate=gates.upload.shift();return gate?await gate.promise:{storage_path:`media/${payload.file_name}`};}};
  const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  const imports={react,'react/jsx-runtime':jsx,'react-router-dom':{useNavigate:()=>()=>{}},'../../api':{api},'../../context/AuthContext':{useAuth:()=>({isGuest:guest,currentUser:owner})},'../../lib/datetime':{formatChinaMonthDayTime:()=>''},'../../utils/uploads':{MAX_REFERENCE_UPLOAD_BYTES:100,formatUploadSize:()=>'',validateReferenceImageSize:file=>file.bad?'bad file':null}};
  if(existsSync(new URL('../src/pages/studio/feedbackDraftSession.ts',import.meta.url)))imports['./feedbackDraftSession']=compile(src('feedbackDraftSession.ts'));
  const component=compile(src('FeedbackPage.tsx'),imports,{URL:{createObjectURL(file){const url=`blob:feedback-${++nextUrl}`;created.push({url,name:file.name});return url;},revokeObjectURL:url=>revoked.push(url)},FileReader:class{readAsDataURL(file){this.result=`data:image/png;base64,${file.name}`;this.onload();}}}).default;
  const onSetError=next=>{errorUpdates.push(next);if(queuedErrors)errorQueue.push(next);else error=typeof next==='function'?next(error):next;};
  function render(commit=true){cursor=0;effects.length=0;tree=component({feedbackItems:items,error,onRefresh:(guard)=>{refreshes++;return refreshImpl?refreshImpl(guard):gates.refresh.shift()?.promise;},onSetError});if(commit)for(const run of effects.splice(0))run();return tree;}
  function flush(){if(!mounted)return;for(const next of errorQueue.splice(0))error=typeof next==='function'?next(error):next;for(const {i,next} of updates.splice(0))slots[i]=typeof next==='function'?next(slots[i]):next;dirty=false;render();}
  async function drain(){for(let i=0;i<12;i++){await Promise.resolve();if(mounted&&(dirty||errorQueue.length))flush();}}
  function nodes(value=tree){const out=[];function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'){out.push(n);walk(n.props?.children);}}walk(value);return out;}
  const main=()=>nodes().find(n=>n.type==='form'&&n.props.className==='feedback-form');
  const follow=id=>{const article=nodes().find(n=>n.type==='article'&&nodes(n).some(x=>x.type==='strong'&&x.props.children===`thread ${id}`));return nodes(article).find(n=>n.type==='form');};
  render();
  return{get tree(){return tree;},get error(){return error;},get refreshes(){return refreshes;},get lateWrites(){return lateWrites;},requests,revoked,created,errorUpdates,nodes,flush,drain,render,main,follow,
    hold(kind){const gate=deferred();gates[kind].push(gate);return gate;},title(value,commit=true){nodes(main()).find(n=>n.type==='input'&&!n.props.type).props.onChange({target:{value}});if(commit)flush();},message(value,commit=true){nodes(main()).find(n=>n.type==='textarea').props.onChange({target:{value}});if(commit)flush();},followText(id,value,commit=true){nodes(follow(id)).find(n=>n.type==='textarea').props.onChange({target:{value}});if(commit)flush();},submit(){return main().props.onSubmit({preventDefault(){}});},submitFollow(id){follow(id).props.onSubmit({preventDefault(){}});},
    value(field='message'){const n=field==='title'?nodes(main()).find(n=>n.type==='input'&&!n.props.type):nodes(main()).find(n=>n.type==='textarea');return n.props.value;},followValue(id){return nodes(follow(id)).find(n=>n.type==='textarea').props.value;},
    async upload(names){const files=names.map(name=>({name,type:'image/png',size:1}));nodes(main()).find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files}});await drain();},remove(index){const cards=nodes(main()).filter(n=>n.props?.className==='feedback-attachment-card');nodes(cards[index]).find(n=>n.type==='button').props.onClick();flush();},
    setItems(next){items=next;flush();},setRefresh(fn){refreshImpl=fn;},dispatchError:onSetError,replayEffects(){for(const slot of slots)slot?.cleanup?.();for(const slot of slots)if(slot?.setup)slot.cleanup=slot.setup();},changeOwner(){owner={id:8,name:'other'};flush();},profileRefresh(){owner={...owner,display_name:'updated'};flush();},setExternalError(value){error=value;},setGuest(){guest=true;flush();},discardOwnerRender(){const saved=slots.slice(),previousOwner=owner;owner={id:8,name:'discarded'};render(false);slots.splice(0,slots.length,...saved);owner=previousOwner;effects.length=0;render();},unmount(){mounted=false;dirty=false;for(const s of slots)s?.cleanup?.();},
  };
}

test('a successful main send preserves the new unsent body and title entered while it was pending',async()=>{
  const h=harness();h.title('title A');h.message('sent A');const gate=h.hold('main'),pending=h.submit();h.title('title B');h.message('unsent B');assert.equal(h.nodes(h.main()).find(n=>n.type==='textarea').props.disabled,undefined);gate.resolve(record(3));await pending;await h.drain();assert.equal(h.value(),'unsent B');assert.equal(h.value('title'),'title B');assert.deepEqual(h.requests.filter(r=>r.kind==='main'),[{kind:'main',payload:{title:'title A',message:'sent A',attachment_paths:[]}}]);
});

test('a successful follow-up send preserves the later unsent text in its own thread',async()=>{
  const h=harness();h.followText(1,'sent A');const gate=h.hold('follow');h.submitFollow(1);h.followText(1,'unsent B');gate.resolve(record(1));await h.drain();assert.equal(h.followValue(1),'unsent B');assert.deepEqual(h.requests.filter(r=>r.kind==='follow'),[{kind:'follow',id:1,payload:{message:'sent A'}}]);
});

test('unchanged main and follow-up drafts clear normally after their own sends',async()=>{
  const h=harness();h.title('A');h.message('A');await h.submit();await h.drain();assert.equal(h.value(),'');assert.equal(h.value('title'),'');h.followText(1,'A');h.submitFollow(1);await h.drain();assert.equal(h.followValue(1),'');assert.equal(h.refreshes,2);
});

test('new input is protected even before the next render or when the text returns to the same value',async()=>{
  const h=harness();h.title('A');h.message('same');const gate=h.hold('main'),pending=h.submit();h.message('different',false);h.message('same',false);gate.resolve(record(3));await pending;await h.drain();assert.equal(h.value(),'same');assert.equal(h.value('title'),'A');h.followText(1,'same');const follow=h.hold('follow');h.submitFollow(1);h.followText(1,'different',false);h.followText(1,'same',false);follow.resolve(record(1));await h.drain();assert.equal(h.followValue(1),'same');
});

test('a submit made before input rendering captures the current intended field values',async()=>{
  const h=harness();h.title('title B',false);h.message('body B',false);await h.submit();await h.drain();assert.deepEqual(h.requests[0].payload,{title:'title B',message:'body B',attachment_paths:[]});assert.equal(h.value(),'');
});

test('same-tick main and same-thread follow-up events each issue just one request',async()=>{
  const h=harness();h.title('A');h.message('A');const gate=h.hold('main'),one=h.submit(),two=h.submit();assert.equal(h.requests.filter(r=>r.kind==='main').length,1);gate.resolve(record(3));await Promise.all([one,two]);await h.drain();h.followText(1,'A');const follow=h.hold('follow');h.submitFollow(1);h.submitFollow(1);assert.equal(h.requests.filter(r=>r.kind==='follow').length,1);follow.resolve(record(1));await h.drain();
});

test('independent threads keep their own busy states and drafts through reversed completion',async()=>{
  const h=harness();h.followText(1,'one A');h.followText(2,'two A');const one=h.hold('follow'),two=h.hold('follow');h.submitFollow(1);h.submitFollow(2);h.flush();assert.equal(h.nodes(h.follow(1)).find(n=>n.type==='button').props.disabled,true);assert.equal(h.nodes(h.follow(2)).find(n=>n.type==='button').props.disabled,true);h.followText(1,'one B');two.resolve(record(2));await h.drain();assert.equal(h.followValue(2),'');assert.equal(h.followValue(1),'one B');assert.equal(h.nodes(h.follow(1)).find(n=>n.type==='button').props.disabled,true);one.resolve(record(1));await h.drain();assert.equal(h.followValue(1),'one B');assert.equal(h.nodes(h.follow(1)).find(n=>n.type==='button').props.disabled,false);
});

test('closing then reopening a thread creates a new observation that old finally cannot release',async()=>{
  const h=harness();h.followText(1,'old A');const old=h.hold('follow');h.submitFollow(1);h.setItems([{...record(1),status:'closed'},record(2)]);h.setItems([record(1),record(2)]);h.followText(1,'new B');const current=h.hold('follow');h.submitFollow(1);h.flush();old.resolve(record(1));await h.drain();assert.equal(h.followValue(1),'new B');assert.equal(h.nodes(h.follow(1)).find(n=>n.type==='button').props.disabled,true);current.resolve(record(1));await h.drain();assert.equal(h.followValue(1),'');assert.equal(h.nodes(h.follow(1)).find(n=>n.type==='button').props.disabled,false);
});

test('a thread removed from the visible list keeps a later unsent draft when it returns',async()=>{
  const h=harness();h.followText(1,'sent A');const old=h.hold('follow');h.submitFollow(1);h.followText(1,'unsent B');h.setItems([record(2)]);old.resolve(record(1));await h.drain();h.setItems([record(1),record(2)]);assert.equal(h.followValue(1),'unsent B');
});

test('current failures preserve drafts and release only their own lock without automatic retry',async()=>{
  const h=harness();h.title('A');h.message('A');const main=h.hold('main'),pending=h.submit();main.reject(Error('unknown transport'));await pending;await h.drain();assert.equal(h.value(),'A');assert.match(h.error,/unknown transport/);assert.equal(h.requests.filter(r=>r.kind==='main').length,1);await h.submit();await h.drain();assert.equal(h.requests.filter(r=>r.kind==='main').length,2);h.followText(1,'A');const follow=h.hold('follow');h.submitFollow(1);follow.reject(Error('append failed'));await h.drain();assert.equal(h.followValue(1),'A');assert.equal(h.nodes(h.follow(1)).find(n=>n.type==='button').props.disabled,false);assert.match(h.error,/append failed/);
});

test('old send failures and success error-clearing do not replace a later input context',async()=>{
  for(const fail of [false,true]){const h=harness();h.title('A');h.message('A');const gate=h.hold('main'),pending=h.submit();h.message('B');h.setExternalError('later error');if(fail)gate.reject(Error('old error'));else gate.resolve(record(3));await pending;await h.drain();assert.equal(h.value(),'B');assert.equal(h.error,'later error');}
});

test('validation and guest controls remain local and issue no feedback or message requests',async()=>{
  const h=harness();await h.submit();await h.drain();assert.match(h.error,/标题/);h.followText(1,'  ');h.submitFollow(1);await h.drain();assert.match(h.error,/补充/);h.setGuest();h.title('A');h.message('A');await h.submit();h.followText(1,'A');h.submitFollow(1);await h.drain();assert.match(h.error,/访客/);assert.equal(h.requests.length,0);
});

test('a later draft retaining the submitted attachment keeps its preview lease alive',async()=>{
  const h=harness();await h.upload(['A.png']);h.title('A');h.message('A');const gate=h.hold('main'),pending=h.submit();h.title('B');h.message('B');gate.resolve(record(3));await pending;await h.drain();assert.equal(h.nodes(h.main()).filter(n=>n.props?.className==='feedback-attachment-card').length,1);assert.deepEqual(h.revoked,[]);assert.deepEqual(h.requests.find(r=>r.kind==='main').payload.attachment_paths,['media/A.png']);
});

test('an unchanged sent draft releases its committed attachment preview exactly once',async()=>{
  const h=harness();await h.upload(['A.png']);h.title('A');h.message('A');await h.submit();await h.drain();assert.deepEqual(h.revoked,['blob:feedback-1']);assert.equal(h.nodes(h.main()).some(n=>n.props?.className==='feedback-attachment-card'),false);h.flush();h.unmount();await h.drain();assert.deepEqual(h.revoked,['blob:feedback-1']);
});

test('attachment removal during a pending send preserves the changed draft and releases only the removed preview',async()=>{
  const h=harness();await h.upload(['A.png','B.png']);h.title('A');h.message('A');const gate=h.hold('main'),pending=h.submit();h.remove(0);gate.resolve(record(3));await pending;await h.drain();const cards=h.nodes(h.main()).filter(n=>n.props?.className==='feedback-attachment-card');assert.equal(cards.length,1);assert.equal(h.nodes(cards[0]).find(n=>n.type==='img').props.alt,'B.png');assert.deepEqual(h.revoked,['blob:feedback-1']);assert.equal(h.value(),'A');assert.deepEqual(h.requests.find(r=>r.kind==='main').payload.attachment_paths,['media/A.png','media/B.png']);
});

test('starting a new upload invalidates old clearing even before the attachment has returned',async()=>{
  const h=harness();h.title('A');h.message('A');const main=h.hold('main'),pending=h.submit(),upload=h.hold('upload');await h.upload(['B.png']);main.resolve(record(3));await pending;await h.drain();assert.equal(h.value(),'A');upload.resolve({storage_path:'media/B.png'});await h.drain();assert.equal(h.nodes(h.main()).filter(n=>n.props?.className==='feedback-attachment-card').length,1);assert.equal(h.value(),'A');
});

test('send remains blocked until every active upload batch has settled',async()=>{
  const h=harness();h.title('A');h.message('A');const first=h.hold('upload'),second=h.hold('upload');await h.upload(['one.png']);await h.upload(['two.png']);first.resolve({storage_path:'media/one.png'});await h.drain();await h.submit();await h.drain();assert.equal(h.requests.filter(r=>r.kind==='main').length,0);assert.match(h.error,/上传/);second.resolve({storage_path:'media/two.png'});await h.drain();await h.submit();await h.drain();assert.equal(h.requests.filter(r=>r.kind==='main').length,1);
});

test('a current feedback list owner extends a committed preview lease after the draft clears',async()=>{
  const h=harness();await h.upload(['A.png']);h.setItems([{...record(1),messages:[{attachment_paths:['blob:feedback-1']}]},record(2)]);h.title('A');h.message('A');await h.submit();await h.drain();assert.deepEqual(h.revoked,[]);h.setItems([record(1),record(2)]);assert.deepEqual(h.revoked,['blob:feedback-1']);
});

test('unmount releases committed previews and rejects late send follow-up and upload writes',async()=>{
  const h=harness();await h.upload(['A.png']);h.title('A');h.message('A');h.followText(1,'A');const main=h.hold('main'),follow=h.hold('follow'),upload=h.hold('upload'),pending=h.submit();h.submitFollow(1);await h.upload(['B.png']);h.unmount();main.resolve(record(3));follow.resolve(record(1));upload.resolve({storage_path:'media/B.png'});await pending;await h.drain();assert.equal(h.lateWrites,0);assert.equal(h.refreshes,0);assert.equal(h.created.length,1);assert.deepEqual(h.revoked,['blob:feedback-1']);
});

test('account changes discard old operations while preserving the new account draft',async()=>{
  const h=harness();h.title('A');h.message('A');const gate=h.hold('main'),pending=h.submit();h.changeOwner();h.title('B');h.message('B');gate.resolve(record(3));await pending;await h.drain();assert.equal(h.value(),'B');assert.equal(h.value('title'),'B');assert.equal(h.refreshes,0);
});

test('same-account profile refresh and abandoned account rendering preserve the current send observation',async()=>{
  for(const discarded of [false,true]){const h=harness();h.title('A');h.message('A');const gate=h.hold('main'),pending=h.submit();if(discarded)h.discardOwnerRender();else h.profileRefresh();gate.resolve(record(3));await pending;await h.drain();assert.equal(h.value(),'');assert.equal(h.refreshes,1);}
});

test('the parent error state updater rechecks intent when it executes after later input',async()=>{
  const h=harness({queuedErrors:true});h.title('A');h.message('A');const gate=h.hold('main'),pending=h.submit();gate.reject(Error('old error'));await pending;h.message('B',false);h.setExternalError('later error');h.flush();assert.equal(h.error,'later error');assert.equal(h.value(),'B');
});

test('a record refresh failure after acceptance reports success accurately and never resends the feedback',async()=>{
  const h=harness();h.title('A');h.message('A');const refresh=h.hold('refresh');await h.submit();await h.drain();assert.equal(h.value(),'');refresh.reject(Error('read failed'));await h.drain();assert.match(h.error,/已发送.*刷新失败/);assert.equal(h.requests.filter(r=>r.kind==='main').length,1);
});

test('the actual parent refresh callback preserves later feedback while still refreshing records',async()=>{
  const code=readFileSync(new URL('../src/router.tsx',import.meta.url),'utf8'),file=ts.createSourceFile('router.tsx',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),route=file.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='StudioFeedbackRoute');let refresh,callback;
  function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='refresh')refresh=n.getText(file);if(ts.isJsxAttribute(n)&&n.name.getText(file)==='onRefresh')callback=n.initializer.expression.getText(file);ts.forEachChild(n,visit);}visit(route);assert.ok(refresh&&callback);
  for(const fail of [false,true]){const gate=deferred(),changes=[];let current=true,items=[];
    const exported=compile(`${refresh}\nexport const invoke=${callback};`,{},{api:{feedback:()=>gate.promise},setFeedbackItems:next=>{items=next;},setError:next=>changes.push(next)});exported.invoke(()=>current);if(fail)gate.reject(Error('old GET failure'));else gate.resolve([record(9)]);for(let i=0;i<8;i++)await Promise.resolve();current=false;let error='later feedback';for(const update of changes)error=typeof update==='function'?update(error):update;assert.equal(error,'later feedback');assert.deepEqual(copy(items),fail?[]:[record(9)]);}

});

test('the actual Page send passes its intent guard through the actual parent callback and queued error setter',async()=>{
  const code=readFileSync(new URL('../src/router.tsx',import.meta.url),'utf8'),file=ts.createSourceFile('router.tsx',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),route=file.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='StudioFeedbackRoute');let refresh,callback;
  function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='refresh')refresh=n.getText(file);if(ts.isJsxAttribute(n)&&n.name.getText(file)==='onRefresh')callback=n.initializer.expression.getText(file);ts.forEachChild(n,visit);}visit(route);
  const h=harness({queuedErrors:true}),list=deferred(),parent=compile(`${refresh}\nexport const invoke=${callback};`,{},{api:{feedback:()=>list.promise},setFeedbackItems:next=>h.setItems(next),setError:h.dispatchError});h.setRefresh(parent.invoke);h.title('A');h.message('A');const send=h.hold('main'),pending=h.submit();h.message('B');h.setExternalError('later feedback');send.resolve(record(3));await pending;await h.drain();list.resolve([record(9)]);await h.drain();assert.equal(h.error,'later feedback');assert.equal(h.value(),'B');assert.ok(h.nodes().some(n=>n.type==='strong'&&n.props.children==='thread 9'));assert.equal(h.requests.filter(r=>r.kind==='main').length,1);
});

test('Strict effect cleanup and replay do not revoke a still-visible preview or discard its pending send',async()=>{
  const h=harness();await h.upload(['A.png']);h.title('A');h.message('A');const gate=h.hold('main'),pending=h.submit();h.replayEffects();await h.drain();assert.deepEqual(h.revoked,[]);gate.resolve(record(3));await pending;await h.drain();assert.equal(h.value(),'');assert.deepEqual(h.revoked,['blob:feedback-1']);
});
