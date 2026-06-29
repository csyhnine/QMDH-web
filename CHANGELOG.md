# Changelog

版本号以仓库根目录 [`VERSION`](VERSION) 为准，与 `package.json`、`CHANGELOG.md` 同步维护。

## v1.1.0 - 2026-06-26（本地已验收，待 commit / 部署）

相对生产环境 **v1.0.0** 的下一版功能集。GitHub `main` 已含部分改动（`cecab36`），其余仍在本地工作区。

### Added

- Studio **2K 生图**（Haodeya 网关对接；Gemini 2K + 16:9 验收 **2752×1536**）
- 历史卡片右下角显示 **分辨率 + 像素尺寸**
- **反馈多轮对话**：用户与管理员可在同一条反馈线程里继续讨论
- 运营看板分组支出：**自定义日期范围 + CSV 导出**

### Changed

- Studio 创作区 UX 迭代：标准 1K 标注、一次最多 3 张、工具栏固定网格、Ctrl+Enter 提交、参考图右上角移除
- 历史卡片统一「上文案 / 下图横向平铺 / 底操作栏」布局
- 上传限制调整为 **图片 20MB、文档 10MB**（nginx `client_max_body_size` 同步为 35m）
- 历史卡片时间按 **Asia/Shanghai** 显示（修复 UTC 少 8 小时）

### Fixed

- 使用日志 KPI 对齐与双重计费修复
- Haodeya 网关 2K 路由与模型映射（不拼 `-2k` 后缀）

### Deployment Notes

- 部署前需 **`alembic upgrade head`**（反馈线程新表 `user_feedback_messages`）
- 建议 Git 基线：`cecab36` 及之后 WIP 一并 commit / push 后再部署
- 生产 URL：`https://cityusbdisk.cn`（当前仍为 v1.0.0）

---

## v1.0.0 - 2026-06（生产环境当前版本）

设计院内部 AI 升级平台 **MVP 1.0** 基线，已部署于 `https://cityusbdisk.cn`。

### 范围

- Studio 图像生成主流程（工作流、任务、历史、模板）
- 统一模型接入、任务记录、异步执行与成本留痕
- Gemini `gemini-3.1-flash-image` CPA 路由修复
- 管理看板、使用日志、反馈（单次问答）、运营后台基础能力
- 单机 Docker Compose 部署基线

### Deployment Notes

- 生产 Git 基线：`51aba1b`（`fix(providers): CPA gemini-3.1-flash-image 走 chat/completions 策略`）
- 后端可能存在 hotpatch 漂移；镜像 rebuild 后应与 Git 基线对齐

---

## Legacy: v0.2.0 - 2026-06-08

早期内部版本记录（package `0.2.0` 时代）。产品口径已统一为 **v1.0.0 / v1.1.0**；本节仅作历史参考。

- 模型启用开关、QMDH 品牌、Studio 模板三栏布局、历史卡片比例缩放等
- 部署基线：`6ae35b1`
