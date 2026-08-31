import { useCallback, useEffect, useMemo, useState } from "react";

import {
  api,
  type GenerationAnalyticsOverview,
  type GenerationAnalyticsSessionRow,
  type TemplateQualityRow,
} from "../../api";
import {
  buildPlaybook,
  METRIC_GUIDES,
  QUALITY_CONTROL_STEPS,
} from "./generationAnalyticsGuide";

const OUTCOME_LABELS: Record<string, string> = {
  reused_as_reference: "置入参考",
  upscaled: "高清放大",
  bookmarked: "收藏",
  shared_to_inspiration: "分享灵感",
  applied_to_composer: "应用到创作区",
  regenerated: "重新生成",
  downloaded: "下载",
};

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatScore(value: number): string {
  return value.toFixed(3);
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

function outcomeSummary(totals: Record<string, number>): string {
  const entries = Object.entries(totals).filter(([, count]) => count > 0);
  if (entries.length === 0) return "—";
  return entries
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([key, count]) => `${OUTCOME_LABELS[key] || key} ${count}`)
    .join(" · ");
}

function templateHint(row: TemplateQualityRow): string {
  if (row.intent_count < 3) return "样本偏少，仅供参考";
  if (row.avg_explore_score >= 0.7 && row.avg_settle_score < 0.3) {
    return "调词频繁、采纳偏低，建议优化提示词";
  }
  if (row.avg_gacha_score >= 0.7 && row.avg_settle_score >= 0.4) {
    return "抽卡满意、采纳较好，可考虑置顶推荐";
  }
  if (row.avg_gacha_score >= 0.7) return "方向稳定，设计师在同 prompt 下反复抽卡";
  if (row.avg_explore_score >= 0.7) return "设计师在频繁改词，模板可能未贴合场景";
  return "—";
}

export default function GenerationAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<GenerationAnalyticsOverview | null>(null);
  const [sessions, setSessions] = useState<GenerationAnalyticsSessionRow[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [templates, setTemplates] = useState<TemplateQualityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [jobMessage, setJobMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextOverview, nextSessions, nextTemplates] = await Promise.all([
        api.generationAnalyticsOverview(days),
        api.generationAnalyticsSessions(days, 50, 0),
        api.generationAnalyticsTemplateQuality(days, 1),
      ]);
      setOverview(nextOverview);
      setSessions(nextSessions.items);
      setSessionTotal(nextSessions.total);
      setTemplates(nextTemplates.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载生成行为分析失败");
      setOverview(null);
      setSessions([]);
      setSessionTotal(0);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const outcomeEntries = useMemo(() => {
    if (!overview) return [];
    return Object.entries(overview.outcome_totals)
      .filter(([, count]) => count > 0)
      .sort((left, right) => right[1] - left[1]);
  }, [overview]);

  const playbook = useMemo(() => (overview ? buildPlaybook(overview) : []), [overview]);

  async function runMaintenance(action: "backfill" | "recompute") {
    setJobMessage("");
    setError("");
    try {
      const result =
        action === "backfill"
          ? await api.backfillGenerationIntents(1000)
          : await api.recomputeGenerationSessions();
      const summary = Object.entries(result.result)
        .map(([key, value]) => `${key}: ${value}`)
        .join(" · ");
      setJobMessage(summary || "已完成");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "运维任务执行失败");
    }
  }

  return (
    <section className="ops-dashboard generation-analytics-page">
      <header className="ops-dashboard-head">
        <div>
          <h1>生成行为分析</h1>
          <p>
            基于同参考图 + 30 分钟内连续提交，衡量设计师是在「同 prompt 抽卡」还是「频繁改词」，并结合收藏/放大/下载等采纳信号评估模板与出图质量。
            {overview ? (
              <>
                {" "}
                统计自{" "}
                {formatDateTime(overview.tracking_since)}
                {" "}
                埋点上线日起（Outcome / 下载 / 润色）；当前窗口自{" "}
                {formatDateTime(overview.window_started_at)}。
              </>
            ) : null}
          </p>
        </div>
        <div className="ops-toolbar">
          <div className="ops-segment">
            {[7, 30, 90].map((option) => (
              <button
                key={option}
                type="button"
                className={days === option ? "active" : ""}
                onClick={() => setDays(option)}
              >
                {option} 天
              </button>
            ))}
          </div>
          <button type="button" className="ops-icon-button" onClick={() => void refresh()} disabled={loading}>
            {loading ? "刷新中..." : "刷新"}
          </button>
        </div>
      </header>

      {error ? <div className="floating-error">{error}</div> : null}
      {jobMessage ? <div className="floating-notice success">{`运维任务完成：${jobMessage}`}</div> : null}

      {!overview && !loading ? (
        <div className="template-empty">暂无分析数据。可先补录历史 intent 并重算 session。</div>
      ) : null}

      {overview ? (
        <>
          <section className="ops-panel generation-analytics-guide">
            <div className="ops-panel-head">
              <h2>怎么读这些数</h2>
              <span>Session = 同一用户、同一参考图指纹、30 分钟内的一组提交</span>
            </div>
            <div className="generation-analytics-guide-grid">
              {METRIC_GUIDES.map((guide) => (
                <article key={guide.key} className="generation-analytics-guide-card">
                  <h3>{guide.title}</h3>
                  <p>{guide.meaning}</p>
                  <dl>
                    <div>
                      <dt>healthy</dt>
                      <dd>{guide.good}</dd>
                    </div>
                    <div>
                      <dt>需关注</dt>
                      <dd>{guide.bad}</dd>
                    </div>
                    <div>
                      <dt>怎么改</dt>
                      <dd>{guide.action}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section className="ops-panel generation-analytics-playbook">
            <div className="ops-panel-head">
              <h2>当前窗口建议（{days} 天）</h2>
              <span>根据 KPI 自动生成的运维/模板动作</span>
            </div>
            <div className="generation-analytics-playbook-list">
              {playbook.map((item) => (
                <article key={item.title} className="generation-analytics-playbook-item">
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
            <details className="generation-analytics-quality-steps">
              <summary>出图质量把控流程（运营 checklist）</summary>
              <ol>
                {QUALITY_CONTROL_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </details>
          </section>

          <div className="ops-kpi-grid">
            <article className="ops-kpi-card ops-kpi-blue">
              <div>
                <span>下载次数</span>
                <strong>{formatCount(overview.download_event_count)}</strong>
                <small>{`${formatCount(overview.downloaded_intent_count)} 次生成被下载`}</small>
              </div>
              <i>下</i>
            </article>
            <article className="ops-kpi-card ops-kpi-purple">
              <div>
                <span>下载率</span>
                <strong>{formatPercent(overview.download_rate)}</strong>
                <small>{`${formatCount(overview.downloaded_intent_count)} / ${formatCount(overview.intent_count)} 次生成触发下载`}</small>
              </div>
              <i>载</i>
            </article>
            <article className="ops-kpi-card ops-kpi-green">
              <div>
                <span>沉默采纳占比</span>
                <strong>{formatPercent(overview.download_settle_share)}</strong>
                <small>{`${formatCount(overview.download_only_settled_count)} 条 settled 仅来自下载（无收藏/放大等）`}</small>
              </div>
              <i>默</i>
            </article>
          </div>

          <div className="ops-kpi-grid">
            <article className="ops-kpi-card ops-kpi-blue">
              <div>
                <span>润色次数</span>
                <strong>{formatCount(overview.polish_event_count)}</strong>
                <small>{`${formatCount(overview.polish_unique_users)} 人使用 · Studio ${formatCount(overview.polish_studio_count)} / 画布 ${formatCount(overview.polish_canvas_count)}`}</small>
              </div>
              <i>润</i>
            </article>
            <article className="ops-kpi-card ops-kpi-purple">
              <div>
                <span>润色后提交率</span>
                <strong>{formatPercent(overview.polish_adoption_rate)}</strong>
                <small>{`${formatCount(overview.polished_intent_count)} / ${formatCount(overview.intent_count)} 次生成标记为润色后提交`}</small>
              </div>
              <i>采</i>
            </article>
            <article className="ops-kpi-card ops-kpi-green">
              <div>
                <span>润色后采纳率</span>
                <strong>{formatPercent(overview.polish_settle_rate)}</strong>
                <small>润色后提交且出现收藏/放大/下载等正向 outcome 的比例</small>
              </div>
              <i>效</i>
            </article>
          </div>

          <div className="ops-kpi-grid">
            <article className="ops-kpi-card ops-kpi-blue">
              <div>
                <span>提交 Intent</span>
                <strong>{formatCount(overview.intent_count)}</strong>
                <small>{`绑定模板 ${formatCount(overview.template_intent_count)} · 会话 ${formatCount(overview.session_count)}`}</small>
              </div>
              <i>提</i>
            </article>
            <article className="ops-kpi-card ops-kpi-purple">
              <div>
                <span>平均 Gacha</span>
                <strong>{formatPercent(overview.avg_gacha_score)}</strong>
                <small>{`高 Gacha 会话 ${formatCount(overview.high_gacha_sessions)}（≥70% 且提交≥2）`}</small>
              </div>
              <i>卡</i>
            </article>
            <article className="ops-kpi-card ops-kpi-orange">
              <div>
                <span>平均 Explore</span>
                <strong>{formatPercent(overview.avg_explore_score)}</strong>
                <small>{`高调词会话 ${formatCount(overview.high_explore_sessions)}（≥70% 且提交≥2）`}</small>
              </div>
              <i>词</i>
            </article>
            <article className="ops-kpi-card ops-kpi-green">
              <div>
                <span>平均 Settle</span>
                <strong>{formatPercent(overview.avg_settle_score)}</strong>
                <small>{`已 settled ${formatCount(overview.settled_intent_count)} 条 intent · ${formatCount(overview.settled_sessions)} 组会话有采纳`}</small>
              </div>
              <i>定</i>
            </article>
          </div>

          <div className="ops-dashboard-grid generation-analytics-grid">
            <section className="ops-panel">
              <div className="ops-panel-head">
                <h2>正向 Outcome 汇总</h2>
                <span>收藏、放大、置入参考、下载等采纳信号</span>
              </div>
              {outcomeEntries.length > 0 ? (
                <div className="ops-table-list">
                  {outcomeEntries.map(([key, count]) => (
                    <div key={key} className="ops-rank-row generation-analytics-outcome-row">
                      <span>{OUTCOME_LABELS[key] || key}</span>
                      <strong>{formatCount(count)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="template-empty">窗口内暂无 outcome 记录。</div>
              )}
            </section>

            <section className="ops-panel">
              <div className="ops-panel-head">
                <h2>数据运维</h2>
                <span>历史任务补录与 session 重算</span>
              </div>
              <div className="generation-analytics-maintenance">
                <button type="button" className="admin-primary-button" onClick={() => void runMaintenance("backfill")}>
                  补录历史 Intent（1000 条）
                </button>
                <button type="button" className="ghost-button" onClick={() => void runMaintenance("recompute")}>
                  重算全部 Session
                </button>
                <p>
                  「补录历史 Intent」仅用于补 Gacha/Explore 的 session 聚类；下载、润色、Settle 等采纳指标只统计埋点上线日（2026-08-28）之后的提交。修改 outcome 规则后请点「重算全部 Session」。
                </p>
              </div>
            </section>
          </div>

          <section className="admin-table-panel generation-analytics-table">
            <div className="ops-panel-head">
              <h2>模板质量排行</h2>
              <span>{`quality = 0.35×Gacha + 0.40×Settle + 0.15×完成率 + 0.10×(1−Explore) — 越高表示模板越易「少改词、多采纳」`}</span>
            </div>
            {templates.length > 0 ? (
              <>
                <div className="admin-table-head generation-analytics-template-head">
                  <span>模板</span>
                  <span>质量分</span>
                  <span>Gacha</span>
                  <span>Explore</span>
                  <span>Settle</span>
                  <span>提交</span>
                  <span>建议</span>
                </div>
                {templates.map((row) => (
                  <div key={row.template_id} className="admin-table-row generation-analytics-template-row">
                    <span>
                      <strong>{row.label || row.title}</strong>
                      <small>{row.category || "未分类"} · {row.title}</small>
                    </span>
                    <strong>{formatScore(row.quality_score)}</strong>
                    <span>{formatPercent(row.avg_gacha_score)}</span>
                    <span>{formatPercent(row.avg_explore_score)}</span>
                    <span>{formatPercent(row.avg_settle_score)}</span>
                    <span>{`${row.intent_count} / ${row.session_count} 会话`}</span>
                    <small>{templateHint(row)}</small>
                  </div>
                ))}
              </>
            ) : (
              <div className="admin-table-empty">窗口内没有绑定 template_id 的提交记录。</div>
            )}
          </section>

          <section className="admin-table-panel generation-analytics-table">
            <div className="ops-panel-head">
              <h2>最近行为会话</h2>
              <span>{`共 ${formatCount(sessionTotal)} 组 · 显示最近 50 组`}</span>
            </div>
            {sessions.length > 0 ? (
              <>
                <div className="admin-table-head generation-analytics-session-head">
                  <span>用户</span>
                  <span>时间</span>
                  <span>提交</span>
                  <span>Prompt 变体</span>
                  <span>Gacha</span>
                  <span>Explore</span>
                  <span>Settle</span>
                  <span>主导模板</span>
                  <span>Outcome</span>
                </div>
                {sessions.map((row) => (
                  <div key={row.id} className="admin-table-row generation-analytics-session-row">
                    <span>{row.user_name}</span>
                    <span>{formatDateTime(row.session_started_at)}</span>
                    <span>{formatCount(row.submit_count)}</span>
                    <span>{formatCount(row.prompt_variant_count)}</span>
                    <span>{formatPercent(row.gacha_score)}</span>
                    <span>{formatPercent(row.explore_score)}</span>
                    <span>{formatPercent(row.settle_score)}</span>
                    <span>{row.dominant_template_label || "—"}</span>
                    <small>{outcomeSummary(row.outcome_totals)}</small>
                  </div>
                ))}
              </>
            ) : (
              <div className="admin-table-empty">窗口内暂无 session。</div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
