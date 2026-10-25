import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const source=readFileSync(new URL('../src/features/studio/CadPreparationPanel.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
function render(info){
 const module={exports:{}},calls=[];
 const drafts={preparationVersion:()=> 'synthetic-version',preparationDraftKey:()=> 'synthetic-key',
  readPreparationDraft:()=>{throw Error('SSR must not read drafts')},writePreparationDraft:()=>{throw Error('no draft mutation')},discardPreparationDraft:()=>{throw Error('no draft mutation')}};
 const localRequire=name=>name==='../../api'?{api:new Proxy({},{get(){calls.push('api');throw Error('no API calls')}})}:
  name==='./cadPreparationDrafts'?drafts:name==='./cadCirculation'?{mergeSuggestedRoutes:()=>{throw Error('no route action')}}:
  name.endsWith('.css')?{}:require(name);
 vm.runInNewContext(code,{module,exports:module.exports,require:localRequire},{timeout:1000});
 const floor={floor_index:1,label:'合成平面',rooms:[],geometry:{min_x:0,max_y:80,scale:9,meters_per_unit:1},unit_info:info};
 const snapshot=JSON.stringify(floor);
 const html=renderToStaticMarkup(React.createElement(module.exports.CadPreparationPanel,{record:{extract_id:1,data:{spaces:{floors:[floor]}}},
  floor,busy:false,onUpdated:()=>{throw Error('no update')},onPendingChange:()=>{throw Error('no action')}}));
 assert.deepEqual(calls,[]);assert.equal(JSON.stringify(floor),snapshot);return html;
}
test('declared conflict is visible beside explicit known-length calibration without changing scale',()=>{
 const html=render({source:'declared',meters_per_unit:1,requires_calibration:true,note:'采用声明比例；尺寸线索冲突，请按已知长度标定。'});
 assert.match(html,/role="status">采用声明比例；尺寸线索冲突，请按已知长度标定。/);assert.match(html,/以米校准/);
});
test('unitless estimate visibly requires confirmation instead of appearing declared',()=>{
 const html=render({source:'span_estimate',meters_per_unit:.1,requires_calibration:true,note:'按 100mm 估算，请先按已知长度标定确认。'});
 assert.match(html,/role="status">按 100mm 估算/);
});
test('confirmed calibration and unmarked legacy floor do not acquire stale new warnings',()=>{
 for(const info of [undefined,{source:'user_calibration',requires_calibration:false,note:'已校准'}]){
  const html=render(info);assert.doesNotMatch(html,/role="status"/);assert.match(html,/每个平面单独保存/);
 }
});
