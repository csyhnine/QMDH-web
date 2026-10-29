# 动效发布记录（2026-10-29）

沿用 `bugfix/migration-bootstrap-001`，接手 HEAD `7cec944`。范围为管理浮层、新生成图片、生成/画布导航和画布节点内部反馈；聊天与折叠区继续暂缓。草稿 PR #5 不合并，冻结审查状态保持。

## 发布前修正

复核新图片的异步显示逻辑，补齐图片 URL 切换后的等待状态复位，并使重复 load/decode 回调只消费一次淡入资格，避免后到回调提前终止动画。未改变 API、鉴权、保存、画布业务快照、坐标、连线及视口行为。

## 本轮验证与发布

最终候选、浏览器证据及发布工具保存在忽略目录 `local/motion-release-20261029/`；旧分批证据不覆盖。本轮构建 888 模块通过，状态测试 3/3，最终包统一浏览器 19/19（A 3、B 5+2、C/D 6+2+1）通过，pageerror=[]，13 个目标文件 TypeScript 诊断 0 项。A 旧合成账号缺少必需 project_codes 字段，补齐 fixture 后 3 场通过；生产代码未为该 fixture 改动。构建仍有既有大块提示，未运行整套 CI。

本轮新目录 `/opt/qmdh-frp/releases/motion-20261029`，新镜像标签 `qmdh-motion-frontend:20261029`。配对备份为服务器 `/www/backup/qmdh-release-20261029-motion` 与本机 `E:/backups/QMDH-web/release-20261029-motion`。

发布采用实际运行前端镜像的静态文件 overlay，保留旧 hash 资源；只切换 frontend，不清理服务器、不执行迁移、不发真实生成、不做生产测试写入。数据库及媒体继承 timeline-consistency → 既有纯前端链 → unit-access 独立快照与本机媒体基础包，不是本轮新数据快照；回滚只恢复前端镜像与配置，不覆盖新业务数据。

## 保留限制

定向通过不等于整仓 typecheck、整套 CI 或独立验收。管理删除取消后焦点落到 BODY 属既有行为，本轮未修复。手机触摸创建节点、同节点多个 task 完整交替、图片失败后重试、同账号权限原地变化及开发 StrictMode 双 effect 未穷举；账号浏览器切换经过整页导航，同 runtime 隔离由状态测试覆盖。

既有 `docs/checks.md`、`docs/plan.md`、`docs/review.md` 及无关未跟踪内容保持，未纳入本轮提交。
