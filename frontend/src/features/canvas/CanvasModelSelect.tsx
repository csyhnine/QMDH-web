import type { Provider } from "../../api";
import type { GenerateNodeData } from "./canvasTypes";
import {
  groupProvidersForCanvas,
  patchFromProviderSelection,
  providerOptionLabel,
  type CanvasProviderGroupKey,
} from "./canvasProviderGroups";

type CanvasModelSelectProps = {
  value: string;
  providers: Provider[];
  data: GenerateNodeData;
  disabled?: boolean;
  onPatch: (patch: Partial<GenerateNodeData>) => void;
};

function isOptionDisabled(groupKey: CanvasProviderGroupKey, nodeKind: GenerateNodeData["nodeKind"]): boolean {
  if (nodeKind === "upscale") return groupKey !== "upscale";
  if (nodeKind === "video") return groupKey !== "video" && groupKey !== "image";
  if (nodeKind === "text2img" || nodeKind === "img2img") {
    return groupKey !== "image" && groupKey !== "video";
  }
  return false;
}

export default function CanvasModelSelect({
  value,
  providers,
  data,
  disabled = false,
  onPatch,
}: CanvasModelSelectProps) {
  if (data.nodeKind === "upload") return null;
  if (data.nodeKind === "annotate") return null;

  const groups = groupProvidersForCanvas(providers, data.nodeKind);
  const hasAny = groups.some((group) => group.providers.length > 0);
  const known = providers.some((provider) => provider.provider_name === value);

  return (
    <label className="qmdh-canvas-field">
      <span>模型</span>
      <select
        value={known ? value : ""}
        disabled={disabled || !hasAny}
        onChange={(event) => {
          const provider = providers.find((item) => item.provider_name === event.target.value);
          if (!provider) return;
          onPatch(patchFromProviderSelection(data, provider));
        }}
      >
        {!hasAny ? <option value="">暂无可用模型</option> : null}
        {hasAny && !known ? <option value="">请选择模型</option> : null}
        {groups.map((group) => (
          <optgroup key={group.key} label={group.label}>
            {group.providers.map((provider) => (
              <option
                key={provider.provider_name}
                value={provider.provider_name}
                disabled={isOptionDisabled(group.key, data.nodeKind)}
              >
                {providerOptionLabel(provider)}
                {group.key === "llm" ? "（对话，画布暂不可用）" : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
