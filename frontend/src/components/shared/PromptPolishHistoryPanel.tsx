import {
  previewPromptPolishHistoryEntry,
  previewPromptText,
  type PromptPolishHistoryEntry,
} from "../../lib/promptPolishHistory";

type PromptPolishHistoryPanelProps = {
  history: PromptPolishHistoryEntry[];
  activeEntryId?: string | null;
  currentPrompt?: string;
  disabled?: boolean;
  className?: string;
  showWhenEmpty?: boolean;
  variant?: "inline" | "sidebar";
  onSelect: (entryId: string) => void;
  onRestoreSource?: (entryId: string) => void;
};

function resolvePreservedSourcePrompt(
  history: PromptPolishHistoryEntry[],
  activeEntryId: string | null | undefined,
  currentPrompt: string
): string {
  const activeEntry = history.find((entry) => entry.id === activeEntryId);
  if (activeEntry) {
    return activeEntry.sourcePrompt;
  }
  return currentPrompt.trim();
}

export default function PromptPolishHistoryPanel({
  history,
  activeEntryId = null,
  currentPrompt = "",
  disabled = false,
  className = "",
  showWhenEmpty = false,
  variant = "inline",
  onSelect,
  onRestoreSource,
}: PromptPolishHistoryPanelProps) {
  const isSidebar = variant === "sidebar";
  const preservedSource = resolvePreservedSourcePrompt(history, activeEntryId, currentPrompt);
  const activeEntry = history.find((entry) => entry.id === activeEntryId) ?? null;
  const canRestoreSource =
    Boolean(activeEntry) &&
    Boolean(onRestoreSource) &&
    currentPrompt.trim() !== activeEntry?.sourcePrompt.trim();

  if (isSidebar) {
    if (!showWhenEmpty && history.length === 0 && !preservedSource) {
      return null;
    }

    return (
      <aside
        className={`prompt-polish-sidebar ${history.length === 0 ? "is-empty" : ""} ${className}`.trim()}
        aria-label="润色记录"
      >
        <div className="prompt-polish-sidebar-source">
          <span className="prompt-polish-sidebar-heading">待润色原文</span>
          {preservedSource ? (
            <p className="prompt-polish-sidebar-source-body">{preservedSource}</p>
          ) : (
            <p className="prompt-polish-sidebar-empty">输入提示词后，原文会保留在这里</p>
          )}
          {canRestoreSource && activeEntry ? (
            <button
              type="button"
              className="prompt-polish-sidebar-restore"
              disabled={disabled}
              onClick={() => onRestoreSource?.(activeEntry.id)}
            >
              恢复原文到输入框
            </button>
          ) : null}
        </div>

        <div className="prompt-polish-sidebar-history">
          <span className="prompt-polish-sidebar-heading">润色记录</span>
          {history.length === 0 ? (
            <p className="prompt-polish-sidebar-empty">点击「润色」后，最近 5 条结果会显示在这里</p>
          ) : (
            <div className="prompt-polish-sidebar-list">
              {history.map((entry, index) => {
                const label = `#${history.length - index}`;
                const isActive = entry.id === activeEntryId;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={`prompt-polish-sidebar-item${isActive ? " is-active" : ""}`}
                    disabled={disabled}
                    title={entry.polishedPrompt}
                    onClick={() => onSelect(entry.id)}
                  >
                    <span className="prompt-polish-sidebar-item-label">{label}</span>
                    <span className="prompt-polish-sidebar-item-preview">
                      {previewPromptText(entry.polishedPrompt, 96)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    );
  }

  if (history.length === 0) {
    if (!showWhenEmpty) {
      return null;
    }
    return (
      <div className={`prompt-polish-history is-empty ${className}`.trim()} aria-label="润色记录">
        <span className="prompt-polish-history-label">润色记录</span>
        <span className="prompt-polish-history-empty">点击「润色」后，最近 5 条结果会显示在这里，可点击切换</span>
      </div>
    );
  }

  return (
    <div className={`prompt-polish-history ${className}`.trim()} aria-label="润色记录">
      <span className="prompt-polish-history-label">润色记录</span>
      <div className="prompt-polish-history-list">
        {history.map((entry, index) => {
          const label = `#${history.length - index}`;
          const preview = previewPromptPolishHistoryEntry(entry);
          const isActive = entry.id === activeEntryId;
          return (
            <button
              key={entry.id}
              type="button"
              className={`prompt-polish-history-item${isActive ? " is-active" : ""}`}
              disabled={disabled}
              title={entry.polishedPrompt}
              onClick={() => onSelect(entry.id)}
            >
              <span className="prompt-polish-history-item-label">{label}</span>
              <span className="prompt-polish-history-item-preview">{preview}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
