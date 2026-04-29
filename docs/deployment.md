# QMDH MVP 1.0 部署说明

## 当前建议

仓库已经提供了根目录 [docker-compose.yml](/E:/projects/QMDH-web/docker-compose.yml) 作为当前 MVP 1.0 的部署入口。

当前编排包含：

- `frontend`：Nginx 托管前端静态资源
- `backend`：FastAPI + Uvicorn 提供 API 与媒体文件
- `worker`：异步任务消费
- `postgres`：业务数据库
- `redis`：任务队列

这套结构比本地开发环境更接近后续服务器部署形态。

## 启动方式

在仓库根目录执行：

```powershell
docker compose -f docker-compose.yml up --build -d
```

启动后默认地址：

- 前端：`http://localhost`
- 后端健康检查：`http://localhost:8000/api/v1/health`

## 本地开发端口

Windows 本地开发可以直接在仓库根目录双击或执行：

```powershell
.\start-dev.cmd
```

它会分别打开后端和前端两个 cmd 窗口：

- 后端：`http://127.0.0.1:18010`
- 前端：`http://127.0.0.1:18080`

也可以通过 npm 别名启动：

```powershell
npm run dev:all
```

如需只检查依赖是否准备好：

```powershell
npm run dev:check
```

Codex Desktop 和其他本地项目可能会占用常见端口，本地开发时建议把 QMDH 后端启动在 `18010`：

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 18010
```

前端 Vite 开发服务器默认监听 `18080`，并会把 `/api` 和 `/media` 代理到 `http://127.0.0.1:18010`：

```powershell
cd frontend
npm run dev -- --host 127.0.0.1
```

如需改成本机其他后端地址，可以设置 `VITE_API_PROXY_TARGET`。

## 生图模型配置

当前生图 provider 可以通过两种方式配置：

1. 后端环境变量 `QMDH_IMAGE_PROVIDER_PROFILES_JSON`
2. 管理端 `/admin/models` 写入数据库的 provider profile

示例：

```env
QMDH_IMAGE_PROVIDER_PROFILES_JSON=[{"provider_name":"modelscope_free_image","api_key":"your-token","base_url":"https://api-inference.modelscope.cn/v1","model_name":"MAILAND/majicflus_v1","adapter_kind":"openai_compatible","capabilities":["image.generate"],"reference_mode":"caption_prompt","reference_caption_model":"Qwen/Qwen3-VL-8B-Instruct"}]
```

建议在服务器上通过 shell 环境变量或 `.env` 文件注入，不要直接把真实 token 写进仓库。

管理端保存的配置会进入 `provider_profiles` 表，并在后端返回 provider 列表、任务创建校验和任务执行时生效。同名数据库 provider 会覆盖环境变量中的同名配置，便于运行中切换模型或 key。

模型与 key 管理不在设计师创作台暴露。管理人员需要直接访问：

```text
http://127.0.0.1:18080/admin/models
```

对应的 `GET/POST/PATCH/DELETE /api/v1/providers/profiles` 接口只允许 `admin`、`owner`、`ops` 角色访问。

当前 MVP 只在前端脱敏展示 key，数据库内仍是明文保存。生产环境上线前需要补充密钥加密、访问审计和轮换策略。

如果上传了参考图，`reference_mode=caption_prompt` 会让后端先调用视觉语言模型读取参考图，再把参考说明拼入文生图 prompt。这个方案能让参考图真实影响结果，但它不是直接的 `img2img / image.edit`，后续如果接入支持图生图的模型，需要再补专用 adapter。

如果需要兼容当前 `docker-compose.yml` 中的 Redis worker 模式，请同时确认：

- `QMDH_TASK_EXECUTION_MODE=redis`
- `QMDH_REDIS_URL=redis://redis:6379/0`
- `QMDH_REDIS_QUEUE_NAME=qmdh:tasks`

## 最小认证配置

当前 MVP 已加入最小 token 认证。前端请求会发送：

- `X-QMDH-User`
- `X-QMDH-Auth`

后端通过 `QMDH_AUTH_USERS_JSON` 派生可信用户与项目访问范围，不再信任任务或模板 payload 中的 `user_name`。

开发默认值：

```env
QMDH_AUTH_USERS_JSON=[{"name":"reviewer","token":"dev-reviewer-token","role":"reviewer","project_codes":["QMDH-001"]}]
```

如需本地打开 `/admin/models`，需要配置一个管理角色，例如：

```env
QMDH_AUTH_USERS_JSON=[{"name":"admin","token":"dev-admin-token","role":"admin","project_codes":["*"]},{"name":"reviewer","token":"dev-reviewer-token","role":"reviewer","project_codes":["QMDH-001"]}]
VITE_QMDH_USER=admin
VITE_QMDH_AUTH_TOKEN=dev-admin-token
```

前端可通过 Vite 环境变量覆盖默认开发账号：

```env
VITE_QMDH_USER=reviewer
VITE_QMDH_AUTH_TOKEN=dev-reviewer-token
```

生产环境应替换默认 token，并按项目授权填写 `project_codes`。如果需要临时允许某账号访问所有项目，可以使用 `"project_codes":["*"]`。

## 当前已具备

- 图像生成主流程
- 生成历史流展示
- 自定义提示词后端持久化
- 参考图真实上传并保存到后端媒体目录
- 模型与 API key 后台配置入口

## 下一步建议

- 为后端补生产级日志方案和反向代理配置
- 为 provider profile 增加密钥加密、轮换和操作审计
- 将热门提示词也改成后端可配置
- 为参考图和生成图补清理策略与容量监控
