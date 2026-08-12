# Audit — 设计助手 Harness 厚度（2026-08）

Date: **2026-08-05**  
Scope: **只读审计**（对照 [Pi agent-core](https://github.com/earendil-works/pi) 薄 loop；不换底座、不引入 Pi 包）  
Local sample DB: `backend` SessionLocal（user=3 / conv=27；enabled providers=6；active Skills with MD=0）  
Code tip at audit: local `main`（功能底仓 `79f4814` + 文档 ahead 不影响本结论）

## 1. 一句话结论

对当前主 Chat 路径，**厚度浪费主要在 L3（每回合 always-on 的 tool hints + 全量 models_note）与 L5（memory 三工具强制常驻）**；L1 在本地默认很薄（~440 字），但 **Skill 正文最多 12k 灌 system 是潜伏炸弹**。不需要整仓换 Pi，优先削 always-on 冗余与修 hints 误排。

## 2. 现状地图（L1–L6）

```text
chat.py agent_mode
  → agent_harness_service
      → policy (L1) + memory (L2) + hints/models (L3) + history (L4)
      → run_studio_agent (L5 tools + PydanticAI retries=4)
      → record_chat_turn_memory
  → SSE / task_proposals (L6)
```

| 层 | 内容 | Always-on? | Admin 可关? | 上限 / 实测 | 弱模型风险 |
|---|---|---|---|---|---|
| **L1 system** | baseline + release template + group/user overlay + Skill 段 | baseline 是；Skill 有则灌 | release/override/Skill 停用 | baseline **390**；本地有效 system **442**；Skill 硬顶 **12_000** | Skill 全文灌入最伤；baseline 本身可接受 |
| **L2 memory** | 自动召回：长期≤6×500 + 会话摘要≤1000 + legacy turn≤2×220 | 有 `user_id` 即注入 | 无总开关（只能清空记忆） | 理论 ~4.6k；本地样本 **618**（1 hit + session） | 中：噪声偏好；但比错误 tool call 轻 |
| **L3 hints** | `rank_tools_for_query` → 文本清单（不改注册集） | allowlist 非空即注入 | 无 | 默认满榜 **409** 字 / 7 行 | **高**：与 tool schema 重复；中文误排可误导 |
| **L3 models** | `format_enabled_generation_models_note` 全量启用图/视频模型 | **每回合** | 无 | 本地 6 模型 **532** 字；随 N 线性涨 | **高**：寒暄也带；生产模型多时更胀 |
| **L4 history** | 近 10 轮×≤800 + 当前用户 | 是 | 无 | 理论 ~8k；本地 6 条历史消息体 ~565–589 | 中：靠截断，尚可 |
| **L5 tools** | catalog 12；默认 allowlist 7；memory 三件套 resolve 末尾强制补回 | 默认 7 常驻 schema | override `disabled_tool_keys`；release 勾选 | 注册数=allowlist；`retries=4` | **高**：工具面越大越易乱调 |
| **L6 输出** | 文本 + `task_proposals`；`create_*` → **`auto_submit`** 立即入队 | 写工具被调用时 | 可从 allowlist 去掉 create_* | — | 产品语义已非 HITL 确认卡 |

关键文件：

- [backend/app/services/agent_harness_service.py](../../backend/app/services/agent_harness_service.py)
- [backend/app/services/agent_policy_service.py](../../backend/app/services/agent_policy_service.py)
- [backend/app/services/agent_memory_service.py](../../backend/app/services/agent_memory_service.py)
- [backend/app/services/agent_tool_registry_service.py](../../backend/app/services/agent_tool_registry_service.py)
- [backend/app/services/agent_skill_install_service.py](../../backend/app/services/agent_skill_install_service.py)（`build_enabled_skills_prompt_section`）
- [backend/app/integrations/studio_agent/agent.py](../../backend/app/integrations/studio_agent/agent.py)
- [backend/app/integrations/studio_agent/tools.py](../../backend/app/integrations/studio_agent/tools.py)
- [backend/app/services/chat_agent_task_service.py](../../backend/app/services/chat_agent_task_service.py)（`auto_submit_chat_agent_proposal`）

## 3. 对照 Pi（只比薄 core，不比 CLI）

| Pi 实践 | QMDH 现状 | 审计判断 |
|---|---|---|
| 最小 loop + 可控 `transformContext` | harness 每回合固定拼 L2+L3 前缀 | L3 应可裁切 |
| Skills 渐进披露 | 目录 + **全文**灌 system（≤12k），`read_skill_resource` 仅作溢出 | 应默认索引优先 |
| 多 provider 一等公民 | Chat 侧统一 OpenAI 兼容；无 per-model harness 分支 | 换模型靠 Admin；厚度与品牌无关 |
| 不默认塞 plan/sub-agent | 单 agent `run_sync`，无 LangGraph | 已够薄，勿加厚 |
| beforeToolCall 门禁 | allowlist + write 校验 | 保留 |

**结论**：值得学 Pi 的是**减法与渐进加载**，不是换 TS 底座。

## 4. 三回合采样（本地组装 L1–L4；未打真实 LLM）

方法：用与 `run_chat_agent_harness` 相同的 policy / memory / hints / models_note / `build_chat_agent_message` 拼接；**不调用**上游模型。  
`baseline_expected_tools` 来自 baseline 文案意图；真实 `tool_calls` 需线上/带 Key 再采。

| 场景 | 用户句 | L1 | L2 | L3 hints keys | L3 models | L4 hist | system+user 约 | 意图工具 | hints 是否误排 |
|---|---|---|---|---|---|---|---|---|---|
| 寒暄 | 你好 | 442 | 618 | 默认 7 全列 | 532 | 565 | **2578** | 无 | 否（但是噪声） |
| 搜模板 | 帮我找一下建筑立面模板 | 442 | 618 | 默认 7 全列 | 532 | 574 | **2587** | `search_shared_templates` | 否（未收窄） |
| 生图 | 用 nano banana 画一张16:9的城市夜景 | 442 | 618 | **仅 `memory_forget`,`memory_store`** | 532 | 589 | 2310 | `create_image_generate_task` | **是** |

### 4.1 关键缺陷：hints 中文误排

`rank_tools_for_query` 按空白分词。生图句含「用 …」时，token「用」命中描述里的「**用户**」，把 **memory_store / memory_forget** 排到前面，且因有命中**不再回退**到 catalog 全序——**最需要 create_* 的回合，hints 反而只推记忆工具**。

旁路对比：`POST /studio-agent/assist` 无 L2/L3 前缀 → 与正式 harness 的厚度差主要来自 **L2+L3（本样本约 1.1k–1.5k 字/回合）**，不是 L1 baseline。

### 4.2 生产放大因子（未在本机复现数值）

- 启用 Skill 且 `skill_md` 非空 → L1 可逼近 **+12k**
- 启用模型数 ≫ 6 → L3 models 线性增长
- 长会话逼近 10×800 → L4 上升

## 5. Top 5 可砍项（优先级）

评分维度：弱模型收益 × 实现成本 × 产品风险（高收益低风险靠前）。

| # | 优先级 | 项 | 落点 | 零代码验证？ | 说明 |
|---|---|---|---|---|---|
| 1 | **P0** | **停用或重写 tool hints** | `agent_tool_registry_service.py` + `agent_harness_service.py` | 否（需小改）；可用临时注释验证 | 与 schema 重复；中文误排有害。建议默认关闭 hints，或仅在无命中时不输出、命中需含中文关键词表 |
| 2 | **P0** | **models_note 按需注入** | `agent_harness_service.py` / `format_enabled_generation_models_note` | 部分：弱模型组 override 难挡 L3 | 寒暄不必带全量模型；可仅当 allowlist 含 `create_*` 且 query 像生成意图时注入，或压缩为 `provider_name` 列表 |
| 3 | **P1** | **memory 三工具改为可选** | `agent_policy_service.py` 强制补回逻辑 | **是**：Admin `disabled_tool_keys` 禁用三者 | 自动 L2 已召回；弱模型易误调 `memory_store`。产品仍保留记忆能力与自动写入 |
| 4 | **P1** | **Skill 默认只注目录** | `build_enabled_skills_prompt_section` | **是**：停用/清空生产 Skill MD 可立刻变薄 | 正文走 `read_skill_resource`；对齐 Pi progressive Skills |
| 5 | **P2** | **按意图子集注册工具** | `agent.py` `_register_chat_tools` + harness | 否 | 真正 progressive registration；改动面大，放薄化二期 |

### 额外文档债（非厚度但审计必记）

- [docs/product-boundary.md](../product-boundary.md) 仍写「HITL 确认后」；代码路径 `auto_submit_chat_agent_proposal` 已**立即入队**，`confirm-agent-task` 为遗留 API。薄化波次应改文案，避免产品误解。

## 6. 明确勿动

- 计费 / `workflow + task` worker 管线
- `create_*` 入队语义（除非产品明确要恢复确认卡）
- 跨对话记忆**产品能力**与 `record_chat_turn_memory` 筛选策略本身
- 整包引入 `@earendil-works/pi-*` 或 merge `wip/agent-multi-chat-*`
- 算力/简历 KPI 专项（已取消）

## 7. 下一波「薄化」最小切片建议（需另批再写代码）

**切片 A（已落地 2026-08-05，未 push/部署）**

1. harness 默认不再注入 `format_tool_hints`（`tool_hint_count=0`）
2. `models_note`：仅当 allowlist 含 `create_*` 时注入；默认 `compact=True` 一行 provider_name 列表
3. `docs/product-boundary.md` HITL 表述改为「create_* 立即入队」

**切片 B（仍待批）**

1. resolve 不再强制追加 memory 三工具（仍允许 release 勾选）
2. Skill section 改为目录 + 截断提示，全文仅 `read_skill_resource`

**验收**：同三句（寒暄/模板/生图）对比 system+user 字符与 tool_calls；寒暄 0 tool；生图 hints 不得只推 memory_*。

## 8. 成功标准对照

| 标准 | 结果 |
|---|---|
| 一句话回答厚度浪费层 | **L3 always-on + L5 memory 常驻**（L1 Skill 为潜伏上限） |
| Top 5 可砍 + 文件落点 | §5 |
| 换品牌 vs 削厚度 | **削厚度**；不换 Pi |

---

*Audit only — no production deploy from this document.*
