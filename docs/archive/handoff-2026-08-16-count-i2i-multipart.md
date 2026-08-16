# Handoff: count 图生图（gpt-image-2-count i2i）— 已验收

**日期：** 2026-08-16  
**状态：** 用户业务验收 **成功**（图像编辑 + 参考图 + count）  
**Safe to hand off：** Yes

---

## 产品结论

- **文生图（image-generate）+ count**：无参考图时走 `/images/generations` 短 body（`model + prompt + size` 像素），正常。
- **图生图（image-edit）+ count + 参考图**：必须走 **`/images/edits` + multipart/form-data**（字段 `image` 为二进制附件），**不能**用 `generations + image_urls`（上游静默忽略，`image_tokens=0`），**不能**用 JSON `images: [{image_url}]`（上游 500：`failed to parse multipart form`）。
- **Studio 模式**：用户必须在 **「图像编辑」** 模式提交；**文生图模式不会把参考图写入 payload**（`buildImagePayload` 仅在 `image-edit` workflow 带 `reference_images`）。
- **分辨率**：`/images/edits` 仅 **`gpt-image-2-count`（1K SKU）** 有渠道；选 2K 时仍发 1K model，输出分辨率约为 1K 档（用户若选 2K 会在 result 里看到 `haodeya_count_edits_resolution_note`）。

---

## 排查时间线（生产 tasks）

| Task | 时间 (UTC+8) | 现象 | 根因 |
|------|--------------|------|------|
| 3949 | 08/15 00:52 | `image_tokens=0` | URL 双重编码 → 404 |
| 3955–3956 | 08/15 01:01 | URL 正确仍 `image_tokens=0` | OSS 直链 `.bin` / `octet-stream` |
| 3957–3958 | 08/15 01:12 | `haodeya_sync_image_urls` | count 同步不支持 `image_urls` |
| 4072 | 08/16 18:27 | failed | `/images/edits` 发了 `gpt-image-2-count-2k` → 503 无渠道 |
| 4073–4074 | 08/16 18:28 | 出无关图 | **文生图**重跑，payload **无参考图** |
| 4075–4076 | 08/16 18:52 | HTTP 500 multipart parse | JSON body 而非 multipart |
| （最终） | 08/16 ~19:35 | **成功** | multipart + `gpt-image-2-count` |

---

## Git / 生产状态

| Commit | 内容 | 生产 |
|--------|------|------|
| `2d798e9` | URL 双重编码幂等 | ✅ 热补 |
| `90d1f12` | site `/media` + `.png` 别名 | ✅ 热补 |
| `2c75332` | count → `/images/edits`（初版 JSON） | ✅ 热补 |
| **（本 commit）** | edits **model 固定 1K** + **multipart** | ✅ **热补已落容器**（2026-08-16 晚间） |

**生产对齐（可选）：** `cd /www/wwwroot/qmdh-web && git pull && ./scripts/deploy-production-hotpatch.sh`

---

## 实现要点（`task_executor.py`）

1. `_build_haodeya_short_images_plan`：`not poll and reference_images` → `_build_haodeya_count_image_edits_plan`
2. `_resolve_haodeya_count_edits_model`：edits 只用 `gpt-image-2-count`（无 `-2k`）
3. `_build_haodeya_count_image_edits_plan`：
   - `endpoint_path="/images/edits"`
   - `body`: `model`, `prompt`, `size`（像素，遵循原图走 `resolve_size_aspect_for_reference`）
   - `multipart_files=(("image", filename, bytes, content_type),)`
   - `headers`: 仅 `Authorization`（勿带 `Content-Type: application/json`）
   - `reference_image_mode`: `haodeya_sync_image_edits`
4. VIP 异步仍用 `generations + image_urls`（`poll=True` 分支）

---

## 验收清单（已通过）

- [x] Studio **图像编辑** + 哥特参考图 + count +「换成白色衣服」
- [x] 不再出现 `failed to parse multipart form` / `gpt-image-2-count-2k 无可用渠道`
- [x] 出图贴近参考图构图/人物

可选复测：

- [ ] wan2.7 文生图 16:9 + 1K 非 1024×1024（`bd67d8d` / `c672aff`）
- [ ] count 2K 图生图是否接受 1K 输出（产品预期内）

---

## 关键配置（生产）

- `QMDH_PUBLIC_MEDIA_BASE_URL=https://cityusbdisk.cn`
- count provider：`strategies.image.generate/edit = haodeya_sync_image`，`reference_mode=disabled`（native edits 不走 caption_prompt）

---

## 相关文件

- `backend/app/services/task_executor.py` — 主逻辑
- `backend/app/services/media_storage.py` — 公网 URL / `.png` 别名
- `backend/tests/test_haodeya_sync_image.py` — count sync + edits 单测
- `scripts/deploy-production-hotpatch.sh` — 热补与容器断言
- `docs/archive/handoff-2026-08-15-wan-t2i-size-wip.md` — wan 文生图 size 平行问题

---

## 暂停范围（用户 2026-08-16）

**文生图 / 图生图（count + wan）先停在这里**；新对话从其它迭代（Studio / Video / prod backlog）继续即可。
