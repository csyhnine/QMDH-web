import type { CadExtractData, CadPlanPoint, CadPreparationInputs } from "../../api";

type Floor = NonNullable<NonNullable<CadExtractData["spaces"]>["floors"]>[number];
export type CadPreparationDraft = {
  baseVersion: string; calibration: CadPlanPoint[]; meters: string; kinds: Record<string, string>;
  routes: CadPreparationInputs["routes"]; draft: CadPlanPoint[]; routeWidth: string;
  mode: "scale" | "route" | "entry" | null; entry: CadPlanPoint | null; notices: string[];
  editingIndex: number | null; dirty: boolean;
};
const drafts = new Map<string, CadPreparationDraft>();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function preparationVersion(floor: Floor): string {
  const { current: _current, ...preparation } = floor.preparation ?? {};
  return JSON.stringify(canonical({ mask: (floor as Floor & { mask_file?: string }).mask_file, geometry: floor.geometry,
    scale: floor.square_meters_per_pixel, rooms: floor.rooms, preparation }));
}
export function preparationDraftKey(owner: string | undefined, extractId: string, floorIndex: number): string | null {
  return owner ? JSON.stringify([owner, extractId, floorIndex]) : null;
}
export function readPreparationDraft(key: string | null): CadPreparationDraft | undefined {
  const draft = key ? drafts.get(key) : undefined;
  return draft ? clone(draft) : undefined;
}
export function writePreparationDraft(key: string | null, draft: CadPreparationDraft): void {
  if (key) drafts.set(key, clone(draft));
}
export function discardPreparationDraft(key: string | null): void {
  if (key) drafts.delete(key);
}
export function clearCadPreparationDrafts(): void { drafts.clear(); }
