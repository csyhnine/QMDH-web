import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const clone=x=>JSON.parse(JSON.stringify(x));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
const template=(id,label,extra={})=>({id,scope:'private',media_type:'image',label,title:`title-${label}`,prompt:`prompt-${label}`,style:'modern',aspect_ratio:'16:9',resolution:'1k',deliverable:'render',notes:'notes',updated_at:'2026-10-24T00:00:00Z',...extra});
const A=template(101,'A'),B=template(202,'B');
function content(n){if(n==null||typeof n==='boolean')return '';if(Array.isArray(n))return n.map(content).join('');return typeof n==='object'?content(n.props?.children):String(n);}
function harness(){
  let cursor=0,mounted=true,changed=false,tree,state,form,setForm,error='',lateWrites=0;
  const slots=[],updates=[],effects=[],requests=[],cache=new Map();
  const world={save:async request=>template(request.id??1001,request.payload.label,{...request.payload}),remove:async()=>{},created:[]};
  const hooks={
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>{if(!mounted){lateWrites++;return;}updates.push({i,next});changed=true;}];},
    useRef(initial){const i=cursor++;return slots[i]??={current:initial};},
    useMemo(create,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={deps,value:create()};return slots[i].value;},
    useCallback(callback,deps){return hooks.useMemo(()=>callback,deps);},
    useEffect(create,deps){const i=cursor++,old=slots[i];if(!old||!deps||deps.some((v,j)=>!Object.is(v,old.deps[j]))){const next={deps};slots[i]=next;effects.push(()=>{old?.cleanup?.();next.cleanup=create();});}},
  };
  const api={
    createPromptTemplate:async payload=>{const request={kind:'POST',id:null,payload:clone(payload)};requests.push(request);const saved=await world.save(request);world.created.push(saved.id);return saved;},
    updatePromptTemplate:async(id,payload)=>{const request={kind:'PATCH',id,payload:clone(payload)};requests.push(request);return world.save(request);},
    deletePromptTemplate:async id=>{requests.push({kind:'DELETE',id});return world.remove(id);},
  };
  const jsx=(type,props)=>typeof type==='function'?type(props):({type,props});
  function load(name){
    if(name==='react')return hooks;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='../../api')return{api};
    if(name==='./studioUtils')name='./studioTemplateFormUtils';if(cache.has(name))return cache.get(name);
    const stem=new URL(`../src/features/studio/${name.replace(/^\.\//,'')}`,import.meta.url),file=new URL(existsSync(new URL(`${stem.pathname}.tsx`,stem))?`${stem.pathname}.tsx`:`${stem.pathname}.ts`,stem);
    const source=readFileSync(file,'utf8'),exports={};cache.set(name,exports);
    const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    vm.runInNewContext(code,{exports,Error,TypeError,structuredClone,console,require:load});return exports;
  }
  const constants=load('./studioConstants'),templates=load('./useStudioTemplates'),Editor=load('./StudioTemplateEditor').default;
  function render(){if(!mounted)return;for(let pass=0;pass<35;pass++){
    for(const {i,next}of updates.splice(0))slots[i]=typeof next==='function'?next(slots[i]):next;
    cursor=0;changed=false;let setError;[form,setForm]=hooks.useState({...clone(constants.defaultStudioForm),title:'original',prompt:'original prompt'});[error,setError]=hooks.useState('');const[,setMenu]=hooks.useState(null);
    state=templates.useStudioTemplates({studioForm:form,setStudioForm:setForm,setActiveComposerMenu:setMenu,onClearError:()=>setError(''),onError:value=>setError(value),workspaceName:'synthetic workspace'});
    tree=Editor({editingTemplateId:state.editingTemplateId,templateDraftLabel:state.templateDraftLabel,templateDraftTitle:state.templateDraftTitle,templateFeedback:state.templateFeedback,onSaveCustomTemplate:()=>void state.saveCustomTemplate(),onCancelTemplateEdit:state.cancelTemplateEdit,onTemplateDraftLabelChange:state.setTemplateDraftLabel,onTemplateDraftTitleChange:state.setTemplateDraftTitle});
    effects.splice(0).forEach(fn=>fn());if(!changed)return;
  }throw Error('hook driver did not settle');}
  function nodes(n){if(!arguments.length)n=tree;if(Array.isArray(n))return n.flatMap(v=>nodes(v));if(!n||typeof n!=='object')return[];return[n,...nodes(n.props?.children)];}
  render();state.setPromptTemplates([A,B]);render();
  return{world,requests,render,nodes,load,get state(){return state;},get form(){return form;},get error(){return error;},get text(){return content(tree);},get lateWrites(){return lateWrites;},
    edit(t){state.editCustomTemplate(t);render();},queuePatch(p){setForm(current=>({...current,...p}));},patch(p){setForm(current=>({...current,...p}));render();},label(value){state.setTemplateDraftLabel(value);render();},title(value){state.setTemplateDraftTitle(value);render();},
    save(){const result=state.saveCustomTemplate();render();return result;},cancel(){state.cancelTemplateEdit();render();},sync(){state.syncTemplateDraftWithCurrentForm();render();},
    button(){return nodes().find(n=>n.type==='button'&&n.props.onClick&&/更新提示词|保存当前提示词|保存中|待核对/.test(content(n)));},
    async flush(){for(let i=0;i<4;i++){await Promise.resolve();render();}},unmount(){if(!mounted)return;mounted=false;slots.forEach(slot=>slot?.cleanup?.());},
  };
}

test('late A save cannot rebind B before the second actual PATCH',async t=>{
  const h=harness();t.after(()=>h.unmount());const gate=deferred();h.world.save=r=>r.id===101?gate.promise:Promise.resolve(template(r.id,r.payload.label,r.payload));
  h.edit(A);h.label('saved-A');const saveA=h.save();h.edit(B);h.label('saved-B');gate.resolve(template(101,'saved-A'));await saveA;h.render();await h.save();h.render();
  assert.equal(h.requests.length,2);assert.equal(h.requests[0].id,101);assert.equal(h.requests[1].id,202);assert.equal(h.requests[1].payload.label,'saved-B');assert.equal(h.state.editingTemplateId,202);
});

test('same render repeated create sends a single POST for one draft',async t=>{
  const h=harness();t.after(()=>h.unmount());const gate=deferred();h.world.save=()=>gate.promise;h.label('new-draft');const save=h.state.saveCustomTemplate;const first=save(),second=save();
  const count=h.requests.length;gate.resolve(template(1001,'new-draft'));await Promise.all([first,second]);h.render();assert.equal(count,1);assert.equal(h.world.created.length,1);assert.equal(h.state.customTemplates.filter(t=>t.id===1001).length,1);
});

test('pending state disables the rendered save button and still blocks a retained keyboard callback',async t=>{
  const h=harness();t.after(()=>h.unmount());const gate=deferred();h.world.save=()=>gate.promise;h.label('pending');const retained=h.state.saveCustomTemplate,first=h.save();
  assert.equal(h.button().props.disabled,true);assert.match(h.text,/保存中/);await retained();await h.state.saveCustomTemplate();assert.equal(h.requests.length,1);
  gate.resolve(template(1001,'pending'));await first;h.render();assert.equal(h.button().props.disabled,false);
});

test('successful create binds its id before the next render so an older save callback PATCHes it',async t=>{
  const h=harness();t.after(()=>h.unmount());h.label('new');const callback=h.state.saveCustomTemplate;await callback();await callback();h.render();assert.equal(h.requests.length,2);assert.equal(h.requests[0].kind,'POST');assert.equal(h.requests[1].kind,'PATCH');assert.equal(h.requests[1].id,1001);
});

test('newer text label and title survive an update acknowledgement and keep the cancel snapshot',async t=>{
  const h=harness();t.after(()=>h.unmount());const original=clone(h.form),gate=deferred();h.edit(A);h.world.save=()=>gate.promise;const save=h.save();h.patch({prompt:'typed during save'});h.label('new label');h.title('new title');gate.resolve(A);await save;h.render();
  assert.equal(h.form.prompt,'typed during save');assert.equal(h.state.templateDraftLabel,'new label');assert.equal(h.state.templateDraftTitle,'new title');assert.equal(h.state.templateFeedback.type,'info');assert.match(h.text,/未保存改动/);h.cancel();assert.equal(h.form.prompt,original.prompt);assert.equal(h.form.title,original.title);
});

test('new draft continued during create keeps new text while its next save updates the acknowledged id',async t=>{
  const h=harness();t.after(()=>h.unmount());const gate=deferred();h.label('first label');h.world.save=()=>gate.promise;const save=h.save();h.label('continued label');h.patch({prompt:'continued prompt'});gate.resolve(template(1001,'first label'));await save;h.render();
  assert.equal(h.state.editingTemplateId,1001);assert.equal(h.state.templateDraftLabel,'continued label');assert.equal(h.form.prompt,'continued prompt');assert.equal(h.state.templateFeedback.type,'info');h.world.save=async r=>template(r.id,r.payload.label,r.payload);await h.save();h.render();assert.equal(h.requests[1].kind,'PATCH');assert.equal(h.requests[1].id,1001);assert.equal(h.requests[1].payload.prompt,'continued prompt');
});

test('A completion cannot erase B cancellation snapshot',async t=>{
  const h=harness();t.after(()=>h.unmount());const gate=deferred();h.edit(A);h.patch({prompt:'A before B'});const beforeB=h.form.prompt;h.world.save=()=>gate.promise;const save=h.save();h.edit(B);gate.resolve(A);await save;h.render();h.cancel();assert.equal(h.form.prompt,beforeB);assert.equal(h.state.editingTemplateId,null);
});

test('cancel and new draft are not rebound to the late saved template',async t=>{
  const h=harness();t.after(()=>h.unmount());const gate=deferred();h.edit(A);h.world.save=()=>gate.promise;const save=h.save();h.cancel();h.label('new after cancel');h.patch({prompt:'new prompt'});gate.resolve(A);await save;h.render();assert.equal(h.state.editingTemplateId,null);assert.equal(h.state.templateDraftLabel,'new after cancel');h.world.save=async r=>template(1002,r.payload.label,r.payload);await h.save();assert.equal(h.requests[1].kind,'POST');
});

test('A B A reentry is a different editing session even with the same record id',async t=>{
  const h=harness();t.after(()=>h.unmount());const gate=deferred();h.edit(A);h.world.save=()=>gate.promise;const save=h.save();h.edit(B);h.edit(A);h.label('reentered A');h.patch({prompt:'reentered prompt'});gate.resolve(A);await save;h.render();assert.equal(h.state.editingTemplateId,101);assert.equal(h.state.templateDraftLabel,'reentered A');assert.equal(h.form.prompt,'reentered prompt');assert.equal(h.state.templateFeedback,null);
});

test('a save callback retained from A cannot submit the new B form',async t=>{
  const h=harness();t.after(()=>h.unmount());h.edit(A);const old=h.state.saveCustomTemplate;h.edit(B);h.label('B current');await old();h.render();assert.equal(h.requests.length,0);assert.equal(h.state.templateDraftLabel,'B current');
});

test('same tick label edit is read from the current draft snapshot rather than a render closure',async t=>{
  const h=harness();t.after(()=>h.unmount());h.label('before');const save=h.state.saveCustomTemplate;h.state.setTemplateDraftLabel('same tick label');await save();h.render();assert.equal(h.requests[0].payload.label,'same tick label');
});

test('A finally does not release the separate pending B lock',async t=>{
  const h=harness();t.after(()=>h.unmount());const a=deferred(),b=deferred();h.world.save=r=>r.id===101?a.promise:b.promise;h.edit(A);const first=h.save();h.edit(B);const second=h.save();
  a.resolve(A);await first;h.render();assert.equal(h.button().props.disabled,true);await h.state.saveCustomTemplate();assert.equal(h.requests.length,2);b.resolve(B);await second;h.render();assert.equal(h.state.editingTemplateId,202);assert.equal(h.button().props.disabled,false);
});

test('a late A rejection does not replace B feedback or error',async t=>{
  const h=harness();t.after(()=>h.unmount());const gate=deferred();h.edit(A);h.world.save=()=>gate.promise;const save=h.save();h.edit(B);h.label('');await h.save();h.render();const message=h.error;gate.reject(Object.assign(Error('old A rejection'),{status:400}));await save;h.render();assert.equal(h.error,message);assert.doesNotMatch(h.text,/old A rejection/);assert.equal(h.state.editingTemplateId,202);
});

test('explicit ordinary rejection unlocks the original draft for a manual retry',async t=>{
  for(const status of [400,404,409,413,422]){const h=harness();t.after(()=>h.unmount());h.label('keep rejected draft');h.world.save=async()=>{throw Object.assign(Error(`synthetic refusal ${status}`),{status});};await h.save();h.render();assert.equal(h.state.templateDraftLabel,'keep rejected draft');assert.equal(h.form.prompt,'original prompt');assert.equal(h.button().props.disabled,false);assert.equal(h.requests.length,1);
    h.world.save=async r=>template(1001,r.payload.label,r.payload);await h.save();h.render();assert.equal(h.requests.length,2);assert.equal(h.state.editingTemplateId,1001);
  }
});

test('network server and timeout failures stay uncertain without any direct repeat POST',async t=>{
  for(const failure of [new TypeError('synthetic network failure'),Object.assign(Error('synthetic server failure'),{status:500}),Object.assign(Error('synthetic timeout'),{status:408})]){const h=harness();t.after(()=>h.unmount());h.label('unknown draft');h.world.save=async()=>{throw failure;};await h.save();h.render();assert.equal(h.state.templateFeedback.saveState,'uncertain');assert.equal(h.button().props.disabled,true);h.label('newer uncertain label');await h.save();await h.state.saveCustomTemplate();assert.equal(h.requests.length,1);assert.equal(h.state.templateDraftLabel,'newer uncertain label');assert.match(h.text,/不代表撤回/);
  }
});

test('explicitly abandoning an uncertain save ends only the local session and permits a new draft',async t=>{
  const h=harness();t.after(()=>h.unmount());h.label('unknown old');h.world.save=async()=>{throw Error('unknown');};await h.save();h.render();h.nodes().find(n=>n.type==='button'&&content(n)==='放弃本次重发').props.onClick();h.render();assert.equal(h.requests.length,1);assert.equal(h.state.templateDraftLabel,'');h.label('explicit different draft');h.world.save=async r=>template(1002,r.payload.label,r.payload);await h.save();h.render();assert.equal(h.requests.length,2);assert.equal(h.requests[1].kind,'POST');assert.equal(h.world.created.length,1);assert.ok(h.requests.every(r=>r.kind!=='DELETE'));
});

test('malformed or mismatched success identity is uncertain and cannot rebind the editor',async t=>{
  for(const response of [null,{id:0},template(202,'wrong target'),{...A,media_type:'video'}]){const h=harness();t.after(()=>h.unmount());h.edit(A);h.world.save=async()=>response;await h.save();h.render();assert.equal(h.state.editingTemplateId,101);assert.equal(h.state.templateFeedback.saveState,'uncertain');await h.save();assert.equal(h.requests.length,1);}
});

test('local validation failures perform no request and can be corrected',async t=>{
  const h=harness();t.after(()=>h.unmount());await h.save();h.render();assert.equal(h.requests.length,0);assert.match(h.error,/名称/);assert.equal(h.button().props.disabled,false);h.label('valid');h.patch({prompt:''});await h.save();h.render();assert.equal(h.requests.length,0);assert.match(h.error,/提示词内容/);h.patch({prompt:'corrected'});await h.save();h.render();assert.equal(h.requests.length,1);
});

test('changing media invalidates image save completion before a distinct video draft is saved',async t=>{
  const h=harness();t.after(()=>h.unmount());const gate=deferred();h.edit(A);h.world.save=r=>r.id===101?gate.promise:Promise.resolve(template(1002,r.payload.label,r.payload));const save=h.save();h.patch({creationMode:'video',resolution:'720p'});h.label('video draft');await h.save();h.render();gate.resolve(A);await save;h.render();assert.equal(h.requests[0].payload.media_type,'image');assert.equal(h.requests[1].payload.media_type,'video');assert.equal(h.requests[1].payload.resolution,'720p');assert.equal(h.state.editingTemplateId,1002);assert.equal(h.state.templateDraftLabel,'video draft');assert.ok(h.state.customTemplates.every(t=>t.media_type==='video'));
});

test('applying another template begins a distinct draft instead of retaining the old edit target',async t=>{
  const h=harness();t.after(()=>h.unmount());const gate=deferred();h.edit(A);h.world.save=()=>gate.promise;const save=h.save();h.state.applyTemplate(B);h.render();h.sync();gate.resolve(A);await save;h.render();assert.equal(h.state.editingTemplateId,null);assert.equal(h.form.prompt,B.prompt);assert.equal(h.form.activeTemplateId,202);h.label('derived from B');h.world.save=async r=>template(1002,r.payload.label,r.payload);await h.save();assert.equal(h.requests[1].kind,'POST');
});

test('opening the template menu again preserves an existing pending draft and its lock',async t=>{
  const h=harness();t.after(()=>h.unmount());const gate=deferred();h.label('custom pending name');h.title('custom pending title');h.world.save=()=>gate.promise;const save=h.save();h.sync();assert.equal(h.state.templateDraftLabel,'custom pending name');assert.equal(h.state.templateDraftTitle,'custom pending title');await h.state.saveCustomTemplate();assert.equal(h.requests.length,1);gate.resolve(template(1001,'custom pending name'));await save;h.render();
});

test('unrelated generation count edits do not falsely claim template fields changed during save',async t=>{
  const h=harness();t.after(()=>h.unmount());const gate=deferred();h.edit(A);h.world.save=()=>gate.promise;const save=h.save();h.patch({imageCount:4,referenceImages:['synthetic-reference']});gate.resolve(A);await save;h.render();assert.equal(h.state.templateFeedback.type,'success');assert.equal(h.form.imageCount,4);assert.equal(h.form.referenceImages[0],'synthetic-reference');
});

test('unmount ignores both late save success and late rejection without any state writes',async t=>{
  for(const succeed of [true,false]){const h=harness();t.after(()=>h.unmount());const gate=deferred();h.label('leaving');h.world.save=()=>gate.promise;const save=h.save();h.unmount();if(succeed)gate.resolve(template(1001,'leaving'));else gate.reject(Error('late rejection'));await save;await h.flush();assert.equal(h.lateWrites,0);}
});

test('ordinary delete success clears its own editor but a late delete cannot clear B',async t=>{
  const h=harness();t.after(()=>h.unmount());const gate=deferred();h.edit(A);h.world.remove=()=>gate.promise;const remove=h.state.deleteCustomTemplate(101);h.edit(B);gate.resolve();await remove;h.render();assert.equal(h.state.editingTemplateId,202);assert.equal(h.state.templateDraftLabel,'B');assert.ok(h.state.customTemplates.every(t=>t.id!==101));h.world.remove=async()=>{};await h.state.deleteCustomTemplate(202);h.render();assert.equal(h.state.editingTemplateId,null);
});

test('a form edit queued before acknowledgement is checked after render before clearing the cancel snapshot',async t=>{
  const h=harness();t.after(()=>h.unmount());const original=clone(h.form),gate=deferred();h.edit(A);h.world.save=()=>gate.promise;const save=h.save();h.queuePatch({prompt:'queued during save'});gate.resolve(A);await save;h.render();
  assert.equal(h.form.prompt,'queued during save');assert.equal(h.state.templateFeedback.type,'info');h.cancel();assert.equal(h.form.prompt,original.prompt);
});

test('starting an edit preserves unrelated form changes already queued in the same event',t=>{
  const h=harness();t.after(()=>h.unmount());h.queuePatch({referenceImages:['queued-reference'],requestedProvider:'queued-provider'});h.edit(A);assert.equal(h.form.referenceImages[0],'queued-reference');assert.equal(h.form.requestedProvider,'queued-provider');assert.equal(h.form.prompt,A.prompt);
});

test('deleting another record cannot erase the current save pending or uncertain state',async t=>{
  const h=harness();t.after(()=>h.unmount());const gate=deferred();h.label('pending new');h.world.save=()=>gate.promise;const save=h.save();await h.state.deleteCustomTemplate(101);h.render();assert.equal(h.button().props.disabled,true);assert.equal(h.state.templateFeedback.saveState,'pending');gate.reject(Error('unknown save'));await save;h.render();await h.state.deleteCustomTemplate(202);h.render();assert.equal(h.state.templateFeedback.saveState,'uncertain');assert.equal(h.button().props.disabled,true);await h.save();assert.equal(h.requests.filter(r=>r.kind==='POST').length,1);
});
