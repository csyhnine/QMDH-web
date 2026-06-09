import type { StudioHistoryEmptyStateProps } from "./studioHistoryPaneTypes";

export default function StudioHistoryEmptyState({
  type,
  workspaceName,
}: StudioHistoryEmptyStateProps) {
  if (type === "filtered") {
    return (
      <section className="empty-stage empty-stage-inline empty-stage-filtered">
        <div className="empty-stage-copy">
          <p className="canvas-kicker">{"\u5f53\u524d\u7b5b\u9009"}</p>
          <h1>{"\u6ca1\u6709\u5339\u914d\u7684\u751f\u6210\u8bb0\u5f55"}</h1>
          <p>
            {"\u8c03\u6574\u65f6\u95f4\u3001\u6a21\u578b\u6216\u72b6\u6001\u7b5b\u9009\u540e\uff0c\u53ef\u4ee5\u7ee7\u7eed\u67e5\u770b\u8fd9\u4e2a\u4e2a\u4eba\u9879\u76ee\u91cc\u7684\u5386\u53f2\u4efb\u52a1\u3002"}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="empty-stage empty-stage-inline">
      <div className="empty-stage-copy">
        <p className="canvas-kicker">{"\u5f53\u524d\u4e2a\u4eba\u9879\u76ee"}</p>
        <h1>{`${workspaceName} \u8fd8\u6ca1\u6709\u751f\u6210\u8bb0\u5f55`}</h1>
        <p>
          {"\u5148\u4ece\u4e0b\u65b9\u8f93\u5165\u533a\u53d1\u8d77\u7b2c\u4e00\u8f6e\u751f\u6210\uff0c\u7ed3\u679c\u4f1a\u5728\u8fd9\u91cc\u6309\u65f6\u95f4\u6c89\u6dc0\u4e0b\u6765\u3002"}
        </p>
      </div>
    </section>
  );
}
