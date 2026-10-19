# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-19] Qwen v1.1 仅同步准备

- 用户明确不跑GPU，enabled保持。读取新版交接，编辑LoadImage470一图/easy seed502，文生图easy seed486；50步/GPU缓存，输出461，Z原样。哈希见docs/qwen-v1.1-preparation.md。
- 准备分支codex/qwen-v11-preparation，未合main/未发布运行镜像；服务器独立/opt/qmdh-frp/prepared/qwen-v1.1-20261019暂存，线上旧模板/双图合同继续。共享种子源保留下游链接；一/双图按在用map合同输出API与前端校验，不硬切当前页面。
- 本地静态合同/后端23与前端回归通过；600秒profile与硬上限相同，旧4K25步483秒不能证明新版50步能达标。超时保留原prompt恢复，不盲重交；本轮不改预算。服务器--network none/read-only静态合同和Linux23项通过；前端53项/TS0新增/构建通过。03e845d已推准备分支，未合main；模板与源码已暂存，verification.json证明active文件SHA、provider enabled/timeout、容器ID/镜像/启动时间均不变，9证据文件两端SHA一致。未调用/prompt/无GPU。准备任务DONE（不代表激活）。后续激活需排空版本任务、成套部署与改展示名并受控GPU验收。

### [2026-10-19] ComfyUI 执行反馈与双图提交提示

- 用户指出本机没有进度条、上传一张不能编辑。旧百分比为估算；本轮补无百分比动态条（排队/执行/恢复，ARIA不伪报数值、减少动画偏好），不冒充ComfyUI采样步数。
- 已批准编辑图仍要求两图；原通用1–4张/已上传即可提交文案误导。上传标题与提示按本机模型明确第一目标图/第二参考图；按钮缺图直说、两图就绪可提交；后端两图校验保留。单图变体仍未实跑/未开放。提交阶段英文改中文。
- 前端52检查、23既有TS/0新增与构建；Chrome真实组件1440/390截图/无溢出/动态条实际transform变化、单图禁交与解释、双图触发表单通过。transport替身、未发送GPU任务。功能c048893、生产合并95794424，frontend ea1c9f24；公网index-BZjpV3Jk/GeneratePage-DLweP8Ox及CSS与容器SHA一致；其他容器ID/镜像/启动时间与env不变，六CAD401/health200。备份/www/backup/qmdh-comfy-feedback-20261019 ↔ E:/backups/QMDH-web/frp-20261019/comfy-feedback-backup：9文件SHA一致、DB/env/5823媒体清单/3增量及恢复链；旧frontend标签20261019-comfy-feedback可回退。原styles13行与原未跟踪文件保持。Safe to hand off: Yes。

### [2026-10-19] ComfyUI 创作框布局回归修复

- 用户截图暴露上次新增状态/尺寸两个根级 grid 子项占用原 auto/276px/auto 行，导致巨大留白。本轮恢复 leading/body/toolbar 三行；状态与自定义宽高放入既有比例/分辨率菜单，自定义默认折叠；新局部CSS，未动原styles.css +13。窄屏展开菜单占整行，输入框可读。
- 本地真实组件 Chrome headless：1440/390 宽度、三可见行/无横向溢出、自定义1536x1024应用、菜单状态及截图检查通过；仅transport替身，不声称线上点击或GPU实测。前端51检查、23既有TS/0新增、构建通过。
- 仅前端修复；后端、数据库结构、FRP、Windows守护保持。功能0a83c2a，生产合并d5311599，frontend镜像22fdfede；公网index-Dvm2Tjrk.js/GeneratePage-C1TJupfk.js及CSS与容器SHA一致，六CAD401/health200；其他容器ID/镜像/启动时间与env不变。备份/www/backup/qmdh-composer-layout-20261019 ↔ E:/backups/QMDH-web/frp-20261019/composer-layout-backup，9文件SHA一致，DB/env/5820媒体清单/0增量/恢复链；旧镜像qmdh-release-backup-frontend:20261019-composer-layout可回退。Safe to hand off: Yes。

