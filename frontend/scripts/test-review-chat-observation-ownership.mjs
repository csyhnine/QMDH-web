import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';
const driverUrl=new URL('./test-review-agent-edit-sessions.mjs',import.meta.url);
let driver=readFileSync(driverUrl,'utf8').split('\ntest(')[0].replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',JSON.stringify(driverUrl.href));
driver=driver.replace("['agentChatPolicyDefaults','agentPolicyOverrides','users','createAgentSkillRelease'","['adminChatConversations','adminAgentTraces','adminChatConversationMessages','agentChatPolicyDefaults','agentPolicyOverrides','users','createAgentSkillRelease'");
driver=driver.replace("'./AgentPolicyOverridesPanel':panel,'./AgentOpsChatObservabilityPanel':{default:'ObservabilityStub'}","'./AgentPolicyOverridesPanel':{default:'OverrideStub'},'./AgentOpsChatObservabilityPanel':compile(source('AgentOpsChatObservabilityPanel.tsx'),imports,globals)");
driver=driver.replace('request(kind,index=0){','replayEffects(){for(const f of fibers.values())for(const slot of f.slots)slot?.cleanup?.();for(const f of fibers.values())for(const slot of f.slots)if(slot?.setup)slot.cleanup=slot.setup();flush();},replaceErrorCallback(){const old=props.onSetError;props={...props,onSetError:next=>old(next)};flush();},request(kind,index=0){');
const {harness}=vm.runInNewContext(driver+'\n;({harness})',{assert,readFileSync,existsSync,vm,ts,Error,Promise,URL,JSON});
const date='2026-10-25T00:00:00Z';
const conversation=id=>({id,title:`title-${id}`,user_display_name:`User ${id}`,user_name:`user-${id}`,message_count:1,agent_thread_id:`thread-${id}`,updated_at:date});
const message=id=>({id:id*10,role:'user',content:`message-from-${id}`,created_at:date});
const trace=id=>({id:id*100,actor_name:`User ${id}`,created_at:date,details:{route:`route-${id}`,tool_calls:[`tool-${id}`]}});
const panel=h=>h.nodes().find(n=>n.type==='section'&&n.props.className==='admin-table-panel'&&h.nodes(n).some(c=>c.type==='h2'&&h.text(c)==='Chat 可观测（gov-001c）'));
const detail=h=>h.nodes(panel(h)).find(n=>n.props?.className==='agent-ops-subpanel');
function select(h,id){const table=h.nodes(panel(h)).find(n=>n.props?.className==='admin-data-table agent-client-table'),row=h.nodes(table).find(n=>n.key===id);assert.ok(row,`conversation ${id}`);h.button('查看',row).props.onClick();h.flush();}
async function finish(h,id,index=0){h.request('adminChatConversationMessages',index).resolve([message(id)]);h.request('adminAgentTraces',index+1).resolve([trace(id)]);await h.drain();}
async function ready(){const h=harness();await h.drain();h.request('adminChatConversations').resolve([conversation(1),conversation(2)]);h.request('adminAgentTraces').resolve([trace(0)]);await h.drain();return h;}
test('reversed conversation details keep message and trace 2 paired under heading 2',async()=>{
  const h=await ready();select(h,1);select(h,2);await finish(h,2,1);await finish(h,1,0);assert.match(h.text(detail(h)),/会话 #2/);assert.match(h.text(detail(h)),/message-from-2/);assert.match(h.text(detail(h)),/route-2/);assert.doesNotMatch(h.text(detail(h)),/message-from-1|route-1/);
});
test('switching from loaded A to pending B immediately removes the A body and trace',async()=>{
  const h=await ready();select(h,1);await finish(h,1);select(h,2);assert.match(h.text(detail(h)),/会话 #2/);assert.doesNotMatch(h.text(detail(h)),/message-from-1|route-1/);
});
test('B read failure cannot retain A messages or traces under B',async()=>{
  const h=await ready();select(h,1);await finish(h,1);select(h,2);h.request('adminChatConversationMessages',1).reject(new Error('B mock failed'));await h.drain();assert.match(h.text(detail(h)),/会话 #2/);assert.doesNotMatch(h.text(detail(h)),/message-from-1|route-1/);assert.match(h.text(detail(h)),/B mock failed/);
});
test('serial B reads preserve original query identities and show both matching results',async()=>{
  const h=await ready();select(h,1);await finish(h,1);select(h,2);await finish(h,2,1);assert.match(h.text(detail(h)),/message-from-2/);assert.match(h.text(detail(h)),/route-2/);assert.deepEqual(h.request('adminChatConversationMessages',1).args,[2]);assert.deepEqual(h.request('adminAgentTraces',2).args,[{conversationId:2,limit:20}]);
});
test('A B A selection uses a new generation even when the first and last conversation ids match',async()=>{
  const h=await ready();select(h,1);select(h,2);select(h,1);h.request('adminChatConversationMessages',2).resolve([{...message(1),content:'latest A content'}]);h.request('adminAgentTraces',3).resolve([{...trace(1),details:{route:'latest-A-route'}}]);await h.drain();await finish(h,2,1);await finish(h,1,0);assert.match(h.text(detail(h)),/latest A content/);assert.match(h.text(detail(h)),/latest-A-route/);assert.doesNotMatch(h.text(detail(h)),/message-from-1|message-from-2|route-2/);
});
test('same conversation reselection clears the old snapshot while its new pair is pending',async()=>{
  const h=await ready();select(h,1);await finish(h,1);select(h,1);assert.doesNotMatch(h.text(detail(h)),/message-from-1|route-1/);assert.match(h.text(detail(h)),/正在加载会话 #1/);h.request('adminChatConversationMessages',1).resolve([{...message(1),content:'refreshed A'}]);h.request('adminAgentTraces',2).resolve([{...trace(1),details:{route:'refreshed-A'}}]);await h.drain();assert.match(h.text(detail(h)),/refreshed A/);assert.match(h.text(detail(h)),/refreshed-A/);
});
test('message and trace become visible together only after both requests finish',async()=>{
  const h=await ready();select(h,2);h.request('adminChatConversationMessages').resolve([message(2)]);await h.drain();assert.doesNotMatch(h.text(detail(h)),/message-from-2|route-2/);assert.match(h.text(detail(h)),/正在加载会话 #2/);h.request('adminAgentTraces',1).resolve([trace(2)]);await h.drain();assert.match(h.text(detail(h)),/message-from-2/);assert.match(h.text(detail(h)),/route-2/);assert.doesNotMatch(h.text(detail(h)),/正在加载/);
});
test('either message or trace failure yields only the current local error and no partial pair',async()=>{
  for(const failing of ['message','trace']){const h=await ready();h.setError('main editor feedback');select(h,2);if(failing==='message'){h.request('adminAgentTraces',1).resolve([trace(2)]);h.request('adminChatConversationMessages').reject(new Error('current messages failed'));}else{h.request('adminChatConversationMessages').resolve([message(2)]);h.request('adminAgentTraces',1).reject(new Error('current traces failed'));}await h.drain();assert.match(h.text(detail(h)),/current .* failed/);assert.doesNotMatch(h.text(detail(h)),/message-from-2|route-2|正在加载/);assert.equal(h.error,'main editor feedback');}
});
test('old failure and finally cannot clear a new completed pair or stop a newer loading indicator',async()=>{
  const h=await ready();select(h,1);select(h,2);h.request('adminChatConversationMessages',0).reject(new Error('old A failed'));await h.drain();assert.match(h.text(detail(h)),/正在加载会话 #2/);assert.doesNotMatch(h.text(detail(h)),/old A failed/);await finish(h,2,1);h.request('adminAgentTraces',1).reject(new Error('old trace failed'));await h.drain();assert.match(h.text(detail(h)),/message-from-2/);assert.match(h.text(detail(h)),/route-2/);assert.doesNotMatch(h.text(detail(h)),/failed/);
});
test('a new selection clears the prior local error and retains the matching title and user identity',async()=>{
  const h=await ready();select(h,1);h.request('adminChatConversationMessages').reject(new Error('A only failure'));await h.drain();assert.match(h.text(detail(h)),/A only failure/);select(h,2);assert.doesNotMatch(h.text(detail(h)),/A only failure/);assert.match(h.text(detail(h)),/title-2/);assert.match(h.text(detail(h)),/User 2 \(user-2\)/);await finish(h,2,1);assert.match(h.text(detail(h)),/title-2/);assert.doesNotMatch(h.text(detail(h)),/User 1|user-1/);
});
test('initial overview traces never masquerade as the first selected conversation snapshot',async()=>{
  const h=await ready();select(h,1);assert.doesNotMatch(h.text(detail(h)),/route-0|tool-0/);assert.deepEqual(h.request('adminChatConversations').args,[{limit:30}]);assert.deepEqual(h.request('adminAgentTraces').args,[{limit:20}]);assert.ok(h.requests.every(r=>['adminChatConversations','adminChatConversationMessages','adminAgentTraces'].includes(r.kind)));
});
test('late overview effect replay updates only overview state rather than the loaded detail',async()=>{
  const h=await ready();select(h,2);await finish(h,2);h.replayEffects();h.request('adminChatConversations',1).resolve([conversation(1),conversation(2)]);h.request('adminAgentTraces',2).resolve([trace(0)]);await h.drain();assert.match(h.text(detail(h)),/message-from-2/);assert.match(h.text(detail(h)),/route-2/);assert.doesNotMatch(h.text(detail(h)),/route-0/);
});
test('error callback identity changes no longer restart initial queries or overwrite a selected pair',async()=>{
  const h=await ready();select(h,2);await finish(h,2);const count=h.requests.length;h.replaceErrorCallback();await h.drain();assert.equal(h.requests.length,count);assert.match(h.text(detail(h)),/message-from-2/);assert.match(h.text(detail(h)),/route-2/);
});
test('initial failure is local and does not replace another editor feedback',async()=>{
  const h=harness();await h.drain();h.setError('other editor feedback');h.request('adminChatConversations').reject(new Error('initial observation failed'));await h.drain();assert.match(h.text(panel(h)),/initial observation failed/);assert.equal(h.error,'other editor feedback');assert.equal(detail(h),undefined);
});
test('same-user profile updates and abandoned renders preserve the current read observation',async()=>{
  const h=await ready();select(h,2);h.profileRefresh();h.discardOwnerRender();await finish(h,2);assert.match(h.text(detail(h)),/message-from-2/);assert.match(h.text(detail(h)),/route-2/);assert.equal(h.lateWrites,0);
});
test('account switch discards the old pair and accepts only the new account current detail',async()=>{
  const h=await ready();select(h,1);h.ownerChange();await h.drain();assert.equal(detail(h),undefined);h.request('adminChatConversations',1).resolve([conversation(2)]);h.request('adminAgentTraces',2).resolve([trace(0)]);await h.drain();select(h,2);h.request('adminChatConversationMessages',1).resolve([message(2)]);h.request('adminAgentTraces',3).resolve([trace(2)]);await h.drain();await finish(h,1,0);assert.match(h.text(detail(h)),/会话 #2/);assert.match(h.text(detail(h)),/message-from-2/);assert.doesNotMatch(h.text(detail(h)),/message-from-1/);
});
test('old initial account reads cannot replace the new account list or its selected detail',async()=>{
  const h=harness();await h.drain();h.ownerChange();await h.drain();h.request('adminChatConversations',1).resolve([conversation(2)]);h.request('adminAgentTraces',1).resolve([trace(0)]);await h.drain();select(h,2);h.request('adminChatConversationMessages',0).resolve([message(2)]);h.request('adminAgentTraces',2).resolve([trace(2)]);await h.drain();h.request('adminChatConversations',0).resolve([conversation(1)]);h.request('adminAgentTraces',0).resolve([trace(0)]);await h.drain();assert.match(h.text(detail(h)),/message-from-2/);assert.match(h.text(detail(h)),/title-2/);assert.doesNotMatch(h.text(panel(h)),/title-1/);
});
test('unmount ignores pending initial and detail success or failure without setter calls',async()=>{
  for(const kind of ['initial','detail'])for(const reject of [false,true]){const h=kind==='initial'?harness():await ready();await h.drain();if(kind==='detail')select(h,1);h.unmount();if(kind==='initial'){if(reject)h.request('adminChatConversations').reject(new Error('old initial fail'));else{h.request('adminChatConversations').resolve([conversation(1)]);h.request('adminAgentTraces').resolve([trace(0)]);}}else if(reject)h.request('adminChatConversationMessages').reject(new Error('old detail fail'));else{h.request('adminChatConversationMessages').resolve([message(1)]);h.request('adminAgentTraces',1).resolve([trace(1)]);}await h.drain();assert.equal(h.lateWrites,0,kind+String(reject));}
});
