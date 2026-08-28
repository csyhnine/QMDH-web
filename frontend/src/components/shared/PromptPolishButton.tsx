type PromptPolishButtonProps = {
  polishing?: boolean;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
};

export default function PromptPolishButton({
  polishing = false,
  disabled = false,
  className = "",
  onClick,
}: PromptPolishButtonProps) {
  return (
    <button
      type="button"
      className={`composer-polish-button ${className}`.trim()}
      disabled={disabled || polishing}
      onClick={onClick}
      title="使用 LLM 优化当前提示词（会参考已连接的上游图片）"
    >
      {polishing ? "润色中..." : "润色"}
    </button>
  );
}
