import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';

// Load actual F55 driver and helpers, never its test registrations.
const driverUrl=new URL('./test-review-inspiration-dialog-ownership.mjs',import.meta.url);
const source=readFileSync(driverUrl,'utf8'),ast=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const definitions=ast.statements.filter(n=>!ts.isImportDeclaration(n)&&!(ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='test')).map(n=>n.getText(ast)).join('\n').replaceAll(',import.meta.url)',','+JSON.stringify(driverUrl.href)+')');
const {ready,preparedImport,change,dialog,cancel,post,finishReads,field,url}=vm.runInNewContext(definitions+'\n;({ready,preparedImport,change,dialog,cancel,post,finishReads,field,url})',{assert,readFileSync,existsSync,vm,ts,URL,Error,Promise,JSON});
const creates=h=>h.mutations.filter(r=>r.name==='createInspiration');
const copy=x=>JSON.parse(JSON.stringify(x));
function accept(request,rows,id){rows.set(id,copy(request.args[0]));request.resolve({...post(id),...copy(request.args[0])});}
async function prepared(){const h=await ready();await preparedImport(h);return h;}

test('same-tick duplicate confirmations create only one request and one isolated row',async()=>{
  const h=await prepared(),confirm=h.button('确认导入').props.onClick,rows=new Map();confirm();confirm();h.flush();for(const [i,r] of creates(h).entries())accept(r,rows,201+i);await h.drain();await finishReads(h);assert.equal(creates(h).length,1);assert.equal(rows.size,1);
});
test('cancel and reopen a pending import resumes the same operation instead of creating another row',async()=>{
  const h=await prepared(),confirm=h.button('确认导入').props.onClick,rows=new Map();confirm();h.flush();cancel(h,'import');h.click('+ 导入参考');assert.equal(field(h,'标题','import').props.value,'extracted title');confirm();await h.drain();for(const [i,r] of creates(h).entries())accept(r,rows,201+i);await h.drain();await finishReads(h);assert.equal(creates(h).length,1);assert.equal(rows.size,1);assert.equal(h.mutations.filter(r=>r.name==='extractImages').length,1);
});
test('a lost response after acceptance does not unlock a second confirmation',async()=>{
  const h=await prepared(),confirm=h.button('确认导入').props.onClick,rows=new Map();confirm();rows.set(201,copy(creates(h)[0].args[0]));creates(h)[0].reject(Error('response lost'));await h.drain();confirm();await h.drain();assert.equal(creates(h).length,1);assert.equal(rows.size,1);assert.ok(h.nodes(dialog(h,'import')).some(n=>n.type==='button'&&n.props.disabled&&h.text(n).includes('待确认')));
});
test('a successful receipt stays accepted when reopened and cannot be posted a second time',async()=>{
  const h=await prepared(),confirm=h.button('确认导入').props.onClick,rows=new Map();confirm();accept(creates(h)[0],rows,201);await h.drain();await finishReads(h);assert.equal(dialog(h,'import'),undefined);h.click('+ 导入参考');assert.match(h.text(dialog(h,'import')),/#201/);assert.equal(h.button('已导入').props.disabled,true);confirm();await h.drain();assert.equal(creates(h).length,1);assert.equal(rows.size,1);
});
test('editing a pending import preserves the captured request and never creates a second record in the same intent',async()=>{
  const h=await prepared(),confirm=h.button('确认导入').props.onClick,rows=new Map();confirm();change(h,'标题','unsent B','import');confirm();assert.equal(creates(h).length,1);assert.equal(creates(h)[0].args[0].title,'extracted title');accept(creates(h)[0],rows,201);await h.drain();await finishReads(h);assert.equal(field(h,'标题','import').props.value,'unsent B');assert.equal(h.button('已导入').props.disabled,true);confirm();await h.drain();assert.equal(rows.size,1);assert.equal(creates(h).length,1);
});
test('definite HTTP rejections retain the draft and allow exactly one explicit retry',async()=>{
  for(const status of [400,401,403,404,405,413,415,422]){const h=await prepared(),rows=new Map();h.click('确认导入');creates(h)[0].reject(Object.assign(Error(`rejected ${status}`),{status}));await h.drain();assert.equal(field(h,'标题','import').props.value,'extracted title');assert.equal(h.button('确认导入').props.disabled,false);assert.match(h.text(dialog(h,'import')),new RegExp(`rejected ${status}`));assert.equal(creates(h).length,1);const confirm=h.button('确认导入').props.onClick;confirm();confirm();assert.equal(creates(h).length,2);accept(creates(h)[1],rows,202);await h.drain();await finishReads(h);assert.equal(rows.size,1);}
});
test('uncertain HTTP statuses transport errors and status-like messages remain locked',async()=>{
  for(const status of [undefined,408,429,500,502,503,'422',200,null]){const h=await prepared(),confirm=h.button('确认导入').props.onClick;confirm();const error=Object.assign(Error('请求失败（422）：response uncertain'),{status});creates(h)[0].reject(error);await h.drain();confirm();assert.equal(creates(h).length,1,String(status));assert.equal(h.button('结果待确认').props.disabled,true);}
});
test('malformed empty and unsafe success receipts are uncertain rather than permission to repeat a create',async()=>{
  for(const receipt of [undefined,null,{}, {id:0},{id:-1},{id:'201'},{id:1.5},{id:Number.MAX_SAFE_INTEGER+1}]){const h=await prepared(),confirm=h.button('确认导入').props.onClick;confirm();creates(h)[0].resolve(receipt);await h.drain();confirm();assert.equal(creates(h).length,1);assert.equal(h.button('结果待确认').props.disabled,true);}
});
test('unknown acceptance survives input ABA and cancel then reopen without discarding the draft',async()=>{
  const h=await prepared(),confirm=h.button('确认导入').props.onClick;confirm();creates(h)[0].reject(Error('lost'));await h.drain();change(h,'标题','B','import');change(h,'标题','extracted title','import');cancel(h,'import');h.click('+ 导入参考');assert.equal(field(h,'标题','import').props.value,'extracted title');assert.equal(h.button('结果待确认').props.disabled,true);confirm();assert.equal(creates(h).length,1);
});
test('an empty manual list check never proves that an uncertain import was not created',async()=>{
  const h=await prepared(),confirm=h.button('确认导入').props.onClick;confirm();creates(h)[0].reject(Error('lost'));await h.drain();h.click('刷新列表核对');h.loads[1].resolve([]);await h.drain();assert.equal(h.button('结果待确认').props.disabled,true);confirm();assert.equal(creates(h).length,1);assert.equal(h.loads.length,2);
});
test('list check failure and accepted list refresh failure never re-enable the create operation',async()=>{
  for(const accepted of [false,true]){const h=await prepared(),rows=new Map(),confirm=h.button('确认导入').props.onClick;confirm();if(accepted)accept(creates(h)[0],rows,201);else creates(h)[0].reject(Error('lost'));await h.drain();if(accepted)h.click('+ 导入参考');else h.click('刷新列表核对');h.loads[1].reject(Error('read failed'));await h.drain();assert.equal(h.button(accepted?'已导入':'结果待确认').props.disabled,true);confirm();assert.equal(creates(h).length,1);}
});
test('two explicit new import intents may create identical content as two independent rows',async()=>{
  const h=await prepared(),rows=new Map();h.click('确认导入');accept(creates(h)[0],rows,201);await h.drain();await finishReads(h);h.click('+ 导入参考');h.click('新建另一条导入');await preparedImport(h);h.click('确认导入');assert.equal(creates(h).length,2);assert.deepEqual(copy(creates(h)[0].args),copy(creates(h)[1].args));accept(creates(h)[1],rows,202);await h.drain();await finishReads(h);assert.equal(rows.size,2);
});
test('a new explicitly separate intent is permitted while an older accepted response was lost',async()=>{
  const h=await prepared(),rows=new Map();h.click('确认导入');rows.set(201,copy(creates(h)[0].args[0]));creates(h)[0].reject(Error('lost'));await h.drain();h.click('新建另一条导入');await preparedImport(h);h.click('确认导入');accept(creates(h)[1],rows,202);await h.drain();await finishReads(h);assert.equal(rows.size,2);assert.equal(creates(h).length,2);h.click('+ 导入参考');assert.match(h.text(dialog(h,'import')),/继续导入.*待确认/);
});
test('old success rejection or uncertainty cannot unlock a newer pending intent',async()=>{
  for(const outcome of ['accepted','rejected','unknown']){const h=await prepared(),rows=new Map();h.click('确认导入');cancel(h,'import');h.click('+ 导入参考');h.click('新建另一条导入');await preparedImport(h);change(h,'标题','B title','import');h.click('确认导入');if(outcome==='accepted')accept(creates(h)[0],rows,201);else creates(h)[0].reject(Object.assign(Error('A failed'),outcome==='rejected'?{status:422}:{}));await h.drain();assert.equal(field(h,'标题','import').props.value,'B title');assert.equal(h.button('导入中...').props.disabled,true);assert.equal(creates(h).length,2);accept(creates(h)[1],rows,202);await h.drain();await finishReads(h);assert.equal(rows.size,outcome==='accepted'?2:1);}
});
test('recovery buttons switch between unknown and pending intents without posting or changing their drafts',async()=>{
  const h=await prepared();change(h,'标题','A title','import');h.click('确认导入');creates(h)[0].reject(Error('lost'));await h.drain();h.click('新建另一条导入');await preparedImport(h);change(h,'标题','B title','import');h.click('确认导入');const recoverA=h.nodes(dialog(h,'import')).find(n=>n.type==='button'&&h.text(n).includes('A title')&&h.text(n).includes('待确认'));assert.ok(recoverA);recoverA.props.onClick();h.flush();assert.equal(field(h,'标题','import').props.value,'A title');assert.equal(h.button('结果待确认').props.disabled,true);const recoverB=h.nodes(dialog(h,'import')).find(n=>n.type==='button'&&h.text(n).includes('B title')&&h.text(n).includes('处理中'));recoverB.props.onClick();h.flush();assert.equal(field(h,'标题','import').props.value,'B title');assert.equal(h.button('导入中...').props.disabled,true);assert.equal(creates(h).length,2);creates(h)[1].reject({status:422});await h.drain();
});
test('reopening a definitely rejected operation keeps its payload available for an explicit corrected retry',async()=>{
  const h=await prepared(),rows=new Map();h.click('确认导入');creates(h)[0].reject(Object.assign(Error('invalid'),{status:422}));await h.drain();cancel(h,'import');h.click('+ 导入参考');assert.equal(field(h,'标题','import').props.value,'extracted title');change(h,'标题','corrected','import');h.click('确认导入');assert.equal(creates(h)[1].args[0].title,'corrected');accept(creates(h)[1],rows,202);await h.drain();await finishReads(h);assert.equal(rows.size,1);
});
test('media and field validation do not acquire a permanent create lock before a valid request exists',async()=>{
  const h=await ready();h.click('+ 导入参考');h.button('确认导入').props.onClick();await h.drain();assert.equal(creates(h).length,0);url(h,'A');h.click('提取图片');h.button('确认导入').props.onClick();await h.drain();assert.equal(creates(h).length,0);h.mutations[0].resolve({images:['media/A.png'],title:'A'});await h.drain();h.click('确认导入');assert.equal(creates(h).length,1);creates(h)[0].reject({status:422});await h.drain();
});
test('unmount and account changes reject retained create callbacks and ignore old result feedback',async()=>{
  for(const action of ['unmount','ownerChange']){const h=await prepared(),confirm=h.button('确认导入').props.onClick;confirm();h[action]();confirm();creates(h)[0].resolve(post(201));await h.drain();assert.equal(creates(h).length,1);assert.equal(h.lateWrites,0);if(action==='ownerChange'){h.loads[1].resolve([post(1),post(2)]);await h.drain();h.click('+ 导入参考');assert.equal(field(h,'标题','import').props.value,'');assert.doesNotMatch(h.text(dialog(h,'import')),/201/);}}
});
test('profile refresh and abandoned renders preserve the currently pending import mutex',async()=>{
  const h=await prepared(),confirm=h.button('确认导入').props.onClick;confirm();h.profileRefresh();h.discardedOwnerRender();confirm();assert.equal(creates(h).length,1);creates(h)[0].reject({status:422});await h.drain();assert.equal(h.button('确认导入').props.disabled,false);
});
test('Strict effect replay never creates a second import or releases the pending intent',async()=>{
  const h=await prepared(),confirm=h.button('确认导入').props.onClick;confirm();h.flush();h.replay();confirm();assert.equal(creates(h).length,1);assert.equal(h.button('导入中...').props.disabled,true);creates(h)[0].reject(Error('lost'));await h.drain();assert.equal(h.button('结果待确认').props.disabled,true);h.loads[1].resolve([post(1),post(2)]);await h.drain();assert.equal(h.lateWrites,0);
});
test('an accepted intent containing later edits keeps those fields when its recovery entry is selected',async()=>{
  const h=await prepared(),rows=new Map();h.click('确认导入');change(h,'标题','unsent B','import');accept(creates(h)[0],rows,201);await h.drain();await finishReads(h);h.click('新建另一条导入');const recover=h.nodes(dialog(h,'import')).find(n=>n.type==='button'&&h.text(n).includes('unsent B')&&h.text(n).includes('已创建'));recover.props.onClick();h.flush();assert.equal(field(h,'标题','import').props.value,'unsent B');assert.equal(h.button('已导入').props.disabled,true);assert.equal(creates(h).length,1);assert.equal(rows.size,1);
});
