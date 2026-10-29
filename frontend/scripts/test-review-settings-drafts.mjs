import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';
const source=name=>readFileSync(new URL(`../src/pages/admin/${name}`,import.meta.url),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
const initialSettings=()=>({chat_agent_ui_enabled:false,prompt_polish_enabled:false,prompt_polish_provider_id:1,prompt_polish_system_prompts:{generate:'saved generate',edit:'saved edit',video:'saved video'},prompt_polish_builtin_prompts:{generate:'builtin',edit:'builtin edit',video:'builtin video'},prompt_polish_mode_limits:{generate:{max_tokens:500,max_output_chars:320,length_multiplier:null},edit:{max_tokens:420,max_output_chars:500,length_multiplier:1.5,compact_original_chars:80,compact_output_chars:120},video:{max_tokens:420,max_output_chars:360,length_multiplier:2}}});
const profile=(id=10,extra={})=>({id,provider_name:'bigjpg',adapter_kind:'bigjpg',base_url:'https://saved.example/api',model_name:'bigjpg',capabilities:['image.upscale'],enabled:true,has_api_key:true,masked_api_key:'mock-mask',...extra});
const chat={id:1,provider_name:'mock-chat',model_name:'mock-chat',display_name:'mock chat',enabled:true,capabilities:['chat.completions']};
function gate(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function compile(code,imports,globals={}){const exports={};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Error,Promise,...globals,require:name=>{assert.ok(Object.hasOwn(imports,name),`undeclared import ${name}`);return imports[name];}});return exports;}
function routeHarness(){
  const text=readFileSync(new URL('../src/router.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('router.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='SettingsRoute');assert.ok(node);
  let cursor=0,tree,dirty=false,mounted=true,lateWrites=0,layouts=[],effects=[],owner={id:7,name:'admin'},canManage=true;const slots=[],updates=[],requests=[];
  const effect=queue=>(setup,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j]))){const next={deps,setup};slots[i]=next;queue.push(()=>{old?.cleanup?.();next.cleanup=setup();});}};
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],next=>{if(!mounted){lateWrites++;return;}updates.push({i,next});dirty=true;}];},useMemo(create,deps){const i=cursor++,old=slots[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))slots[i]={deps,value:create()};return slots[i].value;},useLayoutEffect:(fn,deps)=>effect(layouts)(fn,deps),useEffect:(fn,deps)=>effect(effects)(fn,deps)};
  const api=Object.fromEntries(['tasks','providerProfiles','users','platformSettings'].map(kind=>[kind,()=>{const request={kind,...gate()};requests.push(request);return request.promise;}]));
  const code=`import {useState,useMemo,useLayoutEffect,useEffect} from 'react';import {api} from '../../api';import {useAuth} from '../../context/AuthContext';const AppShell='AppShell',SettingsPage='SettingsPage';\n${node.getText(ast)}\nexports.Route=SettingsRoute;`;
  const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};const Route=compile(code,{'react':react,'react/jsx-runtime':jsx,'../../api':{api},'../../context/AuthContext':{useAuth:()=>({currentUser:owner,isGuest:false,canManageUsers:canManage})}}).Route;
  function render(commit=true){cursor=0;layouts=[];effects=[];const next=Route();if(commit){tree=next;for(const run of layouts)run();for(const run of effects)run();}}
  function flush(){for(const {i,next} of updates.splice(0))slots[i]=typeof next==='function'?next(slots[i]):next;dirty=false;render();}
  async function drain(){for(let i=0;i<12;i++){await Promise.resolve();if(dirty)flush();}}
  render();flush();return{requests,flush,drain,props:()=>tree.props.children.props,get lateWrites(){return lateWrites;},start(){const count=requests.length,promise=tree.props.children.props.onRefresh();return{promise,requests:requests.slice(count)};},ownerChange(){owner={id:8,name:'other-admin'};flush();},profileRefresh(){owner={...owner,display_name:'new'};flush();},permissionChange(){canManage=false;flush();},discardOwnerRender(){const saved=slots.slice(),previous=owner;owner={id:99,name:'discarded'};render(false);slots.splice(0,slots.length,...saved);owner=previous;render();},unmount(){mounted=false;for(const slot of slots)slot?.cleanup?.();}};
}
function resolveRoute(op,marker){for(const request of op.requests)request.resolve(request.kind==='platformSettings'?{marker}:[{id:marker}]);}
function harness({withProfile=true}={}){
  let fibers=new Map(),fiber,layouts=[],passives=[],tree,dirty=false,owner={id:7,name:'mock-admin'},isGuest=false,mounted=true,lateWrites=0,refreshes=0,refreshImpl;
  const updates=[],requests=[];
  let props={userCanUseOpsViews:true,userCanManageUsers:true,tasks:[],users:[],providerProfiles:[chat,...withProfile?[profile()]:[]],platformSettings:initialSettings(),onRefresh:()=>{refreshes++;return Promise.resolve(refreshImpl?.());}};
  const effect=list=>(setup,deps)=>{const i=fiber.cursor++,old=fiber.slots[i];if(!old||!deps||deps.some((value,j)=>!Object.is(value,old.deps?.[j]))){const next={deps,setup};fiber.slots[i]=next;list.push(()=>{old?.cleanup?.();next.cleanup=setup();});}};
  const react={useState(initial){const f=fiber,i=f.cursor++;if(!(i in f.slots))f.slots[i]=typeof initial==='function'?initial():initial;return [f.slots[i],next=>{if(!f.mounted){lateWrites++;return;}updates.push({f,i,next});dirty=true;}];},useRef(initial){const i=fiber.cursor++;return fiber.slots[i]??={current:initial};},useMemo(create,deps){const i=fiber.cursor++,old=fiber.slots[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))fiber.slots[i]={value:create(),deps};return fiber.slots[i].value;},useLayoutEffect:(fn,deps)=>effect(layouts)(fn,deps),useEffect:(fn,deps)=>effect(passives)(fn,deps)};
  const jsx={jsx:(type,props,key)=>({type,props,key}),jsxs:(type,props,key)=>({type,props,key}),Fragment:'fragment'};
  const api=new Proxy({}, {get(_,kind){assert.ok(['updatePlatformSettings','updateProviderProfile','createProviderProfile'].includes(kind),`undeclared API ${String(kind)}`);return(...args)=>{const pending=gate();requests.push({kind,args:copy(args),...pending});return pending.promise;};}});
  const common={'react':react,'react/jsx-runtime':jsx,'../../api':{api}},auth={useAuth:()=>({currentUser:owner,isGuest})};
  const constants=compile(source('settingsIntegrationConstants.ts'),{});
  const hookPath=new URL('../src/pages/admin/useSettingsDraft.ts',import.meta.url);
  const hook=existsSync(hookPath)?compile(source('useSettingsDraft.ts'),{'react':react,'../../context/AuthContext':auth}):null;
  const imports={...common,'./settingsIntegrationConstants':constants,...hook?{'./useSettingsDraft':hook}:{}};
  const big=compile(source('BigjpgIntegrationPanel.tsx'),imports),polish=compile(source('PromptPolishSettingsPanel.tsx'),imports),chatPanel=compile(source('ChatAgentUiSettingsPanel.tsx'),imports);
  const Page=compile(source('SettingsPage.tsx'),{...imports,'./BigjpgIntegrationPanel':big,'./PromptPolishSettingsPanel':polish,'./ChatAgentUiSettingsPanel':chatPanel}).default;
  function walk(n,path,seen){
    if(Array.isArray(n))return n.map((x,i)=>walk(x,`${path}/${x?.key??i}`,seen));if(!n||typeof n!=='object')return n;
    if(typeof n.type==='function'){const id=path+'/'+n.type.name;let f=fibers.get(id);if(!f){f={slots:[],mounted:true};fibers.set(id,f);}f.cursor=0;seen.add(id);const previous=fiber;fiber=f;const out=n.type(n.props);fiber=previous;return walk(out,id,seen);}
    return {...n,props:{...n.props,children:walk(n.props?.children,path+'/c',seen)}};
  }
  function render(commit=true){layouts=[];passives=[];const seen=new Set();const next=walk({type:Page,props},'root',seen);if(commit){tree=next;for(const [id,f] of fibers)if(!seen.has(id)){for(const slot of f.slots)slot?.cleanup?.();f.mounted=false;fibers.delete(id);}for(const run of layouts)run();for(const run of passives)run();}}
  function flush(){for(const {f,i,next} of updates.splice(0))if(f.mounted)f.slots[i]=typeof next==='function'?next(f.slots[i]):next;dirty=false;if(mounted)render();}
  async function drain(){for(let i=0;i<24;i++){await Promise.resolve();if(dirty)flush();}}
  function nodes(root=tree){const out=[];function visit(n){if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object'){out.push(n);visit(n.props?.children);}}visit(root);return out;}
  function text(n){return Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):n==null||typeof n==='boolean'?'':String(n);}
  const panel=name=>nodes().find(n=>['article','div'].includes(n.type)&&nodes(n).some(x=>x.type==='h2'&&text(x)===name)&&(['提示词润色','Chat 设计助手'].includes(name)?n.type==='article':n.props?.className==='settings-integration-panel'));
  function button(label,root=tree){const n=nodes(root).find(n=>n.type==='button'&&text(n)===label);assert.ok(n,`button ${label}`);return n;}
  function field(label,root){const group=nodes(root).find(n=>n.type==='label'&&nodes(n).some(x=>['span','strong'].includes(x.type)&&text(x)===label));assert.ok(group,`field ${label}`);const n=nodes(group).find(n=>['input','select','textarea'].includes(n.type));assert.ok(n);return n;}
  const modeCard=(mode,limits)=>nodes(panel('提示词润色')).find(n=>n.type==='section'&&n.key===mode&&Boolean(n.props.className.includes('limit-card'))===limits);
  render();return {requests,nodes,text,button,field,panel,drain,flush,get props(){return props;},get refreshes(){return refreshes;},get lateWrites(){return lateWrites;},
    click(label,name){const result=button(label,name?panel(name):tree).props.onClick();flush();return result;},change(label,value,name='高清放大'){const n=field(label,panel(name));n.props.onChange({target:{value,checked:value}});flush();},prompt(mode,value){const n=nodes(modeCard(mode,false)).find(n=>n.type==='textarea');if(arguments.length===1)return n;n.props.onChange({target:{value}});flush();},limit(mode,label,value){const n=field(label,modeCard(mode,true));if(arguments.length===2)return n;n.props.onChange({target:{value}});flush();},submitBig(){const n=nodes(panel('高清放大')).find(n=>n.type==='form');const r=n.props.onSubmit({preventDefault(){}});flush();return r;},request(kind,index=0){const r=requests.filter(x=>x.kind===kind)[index];assert.ok(r,`request ${kind}/${index}`);return r;},setSettings(value){props={...props,platformSettings:value};flush();},setProfile(value){props={...props,providerProfiles:[chat,...value?[value]:[]]};flush();},setRefresh(fn){refreshImpl=fn;},ownerChange(){owner={id:8,name:'other-admin'};flush();},profileRefresh(){owner={...owner,display_name:'new'};flush();},discardOwnerRender(){const saved=fibers,previous=owner;fibers=new Map([...saved].map(([id,f])=>[id,{...f,slots:f.slots.slice()}]));owner={id:99,name:'abandoned'};render(false);fibers=saved;owner=previous;render();},unmount(){mounted=false;for(const f of fibers.values()){for(const slot of f.slots)slot?.cleanup?.();f.mounted=false;}}
  };
}
async function ready(options){const h=harness(options);await h.drain();return h;}
test('Chat-only save refresh preserves unsaved polish prompt and max token limit',async()=>{
  const h=await ready();h.click('功能开关');h.prompt('generate','unsaved prompt');h.limit('generate','max_tokens','999');const next={...initialSettings(),chat_agent_ui_enabled:true};h.setRefresh(()=>h.setSettings(next));h.click('启用','Chat 设计助手');assert.deepEqual(h.request('updatePlatformSettings').args[0],{chat_agent_ui_enabled:true});h.request('updatePlatformSettings').resolve(next);await h.drain();assert.equal(h.prompt('generate').props.value,'unsaved prompt');assert.equal(h.limit('generate','max_tokens').props.value,999);
});
test('manual settings refresh with equal values preserves unsaved polish fields',async()=>{
  const h=await ready();h.click('功能开关');h.prompt('generate','unsaved prompt');h.limit('generate','max_tokens','999');h.setRefresh(()=>h.setSettings(initialSettings()));h.click('刷新状态');await h.drain();assert.equal(h.prompt('generate').props.value,'unsaved prompt');assert.equal(h.limit('generate','max_tokens').props.value,999);
});
test('same settings object rerender is the original preservation control',async()=>{
  const h=await ready();h.click('功能开关');h.prompt('generate','unsaved prompt');h.setSettings(h.props.platformSettings);await h.drain();assert.equal(h.prompt('generate').props.value,'unsaved prompt');
});
test('new profile object refresh preserves unsaved Bigjpg base URL and key',async()=>{
  const h=await ready();h.change('API 地址','https://B.example/api');h.change('API Key','mock-B-key');h.setProfile(profile());await h.drain();assert.equal(h.field('API 地址',h.panel('高清放大')).props.value,'https://B.example/api');assert.equal(h.field('API Key',h.panel('高清放大')).props.value,'mock-B-key');
});
test('old Bigjpg save cannot clear the newer URL and key during its response and refresh',async()=>{
  const h=await ready();h.change('API 地址','https://A.example/api');h.change('API Key','mock-A-key');h.submitBig();h.change('API 地址','https://B.example/api');h.change('API Key','mock-B-key');h.setRefresh(()=>h.setProfile(profile(10,{base_url:'https://A.example/api'})));h.request('updateProviderProfile').resolve(profile(10,{base_url:'https://A.example/api'}));await h.drain();assert.equal(h.field('API 地址',h.panel('高清放大')).props.value,'https://B.example/api');assert.equal(h.field('API Key',h.panel('高清放大')).props.value,'mock-B-key');assert.equal(h.request('updateProviderProfile').args[0],10);
});
test('stable Bigjpg save still clears only its submitted key and shows its saved URL',async()=>{
  const h=await ready();h.change('API 地址','https://A.example/api');h.change('API Key','mock-A-key');h.submitBig();h.setRefresh(()=>h.setProfile(profile(10,{base_url:'https://A.example/api'})));h.request('updateProviderProfile').resolve(profile(10,{base_url:'https://A.example/api'}));await h.drain();assert.equal(h.field('API Key',h.panel('高清放大')).props.value,'');assert.equal(h.field('API 地址',h.panel('高清放大')).props.value,'https://A.example/api');
});
test('dirty polish fields preserve every mode while clean fields receive external values and conflict can be explicitly discarded',async()=>{
  const h=await ready();h.click('功能开关');for(const mode of ['generate','edit','video']){h.prompt(mode,`local ${mode}`);h.limit(mode,'max_tokens','999');}h.change('润色模型','','提示词润色');
  const next=initialSettings();next.prompt_polish_enabled=true;next.prompt_polish_provider_id=2;for(const mode of ['generate','edit','video']){next.prompt_polish_system_prompts[mode]=`external ${mode}`;next.prompt_polish_mode_limits[mode].max_tokens=700;next.prompt_polish_mode_limits[mode].max_output_chars=888;}h.setSettings(next);await h.drain();
  for(const mode of ['generate','edit','video']){assert.equal(h.prompt(mode).props.value,`local ${mode}`);assert.equal(h.limit(mode,'max_tokens').props.value,999);assert.equal(h.limit(mode,'结果字数上限').props.value,888);}assert.equal(h.field('润色模型',h.panel('提示词润色')).props.value,'');assert.equal(h.nodes(h.panel('提示词润色')).find(n=>n.type==='input'&&n.props.type==='checkbox').props.checked,true);assert.match(h.text(h.panel('提示词润色')),/同字段配置已变化/);
  h.click('加载服务器配置','提示词润色');await h.drain();assert.equal(h.prompt('generate').props.value,'external generate');assert.equal(h.limit('edit','max_tokens').props.value,700);assert.equal(h.field('润色模型',h.panel('提示词润色')).props.value,'2');assert.doesNotMatch(h.text(h.panel('提示词润色')),/有未保存修改/);assert.equal(h.requests.length,0);
});
test('same-value and ABA polish checkbox and numeric edits remain explicit dirty intent across remote refresh',async()=>{
  const h=await ready();h.click('功能开关');const toggle=()=>h.nodes(h.panel('提示词润色')).find(n=>n.type==='input'&&n.props.type==='checkbox');toggle().props.onChange({target:{checked:false}});h.flush();h.limit('generate','max_tokens','600');h.limit('generate','max_tokens','500');const next=initialSettings();next.prompt_polish_enabled=true;next.prompt_polish_mode_limits.generate.max_tokens=800;h.setSettings(next);await h.drain();assert.equal(toggle().props.checked,false);assert.equal(h.limit('generate','max_tokens').props.value,500);
});
test('polish save uses the submitted snapshot and acknowledges only unchanged versions including trimming',async()=>{
  const h=await ready();h.click('功能开关');h.prompt('generate','  A prompt  ');h.limit('generate','max_tokens','900');h.click('保存配置','提示词润色');h.prompt('generate','B prompt');h.limit('generate','max_tokens','901');const request=h.request('updatePlatformSettings');assert.equal(request.args[0].prompt_polish_system_prompts.generate,'A prompt');assert.equal(request.args[0].prompt_polish_mode_limits.generate.max_tokens,900);const saved=initialSettings();saved.prompt_polish_system_prompts.generate='A prompt';saved.prompt_polish_mode_limits.generate.max_tokens=900;h.setRefresh(()=>h.setSettings(copy(saved)));request.resolve(saved);await h.drain();assert.equal(h.prompt('generate').props.value,'B prompt');assert.equal(h.limit('generate','max_tokens').props.value,901);assert.match(h.text(h.panel('提示词润色')),/仍需保存/);
});
test('stable polish save clears dirty fields to the acknowledged trimmed server values',async()=>{
  const h=await ready();h.click('功能开关');h.prompt('generate','  trimmed  ');h.click('保存配置','提示词润色');const saved=initialSettings();saved.prompt_polish_system_prompts.generate='trimmed';h.request('updatePlatformSettings').resolve(saved);await h.drain();assert.equal(h.prompt('generate').props.value,'trimmed');assert.doesNotMatch(h.text(h.panel('提示词润色')),/有未保存修改/);
});
test('polish save rejects duplicate same-render entry and keeps busy until that operation completes',async()=>{
  const h=await ready();h.click('功能开关');h.prompt('generate','A');const click=h.button('保存配置',h.panel('提示词润色')).props.onClick;click();click();h.flush();assert.equal(h.requests.length,1);assert.ok(h.button('保存中...',h.panel('提示词润色')).props.disabled);h.request('updatePlatformSettings').resolve(initialSettings());await h.drain();assert.equal(h.button('保存配置',h.panel('提示词润色')).props.disabled,false);
});
test('all-limits reset only acknowledges submitted limit versions while prompts and later per-mode edits stay dirty',async()=>{
  const h=await ready();h.click('功能开关');h.prompt('generate','local prompt');h.limit('generate','max_tokens','999');h.click('恢复全部默认','提示词润色');assert.deepEqual(h.request('updatePlatformSettings').args[0],{reset_prompt_polish_mode_limits:true});h.limit('edit','max_tokens','777');const saved=initialSettings();h.setRefresh(()=>h.setSettings(copy(saved)));h.request('updatePlatformSettings').resolve(saved);await h.drain();assert.equal(h.prompt('generate').props.value,'local prompt');assert.equal(h.limit('generate','max_tokens').props.value,500);assert.equal(h.limit('edit','max_tokens').props.value,777);
});
test('per-mode local default restore preserves other modes and does not perform an API call',async()=>{
  const h=await ready();h.click('功能开关');h.limit('generate','max_tokens','999');h.limit('edit','max_tokens','888');const card=h.nodes(h.panel('提示词润色')).find(n=>n.type==='section'&&n.key==='generate'&&n.props.className.includes('limit-card'));h.button('恢复默认',card).props.onClick();h.flush();assert.equal(h.limit('generate','max_tokens').props.value,500);assert.equal(h.limit('edit','max_tokens').props.value,888);assert.equal(h.requests.length,0);
});
test('polish API failure preserves current draft and refresh failure is reported as already saved without resubmission',async()=>{
  const h=await ready();h.click('功能开关');h.prompt('generate','local');h.click('保存配置','提示词润色');h.request('updatePlatformSettings').reject(new Error('mock write rejected'));await h.drain();assert.equal(h.prompt('generate').props.value,'local');assert.match(h.text(h.panel('提示词润色')),/mock write rejected/);h.setRefresh(()=>Promise.reject(new Error('mock GET failed')));h.click('保存配置','提示词润色');h.request('updatePlatformSettings',1).resolve({...initialSettings(),prompt_polish_system_prompts:{...initialSettings().prompt_polish_system_prompts,generate:'local'}});await h.drain();assert.match(h.text(h.panel('提示词润色')),/已保存，但状态刷新失败/);assert.equal(h.requests.length,2);assert.equal(h.refreshes,1);
});
test('old polish failure cannot replace feedback after a new input intention',async()=>{
  const h=await ready();h.click('功能开关');h.prompt('generate','A');h.click('保存配置','提示词润色');h.prompt('generate','B');h.request('updatePlatformSettings').reject(new Error('old A failure'));await h.drain();assert.equal(h.prompt('generate').props.value,'B');assert.doesNotMatch(h.text(h.panel('提示词润色')),/old A failure/);
});
test('Bigjpg refresh merges clean enabled state but protects URL key and explicit same-value checkbox input',async()=>{
  const h=await ready();h.change('API 地址','https://local.example/api');h.change('API Key','mock-local-key');h.setProfile(profile(10,{base_url:'https://remote.example/api',enabled:false}));await h.drain();assert.equal(h.field('API 地址',h.panel('高清放大')).props.value,'https://local.example/api');assert.equal(h.field('API Key',h.panel('高清放大')).props.value,'mock-local-key');assert.equal(h.field('启用集成',h.panel('高清放大')).props.checked,false);assert.match(h.text(h.panel('高清放大')),/当前输入已保留/);h.change('启用集成',false);h.setProfile(profile(10,{enabled:true}));await h.drain();assert.equal(h.field('启用集成',h.panel('高清放大')).props.checked,false);
});
test('Bigjpg same-value key edit and ABA during saving reject stale key cleanup',async()=>{
  for(const values of [['mock-A-key'],['mock-B-key','mock-A-key']]){const h=await ready();h.change('API Key','mock-A-key');h.submitBig();for(const value of values)h.change('API Key',value);h.setRefresh(()=>h.setProfile(profile()));h.request('updateProviderProfile').resolve(profile());await h.drain();assert.equal(h.field('API Key',h.panel('高清放大')).props.value,'mock-A-key');}
});
test('Bigjpg duplicate submit keeps one immutable request and original patch fields',async()=>{
  const h=await ready();h.change('API Key','  mock-A-key  ');const submit=h.nodes(h.panel('高清放大')).find(n=>n.type==='form').props.onSubmit;submit({preventDefault(){}});submit({preventDefault(){}});h.flush();assert.equal(h.requests.length,1);const [id,payload]=h.request('updateProviderProfile').args;assert.equal(id,10);assert.equal(payload.api_key,'mock-A-key');assert.equal(payload.pricing_unit,'per_request');assert.equal(payload.unit_price,0);assert.deepEqual(payload.capabilities,['image.upscale']);h.request('updateProviderProfile').resolve(profile());await h.drain();
});
test('Bigjpg known create result targets the returned id for a later patch even when refresh fails',async()=>{
  const h=await ready({withProfile:false});h.change('API 地址','https://A.example/api');h.change('API Key','mock-A-key');h.setRefresh(()=>Promise.reject(new Error('mock refresh failure')));h.submitBig();h.request('createProviderProfile').resolve(profile(22,{base_url:'https://A.example/api'}));await h.drain();assert.match(h.text(h.panel('高清放大')),/已保存，但状态刷新失败/);h.change('API Key','mock-B-key');h.submitBig();assert.equal(h.requests.filter(r=>r.kind==='createProviderProfile').length,1);assert.equal(h.request('updateProviderProfile').args[0],22);h.request('updateProviderProfile').resolve(profile(22,{base_url:'https://A.example/api'}));await h.drain();
});
test('new Bigjpg creation preserves later fields while the first profile object is received',async()=>{
  const h=await ready({withProfile:false});h.change('API 地址','https://A.example/api');h.change('API Key','mock-A-key');h.submitBig();h.change('API 地址','https://B.example/api');h.change('API Key','mock-B-key');h.setRefresh(()=>h.setProfile(profile(22,{base_url:'https://A.example/api'})));h.request('createProviderProfile').resolve(profile(22,{base_url:'https://A.example/api'}));await h.drain();assert.equal(h.field('API 地址',h.panel('高清放大')).props.value,'https://B.example/api');assert.equal(h.field('API Key',h.panel('高清放大')).props.value,'mock-B-key');h.submitBig();assert.equal(h.request('updateProviderProfile').args[0],22);
});
test('known Bigjpg creation without a valid id is not blindly posted again and explicit server reload confirms its target',async()=>{
  const h=await ready({withProfile:false});h.change('API Key','mock-A-key');h.submitBig();h.request('createProviderProfile').resolve({base_url:'https://saved.example/api',enabled:true});await h.drain();h.submitBig();assert.equal(h.requests.length,1);h.click('加载服务器配置','高清放大');h.submitBig();assert.equal(h.requests.length,1);h.setProfile(profile(23));await h.drain();h.click('加载服务器配置','高清放大');h.change('API Key','mock-next-key');h.submitBig();assert.equal(h.requests.filter(r=>r.kind==='createProviderProfile').length,1);assert.equal(h.request('updateProviderProfile').args[0],23);
});
test('Bigjpg profile identity change cannot silently apply a dirty key to another record',async()=>{
  const h=await ready();h.change('API Key','mock-A-key');h.setProfile(profile(20,{base_url:'https://B.example/api'}));await h.drain();h.submitBig();assert.equal(h.requests.length,0);assert.equal(h.field('API Key',h.panel('高清放大')).props.value,'mock-A-key');h.click('加载服务器配置','高清放大');assert.equal(h.field('API Key',h.panel('高清放大')).props.value,'');h.change('API Key','mock-B-key');h.submitBig();assert.equal(h.request('updateProviderProfile').args[0],20);
});
test('same-account props updates and abandoned owner renders preserve the committed Bigjpg save observation',async()=>{
  const h=await ready();h.change('API Key','mock-key');h.submitBig();h.profileRefresh();h.discardOwnerRender();h.request('updateProviderProfile').resolve(profile());await h.drain();assert.equal(h.field('API Key',h.panel('高清放大')).props.value,'');assert.equal(h.refreshes,1);assert.equal(h.lateWrites,0);
});
test('account change isolates a pending old operation from the new key and busy indicator',async()=>{
  const h=await ready();h.change('API Key','mock-A-key');h.submitBig();h.ownerChange();await h.drain();assert.equal(h.field('API Key',h.panel('高清放大')).props.value,'');h.change('API Key','mock-B-key');h.submitBig();h.request('updateProviderProfile',0).resolve(profile());await h.drain();assert.equal(h.field('API Key',h.panel('高清放大')).props.value,'mock-B-key');assert.ok(h.button('保存中...',h.panel('高清放大')).props.disabled);assert.equal(h.refreshes,0);h.request('updateProviderProfile',1).resolve(profile());await h.drain();assert.equal(h.refreshes,1);
});
test('unmount discards old polish and Bigjpg completions without a late refresh or state write',async()=>{
  for(const kind of ['polish','bigjpg']){const h=await ready();if(kind==='polish'){h.click('功能开关');h.prompt('generate','local');h.click('保存配置','提示词润色');}else{h.change('API Key','mock-key');h.submitBig();}h.unmount();h.request(kind==='polish'?'updatePlatformSettings':'updateProviderProfile').resolve(kind==='polish'?initialSettings():profile());await h.drain();assert.equal(h.refreshes,0,kind);assert.equal(h.lateWrites,0,kind);}
});
test('Bigjpg write failure preserves current key and URL without refreshing or printing the key',async()=>{
  const h=await ready();h.change('API 地址','https://local.example/api');h.change('API Key','mock-sensitive-input');h.submitBig();h.request('updateProviderProfile').reject(new Error('mock rejected'));await h.drain();assert.equal(h.field('API Key',h.panel('高清放大')).props.value,'mock-sensitive-input');assert.equal(h.field('API 地址',h.panel('高清放大')).props.value,'https://local.example/api');assert.match(h.text(h.panel('高清放大')),/mock rejected/);assert.doesNotMatch(h.text(h.panel('高清放大')),/mock-sensitive-input/);assert.equal(h.refreshes,0);
});
test('manual SettingsPage refresh rejection is handled without an unhandled Promise or draft reset',async()=>{
  const h=await ready();h.change('API Key','mock-local-key');h.setRefresh(()=>Promise.reject(new Error('mock read failed')));h.click('刷新状态');await h.drain();assert.equal(h.field('API Key',h.panel('高清放大')).props.value,'mock-local-key');assert.equal(h.refreshes,1);assert.equal(h.requests.length,0);
});
test('actual SettingsRoute rejects stale complete reads and never mixes data from different sequences',async()=>{
  const h=routeHarness(),a=h.start(),b=h.start();resolveRoute(b,200);await b.promise;h.flush();resolveRoute(a,100);await a.promise;h.flush();assert.equal(h.props().platformSettings.marker,200);assert.equal(h.props().providerProfiles[0].id,200);assert.equal(h.props().tasks[0].id,200);assert.equal(h.props().users[0].id,200);
});
test('actual SettingsRoute queued old data updater rechecks its sequence after a newer read starts',async()=>{
  const h=routeHarness(),a=h.start();resolveRoute(a,100);await a.promise;const b=h.start();h.flush();assert.equal(h.props().platformSettings,null);resolveRoute(b,200);await b.promise;h.flush();assert.equal(h.props().platformSettings.marker,200);
});
test('actual SettingsRoute read failure keeps acknowledged data and queued old errors cannot replace a later success',async()=>{
  const h=routeHarness(),ok=h.start();resolveRoute(ok,200);await ok.promise;h.flush();const bad=h.start();bad.requests[0].reject(new Error('mock current read failure'));await assert.rejects(bad.promise,/mock current read failure/);h.flush();assert.equal(h.props().platformSettings.marker,200);assert.equal(h.props().refreshError,'mock current read failure');const old=h.start();old.requests[0].reject(new Error('old error'));await assert.rejects(old.promise,/old error/);const fresh=h.start();h.flush();assert.equal(h.props().refreshError,'mock current read failure');resolveRoute(fresh,300);await fresh.promise;h.flush();assert.equal(h.props().refreshError,'');assert.equal(h.props().platformSettings.marker,300);
});
test('actual SettingsRoute initial rejected read is caught and surfaced through the page refreshError prop',async()=>{
  const h=routeHarness();h.requests[0].reject(new Error('mock initial read failure'));await h.drain();assert.equal(h.props().refreshError,'mock initial read failure');const page=await ready();page.props.refreshError=h.props().refreshError;page.flush();assert.ok(page.nodes().some(n=>n.props?.className==='floating-error'&&page.text(n).includes('mock initial read failure')));
});
test('actual SettingsRoute account and permission changes reject old observations and preserve the existing users query permission rule',async()=>{
  const h=routeHarness(),old=h.start();h.ownerChange();const fresh=h.start();resolveRoute(fresh,200);await fresh.promise;h.flush();resolveRoute(old,100);await old.promise;h.flush();assert.equal(h.props().platformSettings.marker,200);h.permissionChange();const limited=h.start();assert.equal(limited.requests.some(r=>r.kind==='users'),false);resolveRoute(limited,300);await limited.promise;h.flush();assert.deepEqual(Array.from(h.props().users),[]);assert.equal(h.props().platformSettings.marker,300);
});
test('actual SettingsRoute same-user metadata and abandoned account renders do not invalidate its committed observation',async()=>{
  const h=routeHarness(),a=h.start();h.profileRefresh();h.discardOwnerRender();resolveRoute(a,200);await a.promise;h.flush();assert.equal(h.props().platformSettings.marker,200);
});
test('actual SettingsRoute unmount rejects late data and error callbacks without state writes',async()=>{
  for(const reject of [false,true]){const h=routeHarness(),a=h.start();h.unmount();if(reject)a.requests[0].reject(new Error('mock old fail'));else resolveRoute(a,200);await a.promise;assert.equal(h.lateWrites,0);}
});
test('explicit Bigjpg reload after a successful write and failed GET uses the acknowledged server URL rather than stale pre-save props',async()=>{
  const h=await ready();h.change('API 地址','https://acknowledged.example/api');h.change('API Key','mock-submitted-key');h.setRefresh(()=>Promise.reject(new Error('mock GET failed')));h.submitBig();h.request('updateProviderProfile').resolve(profile(10,{base_url:'https://acknowledged.example/api'}));await h.drain();h.change('API 地址','https://later-local.example/api');h.change('API Key','mock-later-key');h.click('加载服务器配置','高清放大');assert.equal(h.field('API 地址',h.panel('高清放大')).props.value,'https://acknowledged.example/api');assert.equal(h.field('API Key',h.panel('高清放大')).props.value,'');assert.equal(h.requests.length,1);
});
test('explicit polish reload after a successful write and failed GET uses the acknowledged trimmed prompt',async()=>{
  const h=await ready();h.click('功能开关');h.prompt('generate','  acknowledged prompt  ');h.setRefresh(()=>Promise.reject(new Error('mock GET failed')));h.click('保存配置','提示词润色');const saved=initialSettings();saved.prompt_polish_system_prompts.generate='acknowledged prompt';h.request('updatePlatformSettings').resolve(saved);await h.drain();h.prompt('generate','later local prompt');h.click('加载服务器配置','提示词润色');assert.equal(h.prompt('generate').props.value,'acknowledged prompt');assert.equal(h.requests.length,1);
});
