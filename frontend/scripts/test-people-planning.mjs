import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(name, overrides={}) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../src/pages/management/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:n=>overrides[n]??require(n)});
 return exports;
}
const plan=load('planning'), {changePeoplePlan:change}=load('staffPlanning',{'./planning':plan});
const staff=[{id:1,is_active:true},{id:2,is_active:true},{id:3,is_active:false}];
const original=()=>({...plan.newProject(1),id:8,version:17,name:'保留项目',notes:'保留备注',design_fee:null,stages:[{id:'a',name:'多人阶段',start:'2026-12-30',end:'2027-01-02',assignees:[1,3],allocation:50,progress:30,milestone:false,notes:'保留阶段说明'}]});
test('assigning staff preserves other participants, historical inactive members, versions and unrelated business fields',()=>{
 const p=original(),n=change(p,staff,{kind:'assign',stageId:'a',personId:2});
 assert.deepEqual(Array.from(n.stages[0].assignees),[1,3,2]); assert.equal(n.version,17);assert.equal(n.notes,p.notes);assert.equal(n.design_fee,null);assert.equal(n.stages[0].notes,p.stages[0].notes);assert.deepEqual(p,original());
 assert.equal(change(n,staff,{kind:'assign',stageId:'a',personId:2}).stages[0].assignees.length,3);
});
test('project management roles remain separate from timed assignments and preserve all other roles',()=>{
 const p=original();p.team.design_manager=[1];const n=change(p,staff,{kind:'role',role:'coordinator',personId:2});
 assert.deepEqual(Array.from(n.team.coordinator),[2]);assert.deepEqual(Array.from(n.team.design_manager),[1]);assert.deepEqual(n.stages,p.stages);
});
test('moving a shared stage across year keeps duration and other assignees; transfer merges duplicate target',()=>{
 const p=original();p.stages[0].assignees=[1,2];const n=change(p,staff,{kind:'move',stageId:'a',fromPerson:1,personId:2,offset:3});
 assert.equal(n.stages[0].start,'2027-01-02');assert.equal(n.stages[0].end,'2027-01-05');assert.deepEqual(Array.from(n.stages[0].assignees),[2]);assert.equal(n.stages[0].progress,30);
});
test('inactive staff cannot receive new work but may be removed; archived and stale-source moves fail',()=>{
 assert.throws(()=>change(original(),staff,{kind:'assign',stageId:'a',personId:3}),/在用/);
 assert.deepEqual(Array.from(change(original(),staff,{kind:'remove',stageId:'a',personId:3}).stages[0].assignees),[1]);
 assert.throws(()=>change({...original(),archived:true},staff,{kind:'dates',stageId:'a',start:'2027-01-01',end:'2027-01-01'}),/只读/);
 assert.throws(()=>change(original(),staff,{kind:'move',stageId:'a',fromPerson:9,personId:2,offset:0}),/已变化/);
});
test('dates validate calendar dates and inclusive ranges, and milestone stays on one day',()=>{
 assert.throws(()=>change(original(),staff,{kind:'dates',stageId:'a',start:'2027-02-30',end:'2027-03-03'}),/有效日期/);
 assert.throws(()=>change(original(),staff,{kind:'dates',stageId:'a',start:'2027-03-03',end:'2027-03-02'}),/结束日期/);
 const p=original();p.stages[0].milestone=true;const n=change(p,staff,{kind:'dates',stageId:'a',start:'2028-02-29',end:'2028-03-03'});assert.equal(n.stages[0].start,n.stages[0].end);
});
test('filtered-out projects still contribute to real overlap including fractional allocation',()=>{
 const p=original(), hidden={...original(),id:9};hidden.stages[0].allocation=60;
 const all=plan.ganttEntries([p,hidden],'2026-12-30',7);assert.equal(plan.staffLoads(all,1,7)[0],110);assert.equal(plan.staffLoads(plan.ganttEntries([p],'2026-12-30',7),1,7)[0],50);
});
