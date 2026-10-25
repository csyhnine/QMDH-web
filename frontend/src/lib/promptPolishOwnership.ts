export type PromptPolishApplyOptions<T extends object> = { expected: T; isCurrent: () => boolean; polished: boolean };
const tokens = new WeakMap<object, object>();
const drafts = new WeakMap<object, { family: object; previousToken: object; applied: boolean }>();
function token(value: object): object {
  let result = tokens.get(value);
  if (!result) { result = {}; tokens.set(value, result); }
  return result;
}
export function promptDraftFamily(value: object): object { return drafts.get(value)?.family ?? token(value); }
export function inheritPromptDraft<T extends object>(previous: T, next: T, applied = false): T {
  if (next !== previous) drafts.set(next, { family: promptDraftFamily(previous), previousToken: token(previous), applied });
  return next;
}
export function isPromptPolishTransition(previous: unknown, next: unknown): boolean {
  if (!next || typeof next !== "object" || !previous || typeof previous !== "object") return false;
  const entry = drafts.get(next);
  return Boolean(entry?.applied && entry.previousToken === tokens.get(previous));
}
