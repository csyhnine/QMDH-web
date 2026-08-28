import { api, type GenerationOutcomePayload, type GenerationOutcomeType } from "../../api";

export function trackGenerationOutcome(
  taskId: number,
  outcomeType: GenerationOutcomeType,
  options?: { assetId?: number; metadata?: Record<string, unknown> }
) {
  const payload: GenerationOutcomePayload = {
    outcome_type: outcomeType,
    asset_id: options?.assetId,
    metadata: options?.metadata,
  };
  void api.recordGenerationOutcome(taskId, payload).catch(() => undefined);
}
