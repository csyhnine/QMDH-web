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
    const target = resolve(dirname(file), name);
    if (target === resolve(sourceRoot, 'api')) return { api: {} };
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
