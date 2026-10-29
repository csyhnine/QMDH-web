import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";

type Entity = string | number | null;
type Feedback = { tone: "success" | "error"; message: string };
type Field = { path: string[]; baseline: unknown; version: number; dirty: boolean; conflict: boolean };
export type SettingsOperation<T> = {
  entity: Entity;
  capture: { values: T; versions: Map<string, number>; intent: number };
  promise: Promise<void>;
};
const clone = <T,>(value: T): T => value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T : value;
function leaves(value: unknown, path: string[] = []): { path: string[]; value: unknown }[] {
  return value && typeof value === "object"
    ? Object.entries(value).flatMap(([key, item]) => leaves(item, [...path, key])) : [{ path, value }];
}
function read(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => (current as Record<string, unknown> | undefined)?.[key], value);
}
function write<T>(value: T, [head, ...tail]: string[], next: unknown): T {
  if (head === undefined) return next as T;
  const current = value as Record<string, unknown> | undefined;
  return { ...current, [head]: write(current?.[head], tail, next) } as T;
}
const keyOf = (path: string[]) => JSON.stringify(path);

/** Mounted, account-local field tracking. Remote Bigjpg values always contain an empty key. */
export function useSettingsDraft<T extends object>(remote: T, source: unknown, remoteEntity: Entity = "platform", refresh?: () => Promise<void>) {
  const { currentUser, isGuest } = useAuth();
  const [, redraw] = useState(0);
  const scope = useMemo(() => ({ active: false, draft: clone(remote), remote: clone(remote), entity: remoteEntity,
    remoteEntity, expectedEntity: undefined as Entity | undefined, identityConflict: false, unconfirmedCreation: false,
    intent: 0, feedback: null as Feedback | null, operation: null as SettingsOperation<T> | null,
    fields: new Map(leaves(remote).map(({ path, value }) => [keyOf(path), { path, baseline: value, version: 0, dirty: false, conflict: false } as Field])),
  }), [currentUser?.id, currentUser?.name, isGuest]);
  const current = useRef(scope);
  const currentRefresh = useRef(refresh);
  const isCurrent = () => scope.active && current.current === scope;
  const dirty = () => [...scope.fields.values()].some((field) => field.dirty);
  function publish() { if (isCurrent()) redraw((value) => isCurrent() ? value + 1 : value); }
  useLayoutEffect(() => {
    current.current.active = false; current.current = scope; scope.active = true;
    return () => { scope.active = false; };
  }, [scope]);
  useLayoutEffect(() => { currentRefresh.current = refresh; }, [refresh]);
  useLayoutEffect(() => {
    scope.remote = clone(remote); scope.remoteEntity = remoteEntity;
    if (scope.expectedEntity !== undefined && remoteEntity === scope.expectedEntity) scope.expectedEntity = undefined;
    if (scope.entity !== remoteEntity) {
      if (scope.operation || dirty() || scope.unconfirmedCreation) {
        if (!scope.identityConflict) { scope.identityConflict = true; scope.intent += 1; publish(); }
        return;
      }
      scope.entity = remoteEntity;
    }
    let changed = scope.identityConflict;
    scope.identityConflict = false;
    const paths = new Map([...scope.fields].map(([key, field]) => [key, field.path]));
    for (const { path } of leaves(remote)) paths.set(keyOf(path), path);
    for (const [key, path] of paths) {
      const incoming = read(remote, path), local = read(scope.draft, path);
      let field = scope.fields.get(key);
      if (!field) { field = { path, baseline: incoming, version: 0, dirty: false, conflict: false }; scope.fields.set(key, field); }
      const conflict = field.dirty && !Object.is(incoming, local) && (field.conflict || !Object.is(incoming, field.baseline));
      if (conflict !== field.conflict) { field.conflict = conflict; changed = true; }
      field.baseline = incoming;
      if (!field.dirty && !Object.is(local, incoming)) { scope.draft = write(scope.draft, path, incoming); changed = true; }
    }
    if (changed) publish();
  }, [scope, source, remoteEntity]);

  function setField(path: string[], value: unknown) {
    if (!isCurrent()) return;
    const key = keyOf(path);
    const field = scope.fields.get(key) ?? { path, baseline: read(scope.remote, path), version: 0, dirty: false, conflict: false };
    field.version += 1; field.dirty = true; field.conflict = !Object.is(value, field.baseline) && field.conflict;
    scope.fields.set(key, field); scope.draft = write(scope.draft, path, value);
    scope.intent += 1; scope.feedback = null; publish();
  }
  function isOperationCurrent(operation: SettingsOperation<T>) {
    return isCurrent() && scope.operation === operation && !scope.identityConflict && scope.entity === operation.entity;
  }
  function report(operation: SettingsOperation<T>, feedback: Feedback, requireOriginalIntent = true) {
    if (!isOperationCurrent(operation) || (requireOriginalIntent && scope.intent !== operation.capture.intent)) return;
    scope.feedback = feedback; publish();
  }
  function confirm(operation: SettingsOperation<T>, saved: T, roots?: string[], newEntity?: Entity) {
    if (!isOperationCurrent(operation)) return false;
    if (newEntity !== undefined) { scope.entity = newEntity; scope.expectedEntity = newEntity; operation.entity = newEntity; }
    const paths = new Map([...scope.fields].map(([key, field]) => [key, field.path]));
    for (const { path } of leaves(saved)) paths.set(keyOf(path), path);
    for (const [key, path] of paths) {
      if (roots && !roots.includes(path[0])) continue;
      const value = read(saved, path), field = scope.fields.get(key);
      if (!field) continue;
      scope.remote = write(scope.remote, path, value);
      field.baseline = value; field.conflict = false;
      if (field.version === operation.capture.versions.get(key)) {
        scope.draft = write(scope.draft, path, value); field.dirty = false; field.conflict = false;
      }
    }
    publish(); return true;
  }
  function markUnconfirmedCreation(operation: SettingsOperation<T>) {
    if (isOperationCurrent(operation)) { scope.unconfirmedCreation = true; publish(); }
  }
  function loadRemote() {
    if (!isCurrent()) return;
    if ((scope.expectedEntity !== undefined && scope.remoteEntity !== scope.entity) || (scope.unconfirmedCreation && scope.remoteEntity === null)) {
      scope.feedback = { tone: "error", message: "配置已保存，请先刷新状态加载已保存配置。" }; publish(); return;
    }
    const paths = new Map([...scope.fields].map(([key, field]) => [key, field.path]));
    for (const { path } of leaves(scope.remote)) paths.set(keyOf(path), path);
    for (const [key, path] of paths) scope.fields.set(key, { path, baseline: read(scope.remote, path), version: (scope.fields.get(key)?.version ?? 0) + 1, dirty: false, conflict: false });
    scope.draft = clone(scope.remote); scope.entity = scope.remoteEntity; scope.expectedEntity = undefined;
    scope.identityConflict = false; scope.unconfirmedCreation = false; scope.feedback = null; scope.intent += 1; publish();
  }
  function run(work: (operation: SettingsOperation<T>) => Promise<void>): Promise<void> {
    if (!isCurrent()) return Promise.resolve();
    if (scope.operation) return scope.operation.promise;
    if (scope.identityConflict || scope.unconfirmedCreation) {
      scope.feedback = { tone: "error", message: "配置对象已变化或保存结果待确认，请先加载服务器配置。" }; publish(); return Promise.resolve();
    }
    const operation: SettingsOperation<T> = { entity: scope.entity,
      capture: { values: scope.draft, versions: new Map([...scope.fields].map(([key, field]) => [key, field.version])), intent: ++scope.intent }, promise: Promise.resolve() };
    scope.operation = operation; scope.feedback = null; publish();
    operation.promise = (async () => {
      try { await work(operation); }
      finally { if (scope.operation === operation) scope.operation = null; publish(); }
    })();
    return operation.promise;
  }
  return { values: scope.draft, entity: scope.entity, saving: Boolean(scope.operation), feedback: scope.feedback,
    hasChanges: dirty(), hasConflict: scope.identityConflict || scope.unconfirmedCreation || [...scope.fields.values()].some((field) => field.conflict),
    isCurrent, isOperationCurrent, setField, run, report, confirm, markUnconfirmedCreation, loadRemote,
    refreshAfter: async () => { if (isCurrent()) await currentRefresh.current?.(); },
  };
}
