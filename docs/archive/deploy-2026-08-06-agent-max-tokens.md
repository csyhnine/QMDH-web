# 生产部署记录 — 2026-08-06 chat-agent max_tokens 402 热修

Date: **2026-08-06**  
Production: `https://cityusbdisk.cn`  
Git tip：**`2e82e55`**  
Runtime：backend 热补丁 `STUDIO_AGENT_MAX_TOKENS=1024`  
Alembic：无变更

## 一句话

65536→4096 仍 402（上游 afford ~1047）；再降到 **1024** 已热补丁上线。

## 说明

OpenRouter 按 `max_tokens` 预扣。若业务侧「有钱」但仍报 afford 1047，多半是 **Chat 模型当前 Key 对应的网关子账户额度紧**，到 Admin 核对 `qwen3.8-max-preview` 实际 Key。

## 验收

设计助手新对话发「你好」，不应再出现 4096/65536 的 402。
