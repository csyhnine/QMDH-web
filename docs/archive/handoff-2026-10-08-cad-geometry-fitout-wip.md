# Handoff — CAD 几何布置收口，下一任务是部署准备（2026-10-08）

**状态：本地功能收口 · 未 commit · 未 push · 未部署 · 生产 migration 未跑**

冷启动先读这一份，再读 `docs/server-operations.md` 的 Daily Update。09-29 的「用户说还是不对、先别改代码」已经过时。分区过程见 `docs/archive/handoff-2026-09-28-cad-zoning-wip.md`，加门时的布置见 `docs/archive/handoff-2026-09-29-cad-fitout-wip.md`。

---

## 冷启动一句话

居委会一层的五段改造已经在本地做完：房间多边形、可摆区域、家具组团、评分改写、咖啡厅吧台和操作台。用户 2026-09-30 确认这五段算做完，并在 2026-10-08 要求留档，**下一任务是准备部署到服务器**。这一轮不要改布置算法，不要重新 POST fitout，不要在用户明确说「提交 / 部署」之前 commit、push 或上生产。

---

## 下一任务：准备部署（先准备，不执行）

用户原话：「留档交接下，下一个任务准备部署到服务器。」

准备时对照 `docs/server-operations.md`。生产在阿里云，路径 `/www/wwwroot/qmdh-web`，入口 `https://cityusbdisk.cn`。更新顺序是：备份 `.env`、备份 PostgreSQL、备份 `backend_media`、用 `admin` 用户 `git pull`、有迁移则 `alembic upgrade head`、再 `docker compose up -d --build`。多模块变更用 `scripts/deploy-production-rebuild.sh`，不要用单文件热补。`git pull` 必须是 `sudo -u admin`，root 没有 Deploy Key。禁止 `docker compose down -v`。禁止更换 `QMDH_ENCRYPTION_KEY`。

这次发布和热补不一样，至少有三件要在准备清单里写清楚：

1. **代码还没进 Git。** `main` HEAD 仍是 `1c68f52`（`fix(chat): delete conversation telemetry rows before cascade`）。CAD 全部在工作区。不 commit 就无法 `git pull` 到服务器。commit 范围要单独圈出来，见下文「不要提交」。
2. **有一条新迁移。** `backend/migrations/versions/z1a2b3c4d5e6_add_cad_extracts.py`，`down_revision = y0z1a2b3c4d5`。09-22 交接里生产当时停在 `y0z1a2b3c4d5`。`docs/continuity.md` 里更早的 `a8b9c0d1e2f3` 不要当成现在的生产版本。上生产前在服务器跑 `alembic current` 核对，再 upgrade。先备份数据库。
3. **镜像要重装依赖。** `backend/requirements.txt` 增加了 `shapely>=2.0,<3`（原有 `ezdxf`、`Pillow`）。必须 rebuild 后端镜像，热补 Python 文件不够。

DWG：服务端要有 `QMDH_CAD_DWG_CONVERTER_CMD`（本机是 ODA File Converter，写在本地 `.env`，不要提交）。未配置时上传 DWG 会得到 `needs_conversion`，只能改传 DXF。生产是 Linux，本机那份 Windows 的 `ODAFileConverter.exe` 不能直接搬过去。准备部署时要确认服务器是否另有 Linux 版转换器；没有的话，第一版就明确「生产先收 DXF」。

本地 SQLite `backend/app.db` 里的解析和布置**不会**跟代码上生产。生产是空的 CAD 数据，用户得重新上传。不要把 `backend/app.db`、`backend/storage/**` 拷到服务器。

部署准备做完后，向用户列出：将提交的文件、排除的文件、迁移、DWG 转换器缺口、备份和 rebuild 步骤。等用户明确说提交并部署，再执行。

---

## 产品顺序（仍有效）

```text
上传原图 → 几何分区 + 面积 → 网页审查意见
        → 文字模型只改房间名和静/动，用户点「确认写入」才落库
        → 边界只用多边形选区
        → 功能定稿之后按规则布置家具
```

分区和布置都是规则几何，不是视觉模型。不要做线稿、ControlNet、Canvas 生图。不要把视觉模型接成主分析器。不要确认 Gemini 重命名。不要改旧 extract `ce_b121e1b892de` 上的咖啡厅。不要重新解析 `ce_d2955df6f9b9`（09/28 17:56）。不要自动重跑布置。

卫生间隐私已经定稿：男女隔墙、厕位隔间、入口隔墙和门都留着。不要再拆卫生间拓扑，除非用户另说。

---

## 五段做到哪里

外部意见的顺序是：房间 Polygon → 可摆区域 → 家具组团 → 评分改写 → 家具库。这五段在一层上做完了。用户 2026-09-30 问过「按意见修改完工了？」，答复是这五段做完，下面三项当时说好先不动，部署准备时也不要顺手做：

- 卫生间拆成两个独立房间
- 其余房间的家具也改到可摆多边形上摆（现在只有接待大厅的洽谈组团吃 usable；其他房间仍是像素沿墙）
- 家具库再加咖啡厅以外的类型

二层在组团、评分和家具库之后没有重算。

### 当前这张图

- 页面：`http://127.0.0.1:18080/studio/cad`。登录 `admin` / `dev-admin-password`。登录 JSON 字段是 `token`。
- **用户看的是** `ce_94778ce26c6e`，文件 `五期云锦居委会办公室0922-x_t3.dwg`，列表时间 **09/28 15:02**。
- 刷新会选中 `ce_d2955df6f9b9`（09/28 17:56）。核对时必须再点 15:02。楼层标签是「平面 1 9」「平面 2 2」。
- 一层 9 间。接待大厅 `f1_r1` 约 171.2㎡。咖啡厅是标记 6、`f1_n1`、约 64.2㎡。卫生间是标记 8、`f1_n3`、约 25.0㎡，「卫生间（含男女卫）」。
- 2026-09-30 最后一次一层布置，选中 **网格 4.74**（沿墙 4.81，主家具 8.53）。硬约束三项通过。组团 0.00，铺开 1.25，密度 3.37，绿植 0.00，卫生间 0.00，会议桌 0.13。主要扣分是密度。
- 页面文案：分隔墙 20 段，家具 121 件。组团：洽谈、绿化、接待台、等候、讨论、工位、会议、备餐、茶座、洁具。卫生间隔墙和厕位门的说明还在。
- 咖啡厅：吧台 1、操作台 1、茶座 6、座椅 6，另有花槽和绿植。吧台约 2.2×0.65 m，操作台约 1.4×0.6 m，茶座约 0.75×0.75 m。墙边门线挡住时柜台会沿同一道墙往里退；座椅留在客人一侧。
- 房间编辑只写 `backend/app.db` 的 `payload_json`。嵌套 JSON 用 `copy.deepcopy` + `flag_modified`。`CadExtract.public_id` 才是 `ce_…`。`CadExtractOut.data` 是松散 dict，polygon、usable、group 能穿过去。

### 几何现在存在哪

- 每间房有 `polygon`（米制外环，简化 0.15 m）和 `usable`（内缩 0.15 m，扣柱、门扇、封闭孔、大房间 1.1 m 走道）。`area_m2` 仍是原来的像素 / 闭合线面积，不要改成 shapely 面积。
- 楼层 `geometry`：`{min_x, max_y, scale, meters_per_unit}`。已有精确框不要覆盖。
- 家具有可选 `group`。评分硬门槛是重叠、出界、障碍，超过 2% 加 100 且 `passed=false`。通过之后比组团、铺开、密度带，外加绿植、卫生间、会议桌居中。

---

## 本地怎么跑

2026-10-08 留档时，**18010、18011、18080 都没有在听**。下一轮要看页面再拉起来。

- 前端 Vite `http://127.0.0.1:18080`，代理到 `18011`（`VITE_API_PROXY_TARGET`）。`vite.config.ts` 和 `start-dev.cmd` 的默认仍是 `18080 → 18010`。CAD 开发不要占用或杀掉 18010 上已有的进程。
- 接口：`http://127.0.0.1:18011`。后端没有 `--reload`。改 Python 后只重启 18011。进程被停掉时退出码 `4294967295` 是主动结束，不是崩溃。用 `netstat -ano | findstr ":18011"` 确认。
- 拉起示例（工作目录 `backend`）：`D:\ComfyUI-aki-v2\python\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 18011`。这台解释器上已有 shapely。测试用 `backend\.venv`。
- PowerShell 不接受 `&&`。控制台是 GBK，中文标签写 UTF-8 文件再读。
- 一层布置：`POST /api/v1/cad/extracts/ce_94778ce26c6e/fitout?floor_index=1`，大约 40 秒。
- 测试：`cd backend` 后 `.\.venv\Scripts\python.exe -m pytest tests/test_cad_extract.py -q --tb=line -k fitout`。2026-09-30 家具库之后 **16 passed**。评分改写和家具库之后没有再跑整文件。

---

## 关键文件

```text
backend/app/services/cad/polygons.py
backend/app/services/cad/usable.py
backend/app/services/cad/furniture_catalog.py
backend/app/services/cad/fitout.py
backend/app/services/cad/fitout_score.py
backend/app/services/cad/space_layout.py
backend/app/services/cad/room_edit.py
backend/app/services/cad/dwg_converter.py
backend/app/routers/cad.py
backend/migrations/versions/z1a2b3c4d5e6_add_cad_extracts.py
backend/requirements.txt
backend/tests/test_cad_extract.py
frontend/src/pages/studio/CadExtractPage.tsx
frontend/src/api.ts
```

页面路由 `/studio/cad`，侧栏「图纸」。另有未提交的 `/admin/cad-usage` 和资产库页，部署准备时看它们是不是同一次 CAD 提交，不要和 `scripts/_tmp_*` 混在一起。

---

## Git

- 分支 `main`，HEAD `1c68f52`。CAD 与相关文档都未 commit。
- **可以进 CAD 提交的：** `backend/app/services/cad/`、`backend/app/routers/cad.py`、CAD 用到的 `models.py` / `schemas.py` / `main.py` / `config.py` / `assets.py` 改动、`requirements.txt`、迁移 `z1a2b3c4d5e6`、`tests/test_cad_extract.py`、`frontend` 里图纸页 / `api.ts` / 路由和侧栏、`.env.example` 里的转换器变量、本交接和 `docs/handoff.md`、`docs/tasks.md`、`docs/continuity.md`，以及已有的 09-24 / 09-28 / 09-29 归档。
- **不要提交：** `.env`、`backend/app.db`、`backend/storage/**`、`backend/.venv/**`、`backend/.pytest_cache/**`、`scripts/_tmp_*`。工作区里还有大量历史 `_tmp_prod_*`、`_tmp_deploy_*`，与这次 CAD 无关。
- 提交和 push 都要用户另说。生产部署也要用户另说。

---

## 下一步

1. 读本档和 `docs/server-operations.md`，做部署准备清单，不要改布置代码。
2. 核对将提交的文件，排除密钥、本地库、图纸存储和 `_tmp` 脚本。
3. 在服务器只读核对当前 alembic、磁盘和有没有 Linux 版 DWG 转换器。不要 upgrade，不要 rebuild。
4. 把清单交给用户。用户明确同意后才 commit、push、备份、迁移、rebuild。

Safe to hand off: **Yes（WIP，下一任务是部署准备）**
