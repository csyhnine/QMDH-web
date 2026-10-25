import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';

const src=name=>readFileSync(new URL(`../src/features/studio/${name}`,import.meta.url),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
const fixtureUrl=new URL('./test-review-studio-submission-source.mjs',import.meta.url);
// Reuse only the F49 driver definitions, never register or execute its old test bodies.
const prefix=readFileSync(fixtureUrl,'utf8').split('\ntest(')[0].replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',JSON.stringify(fixtureUrl.href));
const sandbox={assert,readFileSync,path,fileURLToPath,vm,ts,URL};vm.runInNewContext(prefix+'\nglobalThis.driver={harness,provider,upload};',sandbox);
const {harness,provider,upload}=sandbox.driver;
function compile(code,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Error,Date,AbortController,require:name=>{assert.ok(Object.hasOwn(imports,name),`unstubbed ${name}`);return imports[name];}});return exports;}
function dropzone(items,max=9){
  const removed=[],opened=[];const jsx={Fragment:'fragment',jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  const react={useState:x=>[x,()=>{}],useRef:x=>({current:x}),useEffect:()=>{}};
  const session=compile(src('studioReferenceUploadSession.ts'));
  const component=compile(src('StudioReferenceDropzone.tsx'),{react,'react/jsx-runtime':jsx,'./studioReferenceUploadSession':session,'./seedancePrivateAvatar':{seedanceAvatarStatusLabel:()=>null},'./StudioReferenceAnnotateLightbox':{default:'annotation'}}).default;
  const tree=component({creationMode:'video',referenceUploads:items,maxReferenceCount:max,onOpenReferencePicker:()=>opened.push(true),onReferenceDrop:()=>{},onRemoveReferenceUpload:index=>removed.push(index)});
  function nodes(value,out=[]){if(Array.isArray(value)){for(const child of value)nodes(child,out);}else if(value&&typeof value==='object'){out.push(value);nodes(value.props?.children,out);}return out;}
  return{tree,nodes:nodes(tree),removed,opened};
}

test('all nine supplied HappyHorse reference previews and removal controls are visible',()=>{
  const h=dropzone(Array.from({length:9},(_,i)=>upload(`A${i}`)),9),buttons=h.nodes.filter(n=>n.props?.className==='reference-preview-remove');assert.equal(buttons.length,9);for(const button of buttons)button.props.onClick();assert.deepEqual(h.removed,[0,1,2,3,4,5,6,7,8]);
});

test('history paths and upload rebuilding retain every saved reference in order',()=>{
  const h=harness(),refs=Array.from({length:9},(_,i)=>`A${i}`);assert.deepEqual(copy(h.load('studioTaskReferenceUtils').taskReferenceImages(h.task(refs))),refs);assert.deepEqual(copy(h.load('studioReferenceUtils').buildReferenceUploadsFromPaths(refs)).map(x=>x.storagePath),refs);
});

test('restored excess Grok references are rejected using the real count rather than a clamped four',async()=>{
  const h=harness({providers:[provider('grok',{adapter_kind:'haodeya_grok',model_name:'grok-imagine'})],paths:['A1','A2','A3','A4','A5']});h.replace({...h.value,grokVideoSku:'x-ai/grok-imagine-video-ref'});h.render();await h.submit();assert.equal(h.requests.length,0);assert.match(h.state.error,/4/);
});

test('HappyHorse one four five and nine references stay visible and are submitted in order',async()=>{
  for(const count of [1,4,5,9]){const refs=Array.from({length:count},(_,i)=>`A${i}`),h=harness({providers:[provider('happyhorse',{model_name:'happyhorse-1.1'})],paths:refs});h.replace({...h.value,grokVideoSku:'happyhorse-1.1-r2v-5s'});h.render();await h.submit();assert.equal(h.requests.length,1);assert.deepEqual(copy(h.requests[0].payload.reference_images),refs);assert.equal(h.tracker.hasReferenceImage,true);const view=dropzone(refs.map(p=>upload(p)),9);assert.equal(view.nodes.filter(n=>n.props?.className==='reference-preview-remove').length,count);assert.equal(view.nodes.some(n=>n.props?.className==='reference-preview-add'),count<9);}
});

test('the tenth HappyHorse input is refused by the existing upload and submission contracts',async()=>{
  const refs=Array.from({length:10},(_,i)=>`A${i}`),h=harness({providers:[provider('happyhorse',{model_name:'happyhorse-1.1'})],paths:refs});h.replace({...h.value,grokVideoSku:'happyhorse-1.1-r2v-5s'});h.render();await h.submit();assert.equal(h.requests.length,0);assert.match(h.state.error,/9/);assert.equal(h.uploads.length,10);
  const result=h.load('studioReferenceUtils').prepareReferenceUploadFiles(refs.map(name=>({name,type:'image/png',size:1})),0,9);assert.equal(result.acceptedFiles.length,9);assert.match(result.errors[0],/9/);assert.equal(h.load('studioReferenceUtils').prepareReferenceUploadFiles([{name:'extra',type:'image/png',size:1}],9,9).acceptedFiles.length,0);
});

test('switching to a smaller contract does not hide or delete the existing extra references',()=>{
  const items=Array.from({length:9},(_,i)=>upload(`A${i}`)),before=copy(items);for(const limit of [0,1,4]){const view=dropzone(items,limit),buttons=view.nodes.filter(n=>n.props?.className==='reference-preview-remove');assert.equal(buttons.length,9);assert.equal(view.nodes.some(n=>n.props?.className==='reference-preview-add'),false);buttons[8].props.onClick();assert.deepEqual(view.removed,[8]);assert.deepEqual(copy(items),before);}
});

test('zero reference modes disable the empty add control and invalid limits use the existing default',()=>{
  const view=dropzone([],0);assert.equal(view.tree.type,'button');assert.equal(view.tree.props.disabled,true);assert.ok(view.nodes.some(n=>n.props?.children==='当前档位无需参考图'));
  for(const invalid of [NaN,Infinity]){const full=dropzone(Array.from({length:4},(_,i)=>upload(`A${i}`)),invalid);assert.equal(full.nodes.some(n=>n.props?.className==='reference-preview-add'),false);const smaller=dropzone([upload('A')],invalid);assert.equal(smaller.nodes.some(n=>n.props?.className==='reference-preview-add'),true);}
});

test('nine historical HappyHorse inputs copy to the composer and submit without truncation',async()=>{
  const h=harness({providers:[provider('happyhorse',{model_name:'happyhorse-1.1'})]}),refs=Array.from({length:9},(_,i)=>`A${i}`),task=h.task(refs,{result:{video_sku:'happyhorse-1.1-r2v-5s',reference_image_count:9,reference_image_history_source:'task_payload',reference_image_history_incomplete:false}});h.actions.copyTaskToComposer(task);assert.deepEqual(copy(h.uploads).map(item=>item.storagePath),refs);assert.deepEqual(copy(h.value.referenceImages),refs);h.render();await h.submit();assert.deepEqual(copy(h.requests[0].payload.reference_images),refs);
});

test('direct regeneration keeps all nine A references while leaving B unchanged',async()=>{
  const h=harness({providers:[provider('happyhorse',{model_name:'happyhorse-1.1'})]}),before=h.value,refs=Array.from({length:9},(_,i)=>`A${i}`);await h.actions.regenerateTask(h.task(refs,{result:{video_sku:'happyhorse-1.1-r2v-10s'}}));assert.equal(h.requests.length,1);assert.deepEqual(copy(h.requests[0].payload.reference_images),refs);assert.equal(h.value,before);assert.deepEqual(copy(h.uploads).map(item=>item.storagePath),['B']);assert.equal(h.writes.length,0);
});

test('known incomplete historical records retain the known count and block copy and direct regeneration',async()=>{
  const h=harness(),before=h.value,task=h.task(['A1','A2','A3','A4'],{result:{reference_image_count:9,reference_image_history_incomplete:true,reference_image_history_source:'recorded_result'}});assert.equal(h.load('studioTaskReferenceUtils').taskReferenceImageCount(task),9);assert.deepEqual(copy(h.load('studioTaskReferenceUtils').taskReferenceImages(task)),['A1','A2','A3','A4']);h.actions.copyTaskToComposer(task);await h.actions.regenerateTask(task);assert.equal(h.requests.length,0);assert.equal(h.value,before);assert.equal(h.writes.length,0);assert.equal(h.feedback.length,2);assert.ok(h.feedback.every(row=>row[2]==='error'&&row[3].includes('记录不完整')));
});

test('legacy complete single and four-item histories remain usable without inventing extra paths',async()=>{
  const h=harness(),helper=h.load('studioTaskReferenceUtils');assert.deepEqual(copy(helper.taskReferenceImages(h.task([],{result:{reference_image_storage_paths:undefined,reference_image_storage_path:'single'}}))),['single']);const task=h.task(['A1','A2','A3','A4'],{result:{reference_image_count:4,reference_image_history_source:'recorded_result',reference_image_history_incomplete:false}});assert.equal(helper.taskReferenceImageCount(task),4);await h.actions.regenerateTask(task);assert.deepEqual(copy(h.requests[0].payload.reference_images),['A1','A2','A3','A4']);
});

test('Grok and Seedance keep their own four-input contracts after history expansion',async()=>{
  for(const [name,model,sku] of [['grok','grok-imagine','x-ai/grok-imagine-video-ref'],['seedance','seedance-2','seedance-2-fast-720p-5s']]){for(const count of [4,5]){const h=harness({providers:[provider(name,{model_name:model,adapter_kind:name==='grok'?'haodeya_grok':'generic'})],paths:Array.from({length:count},(_,i)=>`A${i}`)});h.replace({...h.value,grokVideoSku:sku});h.render();await h.submit();assert.equal(h.requests.length,count===4?1:0);if(count===5)assert.match(h.state.error,/4/);}}
});

test('ordinary image editing and generic video reject a fifth reference without silently discarding it',async()=>{
  for(const image of [true,false]){for(const count of [4,5]){const h=harness({providers:[provider(image?'image':'video',{adapter_kind:image?'openai_compatible':'generic',capabilities:image?['image.edit']:['video.generate']})],paths:Array.from({length:count},(_,i)=>`A${i}`)});if(image){h.replace({...h.value,creationMode:'edit'});h.render();}await h.submit();assert.equal(h.requests.length,count===4?1:0);assert.equal(h.uploads.length,count);}}
});

test('the Qwen one and two image contracts remain exact',async()=>{
  for(const required of [1,2]){for(const count of [1,2,3]){const h=harness({providers:[provider('qwen',{adapter_kind:'comfyui',capabilities:['image.edit'],reference_input_count:required})],paths:Array.from({length:count},(_,i)=>`A${i}`)});h.replace({...h.value,creationMode:'edit'});h.render();await h.submit();assert.equal(h.requests.length,count===required?1:0);}}
});

test('HappyHorse text and first-frame modes retain their own zero and one input contracts',async()=>{
  for(const [mode,count,accepted] of [['t2v',0,true],['t2v',1,false],['i2v',0,false],['i2v',1,true],['i2v',2,false]]){const h=harness({providers:[provider('happyhorse',{model_name:'happyhorse-1.1'})],paths:Array.from({length:count},(_,i)=>`A${i}`)});h.replace({...h.value,grokVideoSku:`happyhorse-1.1-${mode}-5s`});h.render();await h.submit();assert.equal(h.requests.length,accepted?1:0);}
});

test('the existing composer body passes the selected maximum to the actual Dropzone boundary',()=>{
  const exports=compile(src('studioComposerExpandedContentPropBuilders.ts'),{'./studioComposerToolbarPropsBuilder':{getStudioComposerToolbarProps:()=>{}}});const body=exports.getStudioComposerBodyProps({maxReferenceCount:9,referenceUploads:[],studioForm:{creationMode:'video'}});assert.equal(body.maxReferenceCount,9);
  const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},component=compile(src('StudioComposerBody.tsx'),{'react/jsx-runtime':jsx,'./studioComposerDockUtils':{composerReferenceZoneLabel:()=>''},'./StudioComposerModeSwitch':{default:'mode'},'./StudioPromptTextarea':{default:'prompt'},'./StudioReferenceDropzone':{default:'dropzone'}}).default;
  const nodes=[];function visit(n){if(Array.isArray(n)){n.forEach(visit);}else if(n&&typeof n==='object'){nodes.push(n);visit(n.props?.children);}}visit(component(body));assert.equal(nodes.find(n=>n.type==='dropzone').props.maxReferenceCount,9);
});
