# Handoff — Haodeya GPT-Image-2-VIP 异步生图（WIP）

Date: **2026-07-03**  
Role: VIP 异步生图对接 Haodeya 网关  
Safe to hand off: **Yes（代码可读；生产未部署；真实联调待完成）**

---

## 一句话

在 Haodeya 网关（`newapi.haodeya.xyz`）上接入 **`gpt-image-2-vip` 异步生图**：POST 提交 → GET `/images/generations/{task_id}` 轮询 → `result.data[0].url` 取图。代码已写好、单测通过；**本地/生产 Studio 实测尚未完全绿灯**。

---

## 完整留档

**[`docs/archive/haodeya-gpt-image-vip-async-2026-07.md`](haodeya-gpt-image-vip-async-2026-07.md)**

---

## Repo 状态（交接时点）

| 项 | 状态 |
| --- | --- |
| 分支 | 本地 `main` 或当前工作分支（VIP 改动**未 commit**） |
| 生产 | **未部署** VIP 异步适配 |
| 改动文件 | `task_executor.py`, `provider_strategy.py`, `providers.py`, `haodeya_pricing.py`, `tests/test_task_executor_toapis_image.py` |

```bash
git status --short backend/app/services/task_executor.py \
  backend/app/services/provider_strategy.py \
  backend/app/routers/providers.py \
  backend/app/services/haodeya_pricing.py \
  backend/tests/test_task_executor_toapis_image.py
```

---

## 已完成

- 新策略 **`haodeya_async_image`**（原内部称 toapis，已改为 Haodeya 语义）
- POST body：`size`=画幅比例、`resolution`=1k/2k、2K 暂用 `gpt-image-2-vip`（不发 `-2k` 模型名）
- 轮询 URL：`{base_url}/images/generations/{task_id}`，**仅这一条路径**
- 取图：优先 `result.data[0].url`
- 参考图：`image_urls`（HTTPS 公网）
- 计费：`unit_price_1k=1.62`, `unit_price_2k=2.67`（与 GPT 合同价一致）
- 单测 6 passed：`pytest tests/test_task_executor_toapis_image.py`

---

## 未完成 / 接班人第一步

1. Admin 确认 Provider：`base_url=https://newapi.haodeya.xyz/v1`，`model_name=gpt-image-2-vip`
2. 本地 `start-dev.cmd`，Studio 跑 **1K + 2K** 各一张
3. 通过后：`git commit`（建议独立 commit message，勿混 Agent WIP）→ 部署 backend + worker → smoke
4. 等 Haodeya 修好 `-2k` SKU 后，改 `_resolve_haodeya_async_upstream_model` 恢复 2K 分模型名

---

## 与 Agent 多聊 WIP 的关系

- Agent 大块能力在 **`wip/agent-multi-chat-2026-07`**，**未上生产**
- VIP 生图与 Agent **分开** commit、分开部署
- 勿把 `task_executor.py` 的 VIP 改动与 Agent 分支混为一个 PR（冲突面大）

---

## 关键命令

```bash
# 单测
cd backend && python -m pytest tests/test_task_executor_toapis_image.py -q

# 本地 dev
cd .. && start-dev.cmd
# 后端 http://127.0.0.1:18010  前端 http://127.0.0.1:18080
```
