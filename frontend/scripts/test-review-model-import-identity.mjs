import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';
const driverUrl=new URL('./test-review-model-admin-sessions.mjs',import.meta.url);
const driver=readFileSync(driverUrl,'utf8').split('\ntest(')[0].replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',JSON.stringify(driverUrl.href));
const {ready,discovered}=vm.runInNewContext(driver+'\n;({ready,discovered})',{assert,readFileSync,existsSync,vm,ts,Error,Promise,URL,JSON});
async function discoverMany(h,ids,url='https://a.example/v1'){
  if(!h.area('discover'))h.click('🔍 探测模型');h.change('Base URL',url,'discover');h.change('API Key','mock-key','discover');h.discover();h.requests.filter(r=>r.kind==='discoverProviderModels').at(-1).resolve({base_url:url,models:ids.map(model_id=>({model_id,owned_by:'mock',already_exists:false}))});await h.drain();h.click('Chat','discover');
}
function nameInput(h,id){const n=h.nodes(h.discovered(id)).find(n=>n.props?.['aria-label']===`导入标识 ${id}`);assert.ok(n);return n;}
function setName(h,id,value){nameInput(h,id).props.onChange({target:{value}});h.flush();}
async function finish(h,result,index=0){h.request('bulkImportProviderProfiles',index).resolve(result);await h.drain();}
const outcome=(model_id,provider_name,status,extra={})=>({model_id,provider_name,status,...extra});
test('default imports delegate distinct raw model identities to the backend without guessing a new display name',async()=>{
  const h=await ready();await discoverMany(h,['Org/Qwen','org_qwen']);h.bulk();const payload=h.request('bulkImportProviderProfiles').args[0];assert.equal(payload.base_url,'https://a.example/v1');assert.deepEqual(payload.models.map(x=>[x.model_id,x.provider_name,x.name_mode]),[['Org/Qwen','org_qwen','identity'],['org_qwen','org_qwen','identity']]);assert.equal(nameInput(h,'Org/Qwen').props.maxLength,100);
});
test('explicit per-model override is preserved by bulk capability assignment and sent as explicit mode',async()=>{
  const h=await ready();await discoverMany(h,['Org/Qwen']);setName(h,'Org/Qwen','custom_qwen');h.click('生成页','discover');assert.equal(nameInput(h,'Org/Qwen').props.value,'custom_qwen');h.bulk();const item=h.request('bulkImportProviderProfiles').args[0].models[0];assert.equal(item.provider_name,'custom_qwen');assert.equal(item.name_mode,'explicit');assert.ok(item.capabilities.includes('image.generate'));
});
test('clearing or entering whitespace in an override restores automatic identity mode',async()=>{
  for(const value of ['', '   ']){const h=await ready();await discoverMany(h,['Org/Qwen']);setName(h,'Org/Qwen','custom_name');setName(h,'Org/Qwen',value);h.bulk();const item=h.request('bulkImportProviderProfiles').args[0].models[0];assert.equal(item.name_mode,'identity');assert.equal(item.provider_name,'org_qwen');}
});
test('invalid explicit names are rejected locally while preserving the value and selection',async()=>{
  for(const value of ['x','bad/name','x'.repeat(101)]){const h=await ready();await discoverMany(h,['Org/Qwen']);setName(h,'Org/Qwen',value);h.bulk();await h.drain();assert.equal(h.requests.filter(r=>r.kind==='bulkImportProviderProfiles').length,0);assert.equal(nameInput(h,'Org/Qwen').props.value,value);assert.match(h.text(h.area('discover')),/2至100位/);assert.equal(h.nodes(h.discovered('Org/Qwen')).find(n=>n.type==='input').props.checked,true);}
});
test('automatic hints stay legal and bounded for Unicode one-letter and long raw ids while preserving raw ids',async()=>{
  const ids=['模型/甲','q','A/'+'x'.repeat(145)];const h=await ready();await discoverMany(h,ids);h.bulk();const models=h.request('bulkImportProviderProfiles').args[0].models;assert.deepEqual(models.map(x=>x.model_id),ids);for(const item of models){assert.match(item.provider_name,/^[a-zA-Z0-9_.-]{2,100}$/);assert.equal(item.name_mode,'identity');}
});
test('actual resolved names may differ from the request hint and confirm both same-hint raw rows',async()=>{
  const h=await ready();await discoverMany(h,['Org/Qwen','org_qwen']);h.bulk();await finish(h,{created:['actual_hash_A','actual_hash_B'],skipped:[],items:[outcome('Org/Qwen','org_qwen','created',{resolved_provider_name:'actual_hash_A'}),outcome('org_qwen','org_qwen','created',{resolved_provider_name:'actual_hash_B'})]});assert.equal(h.discovered('Org/Qwen'),undefined);assert.equal(h.discovered('org_qwen'),undefined);h.click('全选当前未导入','discover');assert.equal(h.nodes(h.area('discover')).find(n=>n.type==='button'&&h.text(n).startsWith('导入选中')).props.disabled,true);
});
test('explicit conflict shows an alternative without claiming skipped means already imported and can submit the chosen alternative',async()=>{
  const h=await ready();await discoverMany(h,['different']);setName(h,'different','manual_name');h.bulk();await finish(h,{created:[],skipped:['manual_name'],items:[outcome('different','manual_name','conflict',{suggested_provider_name:'free_stable_name'})]});assert.match(h.text(h.area('discover')),/建议标识：free_stable_name/);assert.doesNotMatch(h.text(h.area('discover')),/跳过已存在/);assert.ok(h.discovered('different'));setName(h,'different','free_stable_name');h.bulk();assert.equal(h.request('bulkImportProviderProfiles',1).args[0].models[0].provider_name,'free_stable_name');await finish(h,{created:['free_stable_name'],skipped:[],items:[outcome('different','free_stable_name','created',{resolved_provider_name:'free_stable_name'})]},1);assert.equal(h.discovered('different'),undefined);
});
test('a user changing the name during an operation does not mutate its submitted payload or clear the later value on conflict',async()=>{
  const h=await ready();await discoverMany(h,['different']);setName(h,'different','old_name');h.bulk();setName(h,'different','new_name');assert.equal(h.request('bulkImportProviderProfiles').args[0].models[0].provider_name,'old_name');await finish(h,{created:[],skipped:['old_name'],items:[outcome('different','old_name','conflict')]});assert.equal(nameInput(h,'different').props.value,'new_name');assert.equal(h.nodes(h.discovered('different')).find(n=>n.type==='input').props.checked,true);
});
test('old batch conflicts and suggestions never populate a new source batch or its override',async()=>{
  const h=await ready();await discoverMany(h,['same']);setName(h,'same','old_name');h.bulk();await discoverMany(h,['same'],'https://b.example/v1');setName(h,'same','B_name');await finish(h,{created:[],skipped:['old_name'],items:[outcome('same','old_name','conflict',{suggested_provider_name:'A_suggestion'})]});assert.equal(nameInput(h,'same').props.value,'B_name');assert.doesNotMatch(h.text(h.area('discover')),/A_suggestion/);assert.equal(h.nodes(h.discovered('same')).find(n=>n.type==='input').props.checked,true);
});
test('same source historical record resolution does not rename it to the new automatic hint',async()=>{
  const h=await ready();await discoverMany(h,['Org/Qwen']);h.bulk();await finish(h,{created:[],skipped:['legacy_name'],items:[outcome('Org/Qwen','org_qwen','already_same',{resolved_provider_name:'legacy_name'})]});assert.equal(h.discovered('Org/Qwen'),undefined);assert.match(h.text(h.area('discover')),/不会重命名已有配置/);
});
test('actual SQL backend output identity projections drive eight real page mapping cases',async()=>{
  const fixtures=JSON.parse(readFileSync(new URL('../../docs/archive/f62-r71-2026-10-24/backend-identity-fixtures.json',import.meta.url),'utf8'));
  for(const key of ['same_source','two_sources','ms_created','legacy','explicit_conflict','occupied_auto','same_race','other_race']){
    const result=fixtures[key];assert.ok(result,key);const h=await ready(),url=key==='two_sources'?'https://b.example/v1':key==='ms_created'?'https://api-inference.modelscope.cn/v1':'https://a.example/v1';await discoverMany(h,result.items.map(x=>x.model_id),url);if(key==='explicit_conflict')setName(h,'different','manual_name');h.bulk();assert.deepEqual(h.request('bulkImportProviderProfiles').args[0].models.map(x=>[x.model_id,x.provider_name]),result.items.map(x=>[x.model_id,x.provider_name]));await finish(h,result);for(const row of result.items)assert.equal(Boolean(h.discovered(row.model_id)),row.status==='conflict',key);
  }
});
