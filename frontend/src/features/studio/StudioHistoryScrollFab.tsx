type StudioHistoryScrollFabProps = {
  onScrollHistoryToBottom: () => void;
  onScrollHistoryToTop: () => void;
};

function ScrollArrowIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      className="studio-history-scroll-fab-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {direction === "up" ? (
        <path d="M12 7 7 14h10L12 7Z" fill="currentColor" />
      ) : (
        <path d="M12 17 7 10h10l-5 7Z" fill="currentColor" />
      )}
    </svg>
  );
}

export default function StudioHistoryScrollFab({
  onScrollHistoryToBottom,
  onScrollHistoryToTop,
}: StudioHistoryScrollFabProps) {
  return (
    <aside className="studio-history-scroll-fab" aria-label="历史列表滚动">
      <button
        type="button"
        className="studio-history-scroll-fab-button"
        aria-label="到最上方"
        title="到最上方"
        onClick={onScrollHistoryToTop}
      >
        <ScrollArrowIcon direction="up" />
      </button>
      <button
        type="button"
        className="studio-history-scroll-fab-button"
        aria-label="到最下方"
        title="到最下方"
        onClick={onScrollHistoryToBottom}
      >
        <ScrollArrowIcon direction="down" />
      </button>
    </aside>
  );
}
