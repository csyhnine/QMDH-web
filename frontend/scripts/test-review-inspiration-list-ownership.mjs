import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';

const source=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function compile(code,imports){const exports={};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Error,Promise,require:name=>{assert.ok(Object.hasOwn(imports,name),`undeclared import ${name}`);return imports[name];},confirm:()=>true});return exports;}
const post=(id,category='建筑')=>({id,category,title:`post ${id}`,tags:[],like_count:0,source_type:'external',source_name:'mock',source_url:'',image_path:'mock-local',user_name:'user'});
function harness({admin=true}={}){
  let tree,dirty=false,mounted=true,lateWrites=0,owner={id:7,name:'owner'},guest=false,current;
  const contexts=[{slots:[]},{slots:[]}],updates=[],layouts=[],passives=[],loads=[],mutations=[];
  const effect=queue=>(setup,deps)=>{const ctx=current,i=ctx.cursor++,old=ctx.slots[i];if(!old||!deps||deps.some((v,j)=>!Object.is(v,old.deps?.[j]))){const next={deps,setup};ctx.slots[i]=next;queue.push(()=>{old?.cleanup?.();next.cleanup=setup();});}};
  const react={useState(initial){const ctx=current,i=ctx.cursor++;if(!(i in ctx.slots))ctx.slots[i]=typeof initial==='function'?initial():initial;return [ctx.slots[i],next=>{if(!mounted){lateWrites++;return;}updates.push({ctx,i,next});dirty=true;}];},useRef(initial){const ctx=current,i=ctx.cursor++;return ctx.slots[i]??={current:initial};},useMemo(create,deps){const ctx=current,i=ctx.cursor++,old=ctx.slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))ctx.slots[i]={deps,value:create()};return ctx.slots[i].value;},useLayoutEffect:effect(layouts),useEffect:effect(passives)};
  const api=new Proxy({inspiration(category){const gate=deferred();loads.push({category:category||'全部',...gate});return gate.promise;}},{get(target,name){if(name in target)return target[name];assert.ok(['likeInspiration','deleteInspiration','updateInspiration','createInspiration','extractImages'].includes(name),`undeclared API ${String(name)}`);return (...args)=>{const gate=deferred();mutations.push({name,args:copy(args),...gate});return gate.promise;};}});
  const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  const auth={useAuth:()=>({currentUser:owner,isGuest:guest,canManageUsers:true,canUseOpsViews:true})};
  const imports={react,'react/jsx-runtime':jsx,'react-router-dom':{useNavigate:()=>()=>{}},'../../api':{api},'../../context/AuthContext':auth,'../../lib/search/useServerSearch':{useServerSearch:(_,query)=>({trimmedQuery:query.trim(),matchIds:null,usingServerSearch:false,isSearching:false})},'../../utils/uploads':{validateReferenceImageSize:()=>null},'./inspirationPromptUtils':{copyInspirationPrompt:async()=>true,getInspirationPromptText:()=>''},'./inspirationMediaUtils':{hasInspirationComparePreview:()=>false,InspirationMainMediaPreview:'media',inspirationFinalMediaCaption:()=>'',isVideoInspirationPost:()=>false}};
  if(existsSync(new URL('../src/pages/inspiration/useInspirationList.ts',import.meta.url)))imports['./useInspirationList']=compile(source('pages/inspiration/useInspirationList.ts'),{react,'../../api':{api}});
  if(existsSync(new URL('../src/pages/inspiration/useInspirationDialogs.ts',import.meta.url)))imports['./useInspirationDialogs']=compile(source('pages/inspiration/useInspirationDialogs.ts'),{react,'../../api':{api},'../../utils/uploads':imports['../../utils/uploads']});
  const Page=compile(source('pages/inspiration/InspirationPage.tsx'),imports).default;
  const router=source('router.tsx'),ast=ts.createSourceFile('router.tsx',router,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const name=admin?'AdminInspirationRoute':'InspirationRoute',route=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(route,'actual route present');
  const Route=compile(`const {useState,useEffect}=require('react');const {useAuth}=require('auth');const {api}=require('api');const AppShell='shell',InspirationPage='page';${route.getText(ast)};exports.Route=${name};`,{react,auth,api:{api},'react/jsx-runtime':jsx}).Route;
  function nodes(value=tree){const result=[];function walk(node){if(Array.isArray(node))node.forEach(walk);else if(node&&typeof node==='object'){result.push(node);walk(node.props?.children);}}walk(value);return result;}
  function text(node){if(Array.isArray(node))return node.map(text).join('');if(node&&typeof node==='object')return text(node.props?.children);return node==null||typeof node==='boolean'?'':String(node);}
  function inContext(ctx,fn){current=ctx;ctx.cursor=0;return fn();}
  function render(commit=true){layouts.length=passives.length=0;const routeTree=inContext(contexts[0],()=>Route());const props=nodes(routeTree).find(n=>n.type==='page').props;tree=inContext(contexts[1],()=>Page(props));if(commit){for(const run of layouts.splice(0))run();for(const run of passives.splice(0))run();}return tree;}
  function flush(){if(!mounted)return;for(const {ctx,i,next} of updates.splice(0))ctx.slots[i]=typeof next==='function'?next(ctx.slots[i]):next;dirty=false;render();}
  async function drain(){for(let i=0;i<16;i++){await Promise.resolve();if(mounted&&dirty)flush();}}
  const button=label=>{const node=nodes().find(n=>n.type==='button'&&text(n)===label);assert.ok(node,`button ${label}`);return node;};
  const cards=()=>nodes().filter(n=>n.type==='article'&&n.props.className==='inspiration-card');
  const card=id=>{const node=cards().find(n=>nodes(n).some(x=>x.type==='h3'&&text(x)===`post ${id}`));assert.ok(node,`card ${id}`);return node;};
  render();
  return {loads,mutations,nodes,button,cards,card,flush,drain,text,get tree(){return tree;},get lateWrites(){return lateWrites;},
    click(label,commit=true){const result=button(label).props.onClick();if(commit)flush();return result;},category(label,commit=true){return this.click(label,commit);},ids(){return cards().map(n=>Number(text(nodes(n).find(x=>x.type==='h3')).replace('post ','')));},
    select(id,commit=true){nodes(card(id)).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange();if(commit)flush();},like(id){return nodes(card(id)).find(n=>n.type==='button'&&text(n).startsWith('♡')).props.onClick();},
    get error(){return nodes().filter(n=>n.props?.className==='floating-error inspiration-feedback').map(text).join('');},get busy(){return nodes().some(n=>n.type==='button'&&text(n)==='刷新中...'&&n.props.disabled);},get selectedSummary(){return text(nodes().find(n=>n.props?.className==='inspiration-toolbar-summary'));},
    search(value){nodes().find(n=>n.type==='input'&&n.props['aria-label']===(admin?'搜索灵感条目':'搜索灵感')).props.onChange({target:{value}});flush();},source(value){nodes().find(n=>n.type==='select'&&n.props['aria-label']==='筛选来源').props.onChange({target:{value}});flush();},
    ownerChange(){owner={id:8,name:'other'};flush();},profileRefresh(){owner={...owner,display_name:'new'};flush();},guestChange(){guest=true;flush();},
    discardedOwnerRender(){const saved=contexts.map(c=>c.slots.slice()),previous=owner;owner={id:8,name:'abandoned'};render(false);contexts.forEach((c,i)=>c.slots=saved[i]);owner=previous;layouts.length=passives.length=0;render();},
    replay(){for(const ctx of contexts)for(const slot of ctx.slots)slot?.cleanup?.();for(const ctx of contexts)for(const slot of ctx.slots)if(slot?.setup)slot.cleanup=slot.setup();},
    unmount(){mounted=false;for(const ctx of contexts)for(const slot of ctx.slots)slot?.cleanup?.();}
  };
}
async function initial(h,posts=[]){h.loads[0].resolve(posts);await h.drain();}

test('reversed category responses cannot replace the current category',async()=>{
  const h=harness();await initial(h);h.category('建筑');h.category('景观');h.loads[2].resolve([post(22,'景观')]);await h.drain();h.loads[1].resolve([post(11)]);await h.drain();assert.deepEqual(h.ids(),[22]);assert.equal(h.button('景观').props.className,'active');
});
test('a late initial all-category response cannot replace a newer category',async()=>{
  const h=harness();h.category('景观');h.loads[1].resolve([post(22,'景观')]);await h.drain();h.loads[0].resolve([post(11)]);await h.drain();assert.deepEqual(h.ids(),[22]);
});
test('both real parent routes issue exactly one initial read through the page',async()=>{
  for(const admin of [true,false]){const h=harness({admin});assert.equal(h.loads.length,1);assert.equal(h.loads[0].category,'全部');await initial(h,[post(1)]);assert.deepEqual(h.ids(),[1]);h.flush();assert.equal(h.loads.length,1);}
});
test('serial category changes keep the ordinary successful behavior',async()=>{
  const h=harness();await initial(h,[post(1)]);h.category('建筑');h.loads[1].resolve([post(11)]);await h.drain();assert.deepEqual(h.ids(),[11]);h.category('景观');h.loads[2].resolve([post(22,'景观')]);await h.drain();assert.deepEqual(h.ids(),[22]);assert.equal(h.busy,false);assert.equal(h.error,'');
});
test('switching category removes the previous category immediately while preserving search and selection',async()=>{
  const h=harness();await initial(h,[post(11)]);h.select(11);h.search('post');h.source('external');h.category('景观');assert.deepEqual(h.ids(),[]);assert.match(h.selectedSummary,/总已选 1 条/);assert.equal(h.nodes().find(n=>n.props?.['aria-label']==='搜索灵感条目').props.value,'post');assert.equal(h.nodes().find(n=>n.props?.['aria-label']==='筛选来源').props.value,'external');h.loads[1].resolve([post(22,'景观')]);await h.drain();assert.deepEqual(h.ids(),[22]);assert.match(h.selectedSummary,/当前结果已选 0 条，总已选 1 条/);
});
test('a category ABA is distinguished by request generation even when the query matches again',async()=>{
  const h=harness();await initial(h);h.category('建筑');h.category('景观');h.category('建筑');h.loads[3].resolve([post(33)]);await h.drain();h.loads[1].resolve([post(11)]);h.loads[2].reject(Error('old landscape'));await h.drain();assert.deepEqual(h.ids(),[33]);assert.equal(h.error,'');
});
test('same-category overlapping refreshes accept only the latest response',async()=>{
  const h=harness();await initial(h,[post(1)]);h.category('全部');h.category('全部');h.loads[2].resolve([post(3)]);await h.drain();h.loads[1].resolve([post(2)]);await h.drain();assert.deepEqual(h.ids(),[3]);assert.equal(h.loads.length,3);
});
test('old successes and failures cannot finish the busy state of a newer request',async()=>{
  for(const fail of [false,true]){const h=harness();await initial(h);h.category('建筑');h.category('景观');if(fail)h.loads[1].reject(Error('old failure'));else h.loads[1].resolve([post(11)]);await h.drain();assert.equal(h.busy,true);assert.equal(h.error,'');assert.deepEqual(h.ids(),[]);h.loads[2].resolve([post(22,'景观')]);await h.drain();assert.equal(h.busy,false);assert.deepEqual(h.ids(),[22]);}
});
test('an old failure never overwrites a newer request error',async()=>{
  const h=harness();await initial(h);h.category('建筑');h.category('景观');h.loads[2].reject(Error('current failure'));await h.drain();h.loads[1].reject(Error('old failure'));await h.drain();assert.equal(h.error,'current failure');assert.equal(h.busy,false);
});
test('a current failure retains same-query data and explicit retry recovers without an automatic request',async()=>{
  const h=harness();await initial(h,[post(1)]);h.click('刷新');h.loads[1].reject(Error('read failed'));await h.drain();assert.deepEqual(h.ids(),[1]);assert.equal(h.error,'read failed');assert.equal(h.loads.length,2);assert.equal(h.busy,false);h.click('刷新');assert.equal(h.error,'');h.loads[2].resolve([post(2)]);await h.drain();assert.deepEqual(h.ids(),[2]);assert.equal(h.error,'');
});
test('a current empty response is authoritative and a failed different query never reveals old posts',async()=>{
  const h=harness();await initial(h,[post(1)]);h.category('景观');h.loads[1].resolve([]);await h.drain();assert.deepEqual(h.ids(),[]);assert.equal(h.error,'');h.category('建筑');h.loads[2].reject(Error('empty category failure'));await h.drain();assert.deepEqual(h.ids(),[]);assert.equal(h.error,'empty category failure');
});
test('a list response does not erase or replace a later action error',async()=>{
  for(const fail of [false,true]){const h=harness();h.click('批量改分类');assert.equal(h.error,'请先选择要批量修改的灵感条目');if(fail)h.loads[0].reject(Error('older read error'));else h.loads[0].resolve([post(11)]);await h.drain();assert.equal(h.error,'请先选择要批量修改的灵感条目');assert.equal(h.busy,false);}
});
test('loading results never clears selections made after a refresh began',async()=>{
  const h=harness();await initial(h,[post(11),post(12)]);h.click('刷新');h.select(12);h.loads[1].resolve([post(11),post(12)]);await h.drain();assert.match(h.selectedSummary,/当前结果已选 1 条，总已选 1 条/);assert.equal(h.nodes(h.card(12)).find(n=>n.type==='input').props.checked,true);
});
test('a late mutation refreshes the current category and invalidates its older pending read',async()=>{
  const h=harness();await initial(h,[post(11)]);const pending=h.like(11);assert.equal(h.mutations[0].name,'likeInspiration');h.category('景观');h.mutations[0].resolve(post(11));await h.drain();assert.deepEqual(h.loads.map(r=>r.category),['全部','景观','景观']);h.loads[2].resolve([post(23,'景观')]);await h.drain();h.loads[1].resolve([post(22,'景观')]);await pending;await h.drain();assert.deepEqual(h.ids(),[23]);assert.equal(h.button('景观').props.className,'active');
});
test('a mutation refresh started before a category change cannot replace the later category',async()=>{
  const h=harness();await initial(h,[post(11)]);const pending=h.like(11);h.mutations[0].resolve(post(11));await h.drain();assert.equal(h.loads[1].category,'全部');h.category('景观');h.loads[2].resolve([post(22,'景观')]);await h.drain();h.loads[1].resolve([post(11)]);await pending;await h.drain();assert.deepEqual(h.ids(),[22]);
});
test('single deletion keeps a later selection and refreshes the current category',async()=>{
  const h=harness();await initial(h,[post(11)]);h.select(11);h.nodes(h.card(11)).find(n=>n.type==='button'&&h.text(n)==='删除').props.onClick();h.category('景观');h.loads[1].resolve([post(22,'景观')]);await h.drain();h.select(22);h.mutations[0].resolve({});await h.drain();assert.equal(h.loads[2].category,'景观');h.loads[2].resolve([post(22,'景观')]);await h.drain();assert.match(h.selectedSummary,/总已选 1 条/);assert.equal(h.nodes(h.card(22)).find(n=>n.type==='input').props.checked,true);
});
test('batch category and delete completions preserve later selections including selection ABA',async()=>{
  for(const label of ['批量改分类','批量删除']){const h=harness();await initial(h,[post(11),post(12)]);h.select(11);h.click(label);h.select(11);h.select(12);h.select(12);h.select(11);h.mutations[0].resolve({});await h.drain();assert.equal(h.loads[1].category,'全部');h.loads[1].resolve([post(11),post(12)]);await h.drain();assert.match(h.selectedSummary,/总已选 1 条/);assert.equal(h.nodes(h.card(11)).find(n=>n.type==='input').props.checked,true);}
});
test('an unchanged batch selection clears normally after its own successful mutation',async()=>{
  for(const label of ['批量改分类','批量删除']){const h=harness();await initial(h,[post(11)]);h.select(11);h.click(label);h.mutations[0].resolve({});await h.drain();h.loads[1].resolve([]);await h.drain();assert.match(h.selectedSummary,/总已选 0 条/);}
});
test('unmount rejects late reads without writing state or retrying',async()=>{
  for(const fail of [false,true]){const h=harness();h.unmount();if(fail)h.loads[0].reject(Error('late error'));else h.loads[0].resolve([post(1)]);await h.drain();assert.equal(h.lateWrites,0);assert.equal(h.loads.length,1);}
});
test('an unmounted mutation observer cannot start another read',async()=>{
  const h=harness();await initial(h,[post(11)]);const pending=h.like(11);h.unmount();h.mutations[0].resolve(post(11));await pending;await h.drain();assert.equal(h.loads.length,1);assert.equal(h.lateWrites,0);
});
test('account changes start a new list and reject old results errors and selected ids',async()=>{
  for(const fail of [false,true]){const h=harness();await initial(h,[post(11)]);h.select(11);h.category('建筑');h.ownerChange();assert.equal(h.loads[2].category,'全部');assert.deepEqual(h.ids(),[]);assert.match(h.selectedSummary,/总已选 0 条/);h.loads[2].resolve([post(22,'景观')]);await h.drain();if(fail)h.loads[1].reject(Error('old account'));else h.loads[1].resolve([post(11)]);await h.drain();assert.deepEqual(h.ids(),[22]);assert.equal(h.error,'');}
});
test('an old account mutation cannot refresh or modify the new account selection',async()=>{
  const h=harness();await initial(h,[post(11)]);h.select(11);h.click('批量改分类');h.ownerChange();h.loads[1].resolve([post(22)]);await h.drain();h.select(22);h.mutations[0].resolve({});await h.drain();assert.equal(h.loads.length,2);assert.deepEqual(h.ids(),[22]);assert.match(h.selectedSummary,/总已选 1 条/);
});
test('same-account profile refresh keeps the existing pending request and selection',async()=>{
  const h=harness();await initial(h,[post(11)]);h.select(11);h.click('刷新');h.profileRefresh();assert.equal(h.loads.length,2);h.loads[1].resolve([post(11)]);await h.drain();assert.match(h.selectedSummary,/总已选 1 条/);assert.deepEqual(h.ids(),[11]);
});
test('an abandoned account render never invalidates the still-visible request',async()=>{
  const h=harness();h.discardedOwnerRender();assert.equal(h.loads.length,1);h.loads[0].resolve([post(11)]);await h.drain();assert.deepEqual(h.ids(),[11]);
});
test('guest transitions replace the list observation and reject previous results',async()=>{
  const h=harness();h.guestChange();assert.equal(h.loads.length,2);h.loads[0].resolve([post(11)]);h.loads[1].resolve([post(22)]);await h.drain();assert.deepEqual(h.ids(),[22]);
});
test('Strict effect cleanup and setup reject the replayed old request and retain the active observer',async()=>{
  const h=harness();h.replay();assert.equal(h.loads.length,2);h.loads[0].reject(Error('discarded setup'));await h.drain();assert.equal(h.error,'');assert.equal(h.busy,true);h.loads[1].resolve([post(22)]);await h.drain();assert.deepEqual(h.ids(),[22]);assert.equal(h.busy,false);assert.equal(h.lateWrites,0);
});
test('a queued redraw cannot revive an obsolete category result',async()=>{
  const h=harness();await initial(h);h.category('建筑');h.loads[1].resolve([post(11)]);await Promise.resolve();h.category('景观',false);h.flush();assert.deepEqual(h.ids(),[]);h.loads[2].resolve([post(22,'景观')]);await h.drain();assert.deepEqual(h.ids(),[22]);
});
test('batch tag updates retain their original targets but refresh the latest category',async()=>{
  const h=harness();await initial(h,[post(11)]);h.select(11);h.nodes().find(n=>n.props?.['aria-label']==='批量标签输入').props.onChange({target:{value:'new tag'}});h.flush();h.click('批量改标签');assert.deepEqual(h.mutations[0].args,[11,{tags:['new tag']}]);h.category('景观');h.mutations[0].resolve(post(11));await h.drain();assert.equal(h.loads[2].category,'景观');h.loads[2].resolve([post(23,'景观')]);h.loads[1].resolve([post(22,'景观')]);await h.drain();assert.deepEqual(h.ids(),[23]);
});
test('edit save refreshes the latest category without changing the saved target',async()=>{
  const h=harness();await initial(h,[post(11)]);h.nodes(h.card(11)).find(n=>n.type==='button'&&n.props.title==='编辑').props.onClick();h.flush();const pending=h.click('保存');assert.deepEqual(h.mutations[0].args,[11,{title:'post 11',image_path:'mock-local',source_url:''}]);h.category('景观');h.mutations[0].resolve(post(11));await h.drain();assert.equal(h.loads[2].category,'景观');h.loads[2].resolve([post(23,'景观')]);h.loads[1].resolve([post(22,'景观')]);await pending;await h.drain();assert.deepEqual(h.ids(),[23]);
});
test('mock import completion refreshes the latest category while preserving the submitted category',async()=>{
  const h=harness();await initial(h);h.click('+ 导入参考');h.nodes().find(n=>n.props?.placeholder==='粘贴文章链接').props.onChange({target:{value:'mock-article'}});h.flush();const extracting=h.click('提取图片');h.mutations[0].resolve({images:['mock-local'],title:'imported'});await extracting;await h.drain();assert.equal(h.button('确认导入').props.disabled,false);const pending=h.click('确认导入');assert.deepEqual(h.mutations[1].args,[{title:'imported',image_path:'mock-local',category:'建筑',source_type:'external',source_name:'',source_url:'mock-article',tags:[]}]);h.category('景观');h.mutations[1].resolve(post(11));await h.drain();assert.equal(h.loads[2].category,'景观');h.loads[2].resolve([post(23,'景观')]);h.loads[1].resolve([post(22,'景观')]);await pending;await h.drain();assert.deepEqual(h.ids(),[23]);
});
test('a failed mutation issues no refresh and its error survives an earlier list failure',async()=>{
  const h=harness();await initial(h,[post(11)]);h.click('刷新');const pending=h.like(11);h.mutations[0].reject(Error('like failed'));await pending;await h.drain();h.loads[1].reject(Error('older list failed'));await h.drain();assert.equal(h.error,'like failed');assert.equal(h.loads.length,2);assert.deepEqual(h.ids(),[11]);assert.equal(h.busy,false);
});
