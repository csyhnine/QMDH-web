import type { Provider } from "../../api";

/** Old servers omit the contract and still require the original two-image graph. */
export function comfyReferenceCount(provider?: Provider): number {
  const count = provider?.reference_input_count;
  return count && Number.isInteger(count) && count >= 1 && count <= 4 ? count : 2;
}

/** New servers advertise verified variants; an explicit empty list disables submission. */
export function comfyReferenceCounts(provider?: Provider): number[] {
  const counts = provider?.reference_input_counts;
  return Array.isArray(counts)
    ? [...new Set(counts.filter((n) => Number.isInteger(n) && n >= 1 && n <= 4))].sort((a, b) => a - b)
    : [comfyReferenceCount(provider)];
}

export function comfyReferenceLimit(provider?: Provider): number {
  return Math.max(1, ...comfyReferenceCounts(provider));
}

export function comfyReferenceChoices(provider?: Provider): string {
  return comfyReferenceCounts(provider).join(" 或 ");
}
