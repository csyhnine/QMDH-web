# Handoff — CAD 家具布置（2026-09-29）

**状态：WIP · 用户刚说「还是不对」· 本地 `/studio/cad` 可用 · 未 commit · 未部署 · 未跑生产 migration**

冷启动先读这一份。分区和面积见 `docs/archive/handoff-2026-09-28-cad-zoning-wip.md`。那份里的当前图 `ce_b121e1b892de`、以及「家具还没开始」，都已经过时。

---

## 冷启动一句话

居委会一层平面已经在网页上按规则摆了家具，含男女卫生间、厕位隔板和门。用户看过门和尺寸说明后说「还是不对」，没有指出新的具体缺陷。下一轮先听用户说哪里不对，不要先改代码，也不要重新布置。

---

## 产品顺序（仍有效）

```text
上传原图 → 几何分区 + 面积 → 网页审查意见
        → 文字模型只改房间名和静/动，用户点「确认写入」才落库
        → 边界只用多边形选区
        → 功能定稿且面积核对之后才布置家具
```

家具这一步用户已经让做了，而且做过多轮。分区仍是 CAD 几何，不是视觉模型。不要做线稿、ControlNet、Canvas 生图。不要把视觉模型接成主分析器。不要确认 Gemini 重命名。不要改用户的咖啡厅（在旧 extract `ce_b121e1b892de`，不是当前这张）。不要自动重解析。不要部署。不要在生产跑 migration `z1a2b3c4d5e6`。不要 commit，除非用户明确要求。不要提交 `.env`、`scripts/_tmp_*`、`backend/app.db`、`backend/storage/**` 里的图纸和图片。

---

## 用户最后一句

2026-09-29 16:09：「还是不对，你先留档交接下，我们换对话继续开发。」

上一句（16:02）是：「卫生间的隔墙连门都没有吗？那不是被别人看到上厕所了；而且现在布置的家具尺寸是合理真实的吗？」

门已经加上并在页面上看过，尺寸也按代码里的米数回答过。用户没有接受这个结果。门画成微微打开（厕位约 28°，男女隔墙门口约 32°），隔间前面仍留着缝，这可能是「还是不对」的原因，但是没有得到用户确认。下一轮不要凭这个猜测直接改。

---

## 当前这张图

- 页面：`http://127.0.0.1:18080/studio/cad`
- 登录：`admin` / `dev-admin-password`。登录返回字段是 `token`，不是 `access_token`。
- **用户看的是** `ce_94778ce26c6e`，文件 `五期云锦居委会办公室0922-x_t3.dwg`，列表时间 **09/28 15:02**。
- 刷新页面会选中更新的 `ce_d2955df6f9b9`（09/28 17:56）。必须再点 15:02 那一行。不要重新生成 `ce_d2955df6f9b9`。
- 楼层标签的无障碍名称是「平面 1 9」「平面 2 2」（名称加房间数）。
- 一层房间仍是 9 间。标记 3（办公或会议 39.13㎡）和标记 9（`f1_s9`，办公或会议 27.24㎡）是从旧房间 3 拆出来的，两个名字都还没改。卫生间是标记 8，房间 id `f1_n3`，约 25.0㎡，名称「卫生间（含男女卫）」。
- 一层选中方案是 **沿墙 19.79**（主家具 21.24，网格 21.28）。主要扣分是走道过窄。卫生间项是 0.00。
- 一层卫生间隔断计数：男女分隔 1、厕位隔板 8、厕位门 4、卫生间门 1。页面「分隔墙 14 段」把这些线段都算进去了，不是 14 堵墙。洁具：女厕位 2、女洗手池 2、男厕位 2、男小便池 2、男洗手池 2。
- **二层没有在加门之后重新布置。** 二层没有卫生间。二层分数还是更早一次「大房间中间成组」的结果。
- 房间编辑只写 `backend/app.db` 的 `payload_json`，不回写 extracts JSON 文件。嵌套 JSON 必须 `copy.deepcopy` + `flag_modified`。`CadExtract.public_id` 才是 `ce_…`。`CadExtractOut.data` 是松散 dict，`angle`、`score`、`variants` 能穿过去。
- 功能安排里卫生间仍写着旧句：「按现有边界做卫生间，坐便和洗手。」那是程序文案，不是布置说明。

---

## 布置现在怎么做

规则布置，不调视觉模型，不调 Gemini。入口 `POST /api/v1/cad/extracts/{id}/fitout?floor_index=`。结果在 `spaces.fitout.floors[]`，不在 floor 对象上。一层大约 30–45 秒。

三个方案：`wall` 沿墙、`anchor` 主家具、`grid` 网格。大房间中间按面积放 1–3 组沙发或讨论桌，旁边配乔木和绿植。门洞和门扇在摆家具前清出。

卫生间（房间名含「男女」且面积 ≥ 8㎡）：

- 隔墙顺着最长墙的垂直方向，过形心，一端留 0.9 m 缺口。标签「男女分隔」。当前这间约 3.75 m，角度约 -37.3°，不是竖直红线。
- 每个厕位两侧是「厕位隔板」，画到隔间前缘。
- 每个厕位前缘一侧铰接一扇「厕位门」，扇长约为开口的 0.78，向隔间内偏约 28°。
- 男女隔墙缺口端铰接一扇「卫生间门」，扇长 0.8 m，偏约 32°。函数是 `_gender_door`，不要改 `_split_toilet` 的返回值个数，调用方依赖它只返回一段墙。
- 墙和隔板 CSS 类 `is-wall`（黑、2.6）。门是 `is-door`（黑、1.5）。普通分区线仍是橙色 `#b86a12`。

家具尺寸是常见成品，不是从 DWG 图块量的。全图按 1 单位 = 100 mm 估算（一层 mask 814×908，约 0.0399 m/px）。用户问过是否真实，已按下面这些数回答，**没有改尺寸**：

| 件 | 沿墙 × 进深 |
|---|---|
| 厕位隔间 | 0.9 × 1.2 m |
| 小便池 | 0.42 × 0.55 m（进深偏深） |
| 洗手池 | 0.55 × 0.42 m |
| 工位 | 1.4 × 0.7 m（椅子画在桌子框里，看起来比真实 0.45 m 小；桌周单独的椅子是 0.45 m） |
| 沙发 | 1.8 × 0.8 m（进深偏浅） |
| 讨论桌 | 1.6 × 0.85 m |
| 会议桌 | 先试 3.0 × 1.3，再 2.4 × 1.1、1.8 × 0.9（宽度偏窄） |
| 书架 | 2.0 × 0.4 m |
| 阅览桌 | 1.4 × 0.75 m |
| 乔木 | 0.8 × 0.8 m（门厅树冠偏小） |

损失函数在 `fitout_score.py`，权重在前端 `SCORE_WEIGHTS` 里有一份副本，改权重必须两处一起改。越低越好。硬失败只有 overlap、bounds、obstacle。当前还有 center、variety、planting、toilet。toilet 只检查洁具种类齐不齐，不检查有没有门。

---

## 本地怎么跑

- 前端 Vite `http://127.0.0.1:18080`，`VITE_API_PROXY_TARGET=http://127.0.0.1:18011`。`vite.config.ts` 文件里的默认仍是 18010。
- 接口：`http://127.0.0.1:18011`。2026-09-29 16:21 重新拉起，进程 **18924**，已包含厕位门和卫生间门。上一进程 5708 被停掉（退出码 4294967295），不是崩溃。后端没有 `--reload`，改 Python 后只重启 18011。
- **不要杀 18010。**
- 重启 18011 时，旧进程退出码 `4294967295` 是主动结束，不是崩溃。用 `netstat -ano | findstr ":18011"` 确认还在听。
- PowerShell 不接受 `&&`。
- 测试：`cd backend` 后 `.\.venv\Scripts\python.exe -m pytest tests/test_cad_extract.py -q --tb=line -k fitout`。2026-09-29 加门后 **12 passed，14 deselected**。加门后没有跑整文件。
- 浏览器标签 viewId 曾是 `canvas-fa58e9502fe5`。看布置前先点 15:02 那一行，再点「平面 1 9」。

---

## 关键文件

```text
backend/app/services/cad/fitout.py
backend/app/services/cad/fitout_score.py
backend/app/services/cad/space_layout.py
backend/app/services/cad/room_edit.py
backend/app/routers/cad.py
backend/tests/test_cad_extract.py
frontend/src/pages/studio/CadExtractPage.tsx
frontend/src/styles.css
```

---

## Git

- 分支 `main`，HEAD `1c68f52`（`fix(chat): delete conversation telemetry rows before cascade`）。CAD 全部未 commit。
- Migration `backend/migrations/versions/z1a2b3c4d5e6_add_cad_extracts.py` 只在本地用过。

---

## 下一步

1. 新对话里先听用户说「还是不对」指的是门、尺寸，还是整层布置。不要先改代码，不要重新 POST fitout。
2. 用户指出具体问题后再改。改完只重启 18011，只对 `ce_94778ce26c6e` 的一层 POST fitout，然后在页面上点 15:02 核对。
3. commit 和生产 migration 都要用户另说。

Safe to hand off: **Yes（WIP）**
