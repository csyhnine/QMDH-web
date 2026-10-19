# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-19] ComfyUI 执行反馈与双图提交提示

- 用户指出本机没有进度条、上传一张不能编辑。旧百分比为估算；本轮补无百分比动态条（排队/执行/恢复，ARIA不伪报数值、减少动画偏好），不冒充ComfyUI采样步数。
- 已批准编辑图仍要求两图；原通用1–4张/已上传即可提交文案误导。上传标题与提示按本机模型明确第一目标图/第二参考图；按钮缺图直说、两图就绪可提交；后端两图校验保留。单图变体仍未实跑/未开放。提交阶段英文改中文。
- 前端52检查、23既有TS/0新增与构建；Chrome真实组件1440/390截图/无溢出/动态条实际transform变化、单图禁交与解释、双图触发表单通过。transport替身、未发送GPU任务。功能c048893、生产合并95794424，frontend ea1c9f24；公网index-BZjpV3Jk/GeneratePage-DLweP8Ox及CSS与容器SHA一致；其他容器ID/镜像/启动时间与env不变，六CAD401/health200。备份/www/backup/qmdh-comfy-feedback-20261019 ↔ E:/backups/QMDH-web/frp-20261019/comfy-feedback-backup：9文件SHA一致、DB/env/5823媒体清单/3增量及恢复链；旧frontend标签20261019-comfy-feedback可回退。原styles13行与原未跟踪文件保持。Safe to hand off: Yes。

### [2026-10-19] ComfyUI 创作框布局回归修复

- 用户截图暴露上次新增状态/尺寸两个根级 grid 子项占用原 auto/276px/auto 行，导致巨大留白。本轮恢复 leading/body/toolbar 三行；状态与自定义宽高放入既有比例/分辨率菜单，自定义默认折叠；新局部CSS，未动原styles.css +13。窄屏展开菜单占整行，输入框可读。
- 本地真实组件 Chrome headless：1440/390 宽度、三可见行/无横向溢出、自定义1536x1024应用、菜单状态及截图检查通过；仅transport替身，不声称线上点击或GPU实测。前端51检查、23既有TS/0新增、构建通过。
- 仅前端修复；后端、数据库结构、FRP、Windows守护保持。功能0a83c2a，生产合并d5311599，frontend镜像22fdfede；公网index-Dvm2Tjrk.js/GeneratePage-C1TJupfk.js及CSS与容器SHA一致，六CAD401/health200；其他容器ID/镜像/启动时间与env不变。备份/www/backup/qmdh-composer-layout-20261019 ↔ E:/backups/QMDH-web/frp-20261019/composer-layout-backup，9文件SHA一致，DB/env/5820媒体清单/0增量/恢复链；旧镜像qmdh-release-backup-frontend:20261019-composer-layout可回退。Safe to hand off: Yes。

### [2026-10-19] ComfyUI 生产闭环 — 已发布、真实验收完成

- 用户授权全部解决本轮审计缺口。功能7a9874b已推main，生产功能合并cb2bc791；迁移b27d0f85c932追加task_dispatches/reference_uploads。backend fc3ac003、worker 1fbaa318、frontend 3c01a252；env/key和FRP/DB/cache/search容器保持，ODA/FFmpeg/Nano Banana保留。
- 同事务DB待办、Redis短超时唤醒、本机FIFO/原子容量/租约心跳/失主隔离；幂等、原prompt/client_id核对、已下载文件SHA恢复、1～3张逐张checkpoint，未知不盲重交。终态错误不无限重试；管理员恢复/安全关闭有权限与审计。页面真实队列/恢复状态替换估算百分比，后端创建前422，三个渠道1K/2K/4K/自定义已开放。
- 九任务十一图：8245三张（9268～9270，worker中断后恢复）；8246/8247文生图2K（9271/9272，后者FRP断线保持原prompt）；8248双图1K（9273）；8249/8250文生图4K（9274/9275）；8253自定义1536×1024（9278）、8254/8255双图2K/4K（9279/9280）。每Task一ProviderCall、资产/下载SHA与上游实际prompt数量准确；旧失败记录未改/重跑。id60/61文生图、id62双图编辑启用，最后4K编辑约483秒。
- 用户已在管理员PowerShell安装SYSTEM开机守护；原用户守护退出，停止原两进程后SYSTEM重拉ComfyUI/frpc、仅127.0.0.1:8188与后端200、实际GPU成功。当前非提权令牌不可读SYSTEM任务/防火墙元数据；未做整机重启或长期压测。运行材料C:/ProgramData/QMDH-FRP，私钥仅Admin/SYSTEM未导出，私有windows/PRODUCTION-CLOSURE.md为最新本机交接，不再照旧前台/备份路径运行。
- 最终CI39215244482（7a9874b）两job成功：后端227+24subtests；前端50/23既有TS/0新增/构建。Linux最终镜像隔离30项；PG副本49旧表计数保留、并发串行/同键唯一/容量10项通过。公网四容器探活、frontend不可达、三渠道/三档/幂等/422、bundle SHA、六CAD+health通过。IAB工具超时，未声称真实浏览器点击验收。
- 发布前 /www/backup/qmdh-release-20261019-comfyui-closure ↔ 本机frp-20261019/closure-backup：5805媒体/3增量3881989字节、DB/env/旧镜像/Git bundle/FRP运行包及验证，25文件SHA配对。发布后 /www/backup/qmdh-comfy-closure-live-20261019 ↔ closure-live-backup：5820媒体/15增量111458315字节、DB/证据，10文件SHA配对，完整读取tar；恢复链引用发布前及之前全链。隔离验证数据库已删除。
- 重建带 /opt/qmdh-frp/compose.frp.yml overlay及3 worker，保留ODA材料；回退先排空/核对上游并禁用60/61/62，再回qmdh-release-backup-{backend,worker,frontend}:20261019-closure，不降schema/清库/删媒体。原styles.css +13与所有原未跟踪文件保持，未混提交。下一步仅按用户新需求。Safe to hand off: Yes。详见docs/comfyui-frp.md。

