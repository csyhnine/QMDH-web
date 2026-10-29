import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';
const driverUrl=new URL('./test-review-model-preset-fields.mjs',import.meta.url);
let driver=readFileSync(driverUrl,'utf8').split('\ntest(')[0].replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(driverUrl.href));
driver=driver.replace('function harness(profiles=[]){','function harness(profiles=[],rules=[]){');
driver=driver.replace('const api={',`const rows=new Map(rules.map(row=>[row.id,copy(row)]));let nextRule=1000;const api={async createProviderPricingRule(payload){const row={id:nextRule++,...copy(payload)};requests.push({kind:'rule',method:'POST',payload:copy(payload)});rows.set(row.id,row);return copy(row);},async updateProviderPricingRule(id,payload){requests.push({kind:'rule',method:'PATCH',id,payload:copy(payload)});assert.ok(rows.has(id));rows.set(id,{...rows.get(id),...copy(payload)});return copy(rows.get(id));},`);
driver=driver.replace('pricingRules:[]','pricingRules:rules').replaceAll('jsx:(type,props)=>({type,props})','jsx:(type,props,key)=>({type,props,key})').replaceAll('jsxs:(type,props)=>({type,props})','jsxs:(type,props,key)=>({type,props,key})');
driver=driver.replace('return {requests,internals:',"return {requests,get rows(){return [...rows.values()];},setRules(next){rules=next;flush();},setProfiles(next){profiles=next;flush();},internals:");
const {harness}=vm.runInNewContext(driver+'\n;({harness})',{assert,readFileSync,vm,ts,Error,Promise,URL,JSON});
const copy=x=>JSON.parse(JSON.stringify(x));
const profile=(id,extra={})=>({id,provider_name:`model-${id}`,display_name:`model ${id}`,model_name:`upstream-${id}`,base_url:'mock://provider',adapter_kind:'openai_compatible',capabilities:['chat.completions'],strategies:{},adapter_config:{},unit_price:0,enabled:true,has_api_key:true,masked_api_key:'saved',...extra});
const rule=(id,provider_profile_id,unit_price)=>({id,provider_profile_id,unit_price,capability:'chat.completions',metric:'input_tokens',unit_size:1000000,currency:'CNY',is_active:true});
async function ready({profiles=[profile(1),profile(2)],rules=[rule(101,1,9),rule(201,2,5)]}={}){const h=harness(profiles,rules);await h.drain();return h;}
function editProfile(h,id){const row=h.nodes().find(n=>n.type==='div'&&n.key===id&&n.props.className==='admin-table-row');assert.ok(row,`profile ${id}`);h.nodes(row).find(n=>n.type==='button'&&h.text(n)==='编辑').props.onClick();h.flush();}
function editRule(h,id){const row=h.nodes().find(n=>n.type==='div'&&n.key===id&&h.nodes(n).some(x=>x.props?.className==='template-card template-card-main'));assert.ok(row,`rule ${id}`);h.nodes(row).find(n=>n.props?.className==='template-card template-card-main').props.onClick();h.flush();}
async function saveRule(h){const button=h.nodes().find(n=>n.type==='button'&&['新增规则','更新规则'].includes(h.text(n)));assert.ok(button);button.props.onClick();h.flush();await h.drain();}
const ruleRequests=h=>h.requests.filter(r=>r.kind==='rule');

test('browsing from edited rule A to model B exits the old rule identity instead of moving A',async()=>{
  const h=await ready();editProfile(h,1);h.click('Chat 计费');editRule(h,101);editProfile(h,2);h.click('Chat 计费');assert.ok(h.nodes().some(n=>n.type==='button'&&h.text(n)==='新增规则'));await saveRule(h);assert.equal(h.rows.find(r=>r.id===101).provider_profile_id,1);assert.equal(h.rows.find(r=>r.id===201).unit_price,5);assert.equal(ruleRequests(h)[0].method,'POST');assert.equal(ruleRequests(h)[0].payload.provider_profile_id,2);
});
test('changing the Chat model dropdown exits old rule A before saving B',async()=>{
  const h=await ready();h.click('Chat 计费');editRule(h,101);h.change('Chat 模型','2');assert.equal(h.field('单价').props.value,'0');await saveRule(h);const r=ruleRequests(h)[0];assert.equal(r.method,'POST');assert.equal(r.payload.provider_profile_id,2);assert.equal(h.rows.find(r=>r.id===101).provider_profile_id,1);assert.equal(h.rows.find(r=>r.id===101).unit_price,9);
});
test('stable A update keeps the original rule id and profile id and changes only the explicitly edited price',async()=>{
  const h=await ready();h.click('Chat 计费');editRule(h,101);h.change('单价','77');await saveRule(h);const r=ruleRequests(h)[0];assert.equal(r.method,'PATCH');assert.equal(r.id,101);assert.equal(r.payload.provider_profile_id,1);assert.equal(r.payload.unit_price,77);assert.equal(h.rows.find(r=>r.id===101).unit_price,77);assert.equal(h.rows.find(r=>r.id===201).unit_price,5);assert.equal(h.rows.length,2);
});
test('selecting the same dropdown model preserves the current rule edit and unsaved price',async()=>{
  const h=await ready();h.click('Chat 计费');editRule(h,101);h.change('单价','77');h.change('Chat 模型','1');assert.equal(h.field('单价').props.value,'77');await saveRule(h);assert.equal(ruleRequests(h)[0].method,'PATCH');assert.equal(ruleRequests(h)[0].id,101);assert.equal(ruleRequests(h)[0].payload.provider_profile_id,1);
});
test('browsing the same left-hand model preserves a rule draft without assigning a new profile',async()=>{
  const h=await ready();editProfile(h,1);h.click('Chat 计费');editRule(h,101);h.change('单价','77');editProfile(h,1);h.click('Chat 计费');assert.equal(h.field('单价').props.value,'77');await saveRule(h);assert.equal(ruleRequests(h)[0].id,101);assert.equal(ruleRequests(h)[0].payload.provider_profile_id,1);
});
test('cancel then choose B creates a new B rule without moving the cancelled A rule',async()=>{
  const h=await ready();h.click('Chat 计费');editRule(h,101);h.change('单价','88');h.click('取消');h.change('Chat 模型','2');h.change('单价','7');await saveRule(h);assert.equal(ruleRequests(h)[0].method,'POST');assert.equal(ruleRequests(h)[0].payload.provider_profile_id,2);assert.equal(h.rows.find(r=>r.id===101).unit_price,9);assert.equal(h.rows.find(r=>r.id===201).unit_price,5);
});
test('switching to B works both when it has no rule and when it already has an independent rule',async()=>{
  for(const hasB of [false,true]){const rules=[rule(101,1,9),...(hasB?[rule(201,2,5)]:[])];const h=await ready({rules});h.click('Chat 计费');editRule(h,101);h.change('Chat 模型','2');await saveRule(h);assert.equal(ruleRequests(h)[0].method,'POST');assert.equal(h.rows.find(r=>r.id===101).provider_profile_id,1);assert.equal(h.rows.find(r=>r.id===101).unit_price,9);assert.equal(h.rows.length,rules.length+1);if(hasB)assert.equal(h.rows.find(r=>r.id===201).unit_price,5);}
});
test('returning to A starts a new draft until A rule 101 is explicitly selected again',async()=>{
  const h=await ready();h.click('Chat 计费');editRule(h,101);h.change('Chat 模型','2');h.change('Chat 模型','1');assert.equal(h.field('单价').props.value,'0');assert.ok(h.nodes().some(n=>n.type==='button'&&h.text(n)==='新增规则'));editRule(h,101);assert.equal(h.field('单价').props.value,'9');h.change('单价','10');await saveRule(h);assert.equal(ruleRequests(h)[0].method,'PATCH');assert.equal(ruleRequests(h)[0].id,101);assert.equal(h.rows.find(r=>r.id===101).unit_price,10);
});
test('explicitly editing an existing B rule updates B while A and its original rule remain unchanged',async()=>{
  const h=await ready();h.click('Chat 计费');editRule(h,101);h.change('Chat 模型','2');editRule(h,201);h.change('单价','6');await saveRule(h);const r=ruleRequests(h)[0];assert.equal(r.method,'PATCH');assert.equal(r.id,201);assert.equal(r.payload.provider_profile_id,2);assert.equal(h.rows.find(r=>r.id===101).provider_profile_id,1);assert.equal(h.rows.find(r=>r.id===101).unit_price,9);assert.equal(h.rows.find(r=>r.id===201).unit_price,6);
});
test('switching model clears the whole previous rule draft rather than keeping hidden metric currency or activation',async()=>{
  const h=await ready();h.click('Chat 计费');editRule(h,101);h.change('指标','output_tokens');h.change('单位大小','1000');h.change('单价','88');h.change('币种','USD');h.field('启用这条规则').props.onChange({target:{checked:false}});h.flush();h.change('Chat 模型','2');assert.equal(h.field('指标').props.value,'input_tokens');assert.equal(h.field('单位大小').props.value,'1000000');assert.equal(h.field('单价').props.value,'0');assert.equal(h.field('币种').props.value,'CNY');assert.equal(h.field('启用这条规则').props.checked,true);assert.equal(ruleRequests(h).length,0);
});
test('a valid explicit rule update preserves zero price currency metric and units without creating another rule',async()=>{
  const h=await ready();h.click('Chat 计费');editRule(h,101);h.change('指标','output_tokens');h.change('单位大小','1000');h.change('单价','0');h.change('币种','USD');await saveRule(h);assert.deepEqual(copy(ruleRequests(h)[0]),{kind:'rule',method:'PATCH',id:101,payload:{provider_profile_id:1,capability:'chat.completions',metric:'output_tokens',unit_size:1000,unit_price:0,currency:'USD',is_active:true}});assert.equal(h.rows.length,2);
});
test('a rule removed from the current props cannot be silently recreated or updated under a new model',async()=>{
  const h=await ready();h.click('Chat 计费');editRule(h,101);h.change('单价','77');h.setRules([rule(201,2,5)]);await saveRule(h);assert.equal(ruleRequests(h).length,0);assert.match(h.error,/重新选择规则/);assert.equal(h.field('单价').props.value,'77');assert.equal(h.rows.find(r=>r.id===101).unit_price,9);
});
test('a changed current rule owner is rejected even though the same rule id still exists',async()=>{
  const h=await ready();h.click('Chat 计费');editRule(h,101);h.setRules([rule(101,2,9),rule(201,2,5)]);await saveRule(h);assert.equal(ruleRequests(h).length,0);assert.match(h.error,/所属模型已变化/);assert.equal(h.rows.find(r=>r.id===101).provider_profile_id,1);
});
test('a missing or no-longer-Chat profile is rejected before saving an existing rule',async()=>{
  for(const removed of [false,true]){const h=await ready();h.click('Chat 计费');editRule(h,101);h.setProfiles(removed?[profile(2)]:[profile(1,{capabilities:['image.generate']}),profile(2)]);await saveRule(h);assert.equal(ruleRequests(h).length,0);assert.match(h.error,/有效的 Chat 模型/);assert.equal(h.rows.find(r=>r.id===101).unit_price,9);}
});
test('invalid dropdown values cannot submit a rule to an absent profile or preserve an old rule id',async()=>{
  for(const value of ['999','-1','1.5','not-an-id']){const h=await ready();h.click('Chat 计费');editRule(h,101);h.change('Chat 模型',value);await saveRule(h);assert.equal(ruleRequests(h).length,0);assert.match(h.error,/Chat 模型/);assert.equal(h.rows.find(r=>r.id===101).provider_profile_id,1);}
});
test('browsing a non-Chat profile clears the old rule and returns to a valid default Chat draft',async()=>{
  const h=await ready({profiles:[profile(1),profile(2),profile(3,{capabilities:['image.generate']})]});h.click('Chat 计费');editRule(h,101);editProfile(h,3);h.click('Chat 计费');await h.drain();assert.equal(h.field('Chat 模型').props.value,'1');assert.equal(h.field('单价').props.value,'0');await saveRule(h);assert.equal(ruleRequests(h)[0].method,'POST');assert.equal(ruleRequests(h)[0].payload.provider_profile_id,1);assert.equal(h.rows.find(r=>r.id===101).unit_price,9);
});
test('a page with no Chat profiles offers no rule submit action and makes no pricing writes',async()=>{
  const h=await ready({profiles:[profile(3,{capabilities:['image.generate']})],rules:[]});h.click('Chat 计费');assert.ok(h.nodes().some(n=>h.text(n).includes('还没有 Chat 模型')));assert.ok(!h.nodes().some(n=>n.type==='button'&&['新增规则','更新规则'].includes(h.text(n))));assert.equal(ruleRequests(h).length,0);
});
test('two queued model selections stay atomic and never revive A identity after B then A',async()=>{
  const h=await ready();h.click('Chat 计费');editRule(h,101);const change=h.field('Chat 模型').props.onChange;change({target:{value:'2'}});change({target:{value:'1'}});h.flush();assert.equal(h.field('Chat 模型').props.value,'1');assert.equal(h.field('单价').props.value,'0');await saveRule(h);assert.equal(ruleRequests(h)[0].method,'POST');assert.equal(ruleRequests(h)[0].payload.provider_profile_id,1);assert.equal(h.rows.find(r=>r.id===101).unit_price,9);
});
test('left model browsing changes only the editor until an explicit save is requested',async()=>{
  const h=await ready();h.click('Chat 计费');editRule(h,101);editProfile(h,2);h.click('Chat 计费');await h.drain();assert.equal(ruleRequests(h).length,0);assert.deepEqual(copy(h.rows),[rule(101,1,9),rule(201,2,5)]);assert.ok(h.nodes().some(n=>n.type==='small'&&h.text(n).includes('原规则不会迁移')));
});
test('cancelling B returns to a new B draft and keeps its original saved rule untouched',async()=>{
  const h=await ready();h.click('Chat 计费');h.change('Chat 模型','2');editRule(h,201);h.change('单价','77');h.click('取消');assert.equal(h.field('Chat 模型').props.value,'2');assert.equal(h.field('单价').props.value,'0');await saveRule(h);assert.equal(ruleRequests(h)[0].method,'POST');assert.equal(ruleRequests(h)[0].payload.provider_profile_id,2);assert.equal(h.rows.find(r=>r.id===201).unit_price,5);
});
