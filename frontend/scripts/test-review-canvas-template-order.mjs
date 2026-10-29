import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

// Reuse the F43 fixture without registering or rerunning its test cases.
const fixtureUrl = new URL('./test-review-canvas-template-save.mjs', import.meta.url);
const fixture = readFileSync(fixtureUrl, 'utf8');
const firstTest = fixture.indexOf("test('a graph queued less than 700ms");
assert.ok(firstTest > 0, 'the existing fixture/test boundary must remain explicit');
const prefix = fixture.slice(0, firstTest)
  .replaceAll('import.meta.url', JSON.stringify(fixtureUrl.href))
  .replace("from 'typescript'", `from ${JSON.stringify(import.meta.resolve('typescript'))}`);
const {ready, world, graph, record, nodeId} = await import('data:text/javascript;base64,' +
  Buffer.from(prefix + '\nexport {ready,world,graph,record,nodeId};').toString('base64'));

test('an owner switch cannot send a second write to the same template before the accepted old write settles', async t => {
  const h = await ready(); t.after(() => h.unmount());
  const old = h.w.hold('patch', 1), latest = h.w.hold('patch', 1);
  h.queue(graph('owner-seven')); await h.tick();
  await h.switch(1, 8); h.queue(graph('owner-eight')); await h.tick();
  assert.equal(h.w.writes().length, 1, 'account switch does not end the old HTTP write');
  assert.equal(h.result.saving, true);
  assert.equal(h.result.recoveryDrafts.length, 0, 'another owner draft is never offered');
  old.resolve(); await h.flush();
  assert.equal(h.w.writes().length, 2);
  assert.equal(nodeId(h.w.records.get(1)), 'owner-seven');
  assert.equal(nodeId(h.result.template), 'owner-eight');
  assert.equal(h.result.saving, true);
  latest.resolve(); await h.flush();
  assert.equal(nodeId(h.w.records.get(1)), 'owner-eight');
  assert.equal(h.result.statusLabel, '已同步');
});

test('multiple graph edits coalesce to the latest immutable revision behind an in-flight write', async t => {
  const h = await ready(); t.after(() => h.unmount());
  const first = h.w.hold('patch', 1), last = h.w.hold('patch', 1);
  h.queue(graph('v1')); await h.tick();
  h.queue(graph('v2')); await h.tick(2000);
  const newest = graph('v3'); h.queue(newest); newest.nodes[0].id = 'external mutation'; await h.tick(2000);
  assert.equal(h.w.writes().length, 1);
  assert.equal(h.result.saving, true); assert.equal(h.result.hasUnsavedChanges, true);
  first.resolve(); await h.flush();
  assert.equal(h.w.writes().length, 2);
  assert.equal(h.w.writes()[1].payload.graph_json.nodes[0].id, 'v3');
  assert.equal(nodeId(h.w.records.get(1)), 'v1');
  assert.equal(nodeId(h.result.template), 'v3');
  assert.equal(h.result.saving, true); assert.notEqual(h.result.statusLabel, '已同步');
  last.resolve(); await h.flush();
  assert.equal(nodeId(h.w.records.get(1)), 'v3');
  assert.equal(h.result.saving, false); assert.equal(h.result.hasUnsavedChanges, false);
  assert.equal(h.w.saved.size, 0); assert.equal(h.w.writes().length, 2);
});

test('concurrent flush and leave callers all wait for the latest version without duplicate PATCH', async t => {
  const h = await ready(); t.after(() => h.unmount());
  const one = h.w.hold('patch', 1), two = h.w.hold('patch', 1); let completed = 0, exits = 0;
  h.queue(graph('v1')); await h.tick(); h.queue(graph('v2'));
  const waits = [h.result.flushSave(), h.result.flushSave(), h.result.leave(() => exits++)]
    .map(p => p.then(result => { completed++; return result; }));
  await h.flush(); assert.equal(h.w.writes().length, 1); assert.equal(completed, 0);
  one.resolve(); await h.flush(); assert.equal(h.w.writes().length, 2);
  assert.equal(completed, 0); assert.equal(exits, 0); assert.equal(h.result.saving, true);
  two.resolve(); await Promise.all(waits); await h.flush();
  assert.equal(completed, 3); assert.equal(exits, 1);
  assert.equal(h.w.writes().length, 2); assert.equal(nodeId(h.w.records.get(1)), 'v2');
});

test('different template ids continue saving independently while an old owner request is pending', async t => {
  const w = world(), a = await ready(w, 1, 7), b = await ready(w, 2, 8);
  t.after(() => { a.unmount(); b.unmount(); });
  const one = w.hold('patch', 1), two = w.hold('patch', 2);
  a.queue(graph('one')); await a.tick(); b.queue(graph('two')); await b.tick();
  assert.deepEqual(w.writes().map(row => row.id), [1, 2]);
  two.resolve(); await b.flush(); assert.equal(nodeId(w.records.get(2)), 'two');
  assert.equal(b.result.saving, false); assert.equal(a.result.saving, true);
  one.resolve(); await a.flush(); assert.equal(nodeId(w.records.get(1)), 'one');
});

test('an unknown old-owner outcome still blocks automatic writes after its rejected promise has been cleaned up', async t => {
  const h = await ready(); t.after(() => h.unmount());
  const old = h.w.hold('patch', 1); h.queue(graph('uncertain-seven')); await h.tick();
  await h.switch(1, 8); old.reject(Error('old transport disconnected')); await h.flush();
  h.queue(graph('latest-eight')); await h.tick();
  assert.equal(h.w.writes().length, 1, 'unknown is not proof the old server write ended');
  assert.equal(h.result.phase, 'uncertain');
  assert.equal(nodeId(h.result.template), 'latest-eight');
  assert.ok([...h.w.saved.values()].some(raw => JSON.parse(raw).ownerId === 8));
  await h.result.inspectServer(); await h.flush();
  assert.equal(h.w.writes().length, 1, 'read-only inspection never unlocks a write by itself');
  await h.result.confirmInspectedSave(); await h.flush();
  assert.equal(h.w.writes().length, 2); assert.equal(nodeId(h.w.records.get(1)), 'latest-eight');
});

test('a known rejection in the old owner never poisons a later safe write by another owner', async t => {
  const h = await ready(); t.after(() => h.unmount());
  const old = h.w.hold('patch', 1); h.queue(graph('rejected-seven')); await h.tick();
  await h.switch(1, 8); old.reject(Object.assign(Error('known rejected'), {status: 400})); await h.flush();
  h.queue(graph('safe-eight')); await h.tick();
  assert.equal(h.w.writes().length, 2); assert.equal(nodeId(h.w.records.get(1)), 'safe-eight');
  assert.equal(h.result.statusLabel, '已同步');
});

test('failure with several waiting callers retains only the newest graph and never drains it automatically', async t => {
  for (const status of [400, 409, 500]) {
    const h = await ready(); t.after(() => h.unmount());
    const first = h.w.hold('patch', 1); h.queue(graph('v1')); await h.tick();
    h.queue(graph('v2')); h.queue(graph('v3'));
    const outcomes = [h.result.flushSave(), h.result.flushSave()].map(p => p.then(() => 'resolved', () => 'rejected'));
    first.reject(Object.assign(Error(`reject-${status}`), {status}));
    assert.deepEqual(await Promise.all(outcomes), ['rejected', 'rejected']); await h.flush();
    await h.tick(10000); assert.equal(h.w.writes().length, 1);
    assert.equal(nodeId(h.result.template), 'v3'); assert.equal(h.result.hasUnsavedChanges, true);
    assert.equal(h.result.phase, status === 500 ? 'uncertain' : 'rejected');
    assert.ok([...h.w.saved.values()].some(raw => JSON.parse(raw).graph.nodes[0].id === 'v3'));
    assert.notEqual(h.result.statusLabel, '已同步');
  }
});

test('a waiting successor owner receives an unknown failure without replaying and can explicitly resolve its own draft', async t => {
  const h = await ready(); t.after(() => h.unmount());
  const old = h.w.hold('patch', 1); h.queue(graph('old-seven')); await h.tick();
  await h.switch(1, 8); h.queue(graph('new-eight')); await h.tick();
  assert.equal(h.w.writes().length, 1);
  old.reject(Error('original outcome unknown')); await h.flush();
  assert.equal(h.w.writes().length, 1); assert.equal(h.result.phase, 'uncertain');
  assert.equal(h.result.saving, false); assert.equal(nodeId(h.result.template), 'new-eight');
  const owners = [...h.w.saved.values()].map(raw => JSON.parse(raw).ownerId).sort();
  assert.deepEqual(owners, [7, 8], 'both owners keep their separate draft');
  await h.result.inspectServer(); await h.flush(); await h.result.confirmInspectedSave(); await h.flush();
  assert.equal(h.w.writes().length, 2); assert.equal(nodeId(h.w.records.get(1)), 'new-eight');
  assert.deepEqual([...h.w.saved.values()].map(raw => JSON.parse(raw).ownerId), [7]);
});

test('failed or obsolete inspection never clears the template unknown barrier', async t => {
  const h = await ready(); t.after(() => h.unmount());
  const old = h.w.hold('patch', 1); h.queue(graph('unknown-seven')); await h.tick();
  await h.switch(1, 8); old.reject(Error('disconnected')); await h.flush();
  h.queue(graph('eight-v1')); await h.tick();
  const bad = h.w.hold('get', 1), inspect = h.result.inspectServer(); bad.reject(Error('read failed'));
  await inspect; await h.flush(); await h.result.confirmInspectedSave(); await h.flush();
  assert.equal(h.w.writes().length, 1); assert.equal(h.result.inspection, null);
  const late = h.w.hold('get', 1), stale = h.result.inspectServer();
  h.queue(graph('eight-v2')); late.resolve(record(1)); await stale; await h.flush();
  assert.equal(h.result.inspection, null); await h.result.confirmInspectedSave(); await h.flush();
  assert.equal(h.w.writes().length, 1); assert.equal(nodeId(h.result.template), 'eight-v2');
  await h.result.inspectServer(); await h.flush(); await h.result.confirmInspectedSave(); await h.flush();
  assert.equal(nodeId(h.w.records.get(1)), 'eight-v2'); assert.equal(h.w.writes().length, 2);
});

test('an unknown template barrier neither blocks nor is cleared by writes to another template', async t => {
  const w = world(), a = await ready(w, 1, 7), b = await ready(w, 2, 8);
  t.after(() => { a.unmount(); b.unmount(); });
  const old = w.hold('patch', 1); a.queue(graph('unknown-one')); await a.tick();
  old.reject(Error('unknown')); await a.flush();
  b.queue(graph('safe-two')); await b.tick(); assert.equal(nodeId(w.records.get(2)), 'safe-two');
  await a.switch(1, 9); a.queue(graph('nine')); await a.tick();
  assert.deepEqual(w.writes().map(row => row.id), [1, 2]);
  assert.equal(a.result.phase, 'uncertain'); assert.equal(nodeId(a.result.template), 'nine');
  await a.result.inspectServer(); await a.flush(); await a.result.confirmInspectedSave(); await a.flush();
  assert.equal(nodeId(w.records.get(1)), 'nine');
});
