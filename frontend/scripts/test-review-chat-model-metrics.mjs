import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const source=readFileSync(new URL('../src/pages/admin/ChatExperiencePage.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
function render({rate=null,ttft=null,response=null,called=null,count=null,complete=false}={}){
 const overview={window_days:30,window_started_at:'2026-10-25T00:00:00Z',turn_count:10,success_rate:1,upstream_call_rate:rate,
  upstream_known_turn_count:called==null?0:10,upstream_unknown_turn_count:called==null?10:0,
  attachment_turn_count:0,attachment_turn_share:0,agent_mode_share:1,avg_pack_duration_ms:0,p95_pack_duration_ms:0,
  avg_ttft_ms:ttft,p95_ttft_ms:ttft,ttft_sample_count:ttft==null?0:1,
  first_response_sample_count:response==null?0:1,avg_first_response_ms:response,p95_first_response_ms:response,
  avg_total_duration_ms:100,outcome_totals:{agent_success:10},client_event_totals:{}};
 const row={id:1,correlation_id:'synthetic',conversation_id:1,user_name:'synthetic',user_display_name:'',provider_name:'local',model_name:'local-function',
  agent_mode:true,outcome:'agent_success',error_code:'',error_summary:'',attachment_count:0,attachment_total_bytes:0,pack_duration_ms:0,
  upstream_called:called,model_call_count:count,model_call_count_complete:complete,ttft_ms:ttft,total_duration_ms:100,client_event_count:0,started_at:'2026-10-25T00:00:00Z'};
 const module={exports:{}},calls=[];
 const fakeQuery=()=>({params:30,setParams:()=>{throw Error('render cannot mutate window')},loading:false,error:'',refresh:()=>{throw Error('render cannot refresh')},
  data:{overview,turns:[row],turnTotal:1,alerts:[]},snapshot:{params:30},isActionBusy:()=>false,actionMessage:'',runAction:()=>{throw Error('no alert evaluation')}});
 const localRequire=name=>name==='./useWindowQuery'?{useWindowQuery:fakeQuery}:name==='../../api'?{api:new Proxy({},{get(){calls.push('api');throw Error('no API calls')}})}:require(name);
 vm.runInNewContext(code,{module,exports:module.exports,require:localRequire},{timeout:1000});
 const html=renderToStaticMarkup(React.createElement(module.exports.default));assert.deepEqual(calls,[]);return html;
}
test('unknown rate and row render unknown and no fake zero or negative call evidence',()=>{
 const html=render();assert.match(html,/已知 0，未知 10/);assert.match(html,/请求次数未采集[^>]*>未知<\/span>/);
 assert.match(html,/上游调用率<\/span><strong>—<\/strong>/);assert.match(html,/TTFT P95<\/span><strong>—<\/strong>/);
});
test('known zero is displayed as zero percent and no call rather than unknown',()=>{
 const html=render({rate:0,called:false,count:0,complete:true});assert.match(html,/上游调用率<\/span><strong>0\.0%<\/strong>/);
 assert.match(html,/共 0 次模型请求[^>]*>否<\/span>/);
});
test('observed true includes partial request-count basis without inventing TTFT',()=>{
 const html=render({rate:1,called:true,count:2,response:1250});assert.match(html,/已观测 2 次模型请求[^>]*>是<\/span>/);
 assert.match(html,/模型首响应 P95<\/span><strong>1\.3s<\/strong>/);assert.match(html,/非流式完整响应/);
 assert.match(html,/TTFT P95<\/span><strong>—<\/strong>/);
});
test('measured zero latency stays zero while unknown pack retains its placeholder',()=>{
 const html=render({rate:1,called:true,count:1,complete:true,ttft:0,response:0});
 assert.match(html,/TTFT P95<\/span><strong>0ms<\/strong>/);assert.match(html,/模型首响应 P95<\/span><strong>0ms<\/strong>/);
 assert.match(html,/Pack P95<\/span><strong>—<\/strong>/);
});
test('non-finite display values stay unknown with no transport or action side effects',()=>{
 const html=render({rate:NaN,ttft:Infinity,response:NaN});assert.doesNotMatch(html,/NaN%|Infinityms|NaNs/);
 assert.match(html,/上游调用率<\/span><strong>—<\/strong>/);
});
