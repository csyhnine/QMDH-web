# 2026-10-13 新对话冷启动交接

## 已完成与现场状态

- 时间展示已提交/推送/部署：功能 b619413，发布记录 cf9cf22；本轮留档前本地 HEAD/origin main 为 cf9cf22，分支 feature/skill-feedback-003-public-sessions。此次留档会产生后续文档提交，以 git 为准。
- 生产 git 当前 0a41ad8c（合并发布记录）；实际前端镜像来自功能合并 b04ffb53，镜像 sha256:c994f59a4f49c2f563d75cea675647b8d94ddbc7863867381cb94c7af18bae79。本轮只读再查工作区干净、frontend running、health/database/redis healthy。
- 后端未更新，镜像仍 10-10 发布版本；迁移 d5e6f7g8h9i0。聚合问题显示创建/更新，原始事件显示发生/接收，完整日期时间并标注北京时间。
- 本地前端统一检查 16 项通过，23 个既有类型错误、0 新增；构建通过。公网新 JS 包已核对时间标签，未完成已登录浏览器的视觉验收。
- 发布与备份详档：handoff-2026-10-13-feedback-time-release.md。配对备份目录为服务器 /www/backup/qmdh-release-20261013-feedback-time、本机 E:/backups/QMDH-web/release-20261013-feedback-time；完整包、旧增量、新增量恢复顺序已记录。旧两包 SHA256 本轮重新验证通过，新包完整读取通过，当前 5742 文件覆盖核对通过。旧前端镜像保留。

## 反馈真实进展（不要退回旧交接）

- 外部客户端已在 E:/projects/test/agent-skills 实现，已有三个公开 ID；详见 handoff-2026-10-12-feedback-client-verification.md。该仓库 agent 独立维护，本轮未改其文件或给其发消息。skill 名称/版本近期变化，继续前只读核对当前 qmdh.json 与脚本，不拿旧 0.1.4 当固定最新版本。
- 本轮真实服务器查询已见大岗镇检索事件 10/11/12、run_id=5：交付自报 39 条事实/24 张图片，文字自评 100/pass=true；图片自评 95/pass=false，明确仅元数据级核验、模型无法读图。发生北京时间 10-13 10:54:56，接收约 10:55:10。这些是客户端声明，不证明实际素材已核实，也不能据此宣称 WorkBuddy 全验收通过。
- 事件 1–9 包含接入测试/格式探针，不应当真实投诉。用户授权本次 integration_test 三事件与后台核实聚合；事件 2/3/4、run_id=2 是本 agent 测试，delivery 原内容重试 duplicate=true。
- 查询时测试问题 3/4 仍 pending，后台核实/聚合未执行。不能把合成 human 测试当真人业务纠正，不核实其他真实数据为已通过。

## 下一步顺序

1. 按 protocol 冷启动，查 Git/未提交文件，读 tasks/handoff/本档/roadmap 与相关 architecture/decisions；代码优先于文档。
2. 直接 SSH 只读核对最新反馈、登记 ID 与客户端版本。用户明确希望能访问服务器查内容，不必把只读核查卡在浏览器登录。连接方式可参考既有受保护本机脚本，禁止打印/提交秘密、禁止盲跑旧 _tmp_*。本轮临时远端工具在 C:/Users/Admin/AppData/Local/Temp/qmdh-release-remote.py，仅辅助、可消失，不作为长期依赖。
3. 完成时间 UI 视觉检查和既已授权测试 run_id=2 的核实/聚合验收；原始事件、待核实和聚合分别核对。新增真实用户采集或超出已有范围的生产写入需另明确范围。
4. 对真实平台产物核查实际版本、调用记录、安全回执及问题/纠正证据；后续跨进程纠正尚无常驻监听，不承诺自动送达。
5. 扩大使用前做 skill-feedback-005：真实 IP/代理信任链只读核验。当前信任默认空，共享来源限额，不信任全网或伪造来源头。不重复开发已部署 sessions/events/admin 接口。

## 工作区与红线

- 唯一已跟踪未提交改动是 frontend/src/styles.css 原访客样式 13 行；另有 docs/compare-qmdh-openclaw-codex.md、scripts/_tmp_* 等未跟踪文件，全部保留、不混入提交。
- 本轮发布仅提交指定前端/测试/正式交接文档，没有提交 .env、业务库、媒体、token 或临时脚本。
- 不换 QMDH_ENCRYPTION_KEY，不 down -v，不删除数据库/媒体卷，不占用或杀他人 18010；生产 git 用 sudo -u admin，历史合并不支持盲用 --ff-only；保留 Nano Banana 四文件历史差异。
- CAD 等官方 Linux ODA 安装包；不自行下载安装、不改布置算法、不拆卫生间、不做线稿/生图；禁重跑 ce_94778ce26c6e、生成 ce_d2955df6f9b9、修改 ce_b121e1b892de，ce_0abae8a9402f 不自动重转。
- 媒体审计/容量/缩略图/历史视频问题为其他待办，不自动扩任务。详见 tasks。

Safe to hand off: Yes。时间展示已发布，skill-feedback-004 仍 IN_PROGRESS；本轮留档不重建镜像或修改生产数据。
