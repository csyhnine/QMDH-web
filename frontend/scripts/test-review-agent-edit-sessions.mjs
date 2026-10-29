import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';
const source=name=>readFileSync(new URL(`../src/pages/admin/${name}`,import.meta.url),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
const release=(id,name)=>({id,key:`release-${id}`,display_name:name,environment:'prod',openclaw_version:'latest',notes:'saved notes',is_active:true,skill_keys:['skill-a'],system_prompt_template:'saved prompt',chat_tool_allowlist:['mock-tool'],updated_at:null});
const skill=key=>({key,name:key,version:'0.1.0',description:'mock skill',is_active:true,source:'custom',deletable:true,has_skill_md:true,file_manifest:[{path:'SKILL.md'},{path:'notes.md'}]});
const override=(id,scope_key)=>({id,scope:'group',scope_key,disabled_tool_keys:[],system_prompt_overlay:'saved overlay',notes:`saved ${scope_key}`,is_active:true});
function gate(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function compile(code,imports,globals={}){const exports={};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Error,Promise,...globals,require:name=>{assert.ok(Object.hasOwn(imports,name),`undeclared import ${name}`);return imports[name];}});return exports;}
function routeHarness(){
  const source=readFileSync(new URL('../src/router.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('router.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='AgentsRoute');assert.ok(node);
  let cursor=0,tree,dirty=false,mounted=true,lateWrites=0,layouts=[],effects=[],owner={id:7,name:'admin'};const slots=[],updates=[],requests=[];
  const effect=queue=>(setup,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j]))){const next={deps,setup};slots[i]=next;queue.push(()=>{old?.cleanup?.();next.cleanup=setup();});}};
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],next=>{if(!mounted){lateWrites++;return;}updates.push({i,next});dirty=true;}];},useMemo(create,deps){const i=cursor++,old=slots[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))slots[i]={deps,value:create()};return slots[i].value;},useLayoutEffect:(fn,deps)=>effect(layouts)(fn,deps),useEffect:(fn,deps)=>effect(effects)(fn,deps)};
  const api=Object.fromEntries(['agentClients','officialSkills','agentChatTools','agentSkillReleases'].map(kind=>[kind,()=>{const request={kind,...gate()};requests.push(request);return request.promise;}]));
  const code=`import {useState,useMemo,useLayoutEffect,useEffect} from 'react';import {api} from '../../api';import {useAuth} from '../../context/AuthContext';const AppShell='AppShell',AgentOpsPage='AgentOpsPage';\n${node.getText(ast)}\nexports.Route=AgentsRoute;`;
  const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},Route=compile(code,{'react':react,'react/jsx-runtime':jsx,'../../api':{api},'../../context/AuthContext':{useAuth:()=>({currentUser:owner,isGuest:false})}}).Route;
  function render(commit=true){cursor=0;layouts=[];effects=[];const next=Route();if(commit){tree=next;for(const run of layouts)run();for(const run of effects)run();}}
  function flush(){for(const {i,next} of updates.splice(0))slots[i]=typeof next==='function'?next(slots[i]):next;dirty=false;render();}
  async function drain(){for(let i=0;i<12;i++){await Promise.resolve();if(dirty)flush();}}
  render();flush();return{requests,flush,drain,props:()=>tree.props.children.props,get lateWrites(){return lateWrites;},start(guard){const count=requests.length,promise=tree.props.children.props.onRefresh(guard);return{promise,requests:requests.slice(count)};},setError(value){tree.props.children.props.onSetError(value);flush();},ownerChange(){owner={id:8,name:'other'};flush();},profileRefresh(){owner={...owner,display_name:'new'};flush();},discardOwnerRender(){const saved=slots.slice(),previous=owner;owner={id:99,name:'discarded'};render(false);slots.splice(0,slots.length,...saved);owner=previous;render();},unmount(){mounted=false;for(const slot of slots)slot?.cleanup?.();}};
}
function resolveRoute(operation,id){operation.requests.forEach(request=>request.resolve([{id}]));}
function harness(){
  let fibers=new Map(),fiber,layouts=[],passives=[],tree,dirty=false,owner={id:7,name:'mock-admin'},mounted=true,lateWrites=0,refreshes=0,refreshImpl,error='',readImpl;
  const updates=[],errors=[],requests=[];
  let overrides=[override(11,'GroupA'),override(22,'GroupB')];
  let props={clients:[],skills:[skill('skill-a'),skill('skill-b')],chatTools:[{key:'mock-tool',label:'Mock tool',description:'offline'}],releases:[release(101,'A policy'),release(201,'B policy')],error:'',onSetError:next=>{errors.push(next);dirty=true;},onRefresh:()=>{refreshes++;return Promise.resolve(refreshImpl?.());}};
  const effect=list=>(setup,deps)=>{const i=fiber.cursor++,old=fiber.slots[i];if(!old||!deps||deps.some((value,j)=>!Object.is(value,old.deps?.[j]))){const next={deps,setup};fiber.slots[i]=next;list.push(()=>{old?.cleanup?.();next.cleanup=setup();});}};
  const react={useState(initial){const f=fiber,i=f.cursor++;if(!(i in f.slots))f.slots[i]=typeof initial==='function'?initial():initial;return[f.slots[i],next=>{if(!f.mounted){lateWrites++;return;}updates.push({f,i,next});dirty=true;}];},useRef(initial){const i=fiber.cursor++;return fiber.slots[i]??={current:initial};},useMemo(create,deps){const i=fiber.cursor++,old=fiber.slots[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))fiber.slots[i]={value:create(),deps};return fiber.slots[i].value;},useLayoutEffect:(fn,deps)=>effect(layouts)(fn,deps),useEffect:(fn,deps)=>effect(passives)(fn,deps)};
  const jsx={jsx:(type,props,key)=>({type,props,key}),jsxs:(type,props,key)=>({type,props,key}),Fragment:'fragment'};
  const api=new Proxy({}, {get(_,kind){assert.ok(['agentChatPolicyDefaults','agentPolicyOverrides','users','createAgentSkillRelease','updateAgentSkillRelease','createOfficialSkill','installOfficialSkill','officialSkillFile','createAgentPolicyOverride','updateAgentPolicyOverride','deleteAgentPolicyOverride','updateOfficialSkill','deleteOfficialSkill'].includes(kind),`undeclared API ${String(kind)}`);return(...args)=>{if(['agentChatPolicyDefaults','agentPolicyOverrides','users'].includes(kind)){if(readImpl)return readImpl(kind,args);return Promise.resolve(kind==='agentChatPolicyDefaults'?{baseline_prompt:'mock baseline',default_tool_allowlist:['mock-tool']}:kind==='agentPolicyOverrides'?copy(overrides):[{id:1,name:'mock-user',display_name:'Mock',group_name:'GroupA'}]);}const pending=gate();requests.push({kind,args:copy(args),...pending});return pending.promise;};}});
  const globals={window:{confirm:()=>true,requestAnimationFrame:fn=>fn()},document:{getElementById:()=>({scrollIntoView(){}})}};
  const common={'react':react,'react/jsx-runtime':jsx,'../../api':{api}},hookPath=new URL('../src/pages/admin/useAgentEditSessions.ts',import.meta.url);
  const hook=existsSync(hookPath)?compile(source('useAgentEditSessions.ts'),{'react':react,'../../context/AuthContext':{useAuth:()=>({currentUser:owner,isGuest:false})}}):null;
  const imports={...common,...hook?{'./useAgentEditSessions':hook}:{}};
  const panel=compile(source('AgentPolicyOverridesPanel.tsx'),imports,globals);
  const Page=compile(source('AgentOpsPage.tsx'),{...imports,'./AgentPolicyOverridesPanel':panel,'./AgentOpsChatObservabilityPanel':{default:'ObservabilityStub'}},globals).default;
  function walk(n,path,seen){if(Array.isArray(n))return n.map((x,i)=>walk(x,`${path}/${x?.key??i}`,seen));if(!n||typeof n!=='object')return n;if(typeof n.type==='function'){const id=path+'/'+n.type.name;let f=fibers.get(id);if(!f){f={slots:[],mounted:true};fibers.set(id,f);}f.cursor=0;seen.add(id);const previous=fiber;fiber=f;const out=n.type(n.props);fiber=previous;return walk(out,id,seen);}return{...n,props:{...n.props,children:walk(n.props?.children,path+'/c',seen)}};}
  function render(commit=true){layouts=[];passives=[];const seen=new Set(),next=walk({type:Page,props:{...props,error}},'root',seen);if(commit){tree=next;for(const [id,f] of fibers)if(!seen.has(id)){for(const slot of f.slots)slot?.cleanup?.();f.mounted=false;fibers.delete(id);}for(const run of layouts)run();for(const run of passives)run();}}
  function flush(){for(const {f,i,next} of updates.splice(0))if(f.mounted)f.slots[i]=typeof next==='function'?next(f.slots[i]):next;for(const next of errors.splice(0))error=typeof next==='function'?next(error):next;dirty=false;if(mounted)render();}
  async function drain(){for(let i=0;i<24;i++){await Promise.resolve();if(dirty)flush();}}
  function nodes(root=tree){const out=[];function visit(n){if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object'){out.push(n);visit(n.props?.children);}}visit(root);return out;}
  function text(n){return Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):n==null||typeof n==='boolean'?'':String(n);}
  const area=kind=>nodes().find(n=>kind==='policy'?n.type==='form'&&n.props.className?.includes('agent-designer-config-form'):kind==='metadata'?n.type==='details'&&n.props.className==='agent-skill-manual-create':kind==='override'?n.props?.className==='agent-policy-overrides-panel':n.type==='form'&&nodes(n).some(c=>c.type==='h3'&&text(c)==='从 GitHub 安装'));
  function field(label,kind='policy'){const group=nodes(area(kind)).find(n=>n.type==='label'&&nodes(n).some(x=>['span','strong'].includes(x.type)&&text(x)===label));assert.ok(group,`field ${kind}/${label}`);return nodes(group).find(n=>['input','select','textarea'].includes(n.type));}
  function button(label,root=tree){const n=nodes(root).find(n=>n.type==='button'&&text(n)===label);assert.ok(n,`button ${label}`);return n;}
  const row=(kind,id)=>{const root=kind==='override'?area('override'):nodes().find(n=>n.props?.className===(kind==='skill'?'admin-data-table agent-skill-table':'admin-data-table agent-release-table'));const n=nodes(root).find(n=>n.key===id);assert.ok(n,`row ${kind}/${id}`);return n;};
  render();return{requests,nodes,text,area,field,button,row,drain,flush,get error(){return error;},get refreshes(){return refreshes;},get lateWrites(){return lateWrites;},
    request(kind,index=0){const r=requests.filter(x=>x.kind===kind)[index];assert.ok(r,`request ${kind}/${index}`);return r;},change(label,value,kind='policy',commit=true){field(label,kind).props.onChange({target:{value,checked:value}});if(commit)flush();},click(label,kind){const r=button(label,kind?area(kind):tree).props.onClick();flush();return r;},editPolicy(id){button('编辑',row('policy',id)).props.onClick();flush();},editOverride(id){button('编辑',row('override',id)).props.onClick();flush();},deleteOverride(id){button('删除',row('override',id)).props.onClick();flush();},expand(key){const r=row('skill',key);button(nodes(r).some(n=>n.type==='button'&&text(n)==='收起')?'收起':'文件',r).props.onClick();flush();},preview(key,path){button(path,row('skill',key)).props.onClick();flush();},submit(kind){const root=area(kind),form=root.type==='form'?root:nodes(root).find(n=>n.type==='form');assert.ok(form,`form ${kind}`);const r=form.props.onSubmit({preventDefault(){}});flush();return r;},setRefresh(fn){refreshImpl=fn;},setRead(fn){readImpl=fn;},setReleases(value){props={...props,releases:value};flush();},setOverrides(value){overrides=value;},setError(value){error=value;},ownerChange(){owner={id:8,name:'other-admin'};flush();},profileRefresh(){owner={...owner,display_name:'updated'};flush();},discardOwnerRender(){const saved=fibers,previous=owner;fibers=new Map([...saved].map(([id,f])=>[id,{...f,slots:f.slots.slice()}]));owner={id:99,name:'discarded'};render(false);fibers=saved;owner=previous;render();},unmount(){mounted=false;for(const f of fibers.values()){for(const slot of f.slots)slot?.cleanup?.();f.mounted=false;}}
  };
}
async function ready(){const h=harness();await h.drain();return h;}
test('old policy save A preserves later policy B draft and next target',async()=>{
  const h=await ready();h.editPolicy(101);h.submit('policy');h.editPolicy(201);h.change('配置名称','B local');h.request('updateAgentSkillRelease').resolve({});await h.drain();assert.equal(h.field('配置名称').props.value,'B local');h.submit('policy');assert.equal(h.request('updateAgentSkillRelease',1).args[0],201);
});
test('stable policy save finishes the original unchanged editor',async()=>{
  const h=await ready();h.editPolicy(101);h.submit('policy');h.request('updateAgentSkillRelease').resolve({});await h.drain();assert.equal(h.field('配置名称').props.value,'');assert.equal(h.refreshes,1);
});
test('old metadata create preserves newer name key and description',async()=>{
  const h=await ready();h.change('名称','A name','metadata');h.submit('metadata');h.change('名称','B name','metadata');h.change('Key','B_key','metadata');h.change('说明','B description','metadata');h.request('createOfficialSkill').resolve({});await h.drain();assert.equal(h.field('名称','metadata').props.value,'B name');assert.equal(h.field('Key','metadata').props.value,'b_key');assert.equal(h.field('说明','metadata').props.value,'B description');
});
test('stable metadata create clears the submitted unchanged fields',async()=>{
  const h=await ready();h.change('名称','A name','metadata');h.submit('metadata');h.request('createOfficialSkill').resolve({});await h.drain();assert.equal(h.field('名称','metadata').props.value,'');assert.equal(h.refreshes,1);
});
test('old successful install preserves newer source input and current expanded file view',async()=>{
  const h=await ready();h.change('安装源','mock-source-A','install');h.submit('install');h.change('安装源','mock-source-B','install');h.expand('skill-b');h.request('installOfficialSkill').resolve({status:'installed',skill:{key:'skill-a'}});await h.drain();assert.equal(h.field('安装源','install').props.value,'mock-source-B');assert.ok(h.nodes(h.row('skill','skill-b')).some(n=>n.type==='button'&&h.text(n)==='收起'));
});
test('stable successful install clears its unchanged source',async()=>{
  const h=await ready();h.change('安装源','mock-source-A','install');h.submit('install');h.request('installOfficialSkill').resolve({status:'installed',skill:{key:'skill-a'}});await h.drain();assert.equal(h.field('安装源','install').props.value,'');assert.equal(h.refreshes,1);
});
test('late Skill A preview never appears under current Skill B and path',async()=>{
  const h=await ready();h.expand('skill-a');h.preview('skill-a','SKILL.md');h.expand('skill-b');h.preview('skill-b','SKILL.md');h.request('officialSkillFile',1).resolve({content:'body from B'});await h.drain();h.request('officialSkillFile',0).resolve({content:'body from A'});await h.drain();const body=h.nodes(h.row('skill','skill-b')).find(n=>n.type==='pre');assert.equal(h.text(body),'body from B');
});
test('serial Skill previews show the requested stable file body',async()=>{
  const h=await ready();h.expand('skill-a');h.preview('skill-a','SKILL.md');h.request('officialSkillFile').resolve({content:'body from A'});await h.drain();h.expand('skill-b');h.preview('skill-b','notes.md');h.request('officialSkillFile',1).resolve({content:'B notes'});await h.drain();assert.equal(h.text(h.nodes(h.row('skill','skill-b')).find(n=>n.type==='pre')),'B notes');
});
test('old Override save preserves B notes scope and original next update target',async()=>{
  const h=await ready();h.editOverride(11);h.submit('override');h.editOverride(22);h.change('备注','B local notes','override');h.request('updateAgentPolicyOverride').resolve({});await h.drain();assert.equal(h.field('备注','override').props.value,'B local notes');assert.equal(h.field('用户组名称','override').props.value,'GroupB');h.submit('override');assert.equal(h.request('updateAgentPolicyOverride',1).args[0],22);
});
test('stable Override save finishes the original unchanged editor',async()=>{
  const h=await ready();h.editOverride(11);h.submit('override');h.request('updateAgentPolicyOverride').resolve({});await h.drain();assert.equal(h.field('备注','override').props.value,'');assert.equal(h.field('用户组名称','override').props.value,'');
});
test('old Override delete cannot reset the later B editor',async()=>{
  const h=await ready();h.editOverride(11);h.deleteOverride(11);h.editOverride(22);h.change('备注','B local notes','override');h.request('deleteAgentPolicyOverride').resolve({});await h.drain();assert.equal(h.field('备注','override').props.value,'B local notes');assert.equal(h.field('用户组名称','override').props.value,'GroupB');
});
test('stable Override delete ends editing its original record',async()=>{
  const h=await ready();h.editOverride(11);h.deleteOverride(11);h.request('deleteAgentPolicyOverride').resolve({});await h.drain();assert.equal(h.field('备注','override').props.value,'');assert.equal(h.field('用户组名称','override').props.value,'');
});
test('same policy input and ABA preserve later edits while its original immutable payload remains A',async()=>{
  const h=await ready();h.editPolicy(101);h.change('配置名称','A submitted');h.submit('policy');h.change('配置名称','temporary B');h.change('配置名称','A submitted');h.change('变更说明（审计用）','later notes');h.request('updateAgentSkillRelease').resolve({});await h.drain();assert.equal(h.field('配置名称').props.value,'A submitted');assert.equal(h.field('变更说明（审计用）').props.value,'later notes');assert.equal(h.request('updateAgentSkillRelease').args[1].notes,'saved notes');assert.match(h.text(h.area('policy')),/当前修改已保留/);
});
test('cancel and reopen of the same policy id rejects cleanup from the prior editor session',async()=>{
  const h=await ready();h.editPolicy(101);h.submit('policy');h.click('取消编辑','policy');h.editPolicy(101);h.change('配置名称','new A session');h.request('updateAgentSkillRelease').resolve({});await h.drain();assert.equal(h.field('配置名称').props.value,'new A session');
});
test('policy saves on different ids keep independent busy states when A finishes first',async()=>{
  const h=await ready();h.editPolicy(101);h.submit('policy');h.editPolicy(201);h.change('配置名称','B submitted');h.submit('policy');h.request('updateAgentSkillRelease',0).resolve({});await h.drain();assert.equal(h.field('配置名称').props.value,'B submitted');assert.ok(h.button('保存中...',h.area('policy')).props.disabled);h.request('updateAgentSkillRelease',1).resolve({});await h.drain();assert.equal(h.field('配置名称').props.value,'');
});
test('same-render policy submit handlers issue one request and keep the original entity and tools payload',async()=>{
  const h=await ready();h.editPolicy(101);const cb=h.area('policy').props.onSubmit;cb({preventDefault(){}});cb({preventDefault(){}});h.flush();assert.equal(h.requests.length,1);const [id,payload]=h.request('updateAgentSkillRelease').args;assert.equal(id,101);assert.deepEqual(payload.skill_keys,['skill-a','skill-b']);assert.deepEqual(payload.chat_tool_allowlist,['mock-tool']);h.request('updateAgentSkillRelease').resolve({});await h.drain();
});
test('metadata same-value ABA protects new fields and preserves exact create request values',async()=>{
  const h=await ready();h.change('名称','A name','metadata');h.submit('metadata');h.change('名称','B name','metadata');h.change('名称','A name','metadata');h.request('createOfficialSkill').resolve({});await h.drain();assert.equal(h.field('名称','metadata').props.value,'A name');assert.equal(h.request('createOfficialSkill').args[0].name,'A name');assert.equal(h.request('createOfficialSkill').args[0].version,'0.1.0');assert.match(h.text(h.area('metadata')),/当前修改已保留/);
});
test('install source ABA and an explicit same-value overwrite edit reject the original successful cleanup',async()=>{
  const h=await ready();h.change('安装源','mock-source-A','install');h.submit('install');h.change('安装源','mock-source-B','install');h.change('安装源','mock-source-A','install');h.change('同名 Key 时覆盖更新',false,'install');h.request('installOfficialSkill').resolve({status:'installed',skill:{key:'skill-a'}});await h.drain();assert.equal(h.field('安装源','install').props.value,'mock-source-A');assert.deepEqual(h.request('installOfficialSkill').args[0],{source:'mock-source-A',overwrite:false});
});
test('unchanged install clears its own source without stealing a later file expansion',async()=>{
  const h=await ready();h.change('安装源','mock-source-A','install');h.submit('install');h.expand('skill-b');h.preview('skill-b','notes.md');h.request('officialSkillFile').resolve({content:'B notes'});await h.drain();h.request('installOfficialSkill').resolve({status:'installed',skill:{key:'skill-a'}});await h.drain();assert.equal(h.field('安装源','install').props.value,'');assert.equal(h.text(h.nodes(h.row('skill','skill-b')).find(n=>n.type==='pre')),'B notes');
});
test('preview path ABA accepts only the newest owner and duplicate current reads share that request',async()=>{
  const h=await ready();h.expand('skill-a');h.preview('skill-a','SKILL.md');h.preview('skill-a','notes.md');h.preview('skill-a','SKILL.md');h.preview('skill-a','SKILL.md');assert.equal(h.requests.filter(r=>r.kind==='officialSkillFile').length,3);h.request('officialSkillFile',2).resolve({content:'latest A'});await h.drain();h.request('officialSkillFile',1).resolve({content:'old notes'});h.request('officialSkillFile',0).resolve({content:'old first A'});await h.drain();const body=h.nodes(h.row('skill','skill-a')).find(n=>n.type==='pre');assert.equal(h.text(body),'latest A');assert.equal(body.props['aria-label'],'skill-a/SKILL.md');
});
test('old preview failures never replace a newer body and collapse invalidates its pending owner',async()=>{
  const h=await ready();h.expand('skill-a');h.preview('skill-a','SKILL.md');h.expand('skill-b');h.preview('skill-b','notes.md');h.request('officialSkillFile',1).resolve({content:'B current'});await h.drain();h.request('officialSkillFile',0).reject(new Error('old A failure'));await h.drain();assert.equal(h.text(h.nodes(h.row('skill','skill-b')).find(n=>n.type==='pre')),'B current');h.preview('skill-b','SKILL.md');h.expand('skill-b');h.request('officialSkillFile',2).resolve({content:'closed B'});await h.drain();h.expand('skill-b');assert.equal(h.nodes(h.row('skill','skill-b')).some(n=>n.type==='pre'),false);
});
test('same Override draft changes and same-id reopen protect inputs from old deletion cleanup',async()=>{
  for(const reopen of [false,true]){const h=await ready();h.editOverride(11);h.deleteOverride(11);if(reopen){h.click('取消编辑','override');h.editOverride(11);}h.change('备注','new A notes','override');h.request('deleteAgentPolicyOverride').resolve({});await h.drain();assert.equal(h.field('备注','override').props.value,'new A notes');assert.equal(h.field('用户组名称','override').props.value,'GroupA');}
});
test('different Override saves keep separate busy and reset only their own unchanged sessions',async()=>{
  const h=await ready();h.editOverride(11);h.submit('override');h.editOverride(22);h.change('备注','B notes','override');h.submit('override');h.request('updateAgentPolicyOverride',0).resolve({});await h.drain();assert.equal(h.field('备注','override').props.value,'B notes');assert.ok(h.button('保存中...',h.area('override')).props.disabled);h.request('updateAgentPolicyOverride',1).resolve({});await h.drain();assert.equal(h.field('备注','override').props.value,'');
});
test('queued parent error checks the latest shared intention after a sibling input changes',async()=>{
  const h=await ready();h.editPolicy(101);h.submit('policy');h.request('updateAgentSkillRelease').reject(new Error('old A policy failure'));await Promise.resolve();await Promise.resolve();h.setError('B feedback');h.change('备注','B current note','override');await h.drain();assert.equal(h.error,'B feedback');assert.equal(h.field('备注','override').props.value,'B current note');
});
test('known successful policy mutation followed by a refresh rejection is not reported as a failed write or retried',async()=>{
  const h=await ready();h.editPolicy(101);h.setRefresh(()=>Promise.reject(new Error('mock read failed')));h.submit('policy');h.request('updateAgentSkillRelease').resolve({});await h.drain();assert.match(h.error,/操作已完成，但列表刷新失败/);assert.equal(h.requests.length,1);assert.equal(h.field('配置名称').props.value,'');
});
test('override list refreshes reject old data and old failures while preserving the current editor',async()=>{
  const h=await ready(),reads=[];h.setRead(kind=>{if(kind==='agentPolicyOverrides'){const read=gate();reads.push(read);return read.promise;}return Promise.resolve([]);});h.click('刷新','override');h.click('刷新','override');reads[1].resolve([override(22,'NewB')]);await h.drain();h.editOverride(22);h.change('备注','B local','override');reads[0].resolve([override(11,'OldA')]);await h.drain();assert.ok(h.row('override',22));assert.equal(h.field('备注','override').props.value,'B local');h.click('刷新','override');h.click('刷新','override');reads[3].resolve([override(22,'NewestB')]);await h.drain();reads[2].reject(new Error('old list failure'));await h.drain();assert.equal(h.field('备注','override').props.value,'B local');assert.doesNotMatch(h.error,/old list failure/);
});
test('removed policy record preserves its draft and explicit cleared tools are not restored by an unrelated list object',async()=>{
  const h=await ready();h.editPolicy(101);h.change('配置名称','A local');h.setReleases([]);await h.drain();assert.equal(h.field('配置名称').props.value,'A local');assert.match(h.text(h.area('policy')),/草稿已保留/);h.click('新建 Chat 策略版本');h.change('配置名称','new policy');h.click('清空','policy');h.setReleases([release(201,'B')]);await h.drain();h.submit('policy');assert.equal(h.requests.length,0);assert.match(h.error,/至少选择一个 Chat 工具/);
});
test('new account isolate pending saves and old finally cannot unlock its newer operation',async()=>{
  const h=await ready();h.editPolicy(101);h.submit('policy');h.ownerChange();await h.drain();h.editPolicy(201);h.change('配置名称','new account B');h.submit('policy');h.request('updateAgentSkillRelease',0).resolve({});await h.drain();assert.equal(h.field('配置名称').props.value,'new account B');assert.ok(h.button('保存中...',h.area('policy')).props.disabled);assert.equal(h.refreshes,0);h.request('updateAgentSkillRelease',1).resolve({});await h.drain();assert.equal(h.refreshes,1);
});
test('same-account profile update and abandoned render retain the committed editor observation',async()=>{
  const h=await ready();h.editPolicy(101);h.submit('policy');h.profileRefresh();h.discardOwnerRender();h.request('updateAgentSkillRelease').resolve({});await h.drain();assert.equal(h.field('配置名称').props.value,'');assert.equal(h.refreshes,1);assert.equal(h.lateWrites,0);
});
test('unmount discards all six operation completions without new refresh or late state writes',async()=>{
  for(const kind of ['policy','metadata','install','preview','override','delete']){const h=await ready();let api,result={};if(kind==='policy'){h.editPolicy(101);h.submit('policy');api='updateAgentSkillRelease';}if(kind==='metadata'){h.change('名称','A','metadata');h.submit('metadata');api='createOfficialSkill';}if(kind==='install'){h.change('安装源','mock-source','install');h.submit('install');api='installOfficialSkill';result={status:'installed',skill:{key:'skill-a'}};}if(kind==='preview'){h.expand('skill-a');h.preview('skill-a','SKILL.md');api='officialSkillFile';result={content:'old body'};}if(kind==='override'){h.editOverride(11);h.submit('override');api='updateAgentPolicyOverride';}if(kind==='delete'){h.editOverride(11);h.deleteOverride(11);api='deleteAgentPolicyOverride';}h.unmount();h.request(api).resolve(result);await h.drain();assert.equal(h.refreshes,0,kind);assert.equal(h.lateWrites,0,kind);}
});
test('current mutation failures preserve all five drafts and release only their own busy state',async()=>{
  for(const kind of ['policy','metadata','install','override','delete']){const h=await ready();let api;if(kind==='policy'){h.editPolicy(101);h.submit('policy');api='updateAgentSkillRelease';}if(kind==='metadata'){h.change('名称','A name','metadata');h.submit('metadata');api='createOfficialSkill';}if(kind==='install'){h.change('安装源','mock-source-A','install');h.submit('install');api='installOfficialSkill';}if(kind==='override'){h.editOverride(11);h.submit('override');api='updateAgentPolicyOverride';}if(kind==='delete'){h.editOverride(11);h.deleteOverride(11);api='deleteAgentPolicyOverride';}h.request(api).reject(new Error(`${kind} mock failure`));await h.drain();assert.equal(h.error,`${kind} mock failure`,kind);assert.equal(h.refreshes,0);assert.equal(h.requests.length,1);if(kind==='policy')assert.equal(h.field('配置名称').props.value,'A policy');if(kind==='metadata')assert.equal(h.field('名称','metadata').props.value,'A name');if(kind==='install')assert.equal(h.field('安装源','install').props.value,'mock-source-A');if(['override','delete'].includes(kind))assert.equal(h.field('用户组名称','override').props.value,'GroupA');}
});
test('Override write success followed by local list failure is explicitly partial success without another mutation',async()=>{
  const h=await ready();h.editOverride(11);h.setRead(kind=>kind==='agentPolicyOverrides'?Promise.reject(new Error('mock GET failed')):Promise.resolve([]));h.submit('override');h.request('updateAgentPolicyOverride').resolve({});await h.drain();assert.match(h.error,/操作已完成，但 Override 列表刷新失败/);assert.equal(h.requests.length,1);assert.equal(h.field('用户组名称','override').props.value,'');
});
test('different Skill toggle keys have independent busy tokens and retain original API targets',async()=>{
  const h=await ready();h.button('停用',h.row('skill','skill-a')).props.onClick();h.flush();h.button('停用',h.row('skill','skill-b')).props.onClick();h.flush();assert.deepEqual(h.request('updateOfficialSkill',0).args,['skill-a',{is_active:false}]);assert.deepEqual(h.request('updateOfficialSkill',1).args,['skill-b',{is_active:false}]);h.request('updateOfficialSkill',0).resolve({});await h.drain();assert.ok(h.button('处理中…',h.row('skill','skill-b')).props.disabled);h.request('updateOfficialSkill',1).resolve({});await h.drain();assert.equal(h.refreshes,2);
});
test('actual AgentsRoute newest complete read wins and queued stale data cannot apply after a newer request begins',async()=>{
  const h=routeHarness(),a=h.start(),b=h.start();resolveRoute(b,200);await b.promise;h.flush();resolveRoute(a,100);await a.promise;h.flush();for(const field of ['clients','skills','chatTools','releases'])assert.equal(h.props()[field][0].id,200);const c=h.start();resolveRoute(c,300);await c.promise;const d=h.start();h.flush();assert.equal(h.props().releases[0].id,200);resolveRoute(d,400);await d.promise;h.flush();assert.equal(h.props().releases[0].id,400);
});
test('actual AgentsRoute success and failure error updaters recheck the current caller intent',async()=>{
  for(const reject of [false,true]){const h=routeHarness();h.setError('B feedback');let current=true;const a=h.start(()=>current);if(reject){a.requests[0].reject(new Error('old read error'));await assert.rejects(a.promise,/old read error/);}else{resolveRoute(a,100);await a.promise;}current=false;h.flush();assert.equal(h.props().error,'B feedback');}
});
test('actual AgentsRoute initial failure is caught while a superseded failure cannot clear the new data',async()=>{
  const h=routeHarness();h.requests[0].reject(new Error('mock initial failure'));await h.drain();assert.equal(h.props().error,'mock initial failure');const a=h.start(),b=h.start();resolveRoute(b,200);await b.promise;h.flush();a.requests[0].reject(new Error('old fail'));await a.promise;h.flush();assert.equal(h.props().error,'');assert.equal(h.props().releases[0].id,200);
});
test('actual AgentsRoute account switch and unmount discard old data and error observations',async()=>{
  const h=routeHarness(),a=h.start();h.ownerChange();const b=h.start();resolveRoute(b,200);await b.promise;h.flush();resolveRoute(a,100);await a.promise;h.flush();assert.equal(h.props().releases[0].id,200);const c=h.start();h.unmount();c.requests[0].reject(new Error('after unmount'));await c.promise;assert.equal(h.lateWrites,0);
});
test('actual AgentsRoute same-account metadata and abandoned render preserve the committed read',async()=>{
  const h=routeHarness(),a=h.start();h.profileRefresh();h.discardOwnerRender();resolveRoute(a,200);await a.promise;h.flush();assert.equal(h.props().releases[0].id,200);
});
test('pending Override read after unmount never invokes a late state setter on success or failure',async()=>{
  for(const reject of [false,true]){const h=await ready(),read=gate();h.setRead(kind=>kind==='agentPolicyOverrides'?read.promise:Promise.resolve([]));h.click('刷新','override');h.unmount();if(reject)read.reject(new Error('old read failure'));else read.resolve([override(22,'B')]);await h.drain();assert.equal(h.lateWrites,0,String(reject));}
});
