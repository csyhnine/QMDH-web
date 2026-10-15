# 2026-10-15 其他导航一致性与 GIF 复制到压缩区

- 根因：AppShell 已将图纸改其他，但生成页独立 StudioGlobalRailNav 仍使用 Unicode 转义的旧图纸标签与 /studio/cad 链接，之前简单中文检索遗漏。现在两者共用 studioNavigation.ts 的 OTHER_TOOLS_NAV，名称与入口一处维护。图纸解析页签/功能保留。
- 结果详情（当前批次或持久历史/资产库回跳）增加复制到压缩区：从 original_storage_path 读取原始 GIF 为 File，恢复文件名、目标 KB、最长边、fps、颜色、两个适应选项，正确保留 0 与 false。清理 record_id 查询并滚动回表单，提示原记录保留；用户改参后手动提交。
- 没有从已压缩结果二次压缩；新提交沿用原单件接口/新 UUID/新历史记录。读取不到原件/空文件/超 20MiB/非 GIF 显示错误，不破坏当前结果；加载期间禁用输入和冲突操作，卸载后忽略响应。
- 前端完整 30 tests、23 既有类型错误/0 新增、构建通过。新增实际渲染两套侧栏并触发导航验证统一入口；原件读取/文件名/坏文件拒绝与参数 0/false 恢复测试，原结果按钮回归。
- 仅前端，不改 backend/迁移/旧记录/存储。分支 codex/gif-copy-and-navigation，基于 a1c90f3；原 styles.css 13 行/比较文档/_tmp_*、生产四文件差异与 CAD/key/卷/18010 保护继续。

发布结果待续。
