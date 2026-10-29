import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const root=fileURLToPath(new URL('../src/',import.meta.url)),studio=path.join(root,'features/studio');
const copy=value=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
const provider=(name='video-a',extra={})=>({id:1,provider_name:name,display_name:name,model_name:'generic-video',adapter_kind:'generic',enabled:true,outbound:true,capabilities:['video.generate'],config:{},...extra});
const upload=(storagePath,extra={})=>({storagePath,fileName:storagePath,previewUrl:storagePath,...extra});

function harness({paths=['B'],uploading=false,providers=[provider()],queued=false}={}){
  let value,tracker=null,state={error:''},submitting=false,actions,guest=false;const writes=[],requests=[],gates=[],feedback=[],events=[],queue=[];
  const cache=new Map(),trace=new Set();
  const allowed=new Set(['useStudioTaskActions','useStudioTaskSubmission','studioTaskActionUtils','studioTaskFormUtils','studioTaskSubmissionActions','studioTaskSubmissionValidation','studioTaskSubmissionState','studioConstants','studioUpscaleOptions','studioAssetUtils','studioTaskTitleUtils','studioTaskProgressUtils','studioTaskReferenceUtils','studioFormatUtils','modelAdminUtils','studioProviderDefaults','grokVideoUtils','happyHorseVideoUtils','seedanceVideoUtils','studioCanvasLinkage','studioReferenceUtils','studioReferenceUploadTransport','studioTemplateBindingUtils','studioTemplateFormUtils','studioUpscaleActions','comfyReferenceContract']);
  const react={useCallback:fn=>fn,useState:initial=>[initial,()=>{}]};
  const api={createTask:async payload=>{requests.push(copy(payload));const gate=gates.shift();return gate?await gate.promise:{id:200+requests.length,title:payload.title,status:'pending',result:{}};},trackPromptTemplateEvent:async(...args)=>{events.push(args);}};
  function load(name){
    if(cache.has(name))return cache.get(name);
    if(name==='studioUtils')return Object.assign({},load('studioConstants'),load('studioAssetUtils'),load('studioTaskTitleUtils'),load('studioPayloadUtils'));
    if(name==='studioTaskUtils')return Object.assign({},load('studioTaskProgressUtils'),load('studioTaskReferenceUtils'));
    assert.ok(allowed.has(name)||name==='studioPayloadUtils',`unexpected source dependency ${name}`);
    const filename=path.join(studio,`${name}.ts`),exports={};cache.set(name,exports);trace.add(name);
    const code=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    vm.runInNewContext(code,{exports,Error,Date,Promise,window:{requestAnimationFrame:()=>0},require(spec){
      if(spec==='react')return react;
      if(spec==='../../api')return{api};
      if(spec==='../../context/AuthContext')return{useAuth:()=>({isGuest:guest})};
      if(spec==='./trackGenerationOutcome')return{trackGenerationOutcome:(...args)=>events.push(args)};
      if(spec==='../../lib/datetime')return{formatChinaMonthDayTime:()=>''};
      if(spec==='../../utils/uploads')return{MAX_REFERENCE_UPLOAD_BYTES:10,formatUploadSize:()=>'',validateReferenceImageSize:()=>{throw Error('image inspection forbidden');}};
      if(spec.startsWith('./'))return load(spec.slice(2));
      throw Error(`unstubbed dependency ${spec}`);
    },fetch(){throw Error('network forbidden');},XMLHttpRequest(){throw Error('network forbidden');}},{filename});return exports;
  }
  const constants=load('studioConstants');value={...copy(constants.defaultStudioForm),creationMode:'video',title:'B draft',prompt:'B prompt',requestedProvider:providers[0].provider_name,referenceImages:[...paths],promptPolished:true};
  let uploads=paths.map(p=>upload(p));
  const setStudioForm=change=>{if(queued){queue.push(change);return;}const next=typeof change==='function'?change(value):change;if(next!==value)writes.push(copy(next));value=next;};
  const referenceUpload={referenceUploads:uploads,uploadingReference:uploading,buildUploadsFromPaths:p=>load('studioReferenceUtils').buildReferenceUploadsFromPaths(p),replaceReferenceUploads:items=>{uploads=items;referenceUpload.referenceUploads=items;},addReferenceFromStoragePath:()=>{throw Error('reference addition not in scope');}};
  const options={composerToolbarRef:{current:null},hasAutoPositionedRef:{current:false},historyFeedback:{pushFeedback:(...args)=>feedback.push(args),setPendingAction:()=>{}},loadData:async()=>{},providers,referenceUpload,setActiveComposerMenu:()=>{},setComposerCollapsed:()=>{},setState:change=>{state=typeof change==='function'?change(state):change;},setStudioForm,setSubmissionTracker:change=>{tracker=typeof change==='function'?change(tracker):change;},setSubmitting:next=>{submitting=next;},studioForm:value,studioTemplates:{clearFeedback:()=>{},sharedTemplates:[],customTemplates:[],activeTemplate:null},submissionInFlightRef:{current:false},pushLoadError:message=>{state.error=message;}};
  function render(){options.studioForm=value;actions=load('useStudioTaskActions').useStudioTaskActions(options);return actions;}
  render();
  return{get value(){return value;},get uploads(){return uploads;},get actions(){return actions;},get state(){return state;},get tracker(){return tracker;},get submitting(){return submitting;},requests,writes,feedback,events,providers,referenceUpload,options,trace,load,render,
    hold(){const gate=deferred();gates.push(gate);return gate;},replace(form){value=form;},commit(){for(const update of queue.splice(0)){const next=typeof update==='function'?update(value):update;if(next!==value)writes.push(copy(next));value=next;}},
    task(paths=['A1','A2'],extra={}){return{id:41,title:'history A',workflow_key:'video-generate',project_code:'A project',requested_provider:providers[0].provider_name,status:'completed',...extra,result:{prompt:'history A prompt',reference_image_storage_paths:paths,...extra.result}};},
    submit(){return actions.handleSubmit({preventDefault(){}});},setGuest(){guest=true;render();}};
}

test('historical regeneration sends A references and preserves the current B form and upload items',async()=>{
  const h=harness(),before=h.value,uploads=copy(h.uploads);await h.actions.regenerateTask(h.task());
  assert.equal(h.requests.length,1);assert.deepEqual(h.requests[0].payload.reference_images,['A1','A2']);assert.equal(h.requests[0].payload.prompt,'history A prompt');assert.equal(h.value,before);assert.deepEqual(copy(h.uploads),uploads);assert.equal(h.value.promptPolished,true);assert.equal(h.writes.length,0);
});

test('a successful ordinary submission cannot reset a later draft or its polished flag',async()=>{
  const h=harness(),gate=h.hold(),pending=h.submit();const later={...h.value,prompt:'later C',referenceImages:['C'],promptPolished:true};h.replace(later);gate.resolve({id:202,title:'B accepted',status:'pending',result:{}});await pending;h.commit();assert.equal(h.value,later);assert.equal(h.value.promptPolished,true);assert.deepEqual(h.requests[0].payload.reference_images,['B']);
});

test('empty multiple and equal-count B drafts never replace historical A references',async()=>{
  for(const paths of [[],['B1','B2'],['B1','B2','B3']]){const h=harness({paths}),before=h.value,uploads=copy(h.uploads);await h.actions.regenerateTask(h.task());assert.equal(h.requests.length,1);assert.deepEqual(h.requests[0].payload.reference_images,['A1','A2']);assert.equal(h.value,before);assert.deepEqual(copy(h.uploads),uploads);assert.equal(h.writes.length,0);}
});

test('an unrelated current upload does not block saved historical inputs but ordinary submit still waits',async()=>{
  const h=harness({uploading:true}),before=h.value;await h.actions.regenerateTask(h.task());assert.equal(h.requests.length,1);assert.deepEqual(h.requests[0].payload.reference_images,['A1','A2']);assert.equal(h.value,before);await h.submit();assert.equal(h.requests.length,1);assert.match(h.state.error,/上传/);
});

test('ordinary submit sends its own references and clears only its own polished flag',async()=>{
  const h=harness({paths:['B1','B2']}),before=copy(h.value);await h.submit();assert.equal(h.requests.length,1);assert.deepEqual(h.requests[0].payload.reference_images,['B1','B2']);assert.equal(h.requests[0].requested_provider,'video-a');assert.equal(h.value.promptPolished,false);assert.deepEqual({...copy(h.value),promptPolished:true},before);assert.equal(h.tracker.hasReferenceImage,true);assert.equal(h.submitting,false);
});

test('historical provider and SKU are used instead of the current B provider selection',async()=>{
  const a=provider('grok-a',{id:2,model_name:'grok-imagine',adapter_kind:'haodeya_grok'}),b=provider('video-b'),h=harness({providers:[b,a]}),before=h.value;
  await h.actions.regenerateTask(h.task(['A1','A2'],{requested_provider:'grok-a',result:{video_sku:'x-ai/grok-imagine-video-ref-10s'}}));
  if(!h.requests.length){assert.fail(`invalid fixture SKU: ${h.state.error}`);}
  assert.equal(h.requests[0].requested_provider,'grok-a');assert.deepEqual(h.requests[0].payload.reference_images,['A1','A2']);assert.equal(h.requests[0].payload.video_sku,'x-ai/grok-imagine-video-ref-10s');assert.equal(h.requests[0].payload.duration,10);assert.equal(h.value,before);
});

test('Seedance active assets and HTTPS fallback resolve from this operation rather than B',async()=>{
  const h=harness({providers:[provider('seedance-a',{model_name:'seedance-2'})]}),before=h.value;
  h.referenceUpload.buildUploadsFromPaths=paths=>paths.map((p,i)=>upload(p,i===0?{storagePath:'asset://A',assetUrl:'asset://A',mediaPath:'https://media.invalid/A1',avatarStatus:'active'}:{mediaPath:'https://media.invalid/A2',avatarStatus:'failed'}));
  await h.actions.regenerateTask(h.task(['A1','A2'],{result:{video_sku:'seedance-2-fast-720p-5s'}}));assert.equal(h.requests.length,1);assert.deepEqual(h.requests[0].payload.reference_images,['asset://A','https://media.invalid/A2']);assert.equal(h.value,before);assert.equal(h.writes.length,0);
});

test('non-Seedance payload retains original media and never leaks Seedance asset URLs',async()=>{
  const h=harness();h.referenceUpload.referenceUploads=[upload('asset://B',{assetUrl:'asset://B',mediaPath:'https://media.invalid/B',avatarStatus:'active'})];h.replace({...h.value,referenceImages:['asset://B']});h.render();await h.submit();assert.deepEqual(h.requests[0].payload.reference_images,['https://media.invalid/B']);
});

test('historical pending avatar validation uses A metadata and ignores pending B metadata',async()=>{
  const h=harness({providers:[provider('seedance-a',{model_name:'seedance-2'})]});h.referenceUpload.referenceUploads=[upload('B',{avatarStatus:'verifying'})];
  await h.actions.regenerateTask(h.task());assert.equal(h.requests.length,1);await h.submit();assert.equal(h.requests.length,1);assert.match(h.state.error,/审核/);
  h.referenceUpload.buildUploadsFromPaths=paths=>paths.map(p=>upload(p,{avatarStatus:'processing'}));await h.actions.regenerateTask(h.task());assert.equal(h.requests.length,1);assert.match(h.state.error,/审核/);assert.equal(h.submitting,false);
});

test('image editing preserves its historical image paths as a control',async()=>{
  const h=harness({providers:[provider('image-a',{adapter_kind:'openai_compatible',capabilities:['image.edit','image.generate']})]}),before=h.value;await h.actions.regenerateTask(h.task(['A1','A2'],{workflow_key:'image-edit'}));assert.equal(h.requests.length,1);assert.deepEqual(h.requests[0].payload.reference_images,['A1','A2']);assert.equal(h.requests[0].workflow_key,'image-edit');assert.equal(h.value,before);
});

test('an ordinary provider fallback is guarded inside queued form updates and preserves a replacement draft',async()=>{
  const h=harness({queued:true});h.replace({...h.value,requestedProvider:'removed-provider'});h.render();const gate=h.hold(),pending=h.submit(),later={...h.value,prompt:'C',promptPolished:true,requestedProvider:'C provider'};h.replace(later);gate.resolve({id:202,title:'accepted',status:'pending',result:{}});await pending;h.commit();assert.equal(h.requests[0].requested_provider,'video-a');assert.equal(h.value,later);assert.equal(h.writes.length,0);
});

test('a stable queued provider normalization still clears only that accepted source flag',async()=>{
  const h=harness({queued:true});h.replace({...h.value,requestedProvider:'removed-provider'});h.render();await h.submit();h.commit();assert.equal(h.value.requestedProvider,'video-a');assert.equal(h.value.promptPolished,false);assert.equal(h.value.prompt,'B prompt');
});

test('historical fallback never writes the chosen provider back into B',async()=>{
  const h=harness(),before=h.value;await h.actions.regenerateTask(h.task(['A'],{requested_provider:'removed'}));assert.equal(h.requests[0].requested_provider,'video-a');assert.equal(h.value,before);assert.equal(h.writes.length,0);
});

test('failure releases the existing lock without rewriting B or automatically issuing another request',async()=>{
  const h=harness(),gate=h.hold(),before=h.value,pending=h.actions.regenerateTask(h.task());gate.reject(Error('unknown transport'));await pending;assert.equal(h.requests.length,1);assert.equal(h.value,before);assert.equal(h.value.promptPolished,true);assert.equal(h.options.submissionInFlightRef.current,false);assert.equal(h.submitting,false);await Promise.resolve();assert.equal(h.requests.length,1);
  // Explicit second click is a new caller action, not automatic recovery or a claim of server deduplication.
  await h.actions.regenerateTask(h.task());assert.equal(h.requests.length,2);assert.deepEqual(h.requests[1].payload.reference_images,['A1','A2']);assert.equal(h.value,before);
});

test('the existing in-flight lock suppresses concurrent historical and ordinary submits',async()=>{
  const h=harness(),gate=h.hold(),pending=h.actions.regenerateTask(h.task());await h.actions.regenerateTask(h.task(['C']));await h.submit();assert.equal(h.requests.length,1);gate.resolve({id:300,title:'A',status:'pending',result:{}});await pending;assert.equal(h.requests.length,1);assert.equal(h.submitting,false);
});

test('ordinary upload metadata changes cannot mutate an already captured payload',async()=>{
  const h=harness({providers:[provider('seedance-a',{model_name:'seedance-2'})]});h.referenceUpload.referenceUploads=[upload('A',{avatarStatus:'active',assetUrl:'asset://A',mediaPath:'https://media.invalid/A'})];h.replace({...h.value,referenceImages:['A']});h.render();const gate=h.hold(),pending=h.submit();h.referenceUpload.referenceUploads[0].assetUrl='asset://B';h.referenceUpload.referenceUploads[0].mediaPath='https://media.invalid/B';h.value.referenceImages[0]='B';gate.resolve({id:300,title:'A',status:'pending',result:{}});await pending;assert.deepEqual(h.requests[0].payload.reference_images,['asset://A']);assert.equal(h.tracker.hasReferenceImage,true);
});

test('copy-to-composer still explicitly replaces the form and uploads with A before an ordinary submit',async()=>{
  const h=harness();h.actions.copyTaskToComposer(h.task());assert.equal(h.value.prompt,'history A prompt');assert.deepEqual(copy(h.uploads).map(item=>item.storagePath),['A1','A2']);h.render();await h.submit();assert.deepEqual(h.requests[0].payload.reference_images,['A1','A2']);
});

test('HappyHorse historical reference mode preserves the A paths order and requested SKU',async()=>{
  const h=harness({providers:[provider('happyhorse-a',{model_name:'happyhorse-1.1'})]}),before=h.value;await h.actions.regenerateTask(h.task(['A2','A1'],{result:{video_sku:'happyhorse-1.1-r2v-10s'}}));assert.equal(h.requests.length,1);assert.deepEqual(h.requests[0].payload.reference_images,['A2','A1']);assert.equal(h.requests[0].payload.video_sku,'happyhorse-1.1-r2v-10s');assert.equal(h.requests[0].payload.duration,10);assert.equal(h.value,before);
});

test('an empty historical reference set never inherits B references even with the same provider',async()=>{
  const h=harness(),before=h.value;await h.actions.regenerateTask(h.task([]));assert.equal(h.requests.length,1);assert.equal(h.requests[0].payload.reference_images,undefined);assert.equal(h.requests[0].payload.source_images,undefined);assert.equal(h.value,before);
});

test('video validation and payload share the upload snapshot even when form synchronization is behind',async()=>{
  const h=harness({providers:[provider('grok-a',{model_name:'grok-imagine',adapter_kind:'haodeya_grok'})]});h.replace({...h.value,grokVideoSku:'x-ai/grok-imagine-video-i2v',referenceImages:['old1','old2']});h.referenceUpload.referenceUploads=[upload('current-one')];h.render();await h.submit();assert.equal(h.requests.length,1);assert.equal(h.requests[0].payload.start_image_url,'current-one');assert.equal(h.tracker.hasReferenceImage,true);
});

test('a stable ordinary form still supports the existing explicit form-path fallback when no upload items exist',async()=>{
  const h=harness({paths:[]});h.replace({...h.value,referenceImages:['form-only']});h.render();await h.submit();assert.deepEqual(h.requests[0].payload.reference_images,['form-only']);assert.equal(h.tracker.hasReferenceImage,true);
});

test('guest and invalid prompt controls do not submit and historical success feedback does not claim to replace B',async()=>{
  const guest=harness();guest.setGuest();await guest.actions.regenerateTask(guest.task());assert.equal(guest.requests.length,0);assert.match(guest.state.error,/访客/);
  const h=harness(),before=h.value;await h.actions.regenerateTask(h.task());assert.equal(h.value,before);assert.match(h.feedback.at(-1)[3],/历史输入/);assert.doesNotMatch(h.feedback.at(-1)[3],/带入创作区/);h.replace({...h.value,prompt:'  '});h.render();await h.submit();assert.equal(h.requests.length,1);assert.equal(h.options.submissionInFlightRef.current,false);
});
