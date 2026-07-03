# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-07-03] Agent/Chat 多 Agent 留档 + 本地 WIP 索引 — **开新对话读这个**

- **完整留档**：**`docs/archive/handoff-2026-07-03-agent-multi-chat-wip.md`**（架构、文件表、migration、测试、未做项）
- **范围**：chat-004 B1、gov-001、B2、agent-multi-001/002/003、crawl C1/C2、ref-intent MVP — **全部本地 WIP，未 commit / 未部署**
- **生产**：仍为 v1.1.0 @ `0090a2a`；Agent 能力不在生产
- **生产热补丁三件套（2026-07-01，已上服务器，容器内 cp）**：
  1. `task_executor.py` — Haodeya **模型映射** + 2K `image_config` + 分档计价
  2. `bigjpg_upscale.py` — **放大图片**（CDN octet-stream → 按文件头存 png/jpg）
  3. `schemas.py` — 建号/重置密码最短 **4** 位（第三个容易忘）
  - 详 **`docs/archive/haodeya-image-model-routing-2026-07.md` §5**
  - **另**：`frontend/src/api.ts` 422 可读化也热补丁过，待分轨 commit
- **本地近期修复**：Chat 500（缺 `conversations.agent_thread_id`）；Meili 未跑不阻断 uvicorn；定价 `haodeya_pricing.py` 2026-07-03 合同（未部署）
- Safe to hand off: **Yes**（读留档即可；代码未提交）

### [2026-07-02] crawl-001 C2 + 后端启动修复 — 本地 DONE

- **C2**：`crawl_ingest_service`（域名 allowlist、`source_url` 去重）；`import_reference_page` tool；`POST /crawl/import` + Admin `import-batch`。
- **启动修复**：Meilisearch 未运行时不再阻断 uvicorn（`ensure_agent_memory_index` 降级为 warning）。
- **排查**：登录页 `Failed to fetch` = 前端 18080 正常但后端 18010 未监听；常见原因是后端窗口启动失败后退出。
- Safe to hand off: **Yes**

### [2026-07-01] agent-multi-003 HITL + checkpoint + Meili 记忆 — 本地 DONE，未部署

- **HITL**：graph `write_memory → await_hitl → post_hitl`；有 task_proposals 时 interrupt；`confirm-agent-task` → `resume_multi_agent_graph_after_task_confirm`。
- **Checkpoint**：Postgres `PostgresSaver`；SQLite 回退 `MemorySaver`。
- **Meilisearch**：`qmdh_agent_memory` 索引。
- Safe to hand off: **Yes**（细节见 `docs/archive/handoff-2026-07-03-agent-multi-chat-wip.md`）

---

<!-- 更早条目已归档：
  - crawl-001 C1 + ref-intent + gov-001c → handoff-2026-07-03-agent-multi-chat-wip.md
  - v1.1.0 生产 deploy → docs/archive/deploy-2026-06-29-v1.1.0-production.md
  - 图像 1K/2K → docs/archive/haodeya-image-model-routing-2026-07.md
-->
