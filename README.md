# QMDH Web

**当前版本：1.1.0（本地开发）** · **生产环境：1.0.0** · [CHANGELOG](CHANGELOG.md)

设计院内部 AI 升级平台，当前包含：

- `backend/`：FastAPI 后端，提供工作流、任务、资产、看板、反馈等接口
- `frontend/`：React 前端，Studio 创作区、运营后台与管理看板
- `docs/`：协作文档、部署说明与项目状态

## 版本说明

| 环境 | 版本 | Git 基线 | 状态 |
|------|------|----------|------|
| 生产 [`cityusbdisk.cn`](https://cityusbdisk.cn) | **1.0.0** | `51aba1b` | 已部署 MVP 基线 |
| 本地 / 待部署 | **1.1.0** | `main` + WIP | 下一版功能集，尚未上线 |

**版本号管理**

- 单一来源：仓库根目录 [`VERSION`](VERSION)
- 同步位置：根目录与 `frontend/` 的 `package.json`、`CHANGELOG.md`
- 健康检查：`GET /api/v1/health?detail=full` 返回 `version` 字段
- 发版流程：更新 `VERSION` → 同步 `package.json` → 写 `CHANGELOG.md` → 打 Git tag（如 `v1.1.0`）→ 部署

### 1.0.0（生产）

- Studio 图像生成闭环、模板与历史
- 统一模型接入、任务异步执行与成本留痕
- Gemini CPA 生图路由
- 管理看板、使用日志、反馈（单次问答）、单机 Docker Compose 部署

### 1.1.0（本地，相对 1.0.0 新增）

- Studio **2K 生图**与历史卡片分辨率 / 像素尺寸
- Studio 创作区 UX 迭代（最多 3 张、快捷键提交等）
- **反馈多轮对话**（用户 ↔ 管理员线程）
- 上传限制 **图片 20MB / 文档 10MB**
- 历史时间东八区显示、运营看板日期筛选与 CSV 导出、使用日志修复

部署 v1.1.0 前需执行 `alembic upgrade head`（反馈线程新表）。详见 [CHANGELOG](CHANGELOG.md) 与 [docs/handoff.md](docs/handoff.md)。

## 当前实现范围

- 统一模型接入注册表与 Provider 策略
- 统一任务记录、异步执行与成本留痕
- Studio 图像生成、模板浏览与历史管理
- 统一资产列表与灵感库
- 管理看板、使用日志、反馈与运营后台
- 单机 Docker Compose 服务器部署基线

## 本地记录体系

- `docs/prd/`：平台与模块 PRD
- `docs/projects/project-index.json`：项目索引
- `docs/projects/<项目编号>/status.md`：项目阶段状态
- `docs/handoff.md`：最新交接与部署状态

## 启动方式

### 一键本地开发（Windows）

在仓库根目录双击：

```text
start-dev.cmd
```

或在 cmd / PowerShell 中执行：

```bash
npm run dev:all
```

脚本会分别打开两个窗口：

- 后端：`http://127.0.0.1:18010/api/v1/health`
- 前端：`http://127.0.0.1:18080`

> 本地开发统一使用 `http://127.0.0.1:18080` → `http://127.0.0.1:18010`。`5180`、`8000`、`19010` 为历史调试端口，勿与 `start-dev.cmd` 并行占用。

如果只想检查依赖是否准备好：

```bash
npm run dev:check
```

### 后端

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 18010 --reload
```

### 前端

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1
```

默认地址：`http://127.0.0.1:18080`

### Redis Worker（可选）

当 `QMDH_TASK_EXECUTION_MODE=redis` 时，单独启动 worker：

```bash
cd backend
.venv\Scripts\activate
python -m app.worker
```

## 服务器部署

MVP 部署说明见 [DEPLOYMENT.md](DEPLOYMENT.md) 与 [docs/deployment.md](docs/deployment.md)。

当前推荐部署结构：

- `frontend`：Nginx 托管前端并代理 `/api`、`/media`
- `backend`：FastAPI API
- `worker`：Redis 异步任务执行
- `postgres`：业务数据库
- `redis`：队列

升级至 **v1.1.0** 时，除常规 `git pull` + `docker compose up -d --build` 外，还需 **`alembic upgrade head`**。
