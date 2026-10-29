import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';
const src=name=>readFileSync(new URL(`../src/pages/studio/${name}`,import.meta.url),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
const info={width:10,height:10,frames:2,duration_ms:200,average_fps:10,variable_fps:false,colors:16,loop:0,transparent:false};
const record=(id,extra={})=>({record_id:id,file_name:`record-${id}.gif`,storage_path:`mock/output-${id}.gif`,original_storage_path:`mock/original-${id}.gif`,created_at:'2026-10-24',parameters:{},source_info:info,output_info:info,compression:{original_bytes:1000,output_bytes:500,target_bytes:500000,target_met:true,compressed:true},...extra});
const file=name=>({name,type:'image/gif',size:100});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function compile(code,imports,globals={}){const exports={};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Error,Promise,...globals,require:name=>{assert.ok(Object.hasOwn(imports,name),`undeclared import ${name}`);return imports[name];}});return exports;}
function harness({query='record_id=101',history=[record(202),record(303)]}={}){
  let cursor=0,tree,mounted=true,dirty=false,lateWrites=0,params=new URLSearchParams(query),owner={id:7,name:'owner'},guest=false,urlId=0;
  const slots=[],updates=[],layouts=[],passives=[],details=[],compressions=[],restores=[],downloads=[],downloadGates=[],revoked=[],historyCalls=[];
  const effect=queue=>(setup,deps)=>{const i=cursor++,old=slots[i];if(!old||!deps||deps.some((v,j)=>!Object.is(v,old.deps?.[j]))){const next={deps,setup};slots[i]=next;queue.push(()=>{old?.cleanup?.();next.cleanup=setup();});}};
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],next=>{if(!mounted){lateWrites++;return;}updates.push({i,next});dirty=true;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useMemo(create,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={deps,value:create()};return slots[i].value;},useLayoutEffect:effect(layouts),useEffect:effect(passives)};
  const api={gifHistory(){historyCalls.push(owner.id);return Promise.resolve(history);},gifHistoryRecord(id){const gate=deferred();details.push({id,...gate});return gate.promise;},inspectGif:async()=>info,compressGif(payload){const gate=deferred();compressions.push({payload:copy(payload),...gate});return gate.promise;}};
  const batch=compile(src('gifToolBatch.ts'),{'../../utils/uploads':{MAX_REFERENCE_UPLOAD_BYTES:20*1024*1024}});
  const globals={URL:class extends URL {static createObjectURL(){return `blob:mock-${++urlId}`;}static revokeObjectURL(url){revoked.push(url);}},URLSearchParams};
  const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  const imports={react,'react/jsx-runtime':jsx,'react-router-dom':{Link:'Link',useSearchParams:()=>[params,next=>{params=new URLSearchParams(next);dirty=true;}]},'../../lib/datetime':{formatChinaMonthDayTime:()=>''},'../../api':{api},'./GifMediaDetails':{default:'media-details'},'../../context/AuthContext':{useAuth:()=>({isGuest:guest,currentUser:owner})},'../../features/studio/studioAssetUtils':{fileToDataUrl:async f=>`data:mock:${f.name}`},'../../features/studio/studioMediaDownload':{downloadMediaUrl:async(path,name)=>{downloads.push({path,name});await downloadGates.shift()?.promise;}},'./gifToolBatch':{...batch,restoreGifOriginal(row){const gate=deferred();restores.push({id:row.record_id,...gate});return gate.promise;},createGifZip(){throw Error('zip outside test scope');}}};
  if(existsSync(new URL('../src/pages/studio/useGifDisplay.ts',import.meta.url)))imports['./useGifDisplay']=compile(src('useGifDisplay.ts'),{react,'../../api':{api}});
  const Page=compile(src('GifCompressPage.tsx'),imports,globals).default;
  function render(commit=true){cursor=0;layouts.length=passives.length=0;tree=Page();if(commit){for(const run of layouts.splice(0))run();for(const run of passives.splice(0))run();}return tree;}
  function flush(){if(!mounted)return;for(const {i,next} of updates.splice(0))slots[i]=typeof next==='function'?next(slots[i]):next;dirty=false;render();}
  async function drain(){for(let i=0;i<24;i++){await Promise.resolve();if(mounted&&dirty)flush();}}
  function nodes(value=tree){const out=[];function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'){out.push(n);walk(n.props?.children);}}walk(value);return out;}
  function text(n){if(Array.isArray(n))return n.map(text).join('');if(n&&typeof n==='object')return text(n.props?.children);return n==null||typeof n==='boolean'?'':String(n);}
  const button=label=>{const n=nodes().find(n=>n.type==='button'&&text(n)===label);assert.ok(n,`button ${label}`);return n;};
  const panel=()=>nodes().find(n=>n.props?.['aria-label']==='压缩结果');
  render();
  return {details,compressions,restores,downloads,revoked,historyCalls,nodes,text,button,flush,drain,panel,holdDownload(){const gate=deferred();downloadGates.push(gate);return gate;},get lateWrites(){return lateWrites;},
    get output(){return nodes(panel()).find(n=>n.type==='img'&&n.props.alt==='处理后的 GIF 动画')?.props.src??null;},get historyError(){const n=nodes().find(n=>n.props?.['aria-label']==='压缩历史');return nodes(n).filter(x=>x.props?.role==='alert').map(text).join('');},
    click(label){const value=button(label).props.onClick();flush();return value;},history(id,commit=true){const section=nodes().find(n=>n.props?.['aria-label']==='压缩历史');const n=nodes(section).find(n=>n.type==='button'&&text(n).includes(`record-${id}.gif`));assert.ok(n,`history ${id}`);n.props.onClick();if(commit)flush();},choose(names,commit=true){const input=nodes().find(n=>n.type==='input'&&n.props.type==='file');input.props.onChange({target:{files:names.map(file),value:'chosen'}});if(commit)flush();},compress(){const form=nodes().find(n=>n.type==='form');const value=form.props.onSubmit({preventDefault(){}});flush();return value;},query(value){params=new URLSearchParams(value);flush();},get queryString(){return params.toString();},
    ownerChange(){owner={id:8,name:'other'};flush();},guestChange(){guest=true;flush();},profileRefresh(){owner={...owner,display_name:'new'};flush();},discardOwnerRender(){const saved=slots.slice(),previous=owner;owner={id:8,name:'discarded'};render(false);slots.splice(0,slots.length,...saved);owner=previous;render();},replay(){for(const slot of slots)slot?.cleanup?.();for(const slot of slots)if(slot?.setup)slot.cleanup=slot.setup();},unmount(){mounted=false;for(const slot of slots)slot?.cleanup?.();}
  };
}
test('late deep-link detail cannot replace a later history selection or its download',async()=>{
  const h=harness();await h.drain();h.history(202);h.details[0].resolve(record(101));await h.drain();assert.equal(h.output,'mock/output-202.gif');await h.click('下载 GIF');assert.deepEqual(h.downloads,[{path:'mock/output-202.gif',name:'record-202-compressed.gif'}]);
});
test('late deep-link detail cannot replace a later local batch result or its download',async()=>{
  const h=harness();await h.drain();h.choose(['B.gif']);const pending=h.compress();await h.drain();h.compressions[0].resolve(record(303));await h.drain();await pending;h.details[0].resolve(record(101));await h.drain();assert.equal(h.output,'mock/output-303.gif');await h.click('下载 GIF');assert.deepEqual(h.downloads,[{path:'mock/output-303.gif',name:'record-303-compressed.gif'}]);
});
test('serial deep-link then history selection still shows and downloads the selected record',async()=>{
  const h=harness();await h.drain();h.details[0].resolve(record(101));await h.drain();assert.equal(h.output,'mock/output-101.gif');h.history(202);assert.equal(h.output,'mock/output-202.gif');await h.click('下载原文件');assert.deepEqual(h.downloads,[{path:'mock/original-202.gif',name:'record-202.gif'}]);
});
test('selecting local files rejects a late deep link even before any new compression exists',async()=>{
  const h=harness();await h.drain();h.choose(['B.gif']);h.details[0].resolve(record(101));await h.drain();assert.equal(h.output,null);assert.ok(h.nodes().some(n=>n.type==='strong'&&h.text(n)==='B.gif'));
});
test('query changes hide the previous record and reject reverse responses including query ABA',async()=>{
  const h=harness();await h.drain();h.query('record_id=202');h.query('record_id=101');h.details[2].resolve(record(101,{storage_path:'mock/new-101.gif'}));await h.drain();h.details[0].resolve(record(101));h.details[1].resolve(record(202));await h.drain();assert.equal(h.output,'mock/new-101.gif');await h.click('下载 GIF');assert.equal(h.downloads[0].path,'mock/new-101.gif');
});
test('clearing or invalidating the query releases the URL display owner without a replacement GET',async()=>{
  for(const query of ['', 'record_id=0','record_id=not-a-number','record_id=-1']){const h=harness();await h.drain();h.query(query);h.details[0].resolve(record(101));await h.drain();assert.equal(h.output,null);assert.equal(h.details.length,1);assert.equal(h.historyError,'');}
});
test('old query errors cannot overwrite a later history selection or current query error',async()=>{
  for(const selection of ['history','query']){const h=harness();await h.drain();if(selection==='history')h.history(202);else{h.query('record_id=303');h.details[1].reject(Error('current query error'));await h.drain();}h.details[0].reject(Error('old query error'));await h.drain();assert.equal(h.historyError,selection==='history'?'':'current query error');assert.equal(h.output,selection==='history'?'mock/output-202.gif':null);}
});
test('reselecting history recovers a current failed query without automatically retrying it',async()=>{
  const h=harness();await h.drain();h.details[0].reject(Error('read failed'));await h.drain();assert.equal(h.historyError,'read failed');assert.equal(h.details.length,1);h.history(202);assert.equal(h.historyError,'');assert.equal(h.output,'mock/output-202.gif');
});
test('a history supplement belongs to its selection and cannot replace a later history or local choice',async()=>{
  for(const next of ['history','local']){const h=harness({query:'',history:[record(202,{source_info:null}),record(303)]});await h.drain();h.history(202);await h.drain();assert.equal(h.details.length,1);if(next==='history')h.history(303);else h.choose(['B.gif']);h.details[0].resolve(record(202,{storage_path:'mock/hydrated-202.gif'}));await h.drain();assert.equal(h.output,next==='history'?'mock/output-303.gif':null);}
});
test('a current supplement updates both preview and download for the same artifact',async()=>{
  const h=harness({query:'',history:[record(202,{output_info:null})]});await h.drain();h.history(202);await h.drain();h.details[0].resolve(record(202,{storage_path:'mock/hydrated-202.gif'}));await h.drain();assert.equal(h.output,'mock/hydrated-202.gif');await h.click('下载 GIF');assert.equal(h.downloads[0].path,'mock/hydrated-202.gif');assert.equal(h.details.length,1);
});
test('incomplete supplements do not loop and a selection retry can read details again',async()=>{
  const h=harness({query:'',history:[record(202,{output_info:null})]});await h.drain();h.history(202);await h.drain();h.details[0].resolve(record(202,{output_info:null}));await h.drain();assert.equal(h.details.length,1);h.history(202);await h.drain();assert.equal(h.details.length,2);h.details[1].reject(Error('details failed'));await h.drain();assert.equal(h.historyError,'details failed');
});
test('supplement failures never clear the selected artifact and stale failures cannot attach to a later choice',async()=>{
  const h=harness({query:'',history:[record(202,{output_info:null}),record(303)]});await h.drain();h.history(202);await h.drain();h.history(303);h.details[0].reject(Error('old details failed'));await h.drain();assert.equal(h.output,'mock/output-303.gif');assert.equal(h.historyError,'');
});
test('mismatched query and supplement record ids are rejected instead of changing download identity',async()=>{
  for(const supplement of [false,true]){const h=harness({query:supplement?'':'record_id=101',history:[record(202,{output_info:null})]});await h.drain();if(supplement){h.history(202);await h.drain();}h.details[0].resolve(record(303));await h.drain();assert.match(h.historyError,/与当前选择不一致/);assert.equal(h.output,supplement?'mock/output-202.gif':null);}
});
test('a local result supplement never becomes a persistent history override after changing local preview',async()=>{
  const h=harness({query:''});await h.drain();h.choose(['A.gif','B.gif']);const pending=h.compress();await h.drain();h.compressions[0].resolve(record(401,{output_info:null}));await h.drain();const supplement=h.details[0];assert.equal(supplement.id,401);h.compressions[1].resolve(record(402));await h.drain();await pending;h.click('B.gif500 B · 已达标');supplement.resolve(record(401,{storage_path:'mock/hydrated-A.gif'}));await h.drain();assert.equal(h.output,'mock/output-402.gif');await h.click('下载 GIF');assert.equal(h.downloads[0].path,'mock/output-402.gif');
});
test('local hydration stops being visible when a new batch replaces the same local slot',async()=>{
  const h=harness({query:''});await h.drain();h.choose(['A.gif']);let pending=h.compress();await h.drain();h.compressions[0].resolve(record(401,{output_info:null}));await h.drain();await pending;h.details[0].resolve(record(401,{storage_path:'mock/hydrated-A.gif'}));await h.drain();assert.equal(h.output,'mock/hydrated-A.gif');pending=h.compress();await h.drain();assert.equal(h.output,null);h.compressions[1].resolve(record(402));await h.drain();await pending;assert.equal(h.output,'mock/output-402.gif');
});
test('browsing history during a running batch keeps execution and saved results alive without stealing the display',async()=>{
  const h=harness({query:''});await h.drain();h.choose(['A.gif','B.gif']);const pending=h.compress();await h.drain();h.history(202);h.compressions[0].resolve(record(401));await h.drain();assert.equal(h.compressions.length,2);assert.equal(h.output,'mock/output-202.gif');h.compressions[1].resolve(record(402));await h.drain();await pending;assert.equal(h.output,'mock/output-202.gif');assert.ok(h.nodes().some(n=>n.props?.['aria-label']==='压缩历史'&&h.text(n).includes('record-401.gif')&&h.text(n).includes('record-402.gif')));h.click('B.gif500 B · 已达标');assert.equal(h.output,'mock/output-402.gif');
});
test('copying the current history record creates a local intent and rejects a still-pending deep link',async()=>{
  const h=harness({query:'record_id=101&keep=1'});await h.drain();h.history(202);h.click('复制到压缩区');assert.equal(h.restores[0].id,202);h.details[0].resolve(record(101));await h.drain();h.restores[0].resolve(file('copied-202.gif'));await h.drain();assert.equal(h.output,null);assert.equal(h.queryString,'keep=1');assert.ok(h.nodes().some(n=>n.type==='p'&&h.text(n).includes('record-202.gif')&&h.text(n).includes('复制到压缩区')));
});
test('a late copy success or error cannot replace another history selection or its URL',async()=>{
  for(const fail of [false,true]){const h=harness();await h.drain();h.history(202);h.click('复制到压缩区');h.history(303);if(fail)h.restores[0].reject(Error('old copy failed'));else h.restores[0].resolve(file('copied-202.gif'));await h.drain();assert.equal(h.output,'mock/output-303.gif');assert.equal(h.queryString,'record_id=101');assert.ok(!h.nodes().some(n=>n.props?.role==='alert'&&h.text(n).includes('old copy failed')));h.details[0].resolve(record(101));await h.drain();assert.equal(h.output,'mock/output-303.gif');}
});
test('account changes discard old display and stop subsequent old batch processing while preserving new observations',async()=>{
  const h=harness({query:''});await h.drain();h.choose(['A.gif','B.gif']);const pending=h.compress();await h.drain();h.ownerChange();await h.drain();h.compressions[0].resolve(record(401));await h.drain();await pending;assert.equal(h.compressions.length,1);assert.equal(h.output,null);assert.ok(!h.text(h.panel()).includes('record-401.gif'));h.history(202);assert.equal(h.output,'mock/output-202.gif');
});
test('account and guest transitions reject late query results and errors',async()=>{
  for(const action of ['ownerChange','guestChange']){const h=harness();await h.drain();h[action]();await h.drain();h.details[0].reject(Error('old account query'));await h.drain();assert.equal(h.historyError,'');assert.equal(h.output,null);if(action==='ownerChange'){assert.equal(h.details.length,2);h.details[1].resolve(record(101,{storage_path:'mock/new-account.gif'}));await h.drain();assert.equal(h.output,'mock/new-account.gif');}else assert.equal(h.details.length,1);}
});
test('profile refresh and abandoned account render preserve the visible pending query',async()=>{
  const h=harness();await h.drain();h.profileRefresh();h.discardOwnerRender();h.details[0].resolve(record(101));await h.drain();assert.equal(h.output,'mock/output-101.gif');assert.equal(h.details.length,1);
});
test('unmount ignores late query supplement copy and batch callbacks without late state writes',async()=>{
  for(const kind of ['query','supplement','copy','batch']){const h=harness({query:kind==='query'?'record_id=101':'',history:[record(202,{output_info:kind==='supplement'?null:info})]});await h.drain();if(kind==='supplement'){h.history(202);await h.drain();}if(kind==='copy'){h.history(202);h.click('复制到压缩区');}let pending;if(kind==='batch'){h.choose(['A.gif']);pending=h.compress();await h.drain();}h.unmount();if(kind==='query'||kind==='supplement')h.details[0].resolve(record(kind==='query'?101:202));if(kind==='copy')h.restores[0].resolve(file('A.gif'));if(kind==='batch')h.compressions[0].resolve(record(401));await h.drain();await pending;assert.equal(h.lateWrites,0,kind);}
});
test('Strict effect replay refreshes a query observer while ignoring the discarded setup response',async()=>{
  const h=harness();await h.drain();h.replay();await h.drain();h.details[0].resolve(record(101,{storage_path:'mock/discarded.gif'}));h.details[1].resolve(record(101,{storage_path:'mock/current.gif'}));await h.drain();assert.equal(h.output,'mock/current.gif');assert.equal(h.lateWrites,0);
});
test('Strict replay preserves a later manual history selection and restarts only its unfinished supplement',async()=>{
  const h=harness({query:'',history:[record(202,{output_info:null})]});await h.drain();h.history(202);await h.drain();h.replay();await h.drain();assert.equal(h.output,'mock/output-202.gif');assert.equal(h.details.length,2);h.details[0].resolve(record(202,{storage_path:'mock/discarded.gif'}));h.details[1].resolve(record(202,{storage_path:'mock/current.gif'}));await h.drain();assert.equal(h.output,'mock/current.gif');
});
test('old download completion cannot write after unmount or clear the next account download busy state',async()=>{
  for(const unmount of [true,false]){const h=harness({query:''});await h.drain();h.history(202);const old=h.holdDownload();h.click('下载 GIF');if(unmount)h.unmount();else{h.ownerChange();await h.drain();h.history(303);h.holdDownload();h.click('下载 GIF');}old.resolve();await h.drain();assert.equal(h.lateWrites,0);if(!unmount)assert.equal(h.button('准备下载…').props.disabled,true);}
});
test('query changes during copy invalidate the old parameters and URL writeback',async()=>{
  const h=harness({query:''});await h.drain();h.history(202);h.click('复制到压缩区');h.query('record_id=303');h.details[0].resolve(record(303));await h.drain();h.restores[0].resolve(file('copy-A.gif'));await h.drain();assert.equal(h.output,'mock/output-303.gif');assert.equal(h.queryString,'record_id=303');
});
