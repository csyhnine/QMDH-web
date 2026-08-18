import type { StudioComposerModeSwitchProps } from "./studioComposerExpandedContentTypes";

const MODES = [
  { mode: "generate" as const, title: "文生图", subtitle: "纯文字生成" },
  { mode: "edit" as const, title: "图生图", subtitle: "上传参考图编辑" },
  { mode: "video" as const, title: "视频生成", subtitle: "文生 / 图生视频" },
];

export default function StudioComposerModeSwitch({ creationMode, onModeChange }: StudioComposerModeSwitchProps) {
  return (
    <div className="composer-mode-switch" role="tablist" aria-label="创作模式">
      {MODES.map(({ mode, title, subtitle }) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={creationMode === mode}
          className={[
            "composer-mode-button",
            creationMode === mode ? "is-active" : "",
            creationMode === mode ? `is-active-${mode}` : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => onModeChange(mode)}
        >
          <span className="composer-mode-button-title">{title}</span>
          {creationMode === mode ? (
            <span className="composer-mode-button-sub">{subtitle}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
