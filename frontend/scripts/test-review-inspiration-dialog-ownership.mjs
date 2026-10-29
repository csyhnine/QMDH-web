import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';

// Reuse only the F54 driver definition; none of its tests are registered here.
const driverUrl=new URL('./test-review-inspiration-list-ownership.mjs',import.meta.url);
let driver=readFileSync(driverUrl,'utf8').split('\ntest(')[0].replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(driverUrl.href));
driver=driver.replace('function compile(code,imports){','function compile(code,imports,globals={}){').replace('{exports,Error,Promise,require:', '{exports,Error,Promise,...globals,require:');
driver=driver.replace('loads=[],mutations=[];', 'loads=[],mutations=[],readers=[];let deferReads=false;');
driver=driver.replace("'extractImages'].includes", "'extractImages','uploadReferenceImage'].includes");
driver=driver.replace('validateReferenceImageSize:()=>null', "validateReferenceImageSize:file=>file.oversize?'too large':null");
driver=driver.replace("  const Page=compile(source('pages/inspiration/InspirationPage.tsx'),imports).default;",`
  const readerGlobals={URL,FileReader:class {readAsDataURL(file){this.file=file;readers.push(this);if(!deferReads){this.result='data:image/png;base64,'+file.name;this.onload();}}}};
  if(existsSync(new URL('../src/pages/inspiration/useInspirationDialogs.ts',${JSON.stringify(driverUrl.href)})))imports['./useInspirationDialogs']=compile(source('pages/inspiration/useInspirationDialogs.ts'),{react,'../../api':{api},'../../utils/uploads':imports['../../utils/uploads']},readerGlobals);
  const Page=compile(source('pages/inspiration/InspirationPage.tsx'),imports,readerGlobals).default;`);
driver=driver.replace('return {loads,mutations,nodes,button,cards,card,flush,drain,text,', 'return {loads,mutations,readers,deferReading(){deferReads=true;},nodes,button,cards,card,flush,drain,text,');
const {harness,post,initial}=vm.runInNewContext(driver+'\n;({harness,post,initial})',{assert,readFileSync,existsSync,vm,ts,URL,Error,Promise});
const copy=x=>JSON.parse(JSON.stringify(x));
function dialog(h,kind='edit'){return h.nodes().find(n=>n.props?.className==='media-lightbox-content'&&h.nodes(n).some(x=>x.type==='h2'&&h.text(x)===(kind==='edit'?'编辑灵感':'导入灵感参考')));}
function field(h,label,kind='edit'){const group=h.nodes(dialog(h,kind)).find(n=>n.type==='div'&&Array.isArray(n.props.children)&&n.props.children.some(c=>c?.type==='label'&&h.text(c)===label));assert.ok(group,`field ${label}`);return h.nodes(group).find(n=>n.type==='input'||n.type==='select');}
function change(h,label,value,kind='edit',commit=true){field(h,label,kind).props.onChange({target:{value}});if(commit)h.flush();}
function openEdit(h,id){h.nodes(h.card(id)).find(n=>n.type==='button'&&n.props.title==='编辑').props.onClick();h.flush();}
function cancel(h,kind='edit'){const d=dialog(h,kind);h.nodes(d).find(n=>n.type==='button'&&h.text(n)==='取消').props.onClick();h.flush();}
function upload(h,name='A.png',kind='edit',extra={}){const d=dialog(h,kind);assert.ok(d);const target={value:name,files:[{name,type:'image/png',size:1,...extra}]};h.nodes(d).find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target});h.flush();return target;}
function url(h,value,commit=true){h.nodes(dialog(h,'import')).find(n=>n.props?.placeholder==='粘贴文章链接').props.onChange({target:{value}});if(commit)h.flush();}
async function ready(){const h=harness();await initial(h,[post(1),post(2)]);return h;}

test('an old edit upload cannot replace the new target cover or its save payload',async()=>{
  const h=await ready();openEdit(h,1);upload(h);await h.drain();cancel(h);openEdit(h,2);change(h,'标题','unsaved B');h.mutations[0].resolve({storage_path:'media/A.png'});await h.drain();assert.equal(field(h,'图片 URL').props.value,'mock-local');const pending=h.click('保存');assert.deepEqual(copy(h.mutations[1].args),[2,{title:'unsaved B',image_path:'mock-local',source_url:''}]);h.mutations[1].resolve(post(2));await h.drain();h.loads[1].resolve([post(1),post(2)]);await pending;await h.drain();
});
test('a cancelled extraction cannot reopen its old import dialog',async()=>{
  const h=await ready();h.click('+ 导入参考');url(h,'article A');const pending=h.click('提取图片');cancel(h,'import');h.mutations[0].resolve({images:['media/A.png'],title:'A title'});await pending;await h.drain();assert.equal(dialog(h,'import'),undefined);
});
test('an old edit save cannot close a different newly opened draft',async()=>{
  const h=await ready();openEdit(h,1);const pending=h.click('保存');cancel(h);openEdit(h,2);change(h,'标题','unsaved B');h.mutations[0].resolve(post(1));await h.drain();h.loads[1].resolve([post(1),post(2)]);await pending;await h.drain();assert.ok(dialog(h));assert.equal(field(h,'标题').props.value,'unsaved B');
});
async function preparedImport(h){h.click('+ 导入参考');url(h,'https://mock.invalid/article');h.click('提取图片');const request=h.mutations.at(-1);request.resolve({images:['media/cover.png','media/second.png'],title:'extracted title'});await h.drain();}
async function finishReads(h){for(const r of h.loads.slice(1))r.resolve([post(1),post(2)]);await h.drain();}
function manualImage(h,value){const input=h.nodes(dialog(h,'import')).find(n=>n.props?.placeholder==='手动输入图片 URL');assert.ok(input);input.props.onChange({target:{value}});h.flush();}
test('stable edit upload and save preserve the exact target and current fields',async()=>{
  const h=await ready();openEdit(h,1);const input=upload(h);assert.equal(input.value,'');await h.drain();assert.deepEqual(copy(h.mutations[0].args),[{file_name:'A.png',data_url:'data:image/png;base64,A.png'}]);change(h,'标题','edited title');h.mutations[0].resolve({storage_path:'media/A.png'});await h.drain();assert.equal(field(h,'标题').props.value,'edited title');assert.equal(field(h,'图片 URL').props.value,'media/A.png');h.click('保存');assert.deepEqual(copy(h.mutations[1].args),[1,{title:'edited title',image_path:'media/A.png',source_url:''}]);h.mutations[1].resolve(post(1));await h.drain();await finishReads(h);assert.equal(dialog(h),undefined);
});
test('stable import extraction and create use a captured trimmed payload and close only their own draft',async()=>{
  const h=await ready();await preparedImport(h);change(h,'标题','  import title  ','import');change(h,'分类','景观','import');change(h,'标签（逗号分隔）',' tag1, tag2, ','import');h.click('确认导入');assert.deepEqual(copy(h.mutations[1].args),[{title:'import title',image_path:'media/cover.png',category:'景观',source_type:'external',source_name:'mock.invalid',source_url:'https://mock.invalid/article',tags:['tag1','tag2']}]);h.mutations[1].resolve(post(3));await h.drain();await finishReads(h);assert.equal(dialog(h,'import'),undefined);
});
test('cancel and reopen the same post still rejects its previous upload',async()=>{
  const h=await ready();openEdit(h,1);upload(h);await h.drain();cancel(h);openEdit(h,1);change(h,'标题','new same-post draft');h.mutations[0].resolve({storage_path:'media/old.png'});await h.drain();assert.equal(field(h,'图片 URL').props.value,'mock-local');assert.equal(field(h,'标题').props.value,'new same-post draft');
});
test('old extraction success and failure cannot overwrite a newly opened import draft',async()=>{
  for(const fail of [false,true]){const h=await ready();h.click('+ 导入参考');url(h,'article A');h.click('提取图片');cancel(h,'import');h.click('+ 导入参考');url(h,'article B');change(h,'标题','B title','import');if(fail)h.mutations[0].reject(Error('A failed'));else h.mutations[0].resolve({images:['media/A.png'],title:'A title'});await h.drain();assert.equal(field(h,'标题','import').props.value,'B title');assert.equal(h.nodes(dialog(h,'import')).find(n=>n.props?.placeholder==='粘贴文章链接').props.value,'article B');assert.doesNotMatch(h.text(dialog(h,'import')),/A failed/);}
});
test('changing the URL in the same import rejects old extraction including URL ABA',async()=>{
  const h=await ready();h.click('+ 导入参考');url(h,'A');h.click('提取图片');url(h,'B');url(h,'A');h.click('提取图片');h.mutations[1].resolve({images:['media/new.png'],title:'new title'});await h.drain();h.mutations[0].resolve({images:['media/old.png'],title:'old title'});await h.drain();assert.equal(field(h,'标题','import').props.value,'new title');assert.ok(h.nodes(dialog(h,'import')).some(n=>n.type==='img'&&n.props.src==='media/new.png'));assert.ok(!h.nodes(dialog(h,'import')).some(n=>n.type==='img'&&n.props.src==='media/old.png'));
});
test('manual title edits including ABA survive a still-current extraction',async()=>{
  const h=await ready();h.click('+ 导入参考');change(h,'标题','same title','import');url(h,'A');h.click('提取图片');change(h,'标题','different','import');change(h,'标题','same title','import');h.mutations[0].resolve({images:['media/extracted.png'],title:'server title'});await h.drain();assert.equal(field(h,'标题','import').props.value,'same title');assert.ok(h.nodes(dialog(h,'import')).some(n=>n.type==='img'&&n.props.src==='media/extracted.png'));
});
test('a later local import cover wins over an earlier extraction while unrelated title still fills',async()=>{
  const h=await ready();h.click('+ 导入参考');url(h,'A');h.click('提取图片');upload(h,'B.png','import');await h.drain();h.mutations[1].resolve({storage_path:'media/B.png'});await h.drain();h.mutations[0].resolve({images:['media/A.png'],title:'article title'});await h.drain();assert.equal(field(h,'标题','import').props.value,'article title');assert.equal(h.nodes(dialog(h,'import')).find(n=>n.props?.placeholder==='手动输入图片 URL').props.value,'media/B.png');
});
test('manual cover edits reject a pending upload and keep other draft fields including image ABA',async()=>{
  const h=await ready();openEdit(h,1);upload(h);await h.drain();change(h,'图片 URL','manual B');change(h,'图片 URL','mock-local');change(h,'标题','new title');h.mutations[0].resolve({storage_path:'media/old.png'});await h.drain();assert.equal(field(h,'图片 URL').props.value,'mock-local');assert.equal(field(h,'标题').props.value,'new title');assert.equal(h.button('保存').props.disabled,false);
});
test('changing either source URL rejects a cover upload from the old URL intent',async()=>{
  for(const kind of ['edit','import']){const h=await ready();if(kind==='edit')openEdit(h,1);else h.click('+ 导入参考');upload(h,'A.png',kind);await h.drain();if(kind==='edit')change(h,'原文链接','B');else url(h,'B');h.mutations[0].resolve({storage_path:'media/old.png'});await h.drain();assert.ok(!h.nodes(dialog(h,kind)).some(n=>n.type==='img'&&n.props.src==='media/old.png'));assert.equal(h.button(kind==='edit'?'保存':'确认导入').props.disabled,kind==='import');}
});
test('two cover uploads completed in reverse order keep only the latest selection and its busy state',async()=>{
  for(const fail of [false,true]){const h=await ready();openEdit(h,1);upload(h,'A.png');await h.drain();upload(h,'B.png');await h.drain();if(fail)h.mutations[0].reject(Error('old A failed'));else h.mutations[0].resolve({storage_path:'media/A.png'});await h.drain();assert.equal(h.button('保存').props.disabled,true);assert.doesNotMatch(h.text(dialog(h)),/old A failed/);h.mutations[1].resolve({storage_path:'media/B.png'});await h.drain();assert.equal(field(h,'图片 URL').props.value,'media/B.png');assert.equal(h.button('保存').props.disabled,false);}
});
test('an old upload error never changes the new dialog error or busy state',async()=>{
  const h=await ready();openEdit(h,1);upload(h,'A.png');await h.drain();cancel(h);openEdit(h,2);upload(h,'B.png');await h.drain();h.mutations[0].reject(Error('A error'));await h.drain();assert.equal(h.button('保存').props.disabled,true);assert.doesNotMatch(h.text(dialog(h)),/A error/);h.mutations[1].reject(Error('B error'));await h.drain();assert.match(h.text(dialog(h)),/B error/);assert.equal(h.button('保存').props.disabled,false);assert.equal(field(h,'图片 URL').props.value,'mock-local');
});
test('current upload failure remains visible after unrelated title editing and permits explicit retry',async()=>{
  const h=await ready();openEdit(h,1);upload(h);await h.drain();change(h,'标题','B title');h.mutations[0].reject(Error('current upload failed'));await h.drain();assert.match(h.text(dialog(h)),/current upload failed/);assert.equal(field(h,'标题').props.value,'B title');upload(h,'retry.png');await h.drain();h.mutations[1].resolve({storage_path:'media/retry.png'});await h.drain();assert.equal(field(h,'图片 URL').props.value,'media/retry.png');assert.doesNotMatch(h.text(dialog(h)),/current upload failed/);
});
test('current extraction failure survives unrelated edits and a later explicit extraction recovers',async()=>{
  const h=await ready();h.click('+ 导入参考');url(h,'A');h.click('提取图片');change(h,'标题','manual title','import');h.mutations[0].reject(Error('extract failed'));await h.drain();assert.match(h.text(dialog(h,'import')),/extract failed/);h.click('提取图片');h.mutations[1].resolve({images:['media/retry.png'],title:''});await h.drain();assert.equal(field(h,'标题','import').props.value,'manual title');assert.doesNotMatch(h.text(dialog(h,'import')),/extract failed/);
});
test('save handlers reject incomplete covers even when a retained callback bypasses the disabled button',async()=>{
  for(const kind of ['edit','import']){const h=await ready();if(kind==='edit')openEdit(h,1);else await preparedImport(h);const label=kind==='edit'?'保存':'确认导入',save=h.button(label).props.onClick;upload(h,'A.png',kind);await h.drain();const count=h.mutations.length;assert.equal(h.button(label).props.disabled,true);save();await h.drain();assert.equal(h.mutations.length,count);assert.match(h.text(dialog(h,kind)),/封面仍在上传/);h.mutations.at(-1).resolve({storage_path:'media/A.png'});await h.drain();assert.equal(h.button(label).props.disabled,false);}
});
test('pending extraction cannot be submitted until it completes or its URL intent is replaced',async()=>{
  const h=await ready();await preparedImport(h);const save=h.button('确认导入').props.onClick;h.click('提取图片');assert.equal(h.button('确认导入').props.disabled,true);save();await h.drain();assert.equal(h.mutations.length,2);assert.match(h.text(dialog(h,'import')),/文章仍在提取/);url(h,'B');assert.equal(h.button('确认导入').props.disabled,false);h.mutations[1].reject(Error('old extraction error'));await h.drain();assert.doesNotMatch(h.text(dialog(h,'import')),/old extraction error/);
});
test('input and session changes during reading prevent the old upload POST altogether',async()=>{
  for(const action of ['cancel','image','url','account','unmount']){const h=await ready();h.deferReading();openEdit(h,1);upload(h);assert.equal(h.mutations.length,0);if(action==='cancel')cancel(h);if(action==='image')change(h,'图片 URL','B');if(action==='url')change(h,'原文链接','B');if(action==='account')h.ownerChange();if(action==='unmount')h.unmount();h.readers[0].result='data:late';h.readers[0].onload();await h.drain();assert.equal(h.mutations.length,0,action);assert.equal(h.lateWrites,0,action);}
});
test('size type reader and empty-receipt failures keep the draft and report a local error',async()=>{
  for(const kind of ['size','type','reader','empty']){const h=await ready();openEdit(h,1);if(kind==='reader')h.deferReading();upload(h,'A.png','edit',kind==='size'?{oversize:true}:kind==='type'?{type:'text/plain'}:{});await h.drain();if(kind==='reader')h.readers[0].onerror();if(kind==='empty')h.mutations[0].resolve({storage_path:''});await h.drain();assert.match(h.text(dialog(h)),/too large|请选择图片|读取图片失败|未返回图片地址/);assert.equal(field(h,'图片 URL').props.value,'mock-local');assert.equal(h.button('保存').props.disabled,false);assert.equal(h.mutations.length,kind==='empty'?1:0);}
});
test('save success keeps edited same-session drafts including field ABA and reports their unsaved changes',async()=>{
  for(const kind of ['edit','import']){const h=await ready();if(kind==='edit')openEdit(h,1);else await preparedImport(h);const before=field(h,'标题',kind).props.value;h.click(kind==='edit'?'保存':'确认导入');change(h,'标题','B',kind);change(h,'标题',before,kind);h.mutations.at(-1).resolve(post(1));await h.drain();await finishReads(h);assert.ok(dialog(h,kind));assert.equal(field(h,'标题',kind).props.value,before);assert.match(h.text(dialog(h,kind)),/原稿已保存，当前修改尚未保存/);assert.equal(h.button(kind==='edit'?'保存':'已导入').props.disabled,kind==='import');}
});
test('old import create success and failure cannot close or overwrite a later import draft',async()=>{
  for(const fail of [false,true]){const h=await ready();await preparedImport(h);h.click('确认导入');cancel(h,'import');h.click('+ 导入参考');h.click('新建另一条导入');change(h,'标题','B title','import');const request=h.mutations.at(-1);if(fail)request.reject(Error('old create failed'));else request.resolve(post(1));await h.drain();await finishReads(h);assert.ok(dialog(h,'import'));assert.equal(field(h,'标题','import').props.value,'B title');assert.doesNotMatch(h.text(dialog(h,'import')),/old create failed/);}
});
test('an old edit save failure and finally cannot clear the next draft saving state',async()=>{
  const h=await ready();openEdit(h,1);h.click('保存');cancel(h);openEdit(h,2);change(h,'标题','B');h.click('保存');h.mutations[0].reject(Error('A failed'));await h.drain();assert.equal(h.button('保存中...').props.disabled,true);assert.equal(field(h,'标题').props.value,'B');assert.doesNotMatch(h.text(dialog(h)),/A failed/);h.mutations[1].reject(Error('B failed'));await h.drain();assert.equal(h.button('保存').props.disabled,false);assert.match(h.text(dialog(h)),/B failed/);
});
test('same-post reopened drafts reject old saves and current failures allow an explicit retry',async()=>{
  const h=await ready();openEdit(h,1);h.click('保存');cancel(h);openEdit(h,1);change(h,'标题','new same-post');h.mutations[0].resolve(post(1));await h.drain();await finishReads(h);assert.equal(field(h,'标题').props.value,'new same-post');h.click('保存');h.mutations[1].reject(Error('save failed'));await h.drain();assert.match(h.text(dialog(h)),/save failed/);assert.equal(h.mutations.length,2);h.click('保存');h.mutations[2].resolve(post(1));await h.drain();await finishReads(h);assert.equal(dialog(h),undefined);
});
test('retained field and close callbacks from a cancelled session cannot affect its replacement',async()=>{
  const h=await ready();openEdit(h,1);const oldChange=field(h,'标题').props.onChange,oldClose=h.nodes(dialog(h)).find(n=>n.type==='button'&&h.text(n)==='取消').props.onClick;cancel(h);openEdit(h,2);change(h,'标题','B');oldChange({target:{value:'A late'}});oldClose();h.flush();assert.equal(field(h,'标题').props.value,'B');
});
test('current drop events use the same upload owner and captured file while clearing only their input',async()=>{
  const h=await ready();openEdit(h,1);const drop=h.nodes(dialog(h)).find(n=>n.type==='button'&&n.props.onDrop);let prevented=false;drop.props.onDrop({preventDefault(){prevented=true;},dataTransfer:{files:[{name:'drop.png',type:'image/png',size:1}]}});await h.drain();assert.equal(prevented,true);assert.equal(h.mutations[0].args[0].file_name,'drop.png');h.mutations[0].resolve({storage_path:'media/drop.png'});await h.drain();assert.equal(field(h,'图片 URL').props.value,'media/drop.png');
});
test('account and guest transitions discard old dialogs and prevent late saves from refreshing the new list',async()=>{
  for(const action of ['ownerChange','guestChange']){const h=await ready();openEdit(h,1);h.click('保存');h[action]();assert.equal(dialog(h),undefined);h.loads[1].resolve([post(1),post(2)]);await h.drain();openEdit(h,2);change(h,'标题','new account draft');h.mutations[0].resolve(post(1));await h.drain();assert.equal(h.loads.length,2);assert.equal(field(h,'标题').props.value,'new account draft');}
});
test('same-account profile refresh and abandoned renders preserve the visible dialog upload',async()=>{
  const h=await ready();openEdit(h,1);upload(h);await h.drain();h.profileRefresh();h.discardedOwnerRender();h.mutations[0].resolve({storage_path:'media/current.png'});await h.drain();assert.equal(field(h,'图片 URL').props.value,'media/current.png');assert.equal(h.loads.length,1);
});
test('unmount ignores upload extraction and save completions without any late state writes or followup reads',async()=>{
  for(const kind of ['upload','extract','save']){const h=await ready();if(kind==='extract'){h.click('+ 导入参考');url(h,'A');h.click('提取图片');}else{openEdit(h,1);if(kind==='upload'){upload(h);await h.drain();}else h.click('保存');}h.unmount();h.mutations[0].resolve(kind==='upload'?{storage_path:'media/late.png'}:kind==='extract'?{images:['late'],title:'late'}:post(1));await h.drain();assert.equal(h.lateWrites,0,kind);assert.equal(h.loads.length,1,kind);}
});
test('Strict cleanup and setup retain an upload that still belongs to the same visible dialog',async()=>{
  const h=await ready();openEdit(h,1);upload(h);await h.drain();h.replay();h.mutations[0].resolve({storage_path:'media/current.png'});await h.drain();assert.equal(field(h,'图片 URL').props.value,'media/current.png');assert.equal(h.button('保存').props.disabled,false);assert.equal(h.lateWrites,0);h.loads[1].resolve([post(1),post(2)]);await h.drain();
});
