# Handoff — CAD Extract P0（2026-09-24）

**状态：已被 2026-09-28 续档取代。** 下一步不要按本文末尾去做线稿 / ControlNet。当前产品、面积算法和本地端口见 `docs/archive/handoff-2026-09-28-cad-zoning-wip.md`。

**当时状态：WIP · 本地后端 + `/studio/cad` 已通 · 未 commit · 未部署**

---

## 冷启动一句话

用户上传 **DWG/DXF** → 产出可持久化的 **`extract_id` + 结构化 JSON**（图层/文字/包围盒），供后续线稿渲染、ControlNet、Canvas 等下游复用。**P0 不做线稿 PNG、不做生图。**

---

## 产品定调（本迭代收敛后）

```text
上传 → [DWG→DXF 若需要] → 解析 → JSON 信息包 → extract_id
                                              ↓
                                    （P1+）线稿 / 生图 / Canvas
```

**天正备注（每次 extract 自动写入 warnings / usage_notes）：**

> 天正、中望等第三方 CAD 图纸请先在原软件中「转 T3 / 炸开墙体」后再上传，否则自定义墙门窗对象可能无法解析为标准线要素。

**DWG：** 服务端需配置 `QMDH_CAD_DWG_CONVERTER_CMD`（如 ODA File Converter）；未配置时 `status=needs_conversion`，建议用户改传 DXF。

---

## 已交付（本地代码）

### API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/cad/extract` | JSON `{ file_name, data_url }`，登录必填 |
| GET | `/api/v1/cad/extracts/{extract_id}` | 按 `ce_xxx` 取结果 |
| GET | `/api/v1/cad/extracts` | 当前用户列表 |

响应 **无** `{code,message,data}` 信封，直接 Pydantic（与全站一致）。

### JSON 信息包字段（`data`）

- `source` — 文件名、格式、storage_path、sha256
- `conversion` — dwg 转换状态 / dxf 路径
- `meta` — 单位、bbox、entity 总数、layout 名
- `layers[]` — 名、图元统计、规则分类 role（wall/door/…）
- `blocks[]` — 块名、插入次数
- `texts` — `room_labels` / `dimensions` / `misc`
- `semantics` — `space_summary_zh`、`suggested_prompt_en`（模板拼接，非 LLM）
- `geometry_index` — 按 role 汇总
- `artifacts` — 空对象（P1 挂线稿 PNG）
- `usage_notes` — 天正 T3 说明

### 关键文件

```text
backend/app/services/cad/
  constants.py          # 天正备注、图层 role 规则
  dwg_converter.py      # 可选外部 CLI 转换
  dxf_reader.py         # ezdxf 读入 + INSERT 展开
  layer_classifier.py   # 规则分类
  text_extractor.py     # 文字分桶
  extract_service.py    # 编排 + 存盘

backend/app/routers/cad.py
backend/app/models.py   # CadExtract 表
backend/migrations/versions/z1a2b3c4d5e6_add_cad_extracts.py
backend/tests/test_cad_extract.py   # 4 passed
```

### 依赖

```text
ezdxf>=1.3.0,<2
Pillow>=10.0.0,<12   # 已加 requirements，P1 线稿用
```

### 配置（.env.example 已加）

```env
QMDH_CAD_MAX_UPLOAD_BYTES=52428800
QMDH_CAD_MAX_ENTITIES=200000
QMDH_CAD_DWG_CONVERTER_CMD=
QMDH_CAD_DWG_CONVERTER_TIMEOUT_SECONDS=120
```

### 测试

```bash
cd backend
python -m pip install -r requirements.txt
python -m pytest tests/test_cad_extract.py -q
# 期望：4 passed
```

---

## Git 状态（2026-09-24）

- **分支：** `main`
- **HEAD：** `1c68f52`（Chat delete telemetry fix）
- **CAD 改动：** 全部 **未 commit**（见 `git status`）
- **勿 commit：** `scripts/_tmp_*`

---

## 未做 / 下一步（建议顺序）

### P0 收尾（本 feature）

1. **Commit + migration** — `alembic upgrade head`（`z1a2b3c4d5e6`）仍未做
2. **DWG 转换器** — 生产配置 ODA CLI，或继续按「未配置则改传 DXF」
3. **前端上传入口** — 已做：`/studio/cad`，侧栏「图纸」，复用 `data_url`

### P1（下游消费者）

4. **线稿渲染** — 从 `geometry_index` / wall 图层 → 1024 黑白 PNG → `artifacts.lineart_mask`
5. **图层 LLM 分类** — 规则 + flash 一次调用（可选）
6. **Canvas 节点** — node data 存 `extract_id`
7. **生图 API** — mask + prompt → 外部 ControlNet 图像 API

---

## 并行线：设计助手（未在本迭代 commit）

- B1/harness/memory 已在 main；**UI 关 + pydantic-ai 生产 import 失败**（`opentelemetry._events`）
- 对照文档：`docs/compare-qmdh-openclaw-codex.md`
- 任务：`chat-b2-001` IN PROGRESS

---

## 相关文档

- `docs/tasks.md` → `[cad-extract-001]`
- `docs/compare-qmdh-openclaw-codex.md` — OpenClaw/Codex 对照（助手向）

---

Safe to hand off: **Yes（WIP；新对话从 commit + 生产 migration 继续，线稿渲染仍是 P1）**
