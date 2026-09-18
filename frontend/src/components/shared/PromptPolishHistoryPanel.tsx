import {
  previewPromptPolishHistoryEntry,
  type PromptPolishHistoryEntry,
} from "../../lib/promptPolishHistory";

type PromptPolishHistoryPanelProps = {
  history: PromptPolishHistoryEntry[];
  activeEntryId?: string | null;
  disabled?: boolean;
  className?: string;
  showWhenEmpty?: boolean;
  onSelect: (entryId: string) => void;
};

export default function PromptPolishHistoryPanel({
  history,
  activeEntryId = null,
  disabled = false,
  className = "",
  showWhenEmpty = false,
  onSelect,
}: PromptPolishHistoryPanelProps) {
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
