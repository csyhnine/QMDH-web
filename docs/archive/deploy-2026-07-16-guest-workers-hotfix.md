# 生产部署记录 — 2026-07-16

Date: **2026-07-16**  
Production: `https://cityusbdisk.cn`  
最终 Git：**`186b127`**（含热修）  
前一生产基线：`b62b17c`

---

## 一句话

将 **Studio 访客模式 + 密码最短 4 位 + Worker×3** 及此前未上生产的 main 增量部署上线；随后热修 **Haodeya 异步策略误路由**，避免 Gemini 走 VIP 异步接口。

---

## 部署内容（相对 `b62b17c`）

### A. 本次主动上线功能（`60caa22`）

| 项 | 说明 |
| --- | --- |
| **Studio 访客模式** `[guest-001]` P0+P1 | 登录页「访客模式」；`/studio/*` 四 Tab 能看不能用；`/admin/*` 仍须登录；后端 `get_optional_auth_user` + 只读 GET |
| **密码最短 4 位** | `UserCreate` / `UserPasswordReset` `min_length=4`（兼容手机号后四位初始密码） |
| **Worker 默认 3 副本** | `docker-compose.yml` `deploy.replicas: 3`；生产 `worker-1/2/3` |

### B. 随 main 一并上生产的已有提交（此前未 deploy）

含但不限于：`1ed503d` VIP 异步适配代码、计费/定价补丁、Gemini 1K/2K 路由相关提交等。  
**注意**：生产 **尚未配置** `gpt-image-2-vip` Provider；VIP **功能未对设计师开通**，代码在镜像中但不等于已接入。

### C. 当日运维热改（不经 Git 或随后补丁）

| 项 | 说明 |
| --- | --- |
| Grok 视频超时 | Admin/DB：`haodeya_grok` `timeout_seconds` **600 → 900** |
| Nano Banana PRO 策略 | DB id=21：`strategies` 设为 `chat_completions_image`（曾为空导致误路由） |
| 异步默认判定热修 | Git **`186b127`**：仅 `gpt-image-*-vip` / 显式 async 才默认 `haodeya_async_image` |

---

## 部署步骤（已执行）

```bash
# 本机
git push origin main   # 60caa22，后 186b127

# 服务器
sudo -u admin git -C /www/wwwroot/qmdh-web fetch origin main
sudo -u admin git -C /www/wwwroot/qmdh-web reset --hard origin/main
cd /www/wwwroot/qmdh-web
docker compose run --rm backend alembic upgrade head
docker compose up -d --build --scale worker=3 frontend backend worker
# 热修后再：
docker compose up -d --build --scale worker=3 backend worker
```

验收：`docker compose ps` 三 worker；`https://cityusbdisk.cn/api/v1/health` → healthy。

---

## 事故与修复（同日）

**现象**：Nano Banana PRO 报上游 HTTP 400 — `gemini-3.1-flash-image is not supported on /v1/images/generations`。

**根因**：

1. Provider `strategies` 为空；
2. VIP 合入后 `profile_prefers_haodeya_async_image` 把所有 `newapi.haodeya.xyz` 误判为异步。

**处理**：DB 写回 `chat_completions_image` + 收紧异步默认判定（`186b127`）。

**当前生产生图策略摘要**：

| Provider | image.generate |
| --- | --- |
| Nano Banana PRO | `chat_completions_image` |
| Nano Banana 2 | `chat_modalities_image` |
| gpt-image-2（openai/…） | `chat_modalities_image` |
| gpt-image-vip | **未建 Provider，未接入** |

---

## 未完成 / 后续

- [ ] 访客模式 P2：匿名限流、清理 `useStudioAuth`、E2E
- [ ] VIP：Admin 建 `gpt-image-2-vip` + Key + Studio 联调
- [ ] 参考图 OSS/CDN 图床（Grok 视频上游拉 `cityusbdisk.cn/media` 不稳定）
- [ ] 视频 `STALE_RUNNING` 15min 与 900s 超时贴边，必要时放宽
- [ ] root 密码曾用于自动化部署：建议轮换并用密钥登录

---

## 相关文档

- `docs/archive/guest-mode-studio-2026-07-13.md`
- `docs/archive/haodeya-gpt-image-vip-async-2026-07.md`
- `docs/cpa-gemini-image-integration.md`
- `docs/archive/haodeya-image-model-routing-2026-07.md`
