# Architecture

## 1. Purpose
本文件描述项目的**当前有效结构**，用于帮助新 agent 快速理解：

- 系统入口在哪里
- 核心模块有哪些
- 模块边界是什么
- 当前任务主要影响哪里

本文件只写“当前有效状态”，不写长篇历史演化。

---

## 2. System Overview
> 用简短文字描述当前系统。  
> 例：这是一个前后端一体项目，前端使用 Next.js，后端使用 FastAPI，认证逻辑位于 `backend/auth/`，文件处理逻辑位于 `backend/core/file_editor.py`。

---

## 3. Key Entry Points
列出关键入口文件：

- 应用入口：
  - `path/to/app-entry`
- API 入口：
  - `path/to/api-entry`
- 前端入口：
  - `path/to/frontend-entry`
- 后端服务入口：
  - `path/to/backend-entry`

---

## 4. Module Boundaries

### Module: [module-name]
- 路径:
  - `path/to/module`
- 职责:
  - ...
- 依赖:
  - ...
- 不应负责:
  - ...
- 当前相关任务:
  - `task-xxx`

### Module: [another-module]
- 路径:
  - `path/to/module`
- 职责:
  - ...
- 依赖:
  - ...
- 不应负责:
  - ...
- 当前相关任务:
  - ...

---

## 5. Data / Control Flow
> 用项目可理解的方式描述主流程。  
> 例：
1. 用户请求进入 API 路由
2. 中间件完成鉴权
3. 服务层调用核心处理模块
4. 结果返回给前端展示

---

## 6. Current Hot Spots
这里记录当前最容易被误改、最值得注意的区域：

- 热点模块 1：
  - 原因: ...
  - 风险: ...
- 热点模块 2：
  - 原因: ...
  - 风险: ...

---

## 7. Architecture Change Rule
若本轮任务改变了以下任何内容，必须同步更新本文件：

- 模块边界
- 关键入口
- 主流程
- 依赖关系
- 当前热点区域
