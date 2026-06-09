const EXPAND_PROMPT_SUMMARY = "\u5c55\u5f00\u5b8c\u6574\u63d0\u793a\u8bcd";

type StudioFeedCardSummaryProps = {
  hasLongSummary: boolean;
  summary: string;
  summaryPreview: string;
};

export default function StudioFeedCardSummary({
  hasLongSummary,
  summary,
  summaryPreview,
}: StudioFeedCardSummaryProps) {
  return (
    <>
      <p className="feed-card-summary-preview">{summaryPreview}</p>
      {hasLongSummary ? (
        <details className="feed-card-summary-details">
          <summary>{EXPAND_PROMPT_SUMMARY}</summary>
          <p>{summary}</p>
        </details>
      ) : null}
    </>
  );
}
