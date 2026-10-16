import type { CadPreparationInputs } from "../../api";

export function mergeSuggestedRoutes(current: CadPreparationInputs["routes"], suggested: CadPreparationInputs["routes"]) {
  const manual = current.filter(route => route.origin !== "system");
  if (manual.length + suggested.length > 12) throw new Error("保留手画通路后超过 12 条，请先移除不需要的通路。");
  return [...manual, ...suggested.map(route => ({ ...route, origin: "system" as const }))];
}
