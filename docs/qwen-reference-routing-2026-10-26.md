# Qwen 2.1 按输入张数选择 v1.1 工作流（2026-10-26）

状态：本地实现、离线模板及定向自验完成；未提交/推送/部署本轮改动，未发GPU或付费生成。线上当前仍为此前已发布单图合同。用户要求实现按上传张数切换，随后明确指出旧双图模板与v1.1参数不同；本轮采用v1.1派生新双图，未复用旧双图作为v1.1。

## v1.1模板依据

输入：D:/ComfyUI-aki-v2/integration/qmdh/workflow-map.json及workflows/qwen_image_2_1_image_edit-v1.1-api.json。现有单图SHA256 f0842f769bc97773b22b8852993b4e6b8ab3c8b1fe0ade15a6752d3cb4c2d504。

实际两版差异包括：旧双图KSampler.steps=25/cache.device=auto，v1.1为50/gpu；v1.1使用502 easy seed共享源、TextGenerate thinking等设置与旧版也有变化。不能只改输入数量、沿用旧双图其他参数。

新增离线准备器prepare_qwen_reference_variants.py只读取当前v1.1包，不读取v1.0模板，不修改ComfyUI原文件或在用目录。新双图从v1.1完整复制，只增加475 LoadImage、TextEncodeQwenImage21的images.image_2及BatchImagesNode的images.image1连接；原v1.1全部节点、50步、GPU缓存、thinking、共享seed、模型/采样/提示词处理映射等保持。实际节点源码comfy_extras/nodes_qwen.py和nodes_post_processing.py确认这些可扩展图片输入存在；未导入模型或分配GPU。

候选包：local/qwen-reference-routing-20261026/bundle-v11/。新图qwen_image_2_1_image_edit-v1.1-2ref-api.json SHA256 f18ba1fb2368895d520b4de758716cb143131ef785d500793909da92af1d9c3d。文生图v1.1和Z原文件逐字节保持，候选仅增加双图与map内reference_variants。脚本拒绝覆盖已有输出目录。

## 接线与恢复

- ProviderCapability新增reference_input_counts，验证文件SHA及合同后才返回[1,2]；旧reference_input_count保持主模板1。没配置变体的服务器仍走原固定输入数；模板损坏返回空可选列表，前端禁提交。当前只准备1/2，不假造3/4图模板。
- 前端实际上传上限取可用数量最大值，1张/2张均可提交；提示随张数显示将使用的编辑工作流，第一张目标图、第二张参考图。0张、未支持张数和不可用模板在前后端阻止，已有多余参考图不被静默裁掉。旧单图/旧固定双图合同兼容。
- 服务端从可信map按实际输入数选图，逐图检查原所有权/格式/大小，按loader顺序上传绑定全部图片。客户端不能指定任意模板路径或替代SHA。提交前校验返回的workflow_id/SHA/参考图数写入Task.result.comfyui，和任务/派发同事务保存；用户payload不被修改，因此原幂等fingerprint保持。
- worker按同一选图规则核固定SHA与输入数，恢复/逐张输出也复用原合同。变更模板或数量时停止，不重新提交未知prompt；原提交意图、prompt_id、租约、GPU锁、批量已完成结果与参考图丢失后的结果恢复边界保持。
- 对v1.1双图，运行时不仅核SHA，还核与v1.1单图的完整图/绑定差异白名单。即使管理员重算SHA，改回25步、auto缓存或旧thinking也拒绝；不能把v1.0改标签后冒作v1.1。

## 验证与限制

- 真实v1.1文件包离线检查4项通过（编辑单图/双图、文生图、Z），只3处引用拓扑变化；报告及差异见本证据目录。没有GPU实际出图/性能/显存结论。
- 既有adapter27 passed/12 subtests；派发及Comfy恢复定向85 passed/36 subtests（包含7个新增用例）；运行时参数保全补强后，新增10用例最终全过，与85中的7项重叠，不冒称最终整批重跑。5条第三方日志弃用warning保持。HTTP/Redis/媒体为隔离替身，任务接收/幂等为临时SQLite，未接生产库。
- 新增验证覆盖两档真实adapter上传全部图并绑定正确节点、恢复不再POST /prompt、接收时固定变体及重复提交保旧合同、缺少/损坏模板、参数降回旧版时拒绝。首次新增接收测试误设200，实际正确202，修正测试预期后通过。
- 前端Comfy12项+参考图历史16项共28 passed；实际上传选项构造器上限2也核过，旧双图文案保持兼容。9个目标源码strict0诊断（Vite ambient），离线Vite构建exit0、约3.04秒，有既有大块提示。该构建混合本工作树内前一任务的人员管理UI，仅作本地预览，不能当独立生产包上传。
- 未跑全套、安全专项、真实视频/GPU/付费/补账/清理；72 review=PENDING、25冻结STOPPED及R98唯一DONE保持。人员排期新UI与原未提交文档均保留，本轮没有委派。

## 后续发布要求

成套发布后端/worker/前端与候选map/模板，先排空Task/dispatch/上游和锁并备份，保留主Compose/FRP/3worker/工具/env/key及媒体恢复链；不可直接替换仍执行中的模板。启用后公开接口应返回[1,2]，同步把当前“单图编辑”展示名调整为通用图像编辑。新模板源目录及server单图在本轮保持原样；没有上线或GPU通过声明。

## 2.0兼容

沿用稳定provider/workflow/task身份、原项目/任务审计和持久结果，新增输入数量合同是可选字段。接受时固定具体模板与输入数，避免未来工作流步骤恢复时使用最新模板重做旧任务；不新增业务表、迁移或跨任务全局可变选择。
