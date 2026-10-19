import type { Provider } from "../../api";

/** Old servers omit the contract and still require the original two-image graph. */
export function comfyReferenceCount(provider?: Provider): number {
  const count = provider?.reference_input_count;
  return count === 1 ? 1 : 2;
}
