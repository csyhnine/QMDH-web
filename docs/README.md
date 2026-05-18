# 文档体系

这套文档用于本地记录产品需求、模块边界和各项目阶段状态，和运行时数据库分开管理。

## 目录说明

- `prd/`: 平台级与模块级 PRD
- `projects/`: 按项目分目录存放状态记录与里程碑文件
- `roadmap-2.0-prep.md`: 1.0 如何为未来 2.0 升级方向预留地基

## 使用约定

1. 平台级需求先更新 `prd/平台总PRD.md`
2. 模块需求变更同步更新对应模块 PRD
3. 每个项目单独维护 `status.md`
4. 阶段和里程碑状态统一写入 `milestones.json`
5. 任务执行状态仍以数据库为准，项目阶段状态以 `docs/projects` 为准

## 当前入口

- 平台总 PRD：`prd/平台总PRD.md`
- 项目索引：`projects/project-index.json`
- 模板目录：`projects/_template/`
