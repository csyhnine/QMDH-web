# Deployment

QMDH-web 的 MVP 1.0 服务器部署基线采用单机 Docker Compose 方案：

- `frontend`：Nginx 托管前端静态文件，并反向代理 `/api` 与 `/media`
- `backend`：FastAPI API 服务
- `worker`：Redis 队列消费者，负责异步任务执行
- `postgres`：业务数据库
- `redis`：任务队列

## 1. 准备

服务器需要：

- Docker
- Docker Compose Plugin
- 可访问 OpenAI Images API 的外网环境

建议至少准备 2C4G 服务器作为 MVP 测试环境。

## 2. 配置环境变量

在仓库根目录创建 `.env`，至少填写：

```env
QMDH_ENCRYPTION_KEY=replace_with_a_stable_fernet_key
QMDH_FRONTEND_ORIGIN=https://your-domain.example.com
QMDH_OPENAI_IMAGE_API_KEY=your_real_key
QMDH_OPENAI_IMAGE_MODEL=gpt-image-1
QMDH_BOOTSTRAP_ADMIN_PASSWORD=replace_with_a_strong_password
```

如需覆盖默认值，也可额外填写：

```env
QMDH_OPENAI_IMAGE_BASE_URL=https://api.openai.com/v1
QMDH_OPENAI_IMAGE_TIMEOUT_SECONDS=90
QMDH_OPENAI_IMAGE_QUALITY=medium
QMDH_OPENAI_IMAGE_OUTPUT_FORMAT=png
```

后端本地开发也会读取仓库根目录 `.env`；如果你单独在 `backend/` 目录运行服务，也可以改填 `backend/.env`。

如果你要改数据库密码，也请同步修改 `docker-compose.yml` 中：

- `POSTGRES_PASSWORD`
- `QMDH_DATABASE_URL`

## 3. 启动

```bash
docker compose up -d --build
```
Production note:
- Docker frontend host port defaults to `8080`
- backend health is reachable through `http://<server-ip>:8080/api/v1/health`
- if you use Baota or another host-level Nginx, reverse-proxy `80/443` to `127.0.0.1:8080`

启动后默认访问：

- 前端：`http://<server-ip>/`
- 后端健康检查：`http://<server-ip>/api/v1/health`

## 4. 停止

```bash
docker compose down
```

如果需要同时清理数据卷：

```bash
docker compose down -v
```

## 5. 数据与文件

- PostgreSQL 数据保存在 `postgres_data`
- Redis 数据保存在 `redis_data`
- 生图结果和媒体预览保存在 `backend_media`

## 6. MVP 说明

这一版部署方案面向 MVP 1.0，特点是：

- 可以把基础生图、任务队列、图库预览部署到一台服务器
- 前端和后端通过同域 `/api`、`/media` 协作，省去额外跨域处理
- 仍然不是完整生产方案，暂未包含：
  - HTTPS 证书自动化
  - 细粒度权限控制
  - 对象存储
  - 正式 migration 体系
  - 集中式日志与监控
