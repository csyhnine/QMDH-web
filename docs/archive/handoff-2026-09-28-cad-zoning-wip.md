# Handoff — CAD 功能分区与面积（2026-09-28）

**状态：WIP · 本地 `/studio/cad` 可用 · 未 commit · 未部署 · 未跑生产 migration**

冷启动先读这一份。2026-09-24 的 P0 抽取档仍在 `docs/archive/handoff-2026-09-24-cad-extract-wip.md`，其中「下一步做线稿」已过时。

---

## 冷启动一句话

设计师按原图上传居委会办公室 DWG。程序自己关门洞、算出平方米、把卫生间 / 门 / 窗 / 柱留成约束。用户在网页上审功能安排、写修改意见、确认后改房间名和静/动，边界用多边形选区改。面积优先用闭合多段线的矢量面积。家具和线稿都还没开始。

---

## 产品顺序（用户已确认，不要跳）

```text
上传原图 → 几何分区 + 面积 → 网页「功能安排」
        → 审查意见 → 文字模型出修改建议 → 用户点「确认写入」才改名
        → 边界变化只用多边形选区
        → 功能定稿且面积可信之后，才布置家具
```

- 分区是 CAD 几何，不是模型看平面图。文字模型只收到房间 JSON 和已保存意见，不收 PNG。
- 不要把视觉模型接成主分析器。多模态只留给以后的家具坐标。
- 不要做 P1 线稿、ControlNet、Canvas 生图，除非用户另说。
- 不要自动重解析用户当前这张图。新面积要等用户自己再上传。
- 不要部署，不要在生产跑 `z1a2b3c4d5e6`。
- 不要 commit，除非用户明确要求。不要提交 `.env`、`scripts/_tmp_*`、`backend/app.db`、`backend/storage/**` 里的 DWG/DXF/PNG。

---

## 当前这张图（不要改名、不要点确认）

- 页面：`http://127.0.0.1:18080/studio/cad`
- 登录：`admin` / `dev-admin-password`
- 当前 extract：`ce_b121e1b892de`，文件 `五期云锦居委会办公室0922-x_t3.dwg`，创建 2026-09-28 02:40:23 UTC
- 一层：`f1_r1` 先隔卫生间，其余作接待 192.78㎡；`f1_r2` 接待或开放办公 161.43㎡；`f1_r3` 办公或会议 65.86㎡；`f1_n1` 咖啡厅 59.62㎡（用户新建，不要改成厨房）
- 二层（意见已写入）：`f2_r1` 学习区 100.5㎡ 静；`f2_r2` 青少年活动室 97.6㎡ 动
- 已存意见：`f2_r1`「改成学习区/档案或者内部办公之类的，安静分区」；`f2_r2`「可以改成运动分区，让青少年活动，或者舞蹈室之类的」
- 页面上可能还留着未确认的 Gemini 建议：学习区 → 学习与档案区，青少年活动室 → 青少年运动与活动室。不要替用户点「确认写入」。
- 这组平方米是旧像素算法。面积修复已进代码并已加载到 18011，但这条 extract 不会自己变。
- 用户另贴过一张英文图的 CAD 测量（图层都叫卫生间，不是这张居委会图）：Community Parlor 6053.5 平方单位 = 60.5㎡，WC 2839.8 = 28.4㎡，文体活动 11674.9 = 116.7㎡。1 单位 = 100mm 时，CAD「面积」× 0.01 = 平方米。不要把这三间对上 `ce_b121` 的房间。

---

## 面积算法（2026-09-28 下午刚落地）

`backend/app/services/cad/space_layout.py` 的 `_apply_boundary_areas`：

1. 闭合 `LWPOLYLINE` / `POLYLINE` 用鞋带公式算面积和形心，和 AutoCAD AREA 同一条零厚度边界。
2. 形心落在某房间里，且矢量平方米 / 像素平方米在 **0.7–1.45** 之间，就用矢量面积。多条线时取得最接近 1 的。整层外框（比值通常 > 1.45）和套在大房间里的小内框（< 0.7）都会丢掉。
3. 对不上闭合线的房间，把贴墙像素的一半加回去，补偿墙线笔画（宽 2 再 `MaxFilter(3)`）吃掉的内侧半圈。几平方米的出入可以留着。
4. 像素洪水只负责认出哪一块是房间。单位仍走 `_meters_per_unit`：跨度不可靠时按 1 单位 = 100mm（面积系数 0.01）。页面备注：「图纸单位不可靠，按 1 单位 = 100mm 估算面积。」
5. 之后的涂抹 / 新建分区走 `room_edit._sync_areas`，面积会退回像素计数。若用户改过边界，页面面积不再是 CAD 闭合线面积。

pytest：`cd backend` 后 `.\.venv\Scripts\python.exe -m pytest tests/test_cad_extract.py -q --tb=line`，**13 passed**（含矩形约 12㎡、门洞毫米备注、窗洞、卫生间不外溢）。

---

## 本地怎么跑

- 前端：Vite `http://127.0.0.1:18080`，环境变量 `VITE_API_PROXY_TARGET=http://127.0.0.1:18011`。`frontend/vite.config.ts` 文件里的默认仍是 `18010`，没改文件。
- 接口：uvicorn `http://127.0.0.1:18011`，2026-09-28 14:39 左右换过，已加载面积修复。改后端后要再重启 18011，没有 `--reload`。
- **不要杀 18010。** PID 19160 从 2026-09-28 09:43 起占着端口，`TerminateProcess` 返回拒绝访问。
- 停 18011 再拉起时，旧进程退出码 `4294967295` 是主动结束，不是崩溃。
- SQLite：`backend/app.db`。嵌套 JSON 写入必须 `copy.deepcopy` + `flag_modified`。
- `QMDH_CAD_DWG_CONVERTER_CMD` 为空时必须返回 `needs_conversion`，测试依赖这一点，不要自动探测 ODA。本机装了 ODA File Converter 27.1.0，本地 `.env` 可以指向它。

---

## 已在页面上的能力

| 能力 | 行为 |
|------|------|
| 墙线图层 | `*-lines.png` 永远压在色块上面。涂抹不写这张图。旧 extract 在 GET 时从预览里剥出白线。 |
| 多边形选区 | 点顶点，点回起点 / Enter /「完成选区」闭合。扩大、缩小、新建分区。Esc 取消。 |
| 撤销 | 每层最多 20 步，含改名、涂抹、删除、新建。Ctrl+Z。选区进行中 Ctrl+Z 只撤最后一个顶点。此功能之前的修改撤不了。 |
| 新建分区 | 从已有房间切一块，或圈空白。名字来自功能输入，默认「新分区」。 |
| 功能安排 | 前端 `cadProgram.ts` 规则生成，不调模型。用户起的名字优先，咖啡厅保持茶座。 |
| 审查意见 | `POST .../program-review`，最多 40 条，存在 `spaces.program_review.notes`。不改房间。 |
| 按意见重排 | `POST .../program-rearrange`。选已启用的 chat.completions（本机只有 id 10 `gemini-3.7-flash-high`）。只出新名字、静/动、一句理由、可选 `split_hint`。不写库。 |
| 确认写入 | `POST .../program-apply`。只改名字、动静、`layout_hint`。`split_hint` 只展示，边界要用户自己圈。 |

房间编辑：`POST /api/v1/cad/extracts/{id}/rooms`，`action` 为 `rename|remove|paint|create|undo`。

---

## 关键文件

```text
backend/app/services/cad/space_layout.py    # 分区、面积、墙线 PNG
backend/app/services/cad/room_edit.py       # 多边形、撤销、新建、意见
backend/app/services/cad/program_rearrange.py
backend/app/routers/cad.py
backend/app/schemas.py
backend/tests/test_cad_extract.py
frontend/src/pages/studio/CadExtractPage.tsx
frontend/src/features/studio/cadProgram.ts
frontend/src/api.ts
frontend/src/styles.css
```

画布 `canvases/juweihui-room-program.canvas.tsx` 不是交付面。用户要在网页上看、改、再布置。

---

## Git

- 分支 `main`，HEAD `1c68f52`，与 `origin/main` 一致。CAD 全部未 commit。
- Migration 文件 `backend/migrations/versions/z1a2b3c4d5e6_add_cad_extracts.py` 只在本地用过，生产没跑。

---

## 下一步（等用户开口）

1. 用户再上传同一张图，核对新面积是否贴近 CAD「面积」× 0.01。差十几平方米且比值超出 0.7–1.45 的，是旁边空间被并进来了，用多边形拆，不要当空地加家具。
2. 功能定稿之后才做家具。家具坐标以后可以考虑多模态，分区分析不要。
3. 用户明确要求时再 commit，再谈生产 migration。线稿仍不做。

Safe to hand off: **Yes（WIP）**
