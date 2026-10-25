import { type Dispatch, type SetStateAction, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import type { DiscoveredModel, ProviderProfilePreviewRequestResult, ProviderProfileProbeResult, ProviderProfileRecord, ProviderPricingRuleRecord } from "../../api";
import type { DiscoveredModelAssignment, PricingRuleEditor, ProviderPricingRuleDraft, ProviderProfileDraft } from "./ModelsPage";

export type AdminOperation = { key: object | string; kind: string; intent: number; promise: Promise<void> };
type Callbacks = { onRefresh: (guard?: () => boolean) => void | Promise<void>; onSetError: Dispatch<SetStateAction<string>>; profiles: ProviderProfileRecord[]; rules: ProviderPricingRuleRecord[] };
type DiscoveryInputs = { baseUrl: string; apiKey: string };
const profileEditor = (id: number | null, draft: ProviderProfileDraft) => ({ id, draft: { ...draft }, revision: 0, enabledVersion: 0, notice: "" });
const ruleEditor = (value: PricingRuleEditor) => ({ value, revision: 0, notice: "" });
const previewState = () => ({ resolution: "2k", aspectRatio: "1:1", hasReference: false, result: null as ProviderProfilePreviewRequestResult | null });
const discovery = (input: DiscoveryInputs) => ({
  input, models: [] as DiscoveredModel[], assignments: {} as Record<string, DiscoveredModelAssignment>,
  selected: new Set<string>(), selectionVersion: 0, sourceBaseUrl: "", sourceKey: "", error: "",
  result: null as { created: string[]; skipped: string[] } | null, importKey: {},
});
const apply = <T,>(change: SetStateAction<T>, value: T): T => typeof change === "function" ? (change as (current: T) => T)(value) : change;

/** All identities and pending operations are page-local; none are API parameters. */
export function useModelAdminState(defaultProfile: ProviderProfileDraft, defaultRule: ProviderPricingRuleDraft, callbacks: Callbacks, initialBaseUrl: () => string) {
  const { currentUser, isGuest } = useAuth();
  const [, redraw] = useState(0);
  const scope = useMemo(() => {
    const inputs = { baseUrl: initialBaseUrl(), apiKey: "" };
    return { active: false, intent: 0, profile: profileEditor(null, defaultProfile), rule: ruleEditor({ draft: { ...defaultRule }, identity: null }),
      preview: previewState(), inputs, discovery: discovery(inputs), operations: new Map<object | string, AdminOperation>(),
      probeResults: {} as Record<number, ProviderProfileProbeResult> };
  }, [currentUser?.id, currentUser?.name, isGuest]);
  const currentScope = useRef(scope), currentCallbacks = useRef(callbacks);
  const isCurrent = () => scope.active && currentScope.current === scope;
  function publish() { if (isCurrent()) redraw((value) => isCurrent() ? value + 1 : value); }
  useLayoutEffect(() => {
    currentScope.current.active = false; currentScope.current = scope; scope.active = true;
    return () => { scope.active = false; };
  }, [scope]);
  useLayoutEffect(() => { currentCallbacks.current = callbacks; }, [callbacks.onRefresh, callbacks.onSetError, callbacks.profiles, callbacks.rules]);
  const profile = scope.profile, rule = scope.rule, preview = scope.preview, batch = scope.discovery;
  function touch() { if (isCurrent()) scope.intent += 1; }
  function clearPreview() { scope.preview = { ...scope.preview, result: null }; }
  function replaceProfile(id: number | null, draft: ProviderProfileDraft, user = true) {
    if (!isCurrent()) return;
    scope.profile = profileEditor(id, draft); clearPreview(); if (user) touch(); publish();
  }
  function setProviderDraft(change: SetStateAction<ProviderProfileDraft>) {
    if (!isCurrent() || scope.profile !== profile) return;
    const next = apply(change, profile.draft); if (next === profile.draft) return;
    if (next.enabled !== profile.draft.enabled) profile.enabledVersion += 1;
    profile.draft = next; profile.revision += 1; profile.notice = ""; clearPreview(); touch(); publish();
  }
  function setProviderEnabled(enabled: boolean) {
    if (!isCurrent() || scope.profile !== profile) return;
    profile.enabledVersion += 1; setProviderDraft((current) => ({ ...current, enabled }));
  }
  function replaceRule(value: PricingRuleEditor, user = true) {
    if (!isCurrent()) return;
    scope.rule = ruleEditor(value); if (user) touch(); publish();
  }
  function setPricingRuleEditor(change: SetStateAction<PricingRuleEditor>) {
    if (!isCurrent() || (typeof change === "function" && scope.rule !== rule)) return;
    const current = scope.rule, next = apply(change, current.value); if (next === current.value) return;
    if (typeof change !== "function" || next.identity !== current.value.identity || next.draft.providerProfileId !== current.value.draft.providerProfileId) {
      replaceRule(next); return;
    }
    current.value = next; current.revision += 1; current.notice = ""; touch(); publish();
  }
  function selectRuleProfile(providerProfileId: string) {
    if (!isCurrent() || scope.rule.value.draft.providerProfileId === providerProfileId) return;
    replaceRule({ draft: { ...defaultRule, providerProfileId }, identity: null });
  }
  function setPreview<K extends "resolution" | "aspectRatio" | "hasReference">(key: K, change: SetStateAction<(typeof preview)[K]>) {
    if (!isCurrent() || scope.profile !== profile) return;
    scope.preview = { ...scope.preview, [key]: apply(change, scope.preview[key]), result: null }; touch(); publish();
  }
  function setInputs(key: keyof DiscoveryInputs, value: string) {
    if (!isCurrent()) return;
    scope.inputs = { ...scope.inputs, [key]: value };
    if (scope.operations.get(scope.discovery)?.kind === "discover") scope.discovery = discovery(scope.inputs);
    touch(); publish();
  }
  function beginDiscovery() {
    if (!isCurrent()) return null;
    scope.discovery = discovery(scope.inputs); touch(); publish(); return scope.discovery;
  }
  function setBatch<K extends "models" | "assignments" | "selected" | "error" | "result">(key: K, change: SetStateAction<(typeof batch)[K]>, user = false) {
    if (!isCurrent() || scope.discovery !== batch) return;
    batch[key] = apply(change, batch[key]);
    if (user) { batch.selectionVersion += 1; touch(); }
    publish();
  }
  function report(message: string, intent = scope.intent, extra: () => boolean = () => true) {
    const allowed = () => isCurrent() && scope.intent === intent && extra();
    if (allowed()) currentCallbacks.current.onSetError((current) => allowed() ? message : current);
  }
  async function refreshAfter(operation: AdminOperation) {
    if (!isCurrent()) return;
    try { await currentCallbacks.current.onRefresh(() => isCurrent() && scope.intent === operation.intent); }
    catch { report("操作已完成，但列表刷新失败，请刷新列表查看。", operation.intent); }
  }
  async function refreshRecords() {
    if (!isCurrent()) return;
    touch(); const intent = scope.intent;
    try { await currentCallbacks.current.onRefresh(() => isCurrent() && scope.intent === intent); }
    catch { report("列表刷新失败，请重试。", intent); }
  }
  function runOperation(key: object | string, kind: string, work: (operation: AdminOperation) => Promise<void>): Promise<void> {
    if (!isCurrent()) return Promise.resolve();
    const existing = scope.operations.get(key); if (existing) return existing.promise;
    const operation: AdminOperation = { key, kind, intent: ++scope.intent, promise: Promise.resolve() };
    scope.operations.set(key, operation); publish();
    operation.promise = (async () => {
      try { await work(operation); }
      finally { if (scope.operations.get(key) === operation) scope.operations.delete(key); publish(); }
    })();
    return operation.promise;
  }
  const profileKey = (editor = profile) => editor.id === null ? editor : `profile:${editor.id}`;
  const ruleKey = (editor = rule) => editor.value.identity === null ? editor : `rule:${editor.value.identity.ruleId}`;
  return {
    scope, profileEditor: profile, ruleEditor: rule, previewOwner: preview, discoveryBatch: batch,
    records: () => ({ profiles: currentCallbacks.current.profiles, rules: currentCallbacks.current.rules }),
    isCurrent, publish, touch, report, refreshAfter, refreshRecords, runOperation, profileKey, ruleKey,
    replaceProfile, replaceRule, setProviderDraft, setProviderEnabled, setPricingRuleEditor, selectRuleProfile,
    providerDraft: profile.draft, editingProviderProfileId: profile.id, pricingRuleEditor: rule.value,
    profileNotice: profile.notice, ruleNotice: rule.notice,
    profileWriteBusy: scope.operations.has(profileKey()), savingProviderProfile: scope.operations.get(profileKey())?.kind === "profile.save",
    savingPricingRule: scope.operations.has(ruleKey()), isProfileBusy: (id: number) => scope.operations.has(`profile:${id}`),
    isRuleBusy: (id: number) => scope.operations.has(`rule:${id}`),
    isTogglingProfile: (id: number) => scope.operations.get(`profile:${id}`)?.kind === "profile.toggle",
    isProbingProfile: (id: number) => scope.operations.has(`probe:${id}`), probeResults: scope.probeResults,
    previewResult: preview.result, previewResolution: preview.resolution, previewAspectRatio: preview.aspectRatio, previewHasReference: preview.hasReference,
    previewLoading: scope.operations.has(preview), setPreviewResolution: (value: SetStateAction<string>) => setPreview("resolution", value),
    setPreviewAspectRatio: (value: SetStateAction<string>) => setPreview("aspectRatio", value), setPreviewHasReference: (value: SetStateAction<boolean>) => setPreview("hasReference", value),
    discoverBaseUrl: scope.inputs.baseUrl, discoverApiKey: scope.inputs.apiKey, setDiscoverBaseUrl: (value: string) => setInputs("baseUrl", value), setDiscoverApiKey: (value: string) => setInputs("apiKey", value),
    beginDiscovery, discoverLoading: scope.operations.get(batch)?.kind === "discover", importingModels: scope.operations.has(batch.importKey),
    discoveredModels: batch.models, discoveredAssignments: batch.assignments, selectedModelIds: batch.selected,
    discoverBaseUrlForImport: batch.sourceBaseUrl, discoverApiKeyForImport: batch.sourceKey, discoverError: batch.error, importResult: batch.result,
    setDiscoveredModels: (value: SetStateAction<DiscoveredModel[]>) => setBatch("models", value),
    setDiscoveredAssignments: (value: SetStateAction<Record<string, DiscoveredModelAssignment>>) => setBatch("assignments", value, true),
    setSelectedModelIds: (value: SetStateAction<Set<string>>) => setBatch("selected", value, true),
    setDiscoverError: (value: SetStateAction<string>) => setBatch("error", value),
    setImportResult: (value: SetStateAction<typeof batch.result>) => setBatch("result", value),
  };
}
