import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';
const source=readFileSync(new URL('../src/pages/admin/ModelsPage.tsx',import.meta.url),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
const sync='haodeya-gpt-image-20-sync',sunburst='haodeya-gpt-image-25-sunburst',seedance='haodeya-seedance2-video';
function harness(profiles=[]){
  let cursor=0,tree,error='',dirty=false,refreshes=0;const slots=[],updates=[],effects=[],requests=[];
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],next=>{updates.push({i,next});dirty=true;}];},useEffect(setup,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){slots[i]={deps};effects.push(setup);}}};
  react.useRef=initial=>{const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];};
  react.useMemo=(create,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>v!==old.deps[j]))slots[i]={value:create(),deps};return slots[i].value;};
  react.useLayoutEffect=react.useEffect;
  const hookExports={};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/pages/admin/useModelAdminState.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:hookExports,Promise,require:name=>{assert.ok(['react','../../context/AuthContext'].includes(name),`undeclared hook import ${name}`);return name==='react'?react:{useAuth:()=>({currentUser:{id:1,name:'offline-admin'},isGuest:false})};}});
  const api={async createProviderProfile(payload){requests.push({method:'POST',payload:copy(payload)});return{};},async updateProviderProfile(id,payload){requests.push({method:'PATCH',id,payload:copy(payload)});return{};}};
  const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},exports={};
  const code=source+`\n;exports.internals={modelPresets,defaultProviderProfileDraft,toProviderProfileDraft,toProviderProfilePayload,buildAdapterConfigFromDraft,readSupportedResolutionFlags,normalizeProviderPresetDraft:typeof normalizeProviderPresetDraft==='function'?normalizeProviderPresetDraft:null};`;
  vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Error,Promise,localStorage:{getItem:()=>null},require:name=>{assert.ok(['react','react/jsx-runtime','../../api','./ComfyOperations','./useModelAdminState'].includes(name),`undeclared import ${name}`);return name==='react'?react:name==='react/jsx-runtime'?jsx:name==='../../api'?{api}:name==='./useModelAdminState'?hookExports:{default:'ComfyOperations'};}});
  function render(){cursor=0;effects.length=0;tree=exports.default({providerProfiles:profiles,pricingRules:[],providers:[],error,onRefresh:()=>{refreshes++;},onSetError:value=>{error=typeof value==='function'?value(error):value;dirty=true;}});for(const setup of effects.splice(0))setup();}
  function flush(){for(const {i,next} of updates.splice(0))slots[i]=typeof next==='function'?next(slots[i]):next;dirty=false;render();}
  async function drain(){for(let i=0;i<12;i++){await Promise.resolve();if(dirty)flush();}}
  function nodes(value=tree){const out=[];function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'){out.push(n);walk(n.props?.children);}}walk(value);return out;}
  function text(n){if(Array.isArray(n))return n.map(text).join('');if(n&&typeof n==='object')return text(n.props?.children);return n==null||typeof n==='boolean'?'':String(n);}
  function field(label){const group=nodes().find(n=>n.type==='label'&&nodes(n).some(c=>c.type==='span'&&text(c)===label));assert.ok(group,`field ${label}`);const value=nodes(group).find(n=>['input','select','textarea'].includes(n.type));assert.ok(value,`input ${label}`);return value;}
  render();return {requests,internals:exports.internals,nodes,text,field,flush,drain,get error(){return error;},get refreshes(){return refreshes;},
    change(label,value){field(label).props.onChange({target:{value}});flush();},preset(id){this.change('预设',id);},click(label){const n=nodes().find(n=>n.type==='button'&&text(n)===label);assert.ok(n,`button ${label}`);const result=n.props.onClick();flush();return result;},async save(){const form=nodes().find(n=>n.type==='form'&&n.props.className.includes('model-compact-form'));assert.ok(form);await form.props.onSubmit({preventDefault(){}});await drain();},
  };
}
test('blank Sync preset submits its declared tier prices resolutions and upstream model mappings',async()=>{
  const h=harness();h.preset(sync);h.change('API Key','mock-key');await h.save();assert.equal(h.error,'');assert.equal(h.requests.length,1);const p=h.requests[0].payload;assert.equal(p.unit_price,1.62);assert.equal(p.adapter_config.unit_price_1k,1.62);assert.equal(p.adapter_config.unit_price_2k,2.67);assert.deepEqual(p.adapter_config.supported_resolutions,['1k','2k','4k']);assert.equal(p.adapter_config.upstream_model_4k,'gpt-image-2-4k');
});
test('blank Seedance preset submits its declared prices rather than a zero base price',async()=>{
  const h=harness();h.preset(seedance);h.change('API Key','mock-key');await h.save();assert.equal(h.requests.length,1);const p=h.requests[0].payload;assert.equal(p.unit_price,7);assert.equal(p.adapter_config.unit_price_1k,7);assert.equal(p.adapter_config.unit_price_2k,14);
});
test('blank Sunburst preserves declared prices all resolutions and its single-model extension',async()=>{
  const h=harness();h.preset(sunburst);h.change('API Key','mock-key');await h.save();const p=h.requests[0].payload;assert.equal(p.unit_price,1.62);assert.equal(p.adapter_config.unit_price_2k,2.67);assert.deepEqual(p.adapter_config.supported_resolutions,['1k','2k','4k']);assert.equal(p.adapter_config.upstream_model,'gpt-image-2.5-sunburst');assert.equal(p.adapter_config.default_quality,'medium');
});
test('preset prices and mappings appear in their managed form fields before save',()=>{
  const h=harness();h.preset(sync);assert.equal(h.field('1K 单价').props.value,'1.62');assert.equal(h.field('2K 单价').props.value,'2.67');h.click('更多选项（Adapter / 超时…）');assert.equal(h.field('4K 上游模型').props.value,'gpt-image-2-4k');const raw=JSON.parse(h.field('Adapter Config').props.value);assert.equal(raw.provider_flavor,'gpt_image_20_sync');assert.ok(!Object.hasOwn(raw,'unit_price_1k'));assert.ok(!Object.hasOwn(raw,'upstream_model_4k'));
});
test('switching presets resets model-specific prices mappings and resolution flags while keeping the key',async()=>{
  const h=harness();h.preset(sync);h.change('API Key','mock-key');h.change('1K 单价','99');h.preset(seedance);assert.equal(h.field('5s 单价').props.value,'7');assert.equal(h.field('10s 单价').props.value,'14');await h.save();const p=h.requests[0].payload;assert.equal(p.api_key,'mock-key');assert.equal(p.unit_price,7);assert.equal(p.pricing_unit,'per_video');assert.ok(!Object.hasOwn(p.adapter_config,'upstream_model_1k'));assert.ok(!Object.hasOwn(p.adapter_config,'supported_resolutions'));
});
test('switching from an image preset to Chat clears inherited media prices rather than charging the old model rate',async()=>{
  const h=harness();h.preset(sync);h.change('API Key','mock-key');h.preset('haodeya-chat');await h.save();const p=h.requests[0].payload;assert.equal(p.unit_price,0);assert.deepEqual(p.capabilities,['chat.completions']);assert.ok(!Object.hasOwn(p.adapter_config,'unit_price_1k'));assert.ok(!Object.hasOwn(p.adapter_config,'supported_resolutions'));assert.ok(!Object.hasOwn(p.adapter_config,'upstream_model_1k'));
});
test('explicit manual overrides after selecting a preset remain the canonical values in the submitted payload',async()=>{
  const h=harness();h.preset(sync);h.change('API Key','mock-key');h.change('1K 单价','3.5');h.change('2K 单价','0');h.change('4K 单价','8');h.click('更多选项（Adapter / 超时…）');h.change('4K 上游模型','custom-4k');await h.save();const p=h.requests[0].payload;assert.equal(p.unit_price,3.5);assert.equal(p.adapter_config.unit_price_2k,0);assert.equal(p.adapter_config.unit_price_4k,8);assert.equal(p.adapter_config.upstream_model_4k,'custom-4k');
});
test('managed form fields override duplicate managed JSON keys while unknown extension keys survive',async()=>{
  const h=harness();h.preset(sync);h.change('API Key','mock-key');h.click('更多选项（Adapter / 超时…）');h.change('Adapter Config',JSON.stringify({unit_price_1k:999,upstream_model_4k:'wrong-json-model',supported_resolutions:['1k'],extension:{nested:['kept'],enabled:false}}));await h.save();const p=h.requests[0].payload;assert.equal(p.unit_price,1.62);assert.equal(p.adapter_config.unit_price_1k,1.62);assert.equal(p.adapter_config.upstream_model_4k,'gpt-image-2-4k');assert.deepEqual(p.adapter_config.supported_resolutions,['1k','2k','4k']);assert.deepEqual(p.adapter_config.extension,{nested:['kept'],enabled:false});
});
function addPreset(h,draft,id='synthetic'){h.internals.modelPresets.push({id,label:id,category:'test',description:'offline',draft});h.flush();return id;}
test('explicit structured preset fields take precedence over its JSON managed fields and undefined fields use defaults',async()=>{
  const h=harness();const base=h.internals.modelPresets.find(p=>p.id===sync).draft;const id=addPreset(h,{...base,unitPrice1k:'0',unitPrice2k:'4',supportedResolution4k:false,upstreamModel4k:'structured-4k',unitPrice4k:undefined});h.preset(id);h.change('API Key','mock-key');await h.save();const p=h.requests[0].payload;assert.equal(p.unit_price,0);assert.equal(p.adapter_config.unit_price_2k,4);assert.deepEqual(p.adapter_config.supported_resolutions,['1k','2k']);assert.equal(p.adapter_config.upstream_model_4k,'structured-4k');assert.ok(!Object.hasOwn(p.adapter_config,'unit_price_4k'));
});
test('multi-capability preset keeps image tiers and all four video SKU fields through the same mapping',async()=>{
  const h=harness();const base=h.internals.modelPresets.find(p=>p.id===sync).draft;const id=addPreset(h,{...base,capabilities:'image.generate, video.generate, chat.completions',adapterConfig:JSON.stringify({unit_price_1k:2,unit_price_2k:3,unit_price_4k:4,supported_resolutions:['1k','4k'],upstream_model_1k:'image-1',upstream_model_4k:'image-4',upstream_sku_i2v_5s:'i2v-5',upstream_sku_i2v_10s:'i2v-10',upstream_sku_ref_5s:'ref-5',upstream_sku_ref_10s:'ref-10',unknown:{value:1}})});h.preset(id);h.change('API Key','mock-key');await h.save();const p=h.requests[0].payload;for(const [key,value] of Object.entries({unit_price_1k:2,unit_price_2k:3,unit_price_4k:4,upstream_model_1k:'image-1',upstream_model_4k:'image-4',upstream_sku_i2v_5s:'i2v-5',upstream_sku_i2v_10s:'i2v-10',upstream_sku_ref_5s:'ref-5',upstream_sku_ref_10s:'ref-10'}))assert.equal(p.adapter_config[key],value);assert.deepEqual(p.adapter_config.supported_resolutions,['1k','4k']);assert.deepEqual(p.adapter_config.unknown,{value:1});
});
const savedProfile=(adapter_config={},extra={})=>({id:11,provider_name:'saved-profile',display_name:'saved profile',model_name:'saved-model',base_url:'mock://provider',adapter_kind:'openai_compatible',capabilities:['image.generate'],strategies:{'image.generate':'openai_images'},adapter_config,unit_price:9,enabled:true,has_api_key:true,masked_api_key:'saved',pricing_currency:'CNY',pricing_unit:'per_image',...extra});
test('editing an existing profile round trips prices resolutions mapping and unknown extensions without replacing credentials',async()=>{
  const profile=savedProfile({unit_price_1k:1.2,unit_price_2k:2.3,unit_price_4k:4.5,supported_resolutions:['2k','4k'],upstream_model_1k:'one',upstream_model_2k:'two',upstream_model_4k:'four',custom:{nested:true}});const h=harness([profile]);h.click('编辑');assert.equal(h.field('1K 单价').props.value,'1.2');await h.save();const r=h.requests[0];assert.equal(r.method,'PATCH');assert.equal(r.id,11);assert.equal(r.payload.unit_price,1.2);assert.deepEqual(r.payload.adapter_config,profile.adapter_config);assert.ok(!Object.hasOwn(r.payload,'api_key'));assert.ok(!Object.hasOwn(r.payload,'api_secret'));
});
test('legacy video price aliases normalize through the existing canonical first and second tier contract',()=>{
  const h=harness();const p=savedProfile({unit_price_5s:0,unit_price_10s:3,upstream_sku_i2v_5s:'i2v-5',upstream_sku_ref_10s:'ref-10',extra:true},{capabilities:['video.generate'],pricing_unit:'per_video'});const draft=h.internals.toProviderProfileDraft(p),payload=h.internals.toProviderProfilePayload(draft);assert.equal(draft.unitPrice1k,'0');assert.equal(payload.unit_price,0);assert.equal(payload.adapter_config.unit_price_1k,0);assert.equal(payload.adapter_config.unit_price_2k,3);assert.equal(payload.adapter_config.upstream_sku_i2v_5s,'i2v-5');assert.equal(payload.adapter_config.upstream_sku_ref_10s,'ref-10');assert.equal(payload.adapter_config.extra,true);assert.ok(!Object.hasOwn(payload.adapter_config,'unit_price_5s'));
});
test('legal zero price values remain zero while blank tiers retain the existing omitted and base-zero behavior',async()=>{
  const h=harness();h.preset(sync);h.change('API Key','mock-key');h.change('1K 单价','0');h.change('2K 单价','0');h.change('4K 单价','');await h.save();const p=h.requests[0].payload;assert.equal(p.unit_price,0);assert.equal(p.adapter_config.unit_price_1k,0);assert.equal(p.adapter_config.unit_price_2k,0);assert.ok(!Object.hasOwn(p.adapter_config,'unit_price_4k'));const blank=h.internals.toProviderProfilePayload({...h.internals.defaultProviderProfileDraft});assert.equal(blank.unit_price,0);assert.ok(!Object.hasOwn(blank.adapter_config,'unit_price_1k'));
});
test('negative nonnumeric and nonfinite manual prices are rejected locally without issuing a save API call',async()=>{
  for(const value of ['-1','not-a-number','Infinity','NaN','1e309']){const h=harness();h.preset(sync);h.change('API Key','mock-key');h.change('1K 单价',value);await h.save();assert.equal(h.requests.length,0,value);assert.match(h.error,/有限数字/);assert.equal(h.field('1K 单价').props.value,value);}
});
test('Adapter Config null arrays and primitives are rejected as non-object values before saving',async()=>{
  for(const value of [null,[],42,'text',true]){const h=harness();h.preset(sync);h.change('API Key','mock-key');h.click('更多选项（Adapter / 超时…）');h.change('Adapter Config',JSON.stringify(value));await h.save();assert.equal(h.requests.length,0);assert.match(h.error,/JSON 对象/);}
});
test('malformed JSON retains the draft and original JSON validation feedback rather than sending a zero-price profile',async()=>{
  const h=harness();h.preset(sync);h.change('API Key','mock-key');h.click('更多选项（Adapter / 超时…）');h.change('Adapter Config','{');await h.save();assert.equal(h.requests.length,0);assert.match(h.error,/合法 JSON/);assert.equal(h.field('1K 单价').props.value,'1.62');
});
test('preset application leaves source presets immutable and preserves current key secret and enabled only',async()=>{
  const h=harness(),before=copy(h.internals.modelPresets);const normalize=h.internals.normalizeProviderPresetDraft;const d=normalize(h.internals.modelPresets.find(p=>p.id===sync).draft);d.unitPrice1k='99';d.adapterConfig='{}';assert.deepEqual(copy(h.internals.modelPresets),before);h.change('API Key','mock-key');h.preset(sync);h.preset(sunburst);assert.equal(h.field('API Key').props.value,'mock-key');assert.equal(h.field('1K 单价').props.value,'1.62');
});
test('explicit custom mode retains the current edits while switching to another preset initializes that preset anew',()=>{
  const h=harness();h.preset(sync);h.change('1K 单价','8');h.preset('');assert.equal(h.field('1K 单价').props.value,'8');h.preset(sunburst);assert.equal(h.field('1K 单价').props.value,'1.62');
});
test('deprecated count preset remains an offline compatibility control with its own tiers and mappings',async()=>{
  const h=harness();h.preset('haodeya-gpt-image-count');h.change('API Key','mock-key');await h.save();const p=h.requests[0].payload;assert.equal(p.unit_price,1.62);assert.equal(p.adapter_config.unit_price_2k,2.67);assert.deepEqual(p.adapter_config.supported_resolutions,['1k','2k']);assert.equal(p.adapter_config.upstream_model_2k,'gpt-image-2-count-2k');
});
test('missing and unrecognized managed values follow the existing reader defaults without inventing new tiers or SKUs',()=>{
  const h=harness(),normalize=h.internals.normalizeProviderPresetDraft;const d=normalize({adapterConfig:JSON.stringify({supported_resolutions:['8k',' 2K '],upstream_model_1k:123,unit_price_1k:null,unmanaged:'keep'})});assert.equal(d.unitPrice1k,'');assert.equal(d.supportedResolution1k,false);assert.equal(d.supportedResolution2k,true);assert.equal(d.supportedResolution4k,false);assert.equal(d.upstreamModel1k,'');const p=h.internals.toProviderProfilePayload(d);assert.deepEqual(copy(p.adapter_config.supported_resolutions),['2k']);assert.equal(p.adapter_config.unmanaged,'keep');assert.ok(!Object.hasOwn(p.adapter_config,'upstream_model_1k'));
});
test('structured fields with invalid prices are still rejected after normalizing a synthetic preset',()=>{
  const h=harness(),normalize=h.internals.normalizeProviderPresetDraft;const d=normalize({adapterConfig:'{}',unitPrice1k:'invalid'});assert.throws(()=>h.internals.toProviderProfilePayload(d),/有限数字/);assert.throws(()=>normalize({adapterConfig:'[]'}),/JSON 对象/);
});
test('applying another preset keeps the current secret and disabled state while replacing its model prices',async()=>{
  const h=harness(),base=h.internals.modelPresets.find(p=>p.id===sync).draft;const id=addPreset(h,{...base,adapterKind:'jimeng_native',unitPrice1k:'99'});h.preset(id);h.change('API Key','mock-key');h.click('更多选项（Adapter / 超时…）');h.change('API Secret','mock-secret');h.field('启用').props.onChange({target:{checked:false}});h.flush();h.preset(sync);await h.save();const p=h.requests[0].payload;assert.equal(p.api_key,'mock-key');assert.equal(p.api_secret,'mock-secret');assert.equal(p.enabled,false);assert.equal(p.unit_price,1.62);
});
test('a malformed preset is rejected before the React updater and keeps the current valid draft intact',()=>{
  for(const raw of ['null','[]','{']){const h=harness();h.preset(sync);const id=addPreset(h,{adapterConfig:raw});h.preset(id);assert.equal(h.field('1K 单价').props.value,'1.62');assert.equal(h.field('预设').props.value,sync);assert.match(h.error,/JSON/);assert.equal(h.requests.length,0);}
});
