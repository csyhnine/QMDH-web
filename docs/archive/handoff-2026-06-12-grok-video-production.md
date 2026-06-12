# Archive: Haodeya Grok Video Production Rollout (2026-06-12)

## Milestone Summary

Production E2E for **Haodeya Grok Imagine Video** is verified on `https://cityusbdisk.cn`.

| Scenario | Result | Typical latency |
|----------|--------|-----------------|
| 纯文生视频（i2v，无参考图） | ✅ 成功 | ~2–3 分钟 |
| 首帧图生视频（i2v + 1 张参考图） | ✅ 成功 | ~6 分钟（用户实测 task 约 6.2 min） |

User confirmed on 2026-06-12: **视频生成也没有问题了，但时间比较久**.

## Upstream Integration (Final)

Reference: upstream doc `GROK_VIDEO_DOWNSTREAM.md` (Haodeya / OpenRouter gateway).

### Submit

- `POST https://newapi.haodeya.xyz/v1/videos`
- `model`: one of four SKUs (`x-ai/grok-imagine-video-i2v`, `-i2v-10s`, `-ref`, `-ref-10s`)
- i2v `frame_images` **must** use:
  ```json
  {
    "type": "image_url",
    "image_url": { "url": "https://cityusbdisk.cn/media/..." },
    "frame_type": "first_frame"
  }
  ```
- **Do not** use `{ "type": "first_frame", "url": "..." }` (caused HTTP 400 / ZodError on task 236).

### Poll

- `GET /v1/videos/{task_id}` until `status=completed`
- Admin timeout建议 **600s**；复杂带图任务可能接近上限

### Download

- `GET /v1/videos/{task_id}/content` with Bearer auth
- **Do not** follow `unsigned_urls` OpenRouter links (401)

## Production Configuration

### Admin provider (single profile + Studio SKU switcher)

```
Provider: haodeya_grok
Display: Grok Imagine Video
Model: grok-imagine-video（占位，非上游 model）
Adapter: haodeya_grok
Base URL: https://newapi.haodeya.xyz/v1
Capabilities: video.generate
Strategies: {"video.generate":"haodeya_grok_video"}
Timeout: 600
Format: mp4
```

### Server `.env` (2026-06-12)

```env
QMDH_FRONTEND_ORIGIN=https://cityusbdisk.cn
QMDH_PUBLIC_MEDIA_BASE_URL=https://cityusbdisk.cn
```

### Domain / SSL

- ICP filing complete: `cityusbdisk.cn`（京ICP备14011242号-4）
- Let's Encrypt cert for domain; HTTP → HTTPS redirect enabled
- Reference images uploaded in Studio resolve to `https://cityusbdisk.cn/media/references/...`

## Deploy Timeline (server HEAD)

| Commit | Change |
|--------|--------|
| `acec571` | frame_images + SKU resolution fixes |
| `bab1575` | download via `/content` endpoint |
| `608c3a1` | frame_images aligned to upstream final spec |
| `c41778e` | login branding + remember credentials |

Server deploy method: **git bundle** fallback (`git pull` via deploy key still unreliable).

## Known Issues / Follow-up

- Generation is **slow** (minutes, not seconds); expected for async upstream
- GitHub `origin/main` may still lag local `main` (push intermittently fails from dev machine)
- Fix server GitHub deploy key to restore normal `git pull`
- Optional: add ICP footer badge on login / app shell

## Key Code Paths

- `backend/app/services/provider_adapters/haodeya_grok_video.py`
- `frontend/src/features/studio/grokVideoUtils.ts`
- `backend/tests/test_task_executor_haodeya_grok_video.py`
