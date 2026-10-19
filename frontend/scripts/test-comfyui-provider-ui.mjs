import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
const cache = new Map();
function load(relative) {
  const file = resolve(sourceRoot, relative);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, console, URL, URLSearchParams, require(name) {
    if (!name.startsWith('.')) return require(name);
    if (name.endsWith('.css')) return {};
    const target = resolve(dirname(file), name);
    if (target === resolve(sourceRoot, 'api')) return { api: {} };
    if (target === resolve(sourceRoot, 'context/AuthContext')) return { useAuth: () => ({ isGuest: false }) };
    const path = ['.ts', '.tsx', '/index.ts', '/index.tsx'].map(ext => target + ext).find(existsSync);
    if (!path) throw new Error(`Missing test module: ${name} from ${file}`);
    return load(path);
  } });
  return exports;
}

const image = {
  provider_name: 'comfyui-qwen-t2i', model_name: 'qwen_image_2_1_t2i', display_name: '本机 Qwen Image 2.1',
  adapter_kind: 'comfyui', capabilities: ['image.generate'], outbound: true, configurable: true,
  supported_resolutions: ['1k'],
};
const zImage = { ...image, provider_name: 'comfyui-z-image', model_name: 'z_image_turbo', display_name: '本机 Z Image Turbo' };
const video = { ...image, provider_name: 'video-only', model_name: 'video-model', display_name: 'Video', adapter_kind: 'volcengine_ark', capabilities: ['video.generate'] };
const chat = { ...image, provider_name: 'chat-only', adapter_kind: 'openai_compatible', capabilities: ['chat.completions'] };

test('ComfyUI controls stay inside the display menu and leave the three composer rows intact', () => {
  const source = ts.createSourceFile('expanded.tsx', readFileSync(resolve(sourceRoot,
    'features/studio/StudioComposerExpandedContent.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let root;
  function visit(node) {
    if (ts.isJsxFragment(node)) root = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  const children = root.children.filter(node => !ts.isJsxText(node) || node.text.trim());
  assert.deepEqual(children.map(node => node.openingElement?.tagName.getText(source) ?? node.tagName?.getText(source)),
    ['StudioComposerLeading', 'StudioComposerBody', 'input', 'StudioComposerToolbar']);
  const Panel = load('features/studio/StudioComposerDisplayMenuPanel.tsx').default;
  const { defaultStudioForm } = load('features/studio/studioConstants.ts');
  const props = { aspectRatioOptions: ['1:1', '16:9'], resolutionOptions: [], studioForm: defaultStudioForm,
    onAspectRatioSelect() {}, onResolutionSelect() {} };
  const render = selectedProvider => renderToStaticMarkup(require('react').createElement(Panel, { ...props, selectedProvider }));
  assert.match(render(image), /class="comfy-size-controls"/);
  assert.match(render(image), /class="composer-menu-note" role="status"/);
  assert.doesNotMatch(render(chat), /comfy-size-controls|role="status"/);
});

test('an image channel name containing a video gateway does not make it a video group', () => {
  const { providerGroupLabel } = load('features/studio/modelAdminUtils.ts');
  const imageChannel = { ...image, provider_name: 'haodeya-gpt-image', model_name: 'gpt-image', adapter_kind: 'openai_compatible' };
  assert.doesNotMatch(providerGroupLabel(imageChannel), /视频/);
  assert.equal(providerGroupLabel({ ...video, provider_name: 'haodeya-grok', adapter_kind: 'haodeya_grok' }), 'Grok 视频');
});

test('actual Studio derived menus put ComfyUI in images, not video or unimplemented editing', () => {
  const { deriveStudioViewState } = load('features/studio/studioDerivedState.ts');
  const { defaultStudioForm } = load('features/studio/studioConstants.ts');
  const providers = [image, zImage, video, chat];
  const derive = mode => deriveStudioViewState({ providers, projects: [], workflows: [], assets: [], tasks: [],
    studioForm: { ...defaultStudioForm, creationMode: mode, requestedProvider: image.provider_name },
    filters: { status: 'all', provider: 'all', sort: 'latest' } });
  const images = derive('generate');
  assert.deepEqual(Array.from(images.availableProviders, p => p.provider_name), [image.provider_name, zImage.provider_name]);
  assert.equal(images.providerGroups[0].label, '本机 ComfyUI');
  assert.equal(images.selectedProvider.provider_name, image.provider_name);
  assert.equal(images.selectedResolution.id, '1k');
  assert.deepEqual(Array.from(derive('video').availableProviders, p => p.provider_name), [video.provider_name]);
  assert.equal(derive('edit').availableProviders.length, 0);
});

test('ModelsPage renders ComfyUI image label and preserves an unknown adapter identity', () => {
  const ModelsPage = load('pages/admin/ModelsPage.tsx').default;
  const unknown = { ...image, provider_name: 'future-image', adapter_kind: 'future_image_adapter', display_name: 'Future image' };
  const profiles = [image, zImage, unknown].map((p, i) => ({ ...p, id: i + 60, enabled: true, base_url: 'http://comfy-visitor:8188',
    api_key: '', api_secret: '', masked_api_key: '', has_api_key: true, strategies: {}, adapter_config: {},
    quality: 'medium', output_format: 'png', timeout_seconds: 600, pricing_currency: 'CNY', pricing_unit: 'per_image',
    unit_price: 0, reference_mode: 'disabled', reference_caption_model: null }));
  const html = renderToStaticMarkup(ModelsPage ? require('react').createElement(ModelsPage, {
    providerProfiles: profiles, providers: [image, zImage], pricingRules: [], error: '', onRefresh() {}, onSetError() {},
  }) : null);
  const rows = html.split('class="admin-table-row"').map(row => row.split('</div>')[0]);
  for (const name of [image.provider_name, zImage.provider_name]) {
    const row = rows.find(row => row.includes(`<small>${name}</small>`));
    assert.ok(row, `Missing ${name} row`);
    assert.match(row, /ComfyUI 本机图片/);
    assert.doesNotMatch(row, /Haodeya 视频/);
  }
  const row = rows.find(row => row.includes('<small>future-image</small>'));
  assert.match(row, /future_image_adapter/);
  assert.doesNotMatch(row, /Haodeya 视频/);
});

test('local custom dimensions and resolution/count reach the actual submission payload', () => {
  const { buildTaskSubmissionPayload } = load('features/studio/studioTaskSubmissionActions.ts');
  const { defaultStudioForm } = load('features/studio/studioConstants.ts');
  const draft = buildTaskSubmissionPayload({ provider: image, form: { ...defaultStudioForm,
    prompt: 'fixture', projectCode: 'FIXTURE', aspectRatio: '1536x1024', resolution: '2k', imageCount: 3 } });
  assert.equal(draft.payload.payload.width, 1536);
  assert.equal(draft.payload.payload.height, 1024);
  assert.equal(draft.payload.payload.resolution, '2k');
  assert.equal(draft.payload.payload.image_count, 3);
});

test('selecting a resolution preset exits custom dimensions rather than silently ignoring the preset', () => {
  const { ratioForResolutionChange } = load('features/studio/studioConstants.ts');
  assert.equal(ratioForResolutionChange(image, '1536x1024'), '3:2');
  assert.equal(ratioForResolutionChange(image, '1024x1536'), '2:3');
  assert.equal(ratioForResolutionChange(image, '1392x1024'), '1:1');
  assert.equal(ratioForResolutionChange(image, '16:9'), '16:9');
});

test('local editing requires exactly two images before submission', () => {
  const { validateStudioTaskSubmission } = load('features/studio/studioTaskSubmissionValidation.ts');
  const { defaultStudioForm } = load('features/studio/studioConstants.ts');
  const edit = { ...image, capabilities: ['image.edit'] };
  for (const count of [0, 1, 2, 3]) {
    const result = validateStudioTaskSubmission({form: { ...defaultStudioForm, prompt: 'fixture', creationMode: 'edit',
      referenceImages: Array.from({length: count}, (_, i) => `/media/${i}.png`) },
      providerForSubmit: edit, setState() {}, uploadingReference: false });
    assert.equal(result.ok, count === 2);
  }
});

test('two-image editing describes the missing input and disables submission until ready', () => {
  const { composerReferenceHint, composerReferenceZoneLabel } = load('features/studio/studioComposerDockUtils.ts');
  const Submit = load('features/studio/StudioComposerSubmitActions.tsx').default;
  const edit = { ...image, capabilities: ['image.edit'] };
  assert.equal(composerReferenceZoneLabel('edit', edit), '双图编辑（必传 2 张）');
  assert.match(composerReferenceZoneLabel('edit', chat), /1–4/);
  for (const count of [0, 1, 2, 3]) {
    const html = renderToStaticMarkup(require('react').createElement(Submit, {creationMode: 'edit',
      availableProviderCount: 1, hasActiveProject: true, prompt: '修改衣服', referenceUploadCount: count,
      requiresTwoImages: true, submitting: false, uploadingReference: false, submissionProgress: null}));
    assert.equal(html.includes('disabled=""'), count !== 2);
    if (count === 1) {
      assert.match(html, /请补充第 2 张图/);
      assert.match(composerReferenceHint('edit', count, edit), /还需第 2 张参考图才能提交/);
    }
    if (count === 2) assert.match(html, /开始编辑/);
  }
});

test('v1.1 single-image contract updates hints, validation and submit without breaking legacy two-image defaults', () => {
  const provider = { ...image, capabilities: ['image.edit'], reference_input_count: 1 };
  const { validateStudioTaskSubmission } = load('features/studio/studioTaskSubmissionValidation.ts');
  const { composerReferenceHint, composerReferenceZoneLabel } = load('features/studio/studioComposerDockUtils.ts');
  const { defaultStudioForm } = load('features/studio/studioConstants.ts');
  const Submit = load('features/studio/StudioComposerSubmitActions.tsx').default;
  assert.equal(composerReferenceZoneLabel('edit', provider), '编辑原图（必传 1 张）');
  assert.match(composerReferenceHint('edit', 1, provider), /仅接收一张原图/);
  for (const count of [0, 1, 2]) {
    const result = validateStudioTaskSubmission({form: {...defaultStudioForm, creationMode:'edit', prompt:'fixture',
      referenceImages: Array.from({length:count}, (_,i)=>`/media/${i}.png`)}, providerForSubmit:provider,
      setState(){}, uploadingReference:false});
    assert.equal(result.ok, count === 1);
    const html = renderToStaticMarkup(require('react').createElement(Submit, {creationMode:'edit',
      requiredReferenceCount:1, referenceUploadCount:count, availableProviderCount:1, hasActiveProject:true,
      prompt:'fixture', submitting:false, uploadingReference:false, submissionProgress:null}));
    assert.equal(html.includes('disabled=""'), count !== 1);
  }
});

test('local waiting and recovery render truthful states without invented percent', () => {
  const Empty = load('features/studio/StudioFeedEmptyState.tsx').default;
  for (const [stage, label] of [['queued', '前方 2 项任务'], ['recovering', '请勿重复提交'], ['running', '本机正在生成']]) {
    const html = renderToStaticMarkup(require('react').createElement(Empty,
      {isRunning: true, status: 'pending', virtualProgress: 78, localStage: stage, queuePosition: 2}));
    assert.ok(html.includes(label)); assert.doesNotMatch(html, /78%/);
    assert.match(html, /role="progressbar"/);
    assert.doesNotMatch(html, /aria-valuenow/);
  }
});
