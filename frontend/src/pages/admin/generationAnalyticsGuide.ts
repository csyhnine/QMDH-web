import type { GenerationAnalyticsOverview } from "../../api";

export type MetricGuide = {
  key: string;
  title: string;
  meaning: string;
  good: string;
  bad: string;
  action: string;
};

export const METRIC_GUIDES: MetricGuide[] = [
  {
    key: "gacha",
    title: "Gacha（抽卡率）",
    meaning:
      "同一会话里，相邻两次提交 prompt 完全相同的比例。设计师没改词、只是反复点生成，说明已认定方向，在赌模型随机性。",
    good: "适度偏高（40%–70%）通常表示 prompt 方向清晰，设计师在同一句描述上迭代出图。",
    bad: "长期接近 100% 且 Settle 很低：在同一句不太好的 prompt 上「盲抽」，浪费算力。",
    action: "复盘高 Gacha 会话的 dominant prompt，把有效表述沉淀进模板默认值；引导先用「润色」再抽卡。",
  },
  {
    key: "explore",
    title: "Explore（调词率）",
    meaning:
      "相邻提交之间 prompt 发生变化的比例。频繁改词说明设计师还在摸索怎么描述，尚未找到稳定表达。",
    good: "探索新场景时短期偏高正常；成熟模板应逐步下降。",
    bad: "持续 ≥50%：模板默认 prompt 与真实任务不匹配，或缺少场景化示例。",
    action: "查看「最近行为会话」里 Prompt 变体多的记录，拆分/新增模板，补充参考图与默认词。",
  },
  {
    key: "settle",
    title: "Settle（采纳率）",
    meaning:
      "会话内出现正向 outcome 的比例：收藏、高清放大、置入参考、应用到创作区、分享灵感、下载等。代表设计师认为「这张能用」。",
    good: "≥30% 说明产出可交付；模板质量分主要由此驱动。",
    bad: "接近 0%（如当前 0.1%）：大量生成但没有采纳信号，质量或方向可能有问题。",
    action: "对照 Outcome 汇总，看设计师实际用什么动作；若几乎无收藏/放大/下载，优先查模型、模板 prompt、参考图链路。",
  },
  {
    key: "download",
    title: "下载（沉默采纳）",
    meaning:
      "设计师下载生成图/视频但未收藏、放大等显式操作时，视为「沉默满意」信号，计入 Settle。download_settle_share 表示采纳里仅下载、无其他正向动作的比例。",
    good: "下载率稳步上升且 download_settle_share 较高：很多产出被直接取走使用，虽无显式表态但质量可用。",
    bad: "整体 Settle 低且 download_rate 也接近 0：生成后既无收藏/放大，也很少下载，可能产出不可用或下载入口不明显。",
    action: "对比「仅下载 settled」与显式 outcome；若前者占比较高，说明设计师习惯直接取图，可优化下载体验并继续观测 Settle。",
  },
];

export type PlaybookItem = {
  title: string;
  detail: string;
};

export function buildPlaybook(overview: GenerationAnalyticsOverview): PlaybookItem[] {
  const items: PlaybookItem[] = [];
  const gacha = overview.avg_gacha_score;
  const explore = overview.avg_explore_score;
  const settle = overview.avg_settle_score;
  const templateRate =
    overview.intent_count > 0 ? overview.template_intent_count / overview.intent_count : 0;

  if (settle < 0.15 && gacha >= 0.45) {
    items.push({
      title: "高抽卡、低采纳 — 方向可能对了，结果不够可用",
      detail:
        "设计师愿意重复同 prompt，说明大方向不算错，但很少收藏/放大/置入参考/下载。建议：优化模板默认词、开启提示词润色、检查模型与分辨率是否匹配场景，并抽样看失败/无效出图比例。",
    });
  }

  if (overview.downloaded_intent_count >= 3 && overview.download_settle_share >= 0.3) {
    items.push({
      title: "沉默采纳占比较高 — 设计师习惯直接下载",
      detail: `窗口内 ${Math.round(overview.download_rate * 100)}% 生成被下载，其中 ${Math.round(overview.download_settle_share * 100)}% 的 settled 仅来自下载（无收藏/放大等显式动作）。说明不少产出被直接取走使用，可继续观测 download_rate 趋势。`,
    });
  }

  if (overview.intent_count >= 50 && overview.download_rate < 0.02 && settle < 0.1) {
    items.push({
      title: "下载率极低 — 确认下载埋点或产出质量",
      detail:
        "大量生成但几乎无下载记录。若设计师实际有下载行为，请确认 Studio/画布下载埋点已上线；若确实无人下载，需结合 Gacha/Explore 排查出图是否可用。",
    });
  }

  if (explore >= 0.35) {
    items.push({
      title: "调词频繁 — 模板或初始 prompt 未贴合任务",
      detail:
        "Explore 偏高意味着设计师在反复改描述。建议：从「高调词会话」反推缺失的场景标签，拆分模板；对图生图节点强调参考图与改写句式。",
    });
  }

  if (templateRate < 0.1 && overview.intent_count >= 100) {
    items.push({
      title: "模板绑定率极低 — 质量排行暂无样本",
      detail: `当前仅 ${Math.round(templateRate * 100)}% 提交携带 template_id。请在 Studio/画布应用共享模板后再生成，或在补录 intent 后重算 session，才能评估「哪套模板更好用」。`,
    });
  }

  if (overview.outcome_totals.regenerated && overview.outcome_totals.regenerated > overview.settled_intent_count) {
    items.push({
      title: "重新生成多于正向采纳",
      detail: "设计师更多是在「再来一张」而非收藏/放大。可对比 regenerate 与 settled 的比例，评估是模型稳定性问题还是 prompt 粒度问题。",
    });
  }

  if (overview.polish_event_count > 0 && overview.polish_adoption_rate < 0.2) {
    items.push({
      title: "润色点击多、润色后提交少 — 可能只试不用",
      detail: `窗口内润色 ${overview.polish_event_count} 次，但仅 ${Math.round(overview.polish_adoption_rate * 100)}% 的生成标记为润色后提交。建议检查润色结果是否满意、按钮位置是否够显眼，或在模板/教程中强调「润色 → 生成」流程。`,
    });
  }

  if (overview.polished_intent_count >= 5 && overview.polish_settle_rate < overview.avg_settle_score) {
    items.push({
      title: "润色后采纳率低于整体 — 润色质量待优化",
      detail: "润色后提交的 Settle 低于平均水平，可能是 LLM 润色模型或 system prompt 需调整，或润色结果过于冗长/偏离参考图。",
    });
  }

  if (items.length === 0) {
    items.push({
      title: "持续观测即可",
      detail:
        "当前指标未触发典型告警模式。建议每周固定查看：高 Gacha 会话、高调词会话、模板质量分 Top/Bottom，并结合 Outcome 做模板迭代。",
    });
  }

  return items;
}

export const QUALITY_CONTROL_STEPS = [
  "每周打开本页，选 30 天窗口，先看 Settle 与 Outcome 汇总是否上升。",
  "查看「下载次数 / 下载率 / 沉默采纳占比」：下载是显式收藏/放大之外的采纳信号，仅下载 settled 说明设计师直接取图使用。",
  "查看「润色次数 / 润色后提交率」：提交率 = 润色后立刻生成的比例，过低说明功能曝光或体验有问题。",
  "对比润色后采纳率与整体 Settle：若润色后采纳明显更高，说明功能有效，应加大引导。",
  "模板质量排行：quality ≥ 0.55 且样本 ≥ 3 的模板可置顶推荐；Explore 高且 Settle 低的模板需改默认 prompt。",
  "抽「高 Gacha + 低 Settle」会话，复制 dominant prompt 做润色/模板 A/B。",
  "新模板上线后要求设计师从模板入口进入（绑定 template_id），2 周后再看质量分。",
  "Outcome 长期为 0 时，先确认埋点（收藏、放大、置入参考、下载）在生产可用，再解读行为分。",
];
