import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';
const copy=x=>JSON.parse(JSON.stringify(x));
const driverUrl=new URL('./test-review-feedback-send-drafts.mjs',import.meta.url),sessions=[],owners=[],readerGates=[];
let pauseFlush=false;
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function instrument(actual){return{...actual,FeedbackDraftSession:class extends actual.FeedbackDraftSession{constructor(...args){super(...args);sessions.push(this);}},FeedbackPreviewOwner:class extends actual.FeedbackPreviewOwner{constructor(...args){super(...args);owners.push(this);}}};}
let prefix=readFileSync(driverUrl,'utf8').split('\ntest(')[0].replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',JSON.stringify(driverUrl.href));
prefix=prefix.replace("imports['./feedbackDraftSession']=compile(src('feedbackDraftSession.ts'));","imports['./feedbackDraftSession']=instrument(compile(src('feedbackDraftSession.ts')));")
  .replace('if(mounted&&(dirty||errorQueue.length))flush();','if(!paused()&&mounted&&(dirty||errorQueue.length))flush();')
  .replace('this.result=`data:image/png;base64,${file.name}`;this.onload();','this.result=`data:image/png;base64,${file.name}`;const gate=nextReader();if(gate)gate.promise.then(()=>this.onload(),()=>this.onerror());else this.onload();');
const sandbox={assert,readFileSync,existsSync,vm,ts,URL,Error,Promise,queueMicrotask,instrument,paused:()=>pauseFlush,nextReader:()=>readerGates.shift()};
vm.runInNewContext(prefix+'\nglobalThis.driver={harness,record};',sandbox);
function harness(){const start=sessions.length,ownerStart=owners.length,h=sandbox.driver.harness();Object.defineProperty(h,'session',{get(){for(let i=sessions.length-1;i>=start;i--)if(sessions[i].active)return sessions[i];return sessions[start];}});Object.defineProperty(h,'owner',{get:()=>owners[ownerStart]});return h;}
async function settle(h){for(let i=0;i<4;i++)await h.drain();}
const cards=h=>h.nodes(h.main()).filter(n=>n.props?.className==='feedback-attachment-card');
const names=h=>Array.from(cards(h),card=>h.nodes(card).find(n=>n.type==='img').props.alt);

test('a later upload never restores a removed screenshot or its revoked preview',async()=>{
  const h=harness();await h.upload(['A.png']);const gate=h.hold('upload');await h.upload(['B.png']);h.remove(0);assert.deepEqual(copy(h.revoked),['blob:feedback-1']);gate.resolve({storage_path:'media/B.png'});await settle(h);assert.deepEqual(names(h),['B.png']);assert.equal(h.nodes(h.main()).some(n=>n.type==='img'&&n.props.src==='blob:feedback-1'),false);
});

test('independent uploads completed in reverse order are both kept in original selection order',async()=>{
  const h=harness(),a=h.hold('upload'),b=h.hold('upload');await h.upload(['A.png']);await h.upload(['B.png']);b.resolve({storage_path:'media/B.png'});await settle(h);a.resolve({storage_path:'media/A.png'});await settle(h);assert.deepEqual(names(h),['A.png','B.png']);assert.equal(h.requests.filter(r=>r.kind==='upload').length,2);assert.deepEqual(copy(h.revoked),[]);
});

test('serial batches and reversed multi-file batches keep their selection order in the sent payload',async()=>{
  const h=harness(),a1=h.hold('upload'),b=h.hold('upload'),a2=h.hold('upload');await h.upload(['A1.png','A2.png']);await h.upload(['B.png']);b.resolve({storage_path:'media/B.png'});await settle(h);a1.resolve({storage_path:'media/A1.png'});await settle(h);a2.resolve({storage_path:'media/A2.png'});await settle(h);assert.deepEqual(names(h),['A1.png','A2.png','B.png']);await h.upload(['C.png']);await settle(h);assert.deepEqual(names(h),['A1.png','A2.png','B.png','C.png']);h.title('B title');h.message('B body');await h.submit();await settle(h);assert.deepEqual(copy(h.requests.find(r=>r.kind==='main').payload),{title:'B title',message:'B body',attachment_paths:['media/A1.png','media/A2.png','media/B.png','media/C.png']});
});

test('pending reservations prevent a second selection from exceeding four screenshots',async()=>{
  const h=harness(),first=h.hold('upload');await h.upload(['A1.png','A2.png','A3.png','A4.png']);assert.equal(h.session.availableUploadSlots,0);await h.upload(['extra.png']);assert.equal(h.requests.filter(r=>r.kind==='upload').length,1);assert.match(h.error,/4/);first.resolve({storage_path:'media/A1.png'});await settle(h);assert.deepEqual(names(h),['A1.png','A2.png','A3.png','A4.png']);assert.equal(h.requests.filter(r=>r.kind==='upload').length,4);assert.equal(h.session.uploads.size,0);assert.equal(h.session.availableUploadSlots,0);
});

test('removing a completed item frees capacity while other reserved files remain pending',async()=>{
  const h=harness(),a1=h.hold('upload');await h.upload(['A1.png','A2.png']);const a2=h.hold('upload');a1.resolve({storage_path:'media/A1.png'});await settle(h);h.remove(0);assert.equal(h.session.availableUploadSlots,3);await h.upload(['B1.png','B2.png','B3.png']);await settle(h);assert.equal(h.session.availableUploadSlots,0);a2.resolve({storage_path:'media/A2.png'});await settle(h);assert.deepEqual(names(h),['A2.png','B1.png','B2.png','B3.png']);assert.deepEqual(copy(h.revoked),['blob:feedback-1']);
});

test('a later API failure preserves the successful portion and releases unstarted reservations',async()=>{
  const h=harness(),one=h.hold('upload'),two=h.hold('upload');await h.upload(['A.png','B.png','C.png']);one.resolve({storage_path:'media/A.png'});await settle(h);two.reject(Error('upload failed'));await settle(h);assert.deepEqual(names(h),['A.png']);assert.match(h.error,/已保留 1.*upload failed.*重新选择/);assert.equal(h.session.availableUploadSlots,3);assert.equal(h.session.uploads.size,0);assert.equal(h.requests.filter(r=>r.kind==='upload').length,2);assert.deepEqual(copy(h.revoked),[]);await h.upload(['B.png']);await settle(h);assert.deepEqual(names(h),['A.png','B.png']);assert.equal(h.requests.filter(r=>r.kind==='upload').length,3);
});

test('a later validation failure retains an earlier successful screenshot instead of leaking its preview',async()=>{
  const h=harness(),input={value:'selected',files:[{name:'A.png',type:'image/png',size:1},{name:'bad.png',type:'image/png',size:1,bad:true},{name:'C.png',type:'image/png',size:1}]};h.nodes(h.main()).find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:input});await settle(h);assert.equal(input.value,'');assert.deepEqual(names(h),['A.png']);assert.match(h.error,/已保留 1.*bad file/);assert.equal(h.requests.filter(r=>r.kind==='upload').length,1);assert.equal(h.session.availableUploadSlots,3);h.remove(0);assert.deepEqual(copy(h.revoked),['blob:feedback-1']);
});

test('reader failures preserve only completed files and release all unused capacity',async()=>{
  const h=harness(),first=deferred(),second=deferred();readerGates.push(first,second);await h.upload(['A.png','B.png']);first.resolve();await settle(h);second.reject(Error('read failed'));await settle(h);assert.deepEqual(names(h),['A.png']);assert.match(h.error,/已保留 1.*读取截图失败/);assert.equal(h.requests.filter(r=>r.kind==='upload').length,1);assert.equal(h.session.availableUploadSlots,3);assert.deepEqual(copy(h.revoked),[]);
});

test('an empty upload receipt creates no attachment or preview and never triggers an automatic retry',async()=>{
  const h=harness(),gate=h.hold('upload');await h.upload(['A.png']);gate.resolve({});await settle(h);assert.deepEqual(names(h),[]);assert.equal(h.created.length,0);assert.match(h.error,/有效截图路径/);assert.equal(h.requests.filter(r=>r.kind==='upload').length,1);assert.equal(h.session.availableUploadSlots,4);
});

test('draft reset discards the old batch while an independent new batch keeps its own busy state',async()=>{
  const h=harness(),old=h.hold('upload');await h.upload(['A1.png','A2.png']);h.session.resetDraft();h.flush();const current=h.hold('upload');await h.upload(['B.png']);old.resolve({storage_path:'media/A1.png'});await settle(h);assert.equal(h.session.uploads.size,1);assert.equal(h.created.length,0);current.resolve({storage_path:'media/B.png'});await settle(h);assert.deepEqual(names(h),['B.png']);assert.equal(h.requests.filter(r=>r.kind==='upload').length,2);assert.equal(h.session.uploads.size,0);
});

test('reset during file reading prevents even the first upload POST',async()=>{
  const h=harness(),read=deferred();readerGates.push(read);await h.upload(['A.png']);assert.equal(h.requests.length,0);h.session.resetDraft();h.flush();read.resolve();await settle(h);assert.equal(h.requests.length,0);assert.equal(h.created.length,0);assert.deepEqual(names(h),[]);assert.equal(h.session.availableUploadSlots,4);
});

test('a newly acquired preview survives a stale committed view but is freed if its model resets before commit',async t=>{
  const h=harness();pauseFlush=true;t.after(()=>{pauseFlush=false;});await h.upload(['A.png']);assert.equal(h.session.draft.attachments.length,1);assert.deepEqual(names(h),[]);h.owner.observe([],[]);assert.deepEqual(copy(h.revoked),[]);h.session.resetDraft();h.owner.observe([],[]);assert.deepEqual(copy(h.revoked),['blob:feedback-1']);pauseFlush=false;h.flush();assert.deepEqual(names(h),[]);assert.deepEqual(copy(h.revoked),['blob:feedback-1']);
});

test('an acquired but not yet committed preview is released on actual unmount',async t=>{
  const h=harness();pauseFlush=true;t.after(()=>{pauseFlush=false;});await h.upload(['A.png']);assert.equal(h.created.length,1);h.unmount();pauseFlush=false;await settle(h);assert.equal(h.lateWrites,0);assert.deepEqual(copy(h.revoked),['blob:feedback-1']);
});

test('unmount releases pending reservations and stops late upload and later files',async()=>{
  const h=harness(),gate=h.hold('upload');await h.upload(['A.png','B.png']);h.unmount();await settle(h);assert.equal(h.session.uploads.size,0);gate.resolve({storage_path:'media/A.png'});await settle(h);assert.equal(h.requests.filter(r=>r.kind==='upload').length,1);assert.equal(h.created.length,0);assert.equal(h.lateWrites,0);
});

test('account changes discard the old upload without clearing the new account draft or error',async()=>{
  const h=harness(),old=h.hold('upload');await h.upload(['A.png']);h.changeOwner();const current=h.hold('upload');await h.upload(['B.png']);h.title('new owner');h.message('new body');h.setExternalError('new feedback');old.reject(Error('old upload failure'));await settle(h);assert.equal(h.error,'new feedback');assert.equal(h.session.uploads.size,1);current.resolve({storage_path:'media/B.png'});await settle(h);assert.deepEqual(names(h),['B.png']);assert.equal(h.value(),'new body');assert.equal(h.error,'new feedback');assert.equal(h.created.length,1);
});

test('Strict effect replay does not cancel a still-owned pending upload',async()=>{
  const h=harness(),gate=h.hold('upload');await h.upload(['A.png']);h.replayEffects();await settle(h);assert.equal(h.session.uploads.size,1);gate.resolve({storage_path:'media/A.png'});await settle(h);assert.deepEqual(names(h),['A.png']);assert.deepEqual(copy(h.revoked),[]);
});

test('the current feedback list may own a removed preview while a later upload is merged',async()=>{
  const h=harness();await h.upload(['A.png']);h.setItems([{...sandbox.driver.record(1),messages:[{attachment_paths:['blob:feedback-1']}]}]);const gate=h.hold('upload');await h.upload(['B.png']);h.remove(0);assert.deepEqual(copy(h.revoked),[]);gate.resolve({storage_path:'media/B.png'});await settle(h);assert.deepEqual(names(h),['B.png']);assert.deepEqual(copy(h.revoked),[]);h.setItems([sandbox.driver.record(1)]);assert.deepEqual(copy(h.revoked),['blob:feedback-1']);
});

test('each stable slot accepts once and rejected preview acquisitions are disposed',()=>{
  const h=harness(),batch=h.session.reserveUploads(1),slot=batch.slots[0],item={fileName:'A.png',previewUrl:'blob:manual-A',storagePath:'media/A.png'};h.owner.adopt(item.previewUrl,()=>h.session.draft.attachments.some(row=>row.previewUrl===item.previewUrl));assert.equal(h.session.appendUpload(batch,slot,item),true);h.owner.adopt('blob:rejected',()=>false);assert.equal(h.session.appendUpload(batch,slot,{...item,previewUrl:'blob:rejected'}),false);h.owner.discard('blob:rejected');h.flush();assert.deepEqual(names(h),['A.png']);h.session.finishUpload(batch);assert.equal(h.session.appendUpload(batch,slot,item),false);h.remove(0);assert.deepEqual(copy(h.revoked),['blob:rejected','blob:manual-A']);assert.equal(h.session.availableUploadSlots,4);
});

test('a file handler retained from a sent draft appends to the new draft rather than restoring sent screenshots',async()=>{
  const h=harness();await h.upload(['A.png']);const change=h.nodes(h.main()).find(n=>n.type==='input'&&n.props.type==='file').props.onChange;h.title('A');h.message('A');await h.submit();await settle(h);assert.deepEqual(names(h),[]);change({target:{value:'B.png',files:[{name:'B.png',type:'image/png',size:1}]}});await settle(h);assert.deepEqual(names(h),['B.png']);assert.deepEqual(copy(h.revoked),['blob:feedback-1']);
});

test('upload completion preserves text edited during the request and never serializes local attachment identities',async()=>{
  const h=harness(),gate=h.hold('upload');await h.upload(['A.png']);h.title('title B');h.message('body B');gate.resolve({storage_path:'media/A.png'});await settle(h);assert.equal(h.value(),'body B');assert.equal(h.value('title'),'title B');assert.ok(h.session.draft.attachments[0].localId);await h.submit();await settle(h);assert.deepEqual(copy(h.requests.find(r=>r.kind==='main').payload),{title:'title B',message:'body B',attachment_paths:['media/A.png']});
});

test('oversized selections and non-image files are explicitly excluded under the same four-item contract',async()=>{
  const h=harness(),target={value:'selected',files:[{name:'text.txt',type:'text/plain',size:1},...Array.from({length:5},(_,i)=>({name:`A${i}.png`,type:'image/png',size:1}))]};h.nodes(h.main()).find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target});await settle(h);assert.equal(target.value,'');assert.deepEqual(names(h),['A0.png','A1.png','A2.png','A3.png']);assert.equal(h.requests.filter(r=>r.kind==='upload').length,4);assert.match(h.error,/仅支持.*4/);
});

test('the current file selection is cleared synchronously and no late finally clears a newer input',async()=>{
  const h=harness(),field={value:'A.png',files:[{name:'A.png',type:'image/png',size:1}]},input=h.nodes(h.main()).find(n=>n.type==='input'&&n.props.type==='file'),gate=h.hold('upload');input.props.ref.current=field;input.props.onChange({target:field});assert.equal(field.value,'');await settle(h);field.value='later selection';gate.resolve({storage_path:'media/A.png'});await settle(h);assert.equal(field.value,'later selection');
});

test('old remove callbacks and moved item indexes cannot remove a different current screenshot',async()=>{
  const h=harness();await h.upload(['A.png','B.png','C.png']);await settle(h);const oldRemove=h.nodes(cards(h)[0]).find(n=>n.type==='button').props.onClick;h.remove(0);oldRemove();h.flush();assert.deepEqual(names(h),['B.png','C.png']);const current=h.session.draft.attachments[0];assert.equal(h.session.removeAttachment({...current}),true);h.flush();assert.deepEqual(names(h),['C.png']);assert.deepEqual(copy(h.revoked),['blob:feedback-1','blob:feedback-2']);
});

test('a partial failure remains visible beside later form feedback after another batch succeeds',async()=>{
  const h=harness(),a1=h.hold('upload');await h.upload(['A1.png','A2.png']);const a2=h.hold('upload');a1.resolve({storage_path:'media/A1.png'});await settle(h);const b=h.hold('upload');await h.upload(['B.png']);h.title('new draft');h.message('new body');h.setExternalError('new form feedback');a2.reject(Error('A2 failed'));await settle(h);b.resolve({storage_path:'media/B.png'});await settle(h);assert.deepEqual(names(h),['A1.png','B.png']);assert.equal(h.error,'new form feedback');assert.ok(h.nodes(h.main()).some(n=>n.props?.role==='status'&&String(n.props.children).includes('A2 failed')&&String(n.props.children).includes('重新选择')));await h.upload(['A2.png']);await settle(h);assert.deepEqual(names(h),['A1.png','B.png','A2.png']);assert.equal(h.nodes(h.main()).some(n=>n.props?.role==='status'),false);
});
