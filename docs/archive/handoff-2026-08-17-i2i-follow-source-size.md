# Handoff: 图生图「遵循原图」尺寸全链路修复 — 已验收

**日期：** 2026-08-17  
**状态：** 用户业务验收 **成功**（gpt-image-2 / count 等「遵循原图」不再默认 1:1 方图）  
**Git：** `b55e280` — `fix(image): follow-source size for all i2i providers`  
**生产 HEAD：** `b55e280688d426173e1830960fa0ad2ac1166694`（2026-08-17 rebuild）  
**Safe to hand off：** Yes

---

## 问题摘要

用户在图生图选 **「遵循原图」** 时，部分上游仍出 **1:1 / 1024×1024** 或与参考图比例不符的固定档：

| 模型 | 修复前 | 修复后 |
|------|--------|--------|
| **gpt-image-2**（Haodeya chat） | follow 时省略 `aspect_ratio` → 默认 1:1 | 从参考图推断比例写入 `image_config.aspect_ratio` |
| **gpt-image-2-count** | 1024×768 参考 → 最近比例 4:3 → **1536×1024** | 参考图 **真实像素** `1024x768` |
| **Seedream** | follow → 解析 1:1 → `2K` 方图 | 推断比例 → 映射像素（如 4:3 → `2304x1728`） |
| **Wan 2.7 i2i** | follow → 字面量 `1K/2K` | 推断比例 → `_wan_pixel_size_for_aspect` |
| **OpenAI 原生 `/images/edits`** | follow → 1024×1024 | 真实像素或推断比例尺寸 |

**未改（设计如此）：**

- **VIP 异步** + follow source：仍 omit `size`（上游 native follow）
- **Gemini chat** + follow source：仍 omit `aspect_ratio`（上游 native follow）
- **「匹配比例 / 智能」**：不锁参考图像素（与 follow source 区分）

---

## 实现要点

### 新增 / 核心 helper

- `backend/app/services/image_aspect_ratio.py`
  - `pixel_size_from_reference_images()` — 读参考图 WxH 字符串
- `backend/app/services/task_executor.py`
  - `_aspect_for_image_size()` — follow source 时走 `resolve_size_aspect_for_reference`
  - `_openai_follow_source_pixel_size()` — OpenAI 原生 edits 像素尺寸
  - `_build_upstream_image_config()` — gpt-image-2 follow 时补 `aspect_ratio`
  - count / seedream / wan / openai generic body 分支均已接入

### 前端提示

- `frontend/src/features/studio/studioFollowSourceHint.ts`
  - count → `infer_pixels`（真实像素文案）
  - gpt-image-2 → `infer_ratio`
  - seedream / wan → `infer_pixels`（档位换算像素文案）

---

## 测试

本地 **38 项** follow-source 相关 pytest 通过，覆盖：

- `test_haodeya_sync_image.py`（count 真实像素）
- `test_task_executor_openai.py`（gpt-image-2 aspect + openai edits 像素）
- `test_haodeya_seedream_image.py`（seedream follow → 2304x1728）
- `test_task_executor_wan_image_size.py`（wan follow → 1024x768 等）
- `test_image_aspect_ratio.py`

---

## 生产部署

```bash
cd /www/wwwroot/qmdh-web
./scripts/deploy-production-rebuild.sh
```

2026-08-17 已执行：health **healthy**；容器断言 `_aspect_for_image_size` OK。

公网验收：`curl -sS https://cityusbdisk.cn/api/v1/health?detail=full`

---

## 用户验收（2026-08-17）

- [x] 链路通；1024×768 参考 + 「遵循原图」不再出方图
- [x] 用户确认「没问题，链路通了」

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `backend/app/services/task_executor.py` | 各 provider size / image_config 分支 |
| `backend/app/services/image_aspect_ratio.py` | 参考图像素与比例推断 |
| `frontend/src/features/studio/studioFollowSourceHint.ts` | Studio 比例菜单提示 |
| `scripts/deploy-production-rebuild.sh` | 生产全量 rebuild |

前序详档：`docs/archive/handoff-2026-08-16-count-i2i-multipart.md`（count multipart 基础）

---

## 暂停范围（仍有效）

用户 **2026-08-16** 暂停 **文生图/图生图新功能迭代**（count + wan 产品向扩展）；本修复为 **bugfix**，已验收上线。新对话勿主动开大 scope 图链路功能，除非用户重新开需求。
