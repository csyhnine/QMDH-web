# QMDH Web

设计院内部 AI 升级平台的一期开发骨架，当前包含：

- `backend/`: FastAPI 后端，提供统一工作流、任务、资产、看板接口
- `frontend/`: React 前端，展示平台健康状态、工作流、任务和资产
- `qmdh-plan.md`: 当前项目规划文档

## 当前实现范围

- 统一模型接入注册表
- 统一任务记录、异步执行与成本留痕
- 统一工作流目录
- 统一资产列表
- 管理看板基础统计

## 本地记录体系

- `docs/prd/`: 平台与模块 PRD
- `docs/projects/project-index.json`: 项目索引
- `docs/projects/<项目编号>/status.md`: 项目阶段状态
- `docs/projects/<项目编号>/milestones.json`: 项目里程碑状态

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

MVP 1.0 已补充单机服务器部署基线，见 [DEPLOYMENT.md](E:\projects\QMDH-web\DEPLOYMENT.md)。

当前推荐部署结构：

- `frontend`：Nginx 托管前端并代理 `/api`、`/media`
- `backend`：FastAPI API
- `worker`：Redis 异步任务执行
- `postgres`：业务数据库
- `redis`：队列

## 后续建议

1. 把模拟供应商调用替换成真实适配器
2. 接入 Redis 持久化队列与失败重试
3. 增加登录、权限和项目级访问控制
4. 增加真实文件上传和对象存储接入
