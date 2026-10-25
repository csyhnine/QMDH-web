import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const base=fileURLToPath(new URL('../src/features/studio/',import.meta.url));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
const image=name=>new File([`synthetic-${name}`],name,{type:'image/png'});
const tick=()=>new Promise(resolve=>setTimeout(resolve,1));
const text=n=>n==null||typeof n==='boolean'?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
function harness({avatar=false,max=4,ui=false}={}){
  let mounted=true,frame,changed=false,tree,state,form,tracker,setForm,setTracker,lateWrites=0,used;
  const instances=new Map(),updates=[],effects=[],cache=new Map(),requests=[],previews=[],revoked=[];
  const world={avatar,max,provider:'synthetic-provider',errors:[],clears:0,uploads:async p=>({storage_path:`/media/${p.file_name}`,file_name:p.file_name}),
    privateRegister:async()=>({asset_id:'synthetic-private',asset_url:'asset://synthetic-private',status:'active'}),privateGet:async()=>({asset_id:'synthetic-private',asset_url:'asset://synthetic-private',status:'active'}),
    realStart:async()=>({task_id:'verify-1',h5_link:'https://synthetic.invalid/verification'}),realRegister:async()=>({asset_id:'synthetic-real',asset_url:'asset://synthetic-real',status:'active'}),realGet:async()=>({asset_id:'synthetic-real',asset_url:'asset://synthetic-real',status:'active'}),
    exportImage:async()=>({fileName:'annotated.png',dataUrl:'data:image/png;base64,c3ludGhldGlj'})};
  const hooks={
    useState(initial){const f=frame,i=f.cursor++;if(!(i in f.slots))f.slots[i]=typeof initial==='function'?initial():initial;return[f.slots[i],next=>{if(!mounted||!f.active){lateWrites++;return;}updates.push({f,i,next});changed=true;}];},
    useRef(initial){const f=frame,i=f.cursor++;return f.slots[i]??={current:initial};},
    useMemo(create,deps){const f=frame,i=f.cursor++,old=f.slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))f.slots[i]={deps,value:create()};return f.slots[i].value;},
    useCallback(fn,deps){return hooks.useMemo(()=>fn,deps);},
    useEffect(create,deps){const f=frame,i=f.cursor++,old=f.slots[i];if(!old||!deps||deps.some((v,j)=>!Object.is(v,old.deps[j]))){const next={deps};f.slots[i]=next;effects.push(()=>{old?.cleanup?.();next.cleanup=create();});}},
  };
  function invoke(id,fn,props){let f=instances.get(id);if(!f){f={id,slots:[],cursor:0,child:0,active:true};instances.set(id,f);}f.cursor=0;f.child=0;used.add(id);const previous=frame;frame=f;try{return fn(props);}finally{frame=previous;}}
  function jsx(type,props,key){if(typeof type==='function'&&!type.fixtureLeaf)return invoke(`${frame.id}/${type.name}:${key??frame.child++}`,type,props);return{type,props};}
  const api={uploadReferenceImage:async p=>{requests.push({kind:'upload',payload:p});return world.uploads(p);},
    registerSeedancePrivateAvatar:async p=>{requests.push({kind:'private-register',payload:p});return world.privateRegister(p);},
    getSeedancePrivateAvatarAsset:async(...p)=>{requests.push({kind:'private-get',payload:p});return world.privateGet(...p);},
    startSeedanceRealAvatarVerify:async p=>{requests.push({kind:'real-start',payload:p});return world.realStart(p);},
    registerSeedanceRealAvatar:async p=>{requests.push({kind:'real-register',payload:p});return world.realRegister(p);},
    getSeedanceRealAvatarAsset:async(...p)=>{requests.push({kind:'real-get',payload:p});return world.realGet(...p);}};
  const url=class extends URL{};url.createObjectURL=value=>{const id=URL.createObjectURL(value);previews.push(id);return id;};url.revokeObjectURL=id=>{revoked.push(id);URL.revokeObjectURL(id);};
  class FileReader{readAsDataURL(file){file.arrayBuffer().then(bytes=>{this.result=`data:${file.type};base64,${Buffer.from(bytes).toString('base64')}`;this.onload?.();},()=>this.onerror?.());}}
  function AnnotateBoard(){}AnnotateBoard.fixtureLeaf=true;
  function load(spec,parent=path.join(base,'entry.ts')){
    if(spec==='react')return hooks;if(spec==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:Symbol.for('fragment')};if(spec==='react-dom')return{createPortal:node=>node};if(spec.endsWith('/AuthContext'))return{useAuth:()=>({isGuest:false,currentUser:{id:1}})};
    if(spec==='../../api')return{api};if(spec.endsWith('/canvas/AnnotateBoard'))return{default:AnnotateBoard};if(spec.endsWith('/canvas/annotateDraw'))return{exportAnnotatedDataUrl:(...args)=>world.exportImage(...args)};
    if(spec==='./studioTaskUtils')spec='./studioTaskReferenceUtils';
    const stem=path.resolve(path.dirname(parent),spec),file=existsSync(stem+'.tsx')?stem+'.tsx':stem+'.ts';if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
    const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    vm.runInNewContext(code,{exports,Error,TypeError,DOMException,AbortController,URL:url,FileReader,crypto,structuredClone,window:{innerWidth:1280,innerHeight:900},setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,1)),clearTimeout,require:name=>load(name,file)});return exports;
  }
  const constants=load('./studioConstants'),upload=load('./useStudioReferenceUploads'),Dropzone=load('./StudioReferenceDropzone').default,utils=load('./studioReferenceUtils');
  const input={value:'',click(){world.pickerClicks=(world.pickerClicks??0)+1;}};
  function root(){[form,setForm]=hooks.useState({...constants.defaultStudioForm,title:'synthetic form'});[tracker,setTracker]=hooks.useState(null);const[,setError]=hooks.useState('');
    state=upload.useStudioReferenceUploads({defaultTitle:'synthetic',enableSeedancePrivateAvatar:world.avatar,fileInputRef:{current:input},maxReferenceCount:world.max,onClearError:()=>{world.clears++;setError('');},onError:message=>{world.errors.push(message);setError(message);},selectedProviderName:world.provider,setStudioForm:setForm,setSubmissionTracker:setTracker,studioForm:form});
    return ui?jsx(Dropzone,{creationMode:form.creationMode,referenceUploads:state.referenceUploads,maxReferenceCount:world.max,enableSeedanceAvatar:world.avatar,onOpenReferencePicker:state.openReferencePicker,onReferenceDrop:state.handleReferenceDrop,onRemoveReferenceUpload:state.removeReferenceUpload,onReplaceReferenceUpload:state.replaceReferenceUploadAt,onRegisterSeedancePrivateAvatar:state.registerSeedancePrivateAvatar,onStartSeedanceRealAvatar:state.startSeedanceRealAvatar,onCompleteSeedanceRealAvatar:state.completeSeedanceRealAvatar}):null;
  }
  function render(){if(!mounted)return;for(let pass=0;pass<35;pass++){for(const{f,i,next}of updates.splice(0)){if(f.active)f.slots[i]=typeof next==='function'?next(f.slots[i]):next;}changed=false;used=new Set();tree=invoke('root',root);
    for(const[id,f]of instances)if(!used.has(id)){f.active=false;f.slots.forEach(slot=>slot?.cleanup?.());instances.delete(id);}effects.splice(0).forEach(fn=>fn());if(!changed)return;
  }throw Error('Hook driver did not settle');}
  function nodes(n){if(!arguments.length)n=tree;if(Array.isArray(n))return n.flatMap(v=>nodes(v));if(!n||typeof n!=='object')return[];return[n,...nodes(n.props?.children)];}
  render();return{world,requests,previews,revoked,utils,load,render,nodes,input,get state(){return state;},get form(){return form;},get tracker(){return tracker;},get lateWrites(){return lateWrites;},get text(){return text(tree);},
    add(p){const result=state.addReferenceFromStoragePath(p);render();return result;},drop(files,repaint=true){state.handleReferenceDrop({preventDefault(){},dataTransfer:{files}});if(repaint)render();},remove(index){state.removeReferenceUpload(index);render();},clear(){state.clearReferenceUpload();render();},replace(items){state.replaceReferenceUploads(items);render();},patch(p){setForm(current=>({...current,...p}));render();},trackerValue(value){setTracker(value);render();},
    async flush(){for(let i=0;i<12;i++){await tick();render();}},button(label){return nodes().find(n=>n.type==='button'&&(n.props['aria-label']===label||text(n)===label));},
    unmount(){if(!mounted)return;mounted=false;for(const f of instances.values()){f.active=false;f.slots.forEach(slot=>slot?.cleanup?.());}for(const p of previews)URL.revokeObjectURL(p);},
  };
}

test('removing old while new uploads never revives old in the list or form',async t=>{
  const h=harness();t.after(()=>h.unmount());h.add('/media/old.png');const gate=deferred();h.world.uploads=()=>gate.promise;h.drop([image('new.png')]);await h.flush();h.remove(0);gate.resolve({storage_path:'/media/new.png'});await h.flush();assert.equal(h.state.referenceUploads.map(x=>x.storagePath).join(','),'/media/new.png');assert.equal(h.form.referenceImages.join(','),'/media/new.png');
});

test('two concurrent drops keep both results in admission order and busy until the last batch',async t=>{
  const h=harness();t.after(()=>h.unmount());const a=deferred(),b=deferred();h.world.uploads=p=>p.file_name==='a.png'?a.promise:b.promise;h.drop([image('a.png')],false);h.drop([image('b.png')]);await h.flush();b.resolve({storage_path:'/media/b.png'});await h.flush();const busy=h.state.uploadingReference;a.resolve({storage_path:'/media/a.png'});await h.flush();
  assert.equal(h.state.referenceUploads.map(x=>x.storagePath).join(','),'/media/a.png,/media/b.png');assert.equal(h.form.referenceImages.join(','),'/media/a.png,/media/b.png');assert.equal(busy,true);assert.equal(h.state.uploadingReference,false);
});

test('healthy sequential uploads retain A then B with form paths matching the UI',async t=>{
  const h=harness();t.after(()=>h.unmount());h.drop([image('a.png')]);await h.flush();h.drop([image('b.png')]);await h.flush();assert.equal(h.form.referenceImages.join(','),'/media/a.png,/media/b.png');assert.equal(h.state.uploadingReference,false);assert.equal(h.tracker,null);assert.equal(h.requests.length,2);
});

test('capacity one includes a batch reserved before the next render',async t=>{
  const h=harness({max:1});t.after(()=>h.unmount());const gate=deferred();h.world.uploads=()=>gate.promise;h.drop([image('first.png')],false);h.drop([image('excess.png')]);await h.flush();assert.equal(h.requests.length,1);assert.equal(h.add('/media/extra.png').ok,false);gate.resolve({storage_path:'/media/first.png'});await h.flush();assert.equal(h.form.referenceImages.join(','),'/media/first.png');assert.ok(h.world.errors.length>0);
});

test('capacity four reserves every selected file across concurrent batches',async t=>{
  const h=harness();t.after(()=>h.unmount());const gate=deferred();h.world.uploads=p=>gate.promise.then(()=>({storage_path:`/media/${p.file_name}`}));h.drop(['a','b','c'].map(x=>image(x+'.png')),false);h.drop(['d','e'].map(x=>image(x+'.png')));h.drop([image('f.png')]);await h.flush();gate.resolve();await h.flush();assert.equal(h.requests.length,4);assert.equal(h.form.referenceImages.join(','),'/media/a.png,/media/b.png,/media/c.png,/media/d.png');
});

test('a partly failed batch releases its own previews and does not end another pending batch',async t=>{
  const h=harness();t.after(()=>h.unmount());const c=deferred();h.world.uploads=async p=>{if(p.file_name==='b.png')throw Error('synthetic upload failure');if(p.file_name==='c.png')return c.promise;return{storage_path:'/media/a.png'};};h.drop([image('a.png'),image('b.png')],false);h.drop([image('c.png')]);await h.flush();assert.equal(h.state.uploadingReference,true);assert.equal(h.revoked.filter(x=>x===h.previews[0]).length,1);await assert.rejects(fetch(h.previews[0]));c.resolve({storage_path:'/media/c.png'});await h.flush();assert.equal(h.form.referenceImages.join(','),'/media/c.png');assert.equal(h.state.uploadingReference,false);
});

test('clear invalidates an old upload but its finally cannot clear a new busy batch or tracker',async t=>{
  const h=harness();t.after(()=>h.unmount());const old=deferred(),fresh=deferred();h.world.uploads=p=>p.file_name==='old.png'?old.promise:fresh.promise;h.drop([image('old.png')]);await h.flush();h.clear();h.drop([image('fresh.png')]);await h.flush();const tracker=h.tracker;old.resolve({storage_path:'/media/old.png'});await h.flush();assert.equal(h.form.referenceImages.length,0);assert.equal(h.state.uploadingReference,true);assert.equal(h.tracker,tracker);assert.equal(h.revoked.length,1);fresh.resolve({storage_path:'/media/fresh.png'});await h.flush();assert.equal(h.form.referenceImages.join(','),'/media/fresh.png');assert.equal(h.tracker,null);
});

test('explicit replace all invalidates old batches and synchronizes replacement form paths',async t=>{
  const h=harness();t.after(()=>h.unmount());const gate=deferred();h.drop([image('old.png')]);await h.flush();h.world.uploads=()=>gate.promise;h.drop([image('late.png')]);await h.flush();h.replace([{fileName:'replacement',previewUrl:'/media/replacement.png',storagePath:'/media/replacement.png'}]);gate.resolve({storage_path:'/media/late.png'});await h.flush();assert.equal(h.form.referenceImages.join(','),'/media/replacement.png');assert.equal(h.state.referenceUploads[0].storagePath,'/media/replacement.png');assert.equal(h.revoked.length,2);
});

test('upload completion never clears an unrelated tracker even if it is transient',async t=>{
  const h=harness();t.after(()=>h.unmount());const gate=deferred();h.world.uploads=()=>gate.promise;h.drop([image('one.png')]);await h.flush();const other={taskId:null,stage:'submitting',taskTitle:'other operation'};h.trackerValue(other);gate.resolve({storage_path:'/media/one.png'});await h.flush();assert.equal(h.tracker,other);
});

test('native preview ownership survives metadata updates and is revoked exactly once after removal',async t=>{
  const h=harness({avatar:true});t.after(()=>h.unmount());h.drop([image('native.png')]);await h.flush();const preview=h.previews[0];await h.state.registerSeedancePrivateAvatar(0);h.render();assert.equal(await(await fetch(preview)).text(),'synthetic-native.png');assert.equal(h.revoked.length,0);h.remove(0);assert.equal(h.revoked.filter(p=>p===preview).length,1);h.unmount();assert.equal(h.revoked.filter(p=>p===preview).length,1);
});

test('a stale remove callback cannot remove the item that moved into its old index',t=>{
  const h=harness();t.after(()=>h.unmount());h.add('/media/a.png');h.add('/media/b.png');const old=h.state.removeReferenceUpload;h.remove(0);old(0);h.render();assert.equal(h.form.referenceImages.join(','),'/media/b.png');
});

function draw(h){const board=h.nodes().find(n=>n.type?.name==='AnnotateBoard');assert.ok(board);board.props.onChangeStrokes([{id:'synthetic',tool:'region',color:'#ff0000',width:3,opacity:.5,points:[{x:.1,y:.2},{x:.2,y:.3}]}]);h.render();}
function annotate(h,name){h.button(`标注 ${name}`).props.onClick();h.render();draw(h);}
function startRealUi(h,index=0){h.nodes().filter(n=>n.type==='button'&&text(n)==='入库')[index].props.onClick();h.render();h.button('真人入库').props.onClick();h.render();}

test('annotation is applied to its stable item when an earlier item is removed during upload',async t=>{
  const h=harness({ui:true});t.after(()=>h.unmount());h.add('/media/first.png');h.add('/media/target.png');const gate=deferred();h.world.uploads=()=>gate.promise;annotate(h,'target.png');h.button('应用到参考图').props.onClick();h.render();await h.flush();h.remove(0);gate.resolve({storage_path:'/media/marked.png',file_name:'marked.png'});await h.flush();assert.equal(h.form.referenceImages.join(','),'/media/marked.png');assert.doesNotMatch(h.text,/标注参考图 ·/);
});

test('closing annotation while export waits prevents the upload and cannot close a new session',async t=>{
  const h=harness({ui:true});t.after(()=>h.unmount());h.add('/media/a.png');h.add('/media/b.png');const gate=deferred();h.world.exportImage=()=>gate.promise;annotate(h,'a.png');h.button('应用到参考图').props.onClick();h.render();h.button('关闭').props.onClick();h.render();annotate(h,'b.png');gate.resolve({fileName:'late.png',dataUrl:'data:image/png;base64,c3ludGhldGlj'});await h.flush();assert.equal(h.requests.length,0);assert.match(h.text,/标注参考图 · b.png/);assert.equal(h.lateWrites,0);
});

test('closing and clearing during annotation upload never revives its item or closes the next editor',async t=>{
  const h=harness({ui:true});t.after(()=>h.unmount());h.add('/media/a.png');const gate=deferred();h.world.uploads=()=>gate.promise;annotate(h,'a.png');h.button('应用到参考图').props.onClick();h.render();await h.flush();h.button('关闭').props.onClick();h.render();h.clear();h.add('/media/a.png');annotate(h,'a.png');gate.resolve({storage_path:'/media/late.png'});await h.flush();assert.equal(h.form.referenceImages.join(','),'/media/a.png');assert.match(h.text,/标注参考图 · a.png/);assert.equal(h.lateWrites,0);
});

test('annotation confirm locks synchronously and failure permits a deliberate retry with strokes retained',async t=>{
  const h=harness({ui:true});t.after(()=>h.unmount());h.add('/media/a.png');const gate=deferred();h.world.uploads=()=>gate.promise;annotate(h,'a.png');const click=h.button('应用到参考图').props.onClick;click();click();h.render();await h.flush();assert.equal(h.requests.length,1);gate.reject(Error('synthetic annotation rejection'));await h.flush();assert.match(h.text,/synthetic annotation rejection/);assert.ok(h.nodes().find(n=>n.type?.name==='AnnotateBoard').props.strokes.length>0);h.world.uploads=async()=>({storage_path:'/media/retry.png'});h.button('应用到参考图').props.onClick();h.render();await h.flush();assert.equal(h.form.referenceImages.join(','),'/media/retry.png');assert.equal(h.requests.length,2);
});

test('a remove button captured before a list shift still removes its own identity',t=>{
  const h=harness({ui:true});t.after(()=>h.unmount());h.add('/media/a.png');h.add('/media/b.png');const button=h.button('移除 b.png');h.remove(0);button.props.onClick();h.render();assert.equal(h.form.referenceImages.length,0);
});

test('private avatar active response after clear cannot revive the old item',async t=>{
  const h=harness({avatar:true});t.after(()=>h.unmount());h.add('/media/avatar.png');const gate=deferred();h.world.privateRegister=()=>gate.promise;const action=h.state.registerSeedancePrivateAvatar(0);h.render();h.clear();gate.resolve({asset_id:'late',asset_url:'asset://late',status:'active'});await action;await h.flush();assert.equal(h.state.referenceUploads.length,0);assert.equal(h.form.referenceImages.length,0);assert.equal(h.state.uploadingReference,false);
});

test('private avatar result follows its item after an earlier index is removed and preserves protocol isolation',async t=>{
  const h=harness({avatar:true});t.after(()=>h.unmount());h.add('/media/first.png');h.add('/media/target.png');const gate=deferred();h.world.privateRegister=()=>gate.promise;const action=h.state.registerSeedancePrivateAvatar(1);h.render();h.remove(0);gate.resolve({asset_id:'target',asset_url:'asset://target',status:'active'});await action;h.render();assert.equal(h.state.referenceUploads[0].fileName,'target.png');assert.equal(h.state.referenceUploads[0].avatarStatus,'active');assert.equal(h.form.referenceImages.join(','),'/media/target.png');assert.equal(h.utils.resolveReferencePathsForProvider(h.state.referenceUploads,{allowAssetProtocol:false}).join(','),'/media/target.png');assert.equal(h.utils.resolveReferencePathsForProvider(h.state.referenceUploads,{allowAssetProtocol:true}).join(','),'asset://target');
});

test('processing private poll discarded after removal cannot attach an asset to the next item',async t=>{
  const h=harness({avatar:true});t.after(()=>h.unmount());h.add('/media/a.png');h.add('/media/b.png');const gate=deferred();h.world.privateRegister=async()=>({asset_id:'polling',status:'processing'});h.world.privateGet=()=>gate.promise;const action=h.state.registerSeedancePrivateAvatar(0);h.render();await h.flush();assert.ok(h.requests.some(r=>r.kind==='private-get'));h.remove(0);gate.resolve({asset_id:'late',asset_url:'asset://late',status:'active'});await action;h.render();assert.equal(h.form.referenceImages.join(','),'/media/b.png');assert.notEqual(h.state.referenceUploads[0].avatarStatus,'active');
});

test('independent private operations keep busy until both settle without changing each others items',async t=>{
  const h=harness({avatar:true});t.after(()=>h.unmount());h.add('/media/a.png');h.add('/media/b.png');const a=deferred(),b=deferred();h.world.privateRegister=p=>p.storage_path.endsWith('a.png')?a.promise:b.promise;const first=h.state.registerSeedancePrivateAvatar(0);h.render();const second=h.state.registerSeedancePrivateAvatar(1);h.render();b.resolve({asset_id:'b',status:'active'});await second;h.render();assert.equal(h.state.uploadingReference,true);a.resolve({asset_id:'a',status:'active'});await first;h.render();assert.equal(h.state.referenceUploads.map(i=>i.assetId).join(','),'a,b');assert.equal(h.state.uploadingReference,false);
});

test('replacing an image invalidates an old private registration before any result sync',async t=>{
  const h=harness({avatar:true});t.after(()=>h.unmount());h.add('/media/a.png');const gate=deferred();h.world.privateRegister=()=>gate.promise;const action=h.state.registerSeedancePrivateAvatar(0);h.render();h.state.replaceReferenceUploadAt(0,{fileName:'marked.png',storagePath:'/media/marked.png',previewUrl:'/media/marked.png'});h.render();gate.resolve({asset_id:'late',status:'active'});await action;h.render();assert.equal(h.form.referenceImages.join(','),'/media/marked.png');assert.equal(h.state.referenceUploads[0].avatarStatus,'idle');assert.equal(h.state.referenceUploads[0].assetId,undefined);
});

test('provider or capability changes discard private results without clearing the ordinary reference',async t=>{
  for(const change of ['provider','capability']){const h=harness({avatar:true});t.after(()=>h.unmount());h.add('/media/a.png');const gate=deferred();h.world.privateRegister=()=>gate.promise;const action=h.state.registerSeedancePrivateAvatar(0);h.render();if(change==='provider')h.world.provider='another-provider';else h.world.avatar=false;h.render();gate.resolve({asset_id:'late',status:'active'});await action;h.render();assert.equal(h.form.referenceImages.join(','),'/media/a.png');assert.equal(h.state.referenceUploads[0].assetId,undefined);assert.equal(h.requests[0].payload.provider_name,'synthetic-provider');}
});

test('real start cancelled by clear rejects locally and never reintroduces the verification item',async t=>{
  const h=harness({avatar:true});t.after(()=>h.unmount());h.add('/media/real.png');const gate=deferred();h.world.realStart=()=>gate.promise;const action=h.state.startSeedanceRealAvatar(0);const cancelled=assert.rejects(action,error=>error.name==='AbortError');h.render();h.clear();gate.resolve({task_id:'late-task',h5_link:'https://synthetic.invalid/late'});await cancelled;h.render();assert.equal(h.form.referenceImages.length,0);assert.equal(h.state.referenceUploads.length,0);
});

test('healthy real start and complete use captured task and stable shifted item with media paths intact',async t=>{
  const h=harness({avatar:true});t.after(()=>h.unmount());h.add('/media/first.png');h.add('/media/real.png');const started=await h.state.startSeedanceRealAvatar(1);h.render();h.remove(0);await h.state.completeSeedanceRealAvatar(0,started.taskId);h.render();const real=h.requests.find(r=>r.kind==='real-register');assert.equal(real.payload.verify_task_id,'verify-1');assert.equal(real.payload.storage_path,'/media/real.png');assert.equal(h.state.referenceUploads[0].avatarKind,'real');assert.equal(h.state.referenceUploads[0].avatarStatus,'active');assert.equal(h.form.referenceImages.join(','),'/media/real.png');
});

test('external cancellation during real start ignores the late link and resets only local verification state',async t=>{
  const h=harness({avatar:true});t.after(()=>h.unmount());h.add('/media/real.png');const gate=deferred(),controller=new AbortController();h.world.realStart=()=>gate.promise;const action=h.state.startSeedanceRealAvatar(0,controller.signal),cancelled=assert.rejects(action,error=>error.name==='AbortError');h.render();controller.abort();h.render();gate.resolve({task_id:'late',h5_link:'https://synthetic.invalid/late'});await cancelled;h.render();assert.equal(h.form.referenceImages.join(','),'/media/real.png');assert.equal(h.state.referenceUploads[0].verifyTaskId,undefined);assert.equal(h.state.uploadingReference,false);
});

test('real completion cancellation rejects an active late registration before it mutates reference state',async t=>{
  const h=harness({avatar:true});t.after(()=>h.unmount());h.add('/media/real.png');const started=await h.state.startSeedanceRealAvatar(0);h.render();const gate=deferred(),controller=new AbortController();h.world.realRegister=()=>gate.promise;const action=h.state.completeSeedanceRealAvatar(0,started.taskId,controller.signal);h.render();controller.abort();h.render();gate.resolve({asset_id:'late-real',status:'active'});await action;h.render();assert.equal(h.state.referenceUploads[0].assetId,undefined);assert.equal(h.state.referenceUploads[0].avatarStatus,'idle');assert.equal(h.form.referenceImages.join(','),'/media/real.png');
});

test('real modal cancel during start cannot be reopened by an old link or close a new item session',async t=>{
  const h=harness({avatar:true,ui:true});t.after(()=>h.unmount());h.add('/media/a.png');h.add('/media/b.png');const gate=deferred();let starts=0;h.world.realStart=()=>++starts===1?gate.promise:Promise.resolve({task_id:'new-task',h5_link:'https://synthetic.invalid/new'});startRealUi(h,0);h.button('取消').props.onClick();h.render();startRealUi(h,1);await h.flush();gate.resolve({task_id:'old-task',h5_link:'https://synthetic.invalid/old'});await h.flush();assert.ok(h.nodes().some(n=>n.type==='a'&&n.props.href==='https://synthetic.invalid/new'));assert.ok(!h.nodes().some(n=>n.type==='a'&&n.props.href==='https://synthetic.invalid/old'));assert.equal(h.state.referenceUploads[0].verifyTaskId,undefined);assert.equal(h.state.referenceUploads[1].verifyTaskId,'new-task');
});

test('real modal completion targets its item after an earlier removal instead of the old index',async t=>{
  const h=harness({avatar:true,ui:true});t.after(()=>h.unmount());h.add('/media/first.png');h.add('/media/real.png');startRealUi(h,1);await h.flush();h.remove(0);h.button('认证完成，继续入库').props.onClick();h.render();await h.flush();assert.equal(h.requests.find(r=>r.kind==='real-register').payload.storage_path,'/media/real.png');assert.equal(h.state.referenceUploads[0].avatarStatus,'active');assert.doesNotMatch(h.text,/真人入库认证/);
});

test('unmount discards late ordinary and private completions with no state writes or leaked previews',async t=>{
  const h=harness({avatar:true});t.after(()=>h.unmount());h.add('/media/avatar.png');const upload=deferred(),avatar=deferred();h.world.uploads=()=>upload.promise;h.world.privateRegister=()=>avatar.promise;const action=h.state.registerSeedancePrivateAvatar(0);h.render();h.drop([image('late.png')]);await h.flush();h.unmount();upload.resolve({storage_path:'/media/late.png'});avatar.resolve({asset_id:'late',status:'active'});await action;await h.flush();assert.equal(h.lateWrites,0);assert.equal(h.revoked.length,1);await assert.rejects(fetch(h.previews[0]));
});

test('shared preview owners and orphan batches never revoke a preview retained by a current item',t=>{
  const h=harness();t.after(()=>h.unmount());const {ReferenceUploadSession}=h.load('./studioReferenceUploadSession'),released=[];const source=new ReferenceUploadSession(url=>released.push(url));const item={fileName:'shared',storagePath:'/media/shared.png',previewUrl:'blob:synthetic-shared'};source.reset([item,item]);source.remove(source.items[0].localId);assert.equal(released.length,0);const ticket=source.reserve(1);source.reset(source.items);source.finish(ticket,[item]);assert.equal(released.length,0);source.dispose();assert.equal(released.join(','),'blob:synthetic-shared');
});

test('project or media changes preserve references and do not invent an upload reset rule',async t=>{
  const h=harness();t.after(()=>h.unmount());h.add('/media/existing.png');const gate=deferred();h.world.uploads=()=>gate.promise;h.drop([image('pending.png')]);await h.flush();h.patch({projectCode:'different-project',creationMode:'video'});gate.resolve({storage_path:'/media/pending.png'});await h.flush();assert.equal(h.form.referenceImages.join(','),'/media/existing.png,/media/pending.png');assert.equal(h.form.projectCode,'different-project');assert.equal(h.form.creationMode,'video');
});

test('same-render real completion double click cannot cancel the original pending registration',async t=>{
  const h=harness({avatar:true,ui:true});t.after(()=>h.unmount());h.add('/media/real.png');startRealUi(h);await h.flush();const gate=deferred();h.world.realRegister=()=>gate.promise;const click=h.button('认证完成，继续入库').props.onClick;click();click();h.render();await h.flush();gate.resolve({asset_id:'completed-once',status:'active'});await h.flush();assert.equal(h.requests.filter(r=>r.kind==='real-register').length,1);assert.equal(h.state.referenceUploads[0].avatarStatus,'active');
});

test('changing provider closes the stale real verification modal without losing the reference',async t=>{
  const h=harness({avatar:true,ui:true});t.after(()=>h.unmount());h.add('/media/real.png');startRealUi(h);await h.flush();assert.match(h.text,/真人入库认证/);h.world.provider='another-provider';h.render();await h.flush();assert.doesNotMatch(h.text,/真人入库认证/);assert.equal(h.form.referenceImages.join(','),'/media/real.png');
});

test('ordinary upload and private registration share busy accounting without clearing the upload tracker early',async t=>{
  const h=harness({avatar:true});t.after(()=>h.unmount());h.add('/media/avatar.png');const avatar=deferred(),upload=deferred();h.world.privateRegister=()=>avatar.promise;h.world.uploads=()=>upload.promise;const action=h.state.registerSeedancePrivateAvatar(0);h.render();h.drop([image('new.png')]);await h.flush();const tracker=h.tracker;avatar.resolve({asset_id:'ready',status:'active'});await action;h.render();assert.equal(h.state.uploadingReference,true);assert.equal(h.tracker,tracker);upload.resolve({storage_path:'/media/new.png'});await h.flush();assert.equal(h.state.uploadingReference,false);assert.equal(h.tracker,null);assert.equal(h.form.referenceImages.join(','),'/media/avatar.png,/media/new.png');
});

test('processing real poll after clear cannot publish the late active asset',async t=>{
  const h=harness({avatar:true});t.after(()=>h.unmount());h.add('/media/real.png');const started=await h.state.startSeedanceRealAvatar(0);h.render();const gate=deferred();h.world.realRegister=async()=>({asset_id:'processing-real',status:'processing'});h.world.realGet=()=>gate.promise;const action=h.state.completeSeedanceRealAvatar(0,started.taskId);h.render();await h.flush();assert.ok(h.requests.some(r=>r.kind==='real-get'));h.clear();gate.resolve({asset_id:'late-real',status:'active'});await action;h.render();assert.equal(h.form.referenceImages.length,0);assert.equal(h.state.referenceUploads.length,0);
});

test('a task id from a different real verification cannot submit the current item',async t=>{
  const h=harness({avatar:true});t.after(()=>h.unmount());h.add('/media/real.png');await h.state.startSeedanceRealAvatar(0);h.render();await h.state.completeSeedanceRealAvatar(0,'obsolete-task');h.render();assert.equal(h.requests.filter(r=>r.kind==='real-register').length,0);assert.equal(h.state.referenceUploads[0].verifyTaskId,'verify-1');
});
