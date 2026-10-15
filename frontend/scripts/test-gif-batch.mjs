import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { unzipSync } from 'fflate';
const require = createRequire(import.meta.url);
const exports = {};
const source = readFileSync(new URL('../src/pages/studio/gifToolBatch.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports, Uint8Array, Error, File, fetch, require(name) { return name.endsWith('/uploads') ? { MAX_REFERENCE_UPLOAD_BYTES: 20 * 1024 * 1024 } : require(name); } });
const { runGifBatch, validateGifBatch, createGifZip } = exports;
const result = { file_name: '../相同.gif', storage_path: '/media/result.gif', compression: {} };

test('batch validates file types, per-file size, count and aggregate size', () => {
  const file = { name: 'one.gif', type: 'image/gif', size: 1024 };
  assert.equal(validateGifBatch([file, file]), '');
  for (const files of [[{ ...file, name: 'bad.png', type: 'image/png' }], [{ ...file, size: 0 }], [{ ...file, size: 21 * 1024 * 1024 }], Array(21).fill(file), Array(6).fill({ ...file, size: 20 * 1024 * 1024 })]) assert.ok(validateGifBatch(files));
});

test('batch runs sequentially and preserves good results after an individual failure', async () => {
  let pending = 0, peak = 0;
  const updates = [];
  await runGifBatch([1, 2, 3], async id => {
    pending++; peak = Math.max(peak, pending);
    await Promise.resolve(); pending--;
    if (id === 2) throw new Error('bad GIF');
    return { ...result, file_name: `${id}.gif` };
  }, (index, job) => updates.push([index, job]), () => true);
  assert.equal(peak, 1);
  assert.equal(updates.filter(([, job]) => job.status === 'done').length, 2);
  assert.equal(updates.find(([index, job]) => index === 1 && job.status === 'error')[1].error, 'bad GIF');
});

test('leaving the page suppresses late results and prevents further uploads', async () => {
  let active = true, calls = 0;
  const updates = [];
  await runGifBatch([1, 2], async () => { calls++; active = false; return result; }, (_, job) => updates.push(job), () => active);
  assert.equal(calls, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, 'processing');
});

test('ZIP contains every output with safe distinct names and original bytes', async () => {
  const urls = [];
  const archive = await createGifZip([result, result], async (url, options) => {
    urls.push(url); assert.equal(options.credentials, 'include');
    return new Response(new Uint8Array([71, 73, 70]));
  });
  const files = unzipSync(archive);
  assert.equal(Object.keys(files).length, 2);
  for (const [name, bytes] of Object.entries(files)) {
    assert.equal(name.includes('/'), false);
    assert.deepEqual(Array.from(bytes), [71, 73, 70]);
  }
  assert.equal(urls.length, 2);
  await assert.rejects(createGifZip([result], async () => new Response('', { status: 500 })), /下载/);
});


test('copy restores adjustable parameters including original limits and disabled adaptation', () => {
  const saved = { ...result, compression: { target_bytes: 300000 }, parameters: { target_kb: 300, max_edge: 0, max_fps: 0, max_colors: 64, allow_resize: false, allow_frame_reduction: false } };
  const params = exports.gifParametersFromRecord(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(params)), saved.parameters);
  assert.equal(exports.gifParametersFromRecord({ ...saved, parameters: {} }).target_kb, 300);
  assert.equal(exports.gifParametersFromRecord({ ...saved, parameters: { max_edge: -1, max_fps: 'bad' } }).max_edge, 344);
});

test('copy reads original GIF, preserves filename and rejects missing or invalid source', async () => {
  const saved = { ...result, file_name: 'original.gif', original_storage_path: '/media/original.gif' };
  const file = await exports.restoreGifOriginal(saved, async (url, options) => {
    assert.equal(url, '/media/original.gif'); assert.equal(options.credentials, 'include');
    return new Response('GIF89a-original-bytes');
  });
  assert.equal(file.name, 'original.gif'); assert.equal(file.type, 'image/gif');
  assert.equal(await file.text(), 'GIF89a-original-bytes');
  await assert.rejects(exports.restoreGifOriginal(saved, async () => new Response('', { status: 404 })), /无法读取/);
  await assert.rejects(exports.restoreGifOriginal(saved, async () => new Response('<html>not GIF</html>')), /原始 GIF 无法读取/);
});
