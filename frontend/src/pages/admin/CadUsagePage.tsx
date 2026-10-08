import { useEffect, useState } from "react";

import { api, type CadUsageSummary } from "../../api";
import { formatChinaMonthDayTime } from "../../lib/datetime";

const STATUS_LABELS: Record<string, string> = {
  ok: "已解析",
  needs_conversion: "需转 DXF",
  failed: "解析失败",
};

export default function CadUsagePage() {
  const [summary, setSummary] = useState<CadUsageSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .cadUsageSummary()
      .then((payload) => {
        if (!cancelled) setSummary(payload);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "无法加载图纸解析用量");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="ops-dashboard">
      <header className="ops-dashboard-head">
        <div>
          <h1>图纸解析</h1>
          <p>统计谁解析过图纸、成功还是失败。洁污、动静和层间的阈值仍写在代码里，这里还不能直接改规则，也还没有「这间分得对不对」的点击反馈。</p>
        </div>
      </header>
      {error ? <div className="floating-error">{error}</div> : null}
      {summary ? (
        <>
          <div className="cad-meta-grid">
            <div>
              <small>解析次数</small>
              <strong>{summary.total}</strong>
            </div>
            {Object.entries(summary.by_status).map(([status, count]) => (
              <div key={status}>
                <small>{STATUS_LABELS[status] ?? status}</small>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
          <div className="cad-layer-scroll">
            <table className="cad-layer-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>账号</th>
                  <th>文件</th>
                  <th>状态</th>
                  <th>平面</th>
                  <th>房间</th>
                </tr>
              </thead>
              <tbody>
                {summary.recent.map((item) => (
                  <tr key={item.extract_id}>
                    <td>{item.created_at ? formatChinaMonthDayTime(item.created_at) : "—"}</td>
                    <td>
                      {item.owner_name}
                      <small> · {item.owner_role}</small>
                    </td>
                    <td>{item.file_name}</td>
                    <td>{STATUS_LABELS[item.status] ?? item.status}</td>
                    <td>{item.floor_count}</td>
                    <td>{item.room_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
