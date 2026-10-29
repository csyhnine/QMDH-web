import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';
const src=name=>readFileSync(new URL(`../src/pages/admin/${name}`,import.meta.url),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
const profile=(id,extra={})=>({id,provider_name:`model-${id}`,display_name:`model ${id}`,model_name:`upstream-${id}`,base_url:'mock://provider',adapter_kind:'openai_compatible',capabilities:['image.generate','chat.completions'],strategies:{'image.generate':'openai_images'},adapter_config:{},unit_price:1,enabled:true,has_api_key:true,masked_api_key:'mock',...extra});
const rule=(id,provider_profile_id,unit_price)=>({id,provider_profile_id,unit_price,capability:'chat.completions',metric:'input_tokens',unit_size:1000000,currency:'CNY',is_active:true});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function compile(code,imports,globals={}){const exports={};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Error,Promise,...globals,require:name=>{assert.ok(Object.hasOwn(imports,name),`undeclared import ${name}`);return imports[name];}});return exports;}
function routeHarness(){
  const source=readFileSync(new URL('../src/router.tsx',import.meta.url),'utf8');
  const ast=ts.createSourceFile('router.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ModelsRoute');assert.ok(node);
  let cursor=0,tree,cleanup;const slots=[],updates=[],requests=[];
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],next=>updates.push({i,next})];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(setup){if(!cleanup)cleanup=setup();}};
  const api=Object.fromEntries(['providers','providerProfiles','providerPricingRules'].map(kind=>[kind,()=>{const request={kind,...deferred()};requests.push(request);return request.promise;}]));
  const code=`import {useState,useRef,useEffect} from 'react';import {api} from '../../api';const AppShell='AppShell',ModelsPage='ModelsPage';\n${node.getText(ast)}\nexports.Route=ModelsRoute;`;
  const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  const {Route}=compile(code,{'react':react,'react/jsx-runtime':jsx,'../../api':{api}});
  function render(){cursor=0;tree=Route();}function flush(){for(const {i,next} of updates.splice(0))slots[i]=typeof next==='function'?next(slots[i]):next;render();}
  render();return {requests,flush,props:()=>tree.props.children.props,setError(value){tree.props.children.props.onSetError(value);flush();},start:guard=>{const count=requests.length,promise=tree.props.children.props.onRefresh(guard);return {promise,requests:requests.slice(count)};},unmount(){cleanup?.();}};
}
function harness({queuedErrors=false}={}){
  let cursor=0,tree,dirty=false,mounted=true,lateWrites=0,error='',owner={id:7,name:'admin'},guest=false,refreshes=0,refreshImpl;
  const slots=[],updates=[],layouts=[],passives=[],errorQueue=[],requests=[],storageWrites=[];
  let profiles=[profile(1),profile(2)],rules=[rule(101,1,9),rule(201,2,5)];
  const effect=queue=>(setup,deps)=>{const i=cursor++,old=slots[i];if(!old||!deps||deps.some((value,j)=>!Object.is(value,old.deps?.[j]))){const next={deps,setup};slots[i]=next;queue.push(()=>{old?.cleanup?.();next.cleanup=setup();});}};
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>{if(!mounted){lateWrites++;return;}updates.push({i,next});dirty=true;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useMemo(factory,deps){const i=cursor++,old=slots[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))slots[i]={deps,value:factory()};return slots[i].value;},useLayoutEffect:effect(layouts),useEffect:effect(passives)};
  const api=new Proxy({}, {get(_,name){assert.ok(['createProviderProfile','updateProviderProfile','deleteProviderProfile','createProviderPricingRule','updateProviderPricingRule','deleteProviderPricingRule','previewProviderProfileRequest','probeProviderProfile','discoverProviderModels','bulkImportProviderProfiles'].includes(name),`undeclared API ${String(name)}`);return(...args)=>{const gate=deferred();requests.push({kind:name,args:copy(args),...gate});return gate.promise;};}});
  const jsx={jsx:(type,props,key)=>({type,props,key}),jsxs:(type,props,key)=>({type,props,key})},auth={useAuth:()=>({currentUser:owner,isGuest:guest})};
  const imports={react,'react/jsx-runtime':jsx,'../../api':{api},'./ComfyOperations':{default:'ComfyOperations'}};
  if(existsSync(new URL('../src/pages/admin/useModelAdminState.ts',import.meta.url)))imports['./useModelAdminState']=compile(src('useModelAdminState.ts'),{react,'../../context/AuthContext':auth});
  const Page=compile(src('ModelsPage.tsx'),imports,{localStorage:{getItem:()=>null,setItem:(key,value)=>storageWrites.push({key,value})}}).default;
  const onSetError=next=>{if(queuedErrors)errorQueue.push(next);else error=typeof next==='function'?next(error):next;dirty=true;};
  function render(commit=true){cursor=0;layouts.length=passives.length=0;tree=Page({providerProfiles:profiles,pricingRules:rules,providers:[],error,onRefresh:guard=>{refreshes++;return refreshImpl?.(guard);},onSetError});if(commit){for(const run of layouts.splice(0))run();for(const run of passives.splice(0))run();}}
  function flush(){if(!mounted)return;for(const{i,next}of updates.splice(0))slots[i]=typeof next==='function'?next(slots[i]):next;for(const next of errorQueue.splice(0))error=typeof next==='function'?next(error):next;dirty=false;render();}
  async function drain(){for(let i=0;i<24;i++){await Promise.resolve();if(mounted&&dirty)flush();}}
  function nodes(value=tree){const out=[];function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'){out.push(n);walk(n.props?.children);}}walk(value);return out;}
  function text(n){if(Array.isArray(n))return n.map(text).join('');if(n&&typeof n==='object')return text(n.props?.children);return n==null||typeof n==='boolean'?'':String(n);}
  function area(kind){return kind==='discover'?nodes().find(n=>n.type==='section'&&n.props.className==='discover-panel'):kind==='rule'?nodes().find(n=>n.props?.className==='admin-side-form model-chat-billing-panel'):nodes().find(n=>n.type==='form'&&n.props.className?.includes('model-compact-form'));}
  function field(label,kind='profile'){const group=nodes(area(kind)??tree).find(n=>n.type==='label'&&nodes(n).some(x=>x.type==='span'&&text(x)===label));assert.ok(group,`field ${label}/${kind}`);return nodes(group).find(n=>['input','textarea','select'].includes(n.type));}
  const button=(label,within=tree)=>{const n=nodes(within).find(n=>n.type==='button'&&text(n)===label);assert.ok(n,`button ${label}`);return n;};
  const profileRow=id=>{const n=nodes().find(n=>n.type==='div'&&n.key===id&&n.props.className==='admin-table-row');assert.ok(n,`profile row ${id}`);return n;};
  const ruleRow=id=>{const n=nodes().find(n=>n.type==='div'&&n.key===id&&n.props.className==='template-list-item');assert.ok(n,`rule row ${id}`);return n;};
  render();return {requests,nodes,text,area,field,button,profileRow,ruleRow,flush,drain,storageWrites,get error(){return error;},get refreshes(){return refreshes;},get lateWrites(){return lateWrites;},
    request(kind,index=0){const r=requests.filter(r=>r.kind===kind)[index];assert.ok(r,`request ${kind}/${index}`);return r;},change(label,value,kind='profile',commit=true){field(label,kind).props.onChange({target:{value}});if(commit)flush();},click(label,kind){const result=button(label,kind?area(kind):tree).props.onClick();flush();return result;},editProfile(id){button('编辑',profileRow(id)).props.onClick();flush();},editRule(id){nodes(ruleRow(id)).find(n=>n.props?.className==='template-card template-card-main').props.onClick();flush();},toggle(id){button('停用',profileRow(id)).props.onClick();flush();},deleteProfile(id){button('删除',profileRow(id)).props.onClick();flush();},deleteRule(id){button('删除',ruleRow(id)).props.onClick();flush();},save(){const value=area('profile').props.onSubmit({preventDefault(){}});flush();return value;},saveRule(){const n=nodes(area('rule')).find(n=>n.type==='button'&&['新增规则','更新规则'].includes(text(n)));assert.ok(n);n.props.onClick();flush();},
    discover(){const form=nodes(area('discover')).find(n=>n.type==='form');form.props.onSubmit({preventDefault(){}});flush();},bulk(){const n=nodes(area('discover')).find(n=>n.type==='button'&&text(n).startsWith('导入选中'));assert.ok(n);n.props.onClick();flush();},discovered(id){return nodes(area('discover')).find(n=>n.type==='div'&&n.key===id&&n.props.className?.startsWith('discover-model-item'));},setRefresh(fn){refreshImpl=fn;},setError(value){error=value;},ownerChange(){owner={id:8,name:'other-admin'};flush();},profileRefresh(){owner={...owner,display_name:'new'};flush();},discardOwnerRender(){const saved=slots.slice(),previous=owner;owner={id:8,name:'discarded'};render(false);slots.splice(0,slots.length,...saved);owner=previous;render();},replay(){for(const slot of slots)slot?.cleanup?.();for(const slot of slots)if(slot?.setup)slot.cleanup=slot.setup();},unmount(){mounted=false;for(const slot of slots)slot?.cleanup?.();},
  };
}
async function ready(options){const h=harness(options);await h.drain();return h;}
async function discovered(h,url='mock://A',id='same-model'){
  if(!h.area('discover'))h.click('🔍 探测模型');h.change('Base URL',url,'discover');h.change('API Key','mock-key','discover');h.discover();const r=h.requests.filter(r=>r.kind==='discoverProviderModels').at(-1);r.resolve({base_url:url,models:[{model_id:id,owned_by:'mock',already_exists:false}]});await h.drain();h.click('Chat','discover');
}
test('late profile save A preserves unsaved B and its next update target',async()=>{
  const h=await ready();h.editProfile(1);const pending=h.save();h.editProfile(2);h.change('显示名','unsaved B');h.request('updateProviderProfile').resolve({});await pending;await h.drain();assert.equal(h.field('显示名').props.value,'unsaved B');const next=h.save();assert.equal(h.request('updateProviderProfile',1).args[0],2);h.request('updateProviderProfile',1).resolve({});await next;await h.drain();
});
test('late disable A never changes B enabled value or its subsequent save payload',async()=>{
  const h=await ready();h.editProfile(1);h.toggle(1);h.editProfile(2);h.change('显示名','B');h.request('updateProviderProfile').resolve({});await h.drain();assert.equal(h.field('启用').props.checked,true);const pending=h.save();const request=h.request('updateProviderProfile',1);assert.equal(request.args[0],2);assert.equal(request.args[1].enabled,true);request.resolve({});await pending;await h.drain();
});
test('old bulk import A cannot clear B selection or mark B same model id imported',async()=>{
  const h=await ready();await discovered(h);h.bulk();await discovered(h,'mock://B');assert.ok(h.discovered('same-model'));h.request('bulkImportProviderProfiles').resolve({created:['same-model'],skipped:[]});await h.drain();const row=h.discovered('same-model');assert.ok(row);const checkbox=h.nodes(row).find(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(checkbox.props.checked,true);assert.equal(checkbox.props.disabled,false);assert.ok(!h.nodes(h.area('discover')).some(n=>n.props?.className==='discover-import-result'));
});
test('stable profile save clears only its unchanged editor and refreshes once',async()=>{
  const h=await ready();h.editProfile(1);h.change('显示名','saved A');const pending=h.save();assert.equal(h.request('updateProviderProfile').args[0],1);assert.equal(h.request('updateProviderProfile').args[1].display_name,'saved A');h.request('updateProviderProfile').resolve({});await pending;await h.drain();assert.equal(h.field('显示名').props.value,'');assert.equal(h.refreshes,1);
});
test('profile save preserves later same-editor input including ABA and captures the originally submitted payload',async()=>{
  const h=await ready();h.editProfile(1);h.change('显示名','A');const pending=h.save();h.change('显示名','B');h.change('显示名','A');h.request('updateProviderProfile').resolve({});await pending;await h.drain();assert.equal(h.field('显示名').props.value,'A');assert.equal(h.request('updateProviderProfile').args[1].display_name,'A');assert.ok(h.nodes().some(n=>n.props?.role==='status'&&h.text(n).includes('当前修改已保留')));
});
test('cancelling and reopening the same profile rejects the old save cleanup',async()=>{
  const h=await ready();h.editProfile(1);const pending=h.save();h.click('取消');h.editProfile(1);h.change('显示名','new A');h.request('updateProviderProfile').resolve({});await pending;await h.drain();assert.equal(h.field('显示名').props.value,'new A');
});
test('profile saves on different ids have independent pending operations and old finally cannot unlock B',async()=>{
  const h=await ready();h.editProfile(1);const a=h.save();h.editProfile(2);h.change('显示名','B');const b=h.save();assert.equal(h.requests.filter(r=>r.kind==='updateProviderProfile').length,2);h.request('updateProviderProfile').resolve({});await a;await h.drain();assert.equal(h.button('保存中...',h.area('profile')).props.disabled,true);assert.equal(h.field('显示名').props.value,'B');h.request('updateProviderProfile',1).reject(Error('B failed'));await b;await h.drain();assert.equal(h.field('显示名').props.value,'B');assert.equal(h.error,'B failed');
});
test('same-entity duplicate writes share the current operation without issuing another API request',async()=>{
  const h=await ready();h.editProfile(1);const first=h.save(),second=h.save();assert.equal(first,second);assert.equal(h.requests.filter(r=>r.kind==='updateProviderProfile').length,1);h.toggle(1);assert.equal(h.requests.filter(r=>r.kind==='updateProviderProfile').length,1);h.request('updateProviderProfile').resolve({});await first;await h.drain();
});
test('old profile delete completion leaves B draft intact while a stable A delete ends A editing',async()=>{
  for(const switchToB of [false,true]){const h=await ready();h.editProfile(1);h.deleteProfile(1);if(switchToB){h.editProfile(2);h.change('显示名','unsaved B');}h.request('deleteProviderProfile').resolve({});await h.drain();assert.equal(h.field('显示名').props.value,switchToB?'unsaved B':'');assert.equal(h.refreshes,1);}
});
test('delete preserves edits made to the same draft or to a newly reopened same-id draft',async()=>{
  for(const reopen of [false,true]){const h=await ready();h.editProfile(1);h.deleteProfile(1);if(reopen){h.click('取消');h.editProfile(1);}h.change('显示名','new A');h.request('deleteProviderProfile').resolve({});await h.drain();assert.equal(h.field('显示名').props.value,'new A');}
});
test('stable disable merges only enabled while preserving other unsaved fields',async()=>{
  const h=await ready();h.editProfile(1);h.toggle(1);h.change('显示名','new name');h.request('updateProviderProfile').resolve({});await h.drain();assert.equal(h.field('显示名').props.value,'new name');assert.equal(h.field('启用').props.checked,false);const pending=h.save();assert.equal(h.request('updateProviderProfile',1).args[1].enabled,false);h.request('updateProviderProfile',1).resolve({});await pending;await h.drain();
});
test('explicit enabled edits including same-value and ABA reject the old toggle merge',async()=>{
  for(const aba of [false,true]){const h=await ready();h.editProfile(1);h.toggle(1);const enabled=h.field('启用').props.onChange;if(aba)enabled({target:{checked:false}});enabled({target:{checked:true}});h.flush();h.request('updateProviderProfile').resolve({});await h.drain();assert.equal(h.field('启用').props.checked,true);}
});
test('different profile toggle busy indicators and failures remain independent',async()=>{
  const h=await ready();h.toggle(1);h.toggle(2);h.request('updateProviderProfile').reject(Error('A failed'));await h.drain();assert.ok(h.nodes(h.profileRow(2)).some(n=>n.type==='button'&&h.text(n)==='处理中...'&&n.props.disabled));h.request('updateProviderProfile',1).resolve({});await h.drain();assert.equal(h.error,'');
});
test('old rule save never clears B draft or changes its next update target',async()=>{
  const h=await ready();h.click('Chat 计费');h.editRule(101);h.saveRule();h.change('Chat 模型','2','rule');h.editRule(201);h.change('单价','77','rule');h.request('updateProviderPricingRule').resolve({});await h.drain();assert.equal(h.field('单价','rule').props.value,'77');h.saveRule();const next=h.request('updateProviderPricingRule',1);assert.equal(next.args[0],201);assert.equal(next.args[1].provider_profile_id,2);assert.equal(next.args[1].unit_price,77);next.resolve({});await h.drain();
});
test('stable rule save clears only the original unchanged editor and same-editor new input is preserved',async()=>{
  for(const modified of [false,true]){const h=await ready();h.click('Chat 计费');h.editRule(101);h.saveRule();if(modified){h.change('单价','77','rule');h.change('单价','9','rule');}h.request('updateProviderPricingRule').resolve({});await h.drain();assert.equal(h.field('单价','rule').props.value,modified?'9':'0');assert.ok(h.nodes(h.area('rule')).some(n=>n.type==='button'&&h.text(n)===(modified?'更新规则':'新增规则')));}
});
test('old rule deletion never clears B while stable A deletion ends A editing',async()=>{
  for(const switchToB of [false,true]){const h=await ready();h.click('Chat 计费');h.editRule(101);h.deleteRule(101);if(switchToB){h.change('Chat 模型','2','rule');h.editRule(201);h.change('单价','77','rule');}h.request('deleteProviderPricingRule').resolve({});await h.drain();assert.equal(h.field('单价','rule').props.value,switchToB?'77':'0');assert.equal(h.field('Chat 模型','rule').props.value,switchToB?'2':'1');}
});
test('same-rule reopen and same-rule changes protect the replacement draft from old delete cleanup',async()=>{
  for(const reopen of [false,true]){const h=await ready();h.click('Chat 计费');h.editRule(101);h.deleteRule(101);if(reopen){h.click('取消','rule');h.editRule(101);}h.change('单价','77','rule');h.request('deleteProviderPricingRule').resolve({});await h.drain();assert.equal(h.field('单价','rule').props.value,'77');}
});
test('different rule saves keep separate busy states when the old request finishes first',async()=>{
  const h=await ready();h.click('Chat 计费');h.editRule(101);h.saveRule();h.change('Chat 模型','2','rule');h.editRule(201);h.saveRule();h.request('updateProviderPricingRule').resolve({});await h.drain();assert.equal(h.button('保存中...',h.area('rule')).props.disabled,true);h.request('updateProviderPricingRule',1).reject(Error('B rule failed'));await h.drain();assert.equal(h.field('单价','rule').props.value,'5');assert.equal(h.error,'B rule failed');
});
const previewResult=label=>({endpoint:'mock://preview',method:'POST',body:{model:label},adapter_mode:'mock',strategy:'mock',strategy_label:label,body_shape:'model',effective_capability:'image.generate',headers_redacted:{},multipart:false});
test('preview A never appears beside B and a stable preview uses the exact current parameters',async()=>{
  const h=await ready();h.editProfile(1);h.click('预览请求体');assert.deepEqual(h.request('previewProviderProfileRequest').args,[1,{capability:'image.generate',resolution:'2k',aspect_ratio:'1:1',has_reference:false}]);h.editProfile(2);h.request('previewProviderProfileRequest').resolve(previewResult('A-body'));await h.drain();assert.ok(!h.nodes().some(n=>n.type==='pre'&&h.text(n).includes('A-body')));h.click('预览请求体');h.request('previewProviderProfileRequest',1).resolve(previewResult('B-body'));await h.drain();assert.ok(h.nodes().some(n=>n.type==='pre'&&h.text(n).includes('B-body')));
});
test('profile input and preview parameter ABA invalidate old responses and keep the latest preview busy',async()=>{
  const h=await ready();h.editProfile(1);h.click('预览请求体');h.click('4K');h.click('2K');h.click('16:9');h.click('含参考图');h.click('预览请求体');assert.equal(h.request('previewProviderProfileRequest',1).args[1].aspect_ratio,'16:9');h.request('previewProviderProfileRequest').resolve(previewResult('old-body'));await h.drain();assert.equal(h.button('生成中...').props.disabled,true);h.request('previewProviderProfileRequest',1).resolve(previewResult('new-body'));await h.drain();assert.ok(h.nodes().some(n=>n.type==='pre'&&h.text(n).includes('new-body')));h.change('显示名','changed');assert.ok(!h.nodes().some(n=>n.type==='pre'&&h.text(n).includes('new-body')));
});
test('old preview failures cannot clear newer preview results or error feedback',async()=>{
  const h=await ready();h.editProfile(1);h.click('预览请求体');h.click('4K');h.click('预览请求体');h.request('previewProviderProfileRequest',1).resolve(previewResult('new-body'));await h.drain();h.request('previewProviderProfileRequest').reject(Error('old failed'));await h.drain();assert.ok(h.nodes().some(n=>n.type==='pre'&&h.text(n).includes('new-body')));assert.equal(h.error,'');
});
test('preview success is cleared when its original profile draft changes before the next request',async()=>{
  const h=await ready();h.editProfile(1);h.click('预览请求体');h.change('上游 Model','changed-model');h.request('previewProviderProfileRequest').resolve(previewResult('old-body'));await h.drain();assert.ok(!h.nodes().some(n=>n.type==='pre'&&h.text(n).includes('old-body')));
});
test('global errors are checked again inside the queued parent error updater',async()=>{
  const h=await ready({queuedErrors:true});h.editProfile(1);const pending=h.save();h.request('updateProviderProfile').reject(Error('old save failed'));await Promise.resolve();await Promise.resolve();h.editProfile(2);h.setError('B feedback');h.change('显示名','B');await pending;await h.drain();assert.equal(h.error,'B feedback');
});
test('refresh failure after a known successful mutation never reports that the mutation should be retried',async()=>{
  const h=await ready();h.setRefresh(()=>{throw Error('refresh failed');});h.editProfile(1);const pending=h.save();h.request('updateProviderProfile').resolve({});await pending;await h.drain();assert.match(h.error,/操作已完成.*列表刷新失败/);assert.equal(h.requests.filter(r=>r.kind==='updateProviderProfile').length,1);
});
test('old refresh rejection cannot replace the current draft feedback',async()=>{
  const h=await ready(),gate=deferred();h.setRefresh(()=>gate.promise);h.editProfile(1);const pending=h.save();h.request('updateProviderProfile').resolve({});await h.drain();h.editProfile(2);h.change('显示名','B');h.setError('B feedback');gate.reject(Error('old refresh failed'));await pending;await h.drain();assert.equal(h.error,'B feedback');
});
test('stable discovery and import keep captured credentials and clear only their unchanged selection',async()=>{
  const h=await ready();await discovered(h,'mock://A','gpt-4o');h.change('Base URL','mock://B','discover');h.change('API Key','new-mock-key','discover');h.bulk();const r=h.request('bulkImportProviderProfiles');assert.equal(r.args[0].base_url,'mock://A');assert.equal(r.args[0].api_key,'mock-key');r.resolve({created:['gpt-4o'],skipped:[]});await h.drain();assert.ok(h.nodes(h.area('discover')).some(n=>n.props?.className==='discover-import-result'&&h.text(n).includes('已导入 1 个')));h.click('已导入 (1)','discover');const checkbox=h.nodes(h.discovered('gpt-4o')).find(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(checkbox.props.checked,false);assert.equal(checkbox.props.disabled,true);
});
test('a new discovery batch rejects old bulk success and failure even when the original model ids match',async()=>{
  for(const fail of [false,true]){const h=await ready();await discovered(h);h.bulk();await discovered(h,'mock://B');if(fail)h.request('bulkImportProviderProfiles').reject(Error('A bulk failed'));else h.request('bulkImportProviderProfiles').resolve({created:['same-model'],skipped:[]});await h.drain();assert.equal(h.nodes(h.discovered('same-model')).find(n=>n.type==='input').props.checked,true);assert.ok(!h.nodes(h.area('discover')).some(n=>n.props?.className==='discover-import-result'));assert.ok(!h.text(h.area('discover')).includes('A bulk failed'));}
});
test('different discovery batches have independent imports and old finally cannot release B import busy',async()=>{
  const h=await ready();await discovered(h);h.bulk();await discovered(h,'mock://B');h.bulk();h.request('bulkImportProviderProfiles').resolve({created:['same-model'],skipped:[]});await h.drain();assert.equal(h.button('导入中...',h.area('discover')).props.disabled,true);h.request('bulkImportProviderProfiles',1).resolve({created:['same-model'],skipped:[]});await h.drain();assert.ok(h.nodes(h.area('discover')).some(n=>n.props?.className==='discover-import-result'));
});
test('a later selection in the same batch survives the earlier import completion',async()=>{
  const h=await ready();await discovered(h);h.bulk();h.click('取消全选','discover');h.click('全选当前未导入','discover');h.request('bulkImportProviderProfiles').resolve({created:[],skipped:[]});await h.drain();assert.equal(h.nodes(h.discovered('same-model')).find(n=>n.type==='input').props.checked,true);
});
test('discovery input changes reject an in-flight old result and keep the current input and source',async()=>{
  const h=await ready();h.click('🔍 探测模型');h.change('Base URL','mock://A','discover');h.change('API Key','mock-key','discover');h.discover();h.change('Base URL','mock://B','discover');h.discover();h.request('discoverProviderModels',1).resolve({base_url:'mock://B',models:[{model_id:'B-model',owned_by:'mock',already_exists:false}]});await h.drain();h.request('discoverProviderModels').resolve({base_url:'mock://A',models:[{model_id:'A-model',owned_by:'mock',already_exists:false}]});await h.drain();assert.equal(h.field('Base URL','discover').props.value,'mock://B');assert.ok(h.discovered('B-model'));assert.ok(!h.discovered('A-model'));assert.ok(!h.storageWrites.some(r=>r.value==='mock://A'));
});
test('discovery failures from the old input cannot clear current results or errors',async()=>{
  const h=await ready();h.click('🔍 探测模型');h.change('Base URL','mock://A','discover');h.discover();h.change('Base URL','mock://B','discover');h.discover();h.request('discoverProviderModels',1).resolve({base_url:'mock://B',models:[{model_id:'B-model',owned_by:'mock',already_exists:false}]});await h.drain();h.request('discoverProviderModels').reject(Error('A discovery failed'));await h.drain();assert.ok(h.discovered('B-model'));assert.ok(!h.text(h.area('discover')).includes('A discovery failed'));
});
test('probe responses stay per entity and an old probe error does not occupy B draft feedback',async()=>{
  const h=await ready();h.button('校验',h.profileRow(1)).props.onClick();h.flush();h.button('校验',h.profileRow(2)).props.onClick();h.flush();h.editProfile(2);h.change('显示名','B');h.request('probeProviderProfile').reject(Error('old probe failed'));await h.drain();assert.equal(h.error,'');assert.ok(h.nodes(h.profileRow(2)).some(n=>n.type==='button'&&h.text(n)==='校验中...'&&n.props.disabled));h.request('probeProviderProfile',1).resolve({ok:true,status:'ok',detail:'B checked'});await h.drain();assert.ok(h.text(h.profileRow(2)).includes('B checked'));
});
test('account changes discard old operations without new refreshes or old field writes',async()=>{
  const h=await ready();h.editProfile(1);const pending=h.save();h.ownerChange();await h.drain();h.editProfile(2);h.change('显示名','new account B');h.request('updateProviderProfile').resolve({});await pending;await h.drain();assert.equal(h.field('显示名').props.value,'new account B');assert.equal(h.refreshes,0);assert.equal(h.lateWrites,0);
});
test('same-account profile refresh and abandoned renders preserve current editor observations',async()=>{
  const h=await ready();h.editProfile(1);const pending=h.save();h.profileRefresh();h.discardOwnerRender();h.request('updateProviderProfile').resolve({});await pending;await h.drain();assert.equal(h.field('显示名').props.value,'');assert.equal(h.refreshes,1);
});
test('unmount ignores mutation preview discovery and bulk completions without late state writes or refresh',async()=>{
  for(const kind of ['save','preview','discover','bulk']){const h=await ready();let pending;if(kind==='save'){h.editProfile(1);pending=h.save();}if(kind==='preview'){h.editProfile(1);h.click('预览请求体');}if(kind==='discover'){h.click('🔍 探测模型');h.change('Base URL','mock://A','discover');h.discover();}if(kind==='bulk'){await discovered(h);h.bulk();}h.unmount();if(kind==='save')h.request('updateProviderProfile').resolve({});if(kind==='preview')h.request('previewProviderProfileRequest').resolve(previewResult('late'));if(kind==='discover')h.request('discoverProviderModels').resolve({base_url:'mock://A',models:[]});if(kind==='bulk')h.request('bulkImportProviderProfiles').resolve({created:['same-model'],skipped:[]});await pending;await h.drain();assert.equal(h.lateWrites,0,kind);assert.equal(h.refreshes,0,kind);}
});

test('actual ModelsRoute success rechecks the draft guard when its parent error updater is applied',async()=>{
  const h=routeHarness();let current=true;h.setError('B feedback');const op=h.start(()=>current);op.requests.forEach(r=>r.resolve([]));await op.promise;current=false;h.flush();assert.equal(h.props().error,'B feedback');
});
test('actual ModelsRoute failure rechecks the draft guard when the queued error updater is applied',async()=>{
  const h=routeHarness();let current=true;h.setError('B feedback');const op=h.start(()=>current);op.requests[0].reject(new Error('old refresh failure'));await op.promise;current=false;h.flush();assert.equal(h.props().error,'B feedback');
});
test('actual ModelsRoute latest complete read wins when older reads finish last',async()=>{
  const h=routeHarness(),a=h.start(),b=h.start();b.requests.forEach((r,i)=>r.resolve([{id:200+i}]));await b.promise;h.flush();a.requests.forEach((r,i)=>r.resolve([{id:100+i}]));await a.promise;h.flush();assert.equal(h.props().providers[0].id,200);assert.equal(h.props().providerProfiles[0].id,201);assert.equal(h.props().pricingRules[0].id,202);
});
test('actual ModelsRoute queued old data and errors are rejected after a newer refresh begins',async()=>{
  const h=routeHarness(),a=h.start();a.requests.forEach((r,i)=>r.resolve([{id:100+i}]));await a.promise;const b=h.start();h.flush();assert.equal(h.props().providerProfiles.length,0);b.requests.forEach((r,i)=>r.resolve([{id:200+i}]));await b.promise;h.flush();assert.equal(h.props().providerProfiles[0].id,201);
  h.setError('new feedback');const c=h.start();c.requests[0].reject(new Error('stale error'));await c.promise;h.start();h.flush();assert.equal(h.props().error,'new feedback');
});
test('actual ModelsRoute unmount invalidates pending refresh writes',async()=>{
  const h=routeHarness(),a=h.start();h.setError('kept');h.unmount();a.requests.forEach(r=>r.resolve([{id:100}]));await a.promise;h.flush();assert.equal(h.props().providerProfiles.length,0);assert.equal(h.props().error,'kept');
});
