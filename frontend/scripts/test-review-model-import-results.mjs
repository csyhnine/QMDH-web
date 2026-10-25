import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';
const driverUrl=new URL('./test-review-model-admin-sessions.mjs',import.meta.url);
const driver=readFileSync(driverUrl,'utf8').split('\ntest(')[0].replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',JSON.stringify(driverUrl.href));
const {ready,discovered}=vm.runInNewContext(driver+'\n;({ready,discovered})',{assert,readFileSync,existsSync,vm,ts,Error,Promise,URL,JSON});
async function finish(h,result,index=0){h.request('bulkImportProviderProfiles',index).resolve(result);await h.drain();}
const resultItem=(model_id,provider_name,status)=>({model_id,provider_name,status});
test('legacy created provider identifier maps Org/Qwen to its original raw model row',async()=>{
  const h=await ready();await discovered(h,'mock://A','Org/Qwen');h.bulk();assert.equal(h.request('bulkImportProviderProfiles').args[0].models[0].provider_name,'org_qwen');await finish(h,{created:['org_qwen'],skipped:[]});assert.equal(h.discovered('Org/Qwen'),undefined);h.click('已导入 (1)','discover');assert.ok(h.discovered('Org/Qwen'));
});
test('legacy created ModelScope prefix maps ms_qwen back to qwen without repeating its import',async()=>{
  const h=await ready();await discovered(h,'https://api-inference.modelscope.cn/v1','qwen');h.bulk();assert.equal(h.request('bulkImportProviderProfiles').args[0].models[0].provider_name,'ms_qwen');await finish(h,{created:['ms_qwen'],skipped:[]});assert.equal(h.discovered('qwen'),undefined);h.click('全选当前未导入','discover');assert.equal(h.nodes(h.area('discover')).find(n=>n.type==='button'&&h.text(n).startsWith('导入选中')).props.disabled,true);
});
async function discoverMany(h,ids,url='mock://A'){
  if(!h.area('discover'))h.click('🔍 探测模型');h.change('Base URL',url,'discover');h.change('API Key','mock-key','discover');h.discover();h.requests.filter(r=>r.kind==='discoverProviderModels').at(-1).resolve({base_url:url,models:ids.map(model_id=>({model_id,owned_by:'mock',already_exists:false}))});await h.drain();h.click('Chat','discover');
}
const checked=(h,id)=>h.nodes(h.discovered(id)).find(n=>n.type==='input').props.checked;
test('raw identifier equal to the provider identifier remains a valid legacy control',async()=>{
  const h=await ready();await discovered(h,'mock://A','qwen');h.bulk();await finish(h,{created:['qwen'],skipped:[]});assert.equal(h.discovered('qwen'),undefined);
});
test('structured already_same confirms the original model row without treating it as a creation',async()=>{
  const h=await ready();await discovered(h,'mock://A','Org/Qwen');h.bulk();await finish(h,{created:[],skipped:['org_qwen'],items:[resultItem('Org/Qwen','org_qwen','already_same')]});assert.equal(h.discovered('Org/Qwen'),undefined);h.click('已导入 (1)','discover');assert.ok(h.discovered('Org/Qwen'));
});
test('a structured source conflict stays unimported and selected with explicit feedback',async()=>{
  const h=await ready();await discovered(h,'mock://A','Org/Qwen');h.bulk();await finish(h,{created:[],skipped:['org_qwen'],items:[resultItem('Org/Qwen','org_qwen','conflict')]});assert.ok(h.discovered('Org/Qwen'));assert.equal(checked(h,'Org/Qwen'),true);assert.match(h.text(h.area('discover')),/名称冲突，以下模型未导入：Org\/Qwen/);
});
test('partial structured results clear only confirmed selections and a retry excludes the successful model',async()=>{
  const h=await ready();await discoverMany(h,['Org/A','Org/B','Org/C']);h.bulk();await finish(h,{created:['org_a'],skipped:['org_b'],items:[resultItem('Org/A','org_a','created'),resultItem('Org/B','org_b','conflict')]});assert.equal(h.discovered('Org/A'),undefined);assert.equal(checked(h,'Org/B'),true);assert.equal(checked(h,'Org/C'),true);assert.match(h.text(h.area('discover')),/尚未确认/);h.bulk();assert.deepEqual(h.request('bulkImportProviderProfiles',1).args[0].models.map(x=>x.model_id),['Org/B','Org/C']);
});
test('structured results must match both submitted raw id and provider name',async()=>{
  const h=await ready();await discovered(h,'mock://A','Org/Qwen');h.bulk();await finish(h,{created:['org_qwen'],skipped:[],items:[resultItem('Org/Qwen','wrong-name','created')]});assert.ok(h.discovered('Org/Qwen'));assert.equal(checked(h,'Org/Qwen'),true);assert.match(h.text(h.area('discover')),/尚未确认/);
});
test('legacy ambiguous normalized-name creation never marks two distinct raw model rows imported',async()=>{
  const h=await ready();await discoverMany(h,['Org/Qwen','Org_Qwen']);h.bulk();await finish(h,{created:['org_qwen'],skipped:['org_qwen']});assert.ok(h.discovered('Org/Qwen'));assert.ok(h.discovered('Org_Qwen'));assert.equal(checked(h,'Org/Qwen'),true);assert.equal(checked(h,'Org_Qwen'),true);
});
test('legacy skipped identifiers alone cannot prove same-source same-model identity even for an unchanged raw id',async()=>{
  const h=await ready();await discovered(h,'mock://A','qwen');h.bulk();await finish(h,{created:[],skipped:['qwen']});assert.ok(h.discovered('qwen'));assert.equal(checked(h,'qwen'),true);assert.match(h.text(h.area('discover')),/尚未确认/);
});
test('unsubmitted result pairs cannot mark an unselected model imported',async()=>{
  const h=await ready();await discoverMany(h,['Org/A','Org/B']);h.nodes(h.discovered('Org/B')).find(n=>n.type==='input').props.onChange();h.flush();h.bulk();await finish(h,{created:['org_a','org_b'],skipped:[],items:[resultItem('Org/A','org_a','created'),resultItem('Org/B','org_b','created')]});assert.equal(h.discovered('Org/A'),undefined);assert.ok(h.discovered('Org/B'));assert.equal(checked(h,'Org/B'),false);
});
test('an old batch structured result never marks B same raw id imported or clears B selection',async()=>{
  const h=await ready();await discovered(h,'mock://A','Org/Qwen');h.bulk();await discovered(h,'mock://B','Org/Qwen');await finish(h,{created:['org_qwen'],skipped:[],items:[resultItem('Org/Qwen','org_qwen','created')]});assert.ok(h.discovered('Org/Qwen'));assert.equal(checked(h,'Org/Qwen'),true);assert.doesNotMatch(h.text(h.area('discover')),/名称冲突/);
});
test('later same-batch selection and assignment revisions keep their selection on structured completion',async()=>{
  const h=await ready();await discovered(h,'mock://A','Org/Qwen');h.bulk();h.click('取消全选','discover');h.click('全选当前未导入','discover');h.click('生成页','discover');await finish(h,{created:[],skipped:['org_qwen'],items:[resultItem('Org/Qwen','org_qwen','conflict')]});assert.equal(checked(h,'Org/Qwen'),true);assert.match(h.text(h.discovered('Org/Qwen')),/生成/);
});
test('actual isolated backend output fixtures drive the real page result mapping',async()=>{
  const fixtures=JSON.parse(readFileSync(new URL('../../docs/archive/f61-r70-2026-10-24/backend-result-fixtures.json',import.meta.url),'utf8'));
  for(const [name,result] of Object.entries(fixtures)){
    const h=await ready(),ids=result.items.map(x=>x.model_id),url=name==='ms_created'?'https://api-inference.modelscope.cn/v1':'mock://A';await discoverMany(h,ids,url);h.bulk();await finish(h,result);for(const entry of result.items){assert.equal(Boolean(h.discovered(entry.model_id)),entry.status==='conflict',name);if(entry.status==='conflict')assert.equal(checked(h,entry.model_id),true);}
  }
});
test('unknown structured status is left unconfirmed without falling back to a created array',async()=>{
  const h=await ready();await discovered(h,'mock://A','Org/Qwen');h.bulk();await finish(h,{created:['org_qwen'],skipped:[],items:[resultItem('Org/Qwen','org_qwen','unknown')]});assert.ok(h.discovered('Org/Qwen'));assert.equal(checked(h,'Org/Qwen'),true);
});
test('duplicate contradictory pair statuses remain unconfirmed',async()=>{
  const h=await ready();await discovered(h,'mock://A','Org/Qwen');h.bulk();await finish(h,{created:['org_qwen'],skipped:['org_qwen'],items:[resultItem('Org/Qwen','org_qwen','created'),resultItem('Org/Qwen','org_qwen','conflict')]});assert.ok(h.discovered('Org/Qwen'));assert.equal(checked(h,'Org/Qwen'),true);
});
test('an empty optional items list keeps the safe unique-created legacy compatibility path',async()=>{
  const h=await ready();await discovered(h,'mock://A','Org/Qwen');h.bulk();await finish(h,{created:['org_qwen'],skipped:[],items:[]});assert.equal(h.discovered('Org/Qwen'),undefined);
});
