import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function load(name) {
  const exports = {};
  const source = readFileSync(new URL(`../src/features/studio/${name}.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, require(path) {
    if (path === './studioConstants') return { normalizeStudioResolution: x => ['1k', '2k', '4k'].includes(x) ? x : '1k' };
    if (path === './studioUtils') return load('studioTemplateFormUtils');
    return load(path.slice(2));
  } });
  return exports;
}
const forms = load('studioTemplateFormUtils');
const binding = load('studioTemplateBindingUtils');
const template = { id: 7, media_type: 'video', title: 'Orbit', prompt: 'Slow camera orbit', style: 'cinematic', aspect_ratio: '16:9', resolution: '1k', deliverable: '', notes: '' };
const current = { creationMode: 'video', prompt: 'Old', activeTemplateId: null, requestedProvider: 'video-provider', grokVideoSku: '15s', resolution: '720p', aspectRatio: '9:16', referenceImages: ['ref.png'], promptPolished: true };

test('video apply preserves model, resolution, aspect, duration and references; binding follows edits', () => {
  const applied = forms.applyTemplateToForm(forms.toTemplateFormValue(template), current);
  for (const key of ['requestedProvider', 'grokVideoSku', 'resolution', 'aspectRatio', 'referenceImages']) assert.equal(applied[key], current[key]);
  assert.equal(applied.prompt, template.prompt);
  assert.equal(applied.promptPolished, false);
  const bound = { ...applied, activeTemplateId: 7 };
  assert.equal(binding.resolveBoundTemplateId(bound, [template]), 7);
  assert.equal(binding.resolveBoundTemplateId({ ...bound, prompt: 'Edited' }, [template]), undefined);
  assert.equal(binding.resolveBoundTemplateId({ ...bound, creationMode: 'generate' }, [template]), undefined);
  assert.equal(forms.applyTemplateToForm(forms.toTemplateFormValue({ ...template, media_type: 'image' }), current), current);
});

test('legacy image templates retain their image parameters; saved video templates retain type', () => {
  const legacy = { ...template, media_type: undefined, resolution: '4k' };
  const applied = forms.applyTemplateToForm(forms.toTemplateFormValue(legacy), { ...current, creationMode: 'generate' });
  assert.equal(applied.resolution, '4k');
  assert.equal(applied.aspectRatio, '16:9');
  const payload = load('customStudioTemplateUtils').buildCustomTemplatePayload({ draft: { label: 'Saved', title: 'Title', prompt: 'Prompt' }, studioForm: current, workspaceName: 'Test' });
  assert.equal(payload.media_type, 'video');
  assert.equal(payload.resolution, '720p');
});

test('video toolbar exposes template library while keeping image count hidden', () => {
  const exports = {};
  const source = readFileSync(new URL('../src/features/studio/StudioComposerToolbarMenus.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require(name) {
    if (name.startsWith('./')) return { default: () => name.slice(2) };
    return require(name);
  } });
  const html = renderToStaticMarkup(exports.default({ studioForm: current }));
  assert.match(html, /StudioComposerTemplateMenuSlot/);
  assert.doesNotMatch(html, /StudioComposerCountMenuSlot/);
});
