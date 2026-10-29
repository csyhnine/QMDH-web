import type { AuthUser } from "../../api";

type TaskRecord = { observed: boolean; blocked: boolean; assets: Set<number> };
export type RevealScope = { active: boolean; tasks: Map<number, TaskRecord> };
const scopes = new Map<string, RevealScope>();
export function clearStudioResultReveals() {
  for (const scope of scopes.values()) scope.active = false;
  scopes.clear();
}
export function studioResultRevealScope(user: AuthUser | null, guest: boolean): RevealScope | null {
  if (!user || guest) return null;
  const key = JSON.stringify([user.id, user.name, user.company_unit, user.group_name, user.role, [...user.project_codes].sort()]);
  let scope = scopes.get(key);
  if (!scope) {
    scope = { active: true, tasks: new Map() };
    scopes.set(key, scope);
    if (scopes.size > 8) { const oldest = scopes.keys().next().value!; scopes.get(oldest)!.active = false; scopes.delete(oldest); }
  }
  return scope;
}
export function observeResultTask(scope: RevealScope | null, id: number, status: string) {
  if (!scope?.active) return;
  let record = scope.tasks.get(id);
  if (!record) {
    record = { observed: false, blocked: false, assets: new Set() };
    scope.tasks.set(id, record);
    if (scope.tasks.size > 512) scope.tasks.delete(scope.tasks.keys().next().value!);
  }
  if (status === "pending" || status === "running") record.observed = true;
  else if (status !== "completed") record.blocked = true;
}
export function canRevealResult(scope: RevealScope | null, taskId: number, assetId: number, status: string) {
  const record = scope?.tasks.get(taskId);
  return Boolean(scope?.active && record?.observed && !record.blocked && status === "completed" && !record.assets.has(assetId) && record.assets.size < 64);
}
export function claimResultReveal(scope: RevealScope | null, taskId: number, assetId: number, status: string) {
  if (!canRevealResult(scope, taskId, assetId, status)) return false;
  scope!.tasks.get(taskId)!.assets.add(assetId);
  return true;
}
