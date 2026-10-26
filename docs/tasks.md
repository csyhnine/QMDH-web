2026-10-26自动保存已上线：前端3745c5b/镜像a6acf0585e54，已有项目资料和已应用甘特/人员排期停顿约1秒保存，可按账号关闭，失败/冲突保留草稿并停止自动重试；新项目首次仍需创建。7浏览器场景/15定向/7目标strict0通过，51文件及公网包一致。后端/三worker/分院和业务数据保持；当前第三Compose为/opt/qmdh-frp/releases/planning-autosave-20261026/compose.release.yml，模板仍依赖management-categories-20261026/workflows。配对备份23文件SHA一致。见[记录](planning-autosave-2026-10-26.md)，72待验收/25冻结/R98保持。

以下为此前时点记录，当前前端及Compose以顶部为准。

2026-10-26甘特直接管理已上线：前端源码7cdfcb1/镜像6a33c791833c，显示全部工作/完整日期、明确添加编辑入口、图旁编辑人员与内容、自定义月历，真实鼠标移动/拉伸及保存/冲突/窄屏通过。仅前端替换，后端/三worker/分院权限和业务数据保持；当前第三Compose为/opt/qmdh-frp/releases/gantt-direct-20261026/compose.release.yml，继续依赖management-categories-20261026/workflows。配对备份23文件SHA一致。见[记录](gantt-direct-2026-10-26.md)，72待验收/25冻结/R98保持。

下方记录为此前时点，当前前端与Compose以顶部为准。

2026-10-26管理导航已发布：前端85c4650/3b65e290098a，固定四页宽度与子菜单吸顶，增加页面用途和分院边界说明；隔离定向22、前端15、浏览器5场景通过。后端/三worker仍8080b23，f62迁移/42名册与项目保持；仅前端替换。当前第三Compose为/opt/qmdh-frp/releases/management-navigation-20261026/compose.release.yml，并继续依赖management-categories-20261026/workflows。23文件配对备份SHA一致。见[记录](management-navigation-2026-10-26.md)，72待验收/25冻结/R98状态保持。

以下为此前记录，当前前端及Compose以顶部为准。

2026-10-26分院名册/删除已部署：运行源码8080b23，生产迁移f62ab073d957；一院15、合并后二院19、三院8，新增37/关联原5，共42人，原项目/账号分组和授权保持。已授权公司admin切换三院，院管理者仍本院。项目详情可删除到回收站并恢复。27文件配对备份SHA一致；当前第三Compose为/opt/qmdh-frp/releases/management-categories-20261026/compose.release.yml。详见[发布记录](management-categories-2026-10-26.md)。草稿PR #5未合并，72待验收/25冻结/R98保持。

以下记录保留历史时点，当前运行版本以顶部为准。

2026-10-26双功能已部署：运行源码d96d508已推送，人员跨项目甘特/拖拽分工与Qwen v1.1单/双图自动路由上线。公开输入数[1,2]、隔离PG保存/409与接收/幂等、公网新包通过；backend健康/3worker/frontend运行，生产迁移仍e51，无GPU出图。26文件配对备份SHA一致，25媒体归档链仍需本机两份基础包。当前第三Compose改为/opt/qmdh-frp/releases/people-qwen-20261026/compose.release.yml，工作流绑定同目录/workflows，禁止旧Git重建。详见[发布记录](release-people-qwen-2026-10-26.md)。草稿PR #5未合并，72待验收/25冻结/R98状态保持。

以下此前执行记录保留为历史，以顶部发布记录为当前状态。

- 2026-10-26双功能发布执行：用户明确授权提交/部署人员工作台与Qwen v1.1单/双图路由，显式白名单提交、隔离候选与备份后切换。见[执行记录](release-people-qwen-2026-10-26.md)。不合并main/不委派/不发GPU，保留72待验收和25冻结状态。

- 2026-10-26 QWEN-REF-AUTO-001 IN_PROGRESS / review=PENDING：按上传1/2张自动选择工作流，已提交并部署（运行源码d96d508）；新双图严格由v1.1派生，50步/gpu缓存/thinking/共享seed保全，运行时拒绝旧参数回退。接收时固定SHA/输入数、恢复不重提，前后端已接线；定向测试/真实包离线检查通过，已推送/部署，未发GPU。见[接线与证据](qwen-reference-routing-2026-10-26.md)。人员排期及其他原改动保持，72待验收/25冻结/R98状态不变。

- 2026-10-26人员排期易用性：UX-PEOPLE-001 IN_PROGRESS / review=PENDING。本地新增可选人员与职务/余量、跨项目甘特拖拽、阶段和管理分工直接安排；隐藏项目负荷不漏计，预览/逐项目保存和冲突保全。15项定向测试、10浏览器场景和4目标strict0通过，已提交/推送/部署，待用户体验与独立验收。详见[工作台记录](people-planning-2026-10-26.md)。原未提交文档已保全，72待验收/25冻结/R98保持。

2026-10-26发布完成：源码e6add45已推送，草稿PR #5未合并；backend健康/3worker运行/frontend新包生效，生产迁移e51、源码/静态包/公网核验通过。23文件私有配对备份SHA一致，24媒体归档恢复链中2个基础包依赖本机。当前第三Compose和有效发布目录必须保留，详见[执行记录](release-execution-2026-10-26.md)。72待验收、25冻结及R98唯一DONE保持。

- 2026-10-26发布执行：已固定288个源码/测试文件白名单并保全原工作树；服务器候选PG空库/b27升级、受控应用启动与路由/种子/模型列检查通过；生产切换尚未执行。见[执行记录](release-execution-2026-10-26.md)。72项review=PENDING、25冻结STOPPED保持。

# Tasks

- 2026-10-25发布执行移交：用户最新请求另开新对话负责更新GitHub并部署服务器；具体授权、候选、资源边界与步骤见[发布交接](release-handoff-2026-10-25.md)。该发布请求覆盖此前不提交/推送/部署及只读限制，冻结25项、不委派、不切分支与数据保全继续有效。原对话交接后停止编辑共享工作区，由新对话完成候选隔离验收、必要GitHub更新和验证后的部署；当前尚未提交/推送/部署，72项review=PENDING不变。

- 2026-10-25服务器只读核对：见[实测结果与候选路线](server-readonly-report-2026-10-25.md)。backend健康/3 worker运行、Qwen种子热修和b27迁移基线已确认；57内容差异+19新增组成76文件本地覆盖输入，102仅换行文件排除。10容器启动时间保持；无上传/构建/重启/迁移/部署。下一阶段服务器隔离候选验收超出只读授权，待明确；本机Docker daemon当前不可用，72待验收/25冻结状态不变。

- 2026-10-25发布准备：见[本地就绪核对](release-readiness-2026-10-25.md)。离线前端构建exit0；51迁移静态单head e51fa962c846/无缺父；615源码配置哈希保持。已整理候选源快照与上线/回退步骤，尚未连接服务器、执行迁移或发布。建议下一步仅只读核对实际镜像/配置/迁移基线，保全线上Qwen/种子热修；普通72待验收、25冻结状态不变，不自关单。

- 当前执行：F83 / R96已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f83-r96-2026-10-25/evidence.md)。用户已知长度标定优先，其次有效声明单位；3/80米跨度与门洞线索只提示冲突，不再覆盖已声明比例。缺失/无法换算仍保旧估算但明确来源/需标定，floor/root保存单位元数据，旧图仅在用户显式标定后改当前floor并保initial来源。100×80米及同物理厘米/毫米均约8000㎡，真实polygon/usable/家具换算/legacy标定与undo链路已验。后端25精确节点累计通过：首轮21过、修正3测试预期后对应3过，追加1隔离驱动执行6个原毫米用例也通过；前端3 passed、2目标strict前后0诊断。1259基线/83旧档保持；普通1已验收、72进行中、0 TODO，冻结25 STOPPED、总未解决97。未关闭任何R项，当前不等于全部bug完成；下一需用户指定解冻项或独立验收范围，不自行复核全项目/委派/解冻/提交部署。

- 当前执行：F82 / R89已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f82-r89-2026-10-25/evidence.md)。bundle独占随机暂存/payload和私有ZIP，同输出exclusive-create锁冲突先于媒体准备；完成ZIP关闭且输出未改变才原子replace。复制/manifest/ZIP/发布前核归属，仅清本次核验目录/锁，原固定__bundle和他任务目录不碰。清理失败单独返回warning/保留路径，不把已发布成功改失败、不覆盖原错误；失去归属/既有锁不自动删。22新+原build1共23 passed/5 subtests、child0，无warning/fail/skip；全部专用临时文件/ZIP与媒体替身。1257基线/82旧档保持，普通1已验收、71进行中、1 TODO，25冻结STOPPED、总未解决97。无真实维护/下载/媒体/业务库/委派/独立复核/提交部署，不关R89，下一R96先核入口并定有界卡。

- 当前执行：F81 / R88b已本地实施，R88两部分本地实现齐备但整体IN_PROGRESS / review=PENDING；[证据](archive/f81-r88b-2026-10-25/evidence.md)。共享reader按版本/身份/状态解读观测，旧未标记Agent与坏/未来事件为unknown，调用率以known轮次为分母并显示覆盖数。低调用率仅known>=min10且精确计数比小于阈值才触发；样本不足不触发也不自动恢复旧告警。非流式TTFT/null与完整first_response分列，API/TS/界面保三态、未知不作否/0。后端16新+6受影响共22 passed/23 subtests，界面5 passed，2目标strict含Vite ambient前后0诊断；均child0。1254基线/81旧档保持，普通1已验收、70进行中、2 TODO，25冻结STOPPED，总未解决97。未运行evaluate/调度/写告警或历史回填、真实模型/服务，无委派/独立复核/提交部署；R88不关单，下一R89先定有界本地修复卡。

- 当前执行：F80 / R88a已本地实施，R88整体仍IN_PROGRESS / review=PENDING；[证据](archive/f80-r88a-2026-10-25/evidence.md)。实际非流式Model.request边界记录逐次run/call/turn身份、尝试状态和耗时，Agent线程桥接到Tracker版本化metadata；多工具往返分别计数，不把thinking或本地回复分片当首token。完整响应时间单列first_response_ms，TTFT明确null；取消时快照censored，尚未观测调用为unknown，晚到worker不能改已存快照。19新+F73/F74受影响51共70 passed、41条第三方弃用warning、child0。1252基线/80旧档保持；普通1已验收、70进行中、2 TODO，25冻结STOPPED，总未解决97。R88a只补采集，下一F81/R88b必须统一新旧覆盖/聚合/API/告警口径；不关R88，无真实模型/HTTP/业务库/告警评估/委派/独立复核/提交部署。

- 当前执行：F79 / R87b已本地实施，R87两部分本地实现齐备但整体IN_PROGRESS / review=PENDING；[证据](archive/f79-r87b-2026-10-25/evidence.md)。全量同步新建随机generation，创建/配置/分批写入逐task核UID/目标/成功终态并核文档数量，再按业务revision及旧active锁内CAS切换并ack意图；失败/未知/并发变化保旧索引。零集可切空新代，旧不确定任务晚到只影响旧代。读取只用DB active并回主库核指纹/存在性/shared可见性，以主库字段返回；未就绪/pending/异常/陈旧走原SQL。32新+F78受影响32共64 passed、41 subtests、1既有弃用warning、child0。1250基线/79旧档保持，普通1已验收、69进行中、3 TODO，25冻结STOPPED，总未解决97。无真实Meili/PG/业务库/迁移同步/委派/独立复核/提交部署；R87不关单，下一普通R88先核真实调用遥测边界并定有界卡。

- 当前执行：F78 / R87a已本地实施，R87整体仍IN_PROGRESS / review=PENDING；[证据](archive/f78-r87a-2026-10-25/evidence.md)。六个灵感/共享模板CRUD同事务保存业务与持久索引意图，响应后使用独立Session派发；索引异常不再把已提交成功伪成失败。每域单在途凭据，异步终态确认才记应用版本，未知提交不盲重发；重试从主库读取最新状态。新增迁移只建两表/两个锁行，SQLite DDL/seed/版本失败完整回滚。32新+R32受影响12共44 passed、3 subtests、1既有弃用warning，child0。1247基线/78旧档保持；普通1已验收、69进行中、3 TODO，25冻结STOPPED，总未解决97。R87a仅部分修复，下一F79/R87b完成新generation全量同步/CAS切换、读取主库核验及pending SQL回退；未知提交恢复依赖该后续卡，不关R87，无委派/独立复核/真实索引或服务/提交部署。

- 当前执行：F77 / R86e已本地实施，R86各本地修复路径及补账入口齐备但整体IN_PROGRESS / review=PENDING；[证据](archive/f77-r86e-2026-10-25/evidence.md)。新增明确receipt ID的默认只读预览/指纹核对apply工具，统一三路径metadata-only settle，不导入SDK/读取正文/重放模型记忆。未知/冲突/陈旧预览不写；重复与并发只留一账，部分失败非零退出。新增完整身份/金额/计数/时间/类型核对，拒绝跨类型同一调用重复账。23新+三路径受影响84共107 passed、1既有弃用warning、child0。1244基线/77旧档保持，普通1已验收、68进行中、4 TODO，25冻结STOPPED、总未解决97。未执行真实维护CLI/业务库操作，无委派/独立复核/提交部署；R86不关单，下一R87先核索引副作用边界并定有界卡，不以复核阻断普通修复。

- 当前执行：F76 / R86d已本地实施，R86整体IN_PROGRESS / review=PENDING；[证据](archive/f76-r86d-2026-10-25/evidence.md)。普通回复模型前留独立凭据，回复/数字用量先独立提交和计账，再memory；记忆失败不回滚已知消耗。未报用量unknown不填0，累计已知计数不被空/坏/零事件覆盖。每chunk交付前核会话，删除/无法确认后停止输出并只保合法用量收尾，不回建内容；重复完成只写一消息/账/记忆。21新+原R12 10+F75停止2共33 passed、1既有弃用warning、child0。1242基线/76旧档保持，普通1已验收、68进行中、4 TODO，25冻结STOPPED、总未解决97。下一继续R86 pending凭据可用运维补账入口，不关单，无委派/独立复核/真实服务/提交部署。

- 当前执行：F75 / R86c已本地实施，R86整体IN_PROGRESS / review=PENDING；[证据](archive/f75-r86c-2026-10-25/evidence.md)。普通Chat压缩每次调用独立凭据，先提交原会话摘要与无正文数字用量，再独立计账；同until多次真实调用分别记账，空摘要也保已知消耗。失败Session先rollback再裁剪/静态日志，输入快照避过期ORM；摘要提交故障仅重试本地结果，删除/无法核实停止后续回复，不重建内容。25新+原R12受影响10共35 passed、1第三方弃用warning、child0。1240基线/75旧档保持，普通1已验收、68进行中、4 TODO，冻结25 STOPPED、总未解决97。下一继续R86普通回复memory事务及pending凭据运维接入，不关单、无委派/独立复核/真实服务/提交部署。

- 当前执行：F74 / R86b已本地实施，R86整体IN_PROGRESS / review=PENDING；[证据](archive/f74-r86b-2026-10-25/evidence.md)。Agent模型前提交调用凭据，完成后先保存原会话回复和无正文的数字用量，再独立记账/写记忆；删除后保合法消耗，不重建内容。按receipt唯一源去重，账本失败可仅按凭据补账并沿调用价格快照；成功但未报用量明确unknown，不伪造零账。路由复用消息/账本且核call_id，取消等待不阻断后台完成；28新+23受影响回归51 passed。原未提交/74旧档保持，普通1已验收、68进行中、4 TODO，冻结25 STOPPED、总未解决97。下一F75继续R86普通Chat压缩摘要与失败Session恢复；无委派/独立复核/真实服务/提交部署，不关任何R项。

- 当前执行：F73 / R86a已本地实施，R86整体IN_PROGRESS / review=PENDING；[证据](archive/f73-r86a-2026-10-25/evidence.md)。Agent完成后记忆改用独立Session，不commit/rollback调用者或已接受工具；flush/commit失败仍保原reply和已知token/cache。模型前产生本次call_id；独立DB标量检查会话，删除/属主不匹配撤销，无法核实停止输出，路由不写回复预览/消息/旧遥测。23精确离线回归通过，原2真实约束红复现保留；原未提交及73旧档保持。普通1已验收、68进行中、4 TODO，冻结25 STOPPED、总未解决97。R86仍欠独立持久call/用量审计、取消/删除及重复记账、普通Chat压缩摘要与失败Session恢复；下一F74先接持久审计边界，不以本卡吞异常冒称全修，无委派/复核/真实服务/提交部署。

- 当前执行：F72 / R81已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f72-r81-2026-10-25/evidence.md)。管理回复捕获反馈/editor与字段版本，原提交成功仅清未改文本，期间B/ABA及新沟通状态保留；改进状态独立版本/baseline确认，不清回复框。reply/improvement同步互斥并保持列表busy禁切换，旧账号/error/finally不占新操作；已发送与刷新失败分开，父列表latest读取且草稿保全。32实际React/DOM场景+1隔离33 passed，2目标strict前后同3旧router JSX、新0；原反馈UI快照及CSS SHA保全。普通1已验收、67进行中、5 TODO，冻结25未解决，总未解决97；R81不关单，无委派/独立复核/真实消息通知或服务/提交部署。NEEDS_CARD已无剩余，下一普通待设计R86先核后置事务边界并定卡，R86/R87/R88/R89/R96仍NEEDS_DESIGN，25冻结停止。

- 当前执行：F71 / R80已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f71-r80-2026-10-25/evidence.md)。使用日志复用未改查询Hook，完整筛选/page/pageSize/revision绑定记录/费用/更新时间/error/loading；旧成功/失败/finally不占当前，失败保带来源的最后成功结果。显示实际筛选/页码/页大小，草稿与查询意图分离；响应页码clamp不写effect依赖，后续显式操作以接受页为准，旧clamp不重启请求。32实际React/DOM场景+1隔离33 passed，单目标strict前后0诊断；普通1已验收、66进行中、6 TODO，冻结25未解决，总未解决97。R80不关单，无委派/独立复核/真实业务账或服务/提交部署；原日期/过滤/费用/API/后端保持，下一普通R81先保护原反馈UI改动并定卡。

- 当前执行：F70 / R79已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f70-r79-2026-10-25/evidence.md)。模板原图/最终图及工具封面按账号、实体/editor、字段版本/远端baseline与上传token隔离；清空/重选使旧成功/error/busy失效，慢读失效不发上传。双字段可并发/重新选择，实际submit也拒当前有效待定上传；迟到成功工件保原来源，仅确认后恢复至原条目/原新建稿，不自动写B。上传80实际React/DOM场景+1隔离81 passed，受影响R78三页110场景+3隔离113 passed，共194执行；5目标strict前后同3旧router JSX、新0。普通1已验收、65进行中、7 TODO，冻结25未解决，总未解决97；R79不关单，无委派/独立复核/真实上传或服务/提交部署。原CRUD/文件限额/API/后端保持，ContentEditor只追加字段ticket API，两父route移除旧upload全局反馈；下一普通R80先定查询归属卡。

- 当前执行：F69 / R78c工具已本地实施，R78三页本地实施自验齐备但整体IN_PROGRESS / review=PENDING；[证据](archive/f69-r78c-2026-10-25/evidence.md)。工具复用原编辑会话/字段版本/远端baseline与父查询代次，旧保存/删除/刷新不覆盖B、新建或期间同A输入；冲突保稿可恢复，缺失原id阻止误POST，创建回执保PATCH身份。实际React/DOM37场景+1隔离38 passed，2目标strict前后同3旧router JSX、新0；复用两Hook未改，公告/模板和旧封存保持。普通1已验收、64进行中、8 TODO，冻结25未解决，总未解决97；R78不关单，无委派/独立复核/真实工具服务/提交部署。原八字段payload/trim/数值/校验/默认/确认与封面上传函数体保持，必要setter接线不代替R79；下一普通R79先定有界上传归属卡。

- 当前执行：F68 / R78b共享模板已本地实施，R78整体IN_PROGRESS / review=PENDING，工具R78c仍待实施；[证据](archive/f68-r78b-2026-10-25/evidence.md)。模板复用编辑会话/字段版本和远端baseline，旧保存/删除不切回A或清B，列表clone/无关新增不重置dirty；缺失原id阻止误POST，冲突可显式恢复，创建回执保PATCH身份。父PromptTemplatesRoute复用F66读取归属；共享Hook仅加内容名称参数，公告缺省保持。实际React模板39场景+1隔离40 passed，受影响公告34场景+1隔离35 passed，共75执行；3目标strict前后同3旧router JSX、新0。普通1已验收、64进行中、8 TODO，冻结25未解决，总未解决97；R78不关单，无委派/独立复核/真实模板服务/提交部署。原payload/过滤/分类/显示及上传函数体保持，必要setDraft接线不代替R79上传归属修复；下一R78c工具，不越序启动R79。

- 当前执行：F67 / R78a公告部分已本地实施，R78整体IN_PROGRESS / review=PENDING，模板/工具未实施；[证据](archive/f67-r78a-2026-10-25/evidence.md)。公告编辑按账号/独立会话/字段版本保护，旧保存/删除不清B或后续同A输入；列表仅合并未编辑字段，冲突保稿并可显式加载服务器版本，缺失原条目保原id且阻止误POST。有效新建回执保id，刷新失败后后续仍PATCH；操作按实体互斥，错误/忙状态归原操作。父AnnouncementsRoute复用F66查询Hook拒旧GET。实际React/DOM34场景+1隔离共35 passed；3目标strict前后同3项旧router JSX诊断、新增0。普通1已验收、64进行中、8 TODO，冻结25未解决，总未解决97；R78不关单，无委派/独立复核/真实公告服务/提交部署。原公告时间/默认窗/校验/确认/payload保持，模板/工具/上传及其他routes未改；下一实施R78b共享模板，不跳到R79。

- 当前执行：F66 / R77已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f66-r77-2026-10-25/evidence.md)。生成/Chat统计及Dashboard读取绑定账号、查询对象及请求代次；成对/整批接受数据、来源参数和时间，旧成功/error/finally不写当前。保留最后成功结果并显示真实数据窗口；看板日期/分组跟随文案及CSV读取已展示数据来源，选择及日期输入保当前意图。维护/告警完成刷新当时当前窗口，原操作pending去重、错误/busy局部，不重放写入。真实React/DOM54场景+1隔离检查共55 passed，非file请求/页面错误/未捕获Promise均0；5目标strict前后同5项旧诊断、新增0。普通1已验收、63进行中、9 TODO，冻结25未解决，总未解决97；R77不关单，无委派/独立复核/真实统计维护或服务/提交部署。原GET参数/统计/费用/告警/业务日期算法及其他routes保持，下一普通R78。

- 当前执行：F65 / R76已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f65-r76-2026-10-25/evidence.md)。Chat观测选中会话、当时标题/用户及messages/traces/loading/error绑定独立view和read代次；切换/同id重选即清旧详情，成对接受本次结果，旧成功/error/finally不写新view。初始overview与详情分离，不随error callback引用重查；错误在观测面板/本次详情本地显示，Main仅传已有账号owner，保其他编辑反馈。VM18及真实React/DOM6复测通过（6与VM重叠，共24执行），page errors/非file请求0；2目标strict前后0诊断，child0无skip/stderr空。普通1已验收、62进行中、10 TODO，冻结25未解决，总未解决97；R76不关单，无委派/独立复核/真实会话服务/提交部署。原只读GET参数/limits/权限合同保持，R74/冻结R75其他行为不改；下一普通R77。

- 当前执行：F64 / R74已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f64-r74-2026-10-25/evidence.md)。策略/元数据/安装输入/Override分别绑定编辑会话和版本，原未改稿才清理，同稿新输入或B稿保留；busy按实体，finally仅释放原token。文件预览绑定Skill+路径+owner，换文件/展开/收起拒旧正文与error/loading；父AgentsRoute和Override列表按读取代次拒旧回写，错误updater再核用户意图。最终VM39通过，原12场景真实React19/ReactDOM+本机缓存Chromium复测12通过（重叠场景，共51执行），页面错误/非本地请求0；4目标strict前后同3项旧router JSX诊断、新增0。普通1已验收、61进行中、11 TODO，冻结25未解决，总未解决97；R74不关单，无委派/独立复核/真实安装发布或服务/提交部署。R75冻结，原候选分支/来源选择/请求合同保持，无专项执行；观测子面板原逻辑保留，下一普通R76。

- 当前执行：F63 / R73已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f63-r73-2026-10-24/evidence.md)。润色/Bigjpg草稿按字段dirty、输入版本和远端基线合并，刷新只更新未编辑字段，同字段冲突保稿并可显式加载服务器配置。旧保存只确认原版本，期间新Key/地址/提示词/长度保留；已保存但刷新失败明确提示，Bigjpg有效新建回执保目标id供后续PATCH，缺id不盲目再POST。父SettingsRoute按账号及读取代次拒旧回写/旧错误，手动初始刷新失败有提示且Promise被处理。新36定向passed，5目标strict前后同3项旧router JSX诊断、新增0，child0无skip/stderr空。普通1已验收、60进行中、12 TODO，冻结25未解决，总未解决97；R73不关单，无委派/独立复核/真实润色超分/配置服务/提交部署。2026-10-24起卡、10-25收口；R72经CSV确认冻结，纠正上一交接误指并停止，无实施/测试，下一普通R74。VM/伪React/API非真实浏览器/HTTP/服务端CAS，冻结停止。

- 当前执行：F62 / R71已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f62-r71-2026-10-24/evidence.md)。默认批导入由后端按规范化渠道URL+原模型ID生成稳定且有界的标识，同源不同原ID/跨源同SKU不再因slug碰撞漏项；先复用同身份历史名字，保原配置和引用。支持可选手填导入标识，冲突显示建议，显式名字不重命名已有配置；逐项savepoint/flush后唯一竞争核实际winner，保后续项。16隔离SQL+11新前端+受影响R70/R69精确9共36 passed，2目标strict前后同3项既有api ImportMeta诊断、新增0，child exit0无skip/stderr空。普通1已验收、59进行中、13 TODO，冻结25未解决，总未解决97；R71不关单，无委派/独立复核/真实配置导入服务/提交部署。AST/实际ORM列/SQLite内存及VM不是PG/ASGI或真实线程并发验收；默认确定名受原唯一约束仲裁，不新增跨任意显式名字的身份唯一约束。下一普通R72，冻结停止。

- 当前执行：F61 / R70已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f61-r70-2026-10-24/evidence.md)。批导入保留created/skipped旧数组，新增原model_id/provider_name逐项created/already_same/conflict；已存在同规范来源和原模型身份才确认，不覆盖原配置。页面按本次提交pair回写，确认项移出未导入，冲突/未确认保留选择并说明；旧响应仅安全映射唯一created，skipped不猜身份。新16前端+8隔离后台+受影响R69精确7共31 passed，2目标strict前后同3项既有api ImportMeta诊断、新增0，child exit0。普通1已验收、58进行中、14 TODO，冻结25未解决，总未解决97；R70不关单，无委派/独立复核/真实导入服务/提交部署。VM/AST/伪React/API/内存列表非HTTP/SQL/生产验收；R71命名碰撞和跨渠道全局去重仍未修，下一普通R71先设计，冻结停止。

- 当前执行：F60 / R69已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f60-r69-2026-10-24/evidence.md)。模型/规则操作捕获实体、编辑会话和输入版本，只清理原未改稿；启停只合并原编辑器未改enabled，预览随模型/草稿/参数失效。忙状态按实体隔离，探测/批导入按批次、凭证快照和选择版本隔离；旧批次不清新选择或标记新同ID模型。父ModelsRoute刷新最新读取优先，反馈在updater再核当前意图。新40+受影响R67/R68精确10共50离线passed，3目标strict前后同3项既有router JSX诊断、新增0，exit0无skip/stderr空。普通1已验收、57进行中、15 TODO，冻结25未解决，总未解决97；R69不关单，无委派/独立复核/真实模型维护服务/提交部署。VM/伪React/API非真实浏览器或服务端取消/CAS证明，R70导入返回ID匹配及R71命名保持待修；下一普通R70，冻结停止。

- 当前执行：F59 / R68已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f59-r68-2026-10-24/evidence.md)。计费规则draft与原ruleId/profileId身份放同一原子编辑state，换不同Chat模型回该模型新增稿，同模型保当前编辑。保存核当前Chat模型和规则原归属，缺失/归属变化拒绝，不把浏览模型解释为迁移；明确更新仍PATCH原规则，新增仍POST。新20+受影响R67精确2共22离线passed，1目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、56进行中、16 TODO，冻结25未解决，总未解决97；R68不关单，无委派/独立复核/真实规则或服务/提交部署。VM/伪React/API/Map非SQL或服务端CAS，后端迁移能力保持；R69异步完成串位下一卡，冻结停止。

- 当前执行：F58 / R67已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f58-r67-2026-10-24/evidence.md)。预设与已有profile共用受管理字段读取，档价/支持档位/上游模型及四SKU进入规范草稿后按原字段重建，扩展JSON保留。新预设重置模型专属价格/映射，只保当前凭证/启用；手填值为保存真值，合法零价保持，非有限负价/非对象JSON本地拒绝。新23前端+8真实纯计价/映射AST共31通过，1目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、55进行中、17 TODO，冻结25未解决，总未解决97；R67不关单，无委派/独立复核/真实服务配置/报价同步/提交部署。VM/伪React/API及纯AST非HTTP/SQL/真实账单，原preset数值未改；下一普通R68另定规则归属卡，冻结停止。

- 当前执行：F57 / R66已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f57-r66-2026-10-24/evidence.md)。GIF显示由账号scope/选择token隔离深链与参数补读，历史/本地/复制明确选择优先，preview和download共用当前结果。本地补读绑定原工件，不转成持久history覆盖；显示代次独立于批次执行，浏览历史不取消已受理批次。新26+原GIF页面精确3共29离线passed，2目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、54进行中、18 TODO，冻结25未解决，总未解决97；R66不关单，无委派/独立复核/真实GIF或服务/提交部署。VM/伪React/API/恢复下载边界，非DOM/HTTP/压缩质量验收；下一普通R67先定模型预设合同，冻结停止。

- 当前执行：F56 / R65已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f56-r65-2026-10-24/evidence.md)。导入POST前同步登记意图与Promise，重复确认复用；取消重开恢复原操作，未知受理保持锁定，仅明确拒绝可重试。有效正整数receipt才确认成功，已成功意图不重复POST；显式新建允许相同内容独立条目，旧意图有本页恢复入口，列表核对不解锁。新21+R64受影响精确11共32离线passed，2目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、53进行中、19 TODO，冻结25未解决，总未解决97；R65不关单，无委派/独立复核/真实服务/提交部署。VM/伪React/API/隔离Map，非HTTP/SQL/服务器幂等验收；仅本页账号内存，重载/多标签无幂等保证。下一普通R66另卡，冻结停止。

- 当前执行：F55 / R64已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f55-r64-2026-10-24/evidence.md)。灵感导入/编辑按账号scope、每次打开会话、URL/标题/封面版本和operation合并有效字段，取消/重开/换post/换图拒绝旧观察。保存捕获目标与字段快照，旧成功不关闭B；同会话新输入保稿并提示原稿已保存，当前提取/上传在handler和按钮阻止保存。新30+受影响R63精确2共32 passed，2目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、52进行中、20 TODO，冻结25未解决，总未解决97；R64不关单，无委派/独立复核/真实服务/提交部署。实际Page/Hook/父route配VM/伪React/API/FileReader/URL，非DOM/HTTP/媒体验收；R65同步互斥/未知受理下一卡，冻结停止。

- 当前执行：F54 / R63已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f54-r63-2026-10-24/evidence.md)。灵感列表初始/分类/刷新/mutation后读取统一页面账号scope与请求代次，旧响应不覆盖当前分类/posts/loading/error；变更完成刷新当前分类。分类切换即时清旧分类结果，保搜索/来源/选中ID；批量完成仅清未改原选择，保后来选择及ABA。新31定向离线passed，3目标strict前后同3项既有JSX TS2503、新增0，exit0无skip/stderr空。普通1已验收、51进行中、21 TODO，冻结25未解决，总未解决97；R63不关单，无委派/独立复核/真实读写服务/提交部署。实际Page/两个父route/新Hook配VM/伪React/API，非DOM/Router/HTTP验收；R64弹窗请求归属下一卡，冻结停止。

- 当前执行：F53 / R62已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f53-r62-2026-10-24/evidence.md)。截图上传按epoch/稳定slot同步预留4项容量，每个成功项合并当前列表并按选择顺序排列，不复活移除项、不覆盖并发结果。部分成功立即保留，失败释放未完成预留并保留本地上传提示；重置/卸载拒绝旧观察，preview从创建起有暂定owner到commit。新24+R61受影响精确9共33 passed，2目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、50进行中、22 TODO，冻结25未解决，总未解决97；R62不关单，无委派/独立复核/真实上传发送/服务/提交部署。实际Page/helper配VM/伪React/API/FileReader/URL，非真实浏览器/HTTP/媒体验收。下一普通R63先定灵感查询归属卡，冻结停止。

- 当前执行：F52 / R61已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f52-r61-2026-10-24/evidence.md)。主反馈/线程发送捕获独立草稿版本与operation，原稿未变才清空，新正文/标题/附件及ABA保留；同线程去重、不同线程各守busy。发送错误及其父路由刷新error updater再次核当前意图，旧响应不清新反馈；已commit截图仅无当前草稿/列表owner才释放。新26定向passed，3目标strict前后同3项既有JSX TS2503、新增0，exit0无skip/stderr空。普通1已验收、49进行中、23 TODO，冻结25未解决，总未解决97；R61不关单，无委派/独立复核/真实发送上传/服务/提交部署。实际Page/局部父路由回调配VM/伪React/API/FileReader/URL，非浏览器/真实通知验收。R62上传旧列表合并/容量/部分结果仍待下一卡，冻结停止。

- 当前执行：F51 / R60已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f51-r60-2026-10-24/evidence.md)。创建/改名按编辑model与版本关闭原草稿，删除在functional updater核当前选择并从最新有效列表回退，不清后来B编辑或抢C选择。成功变更先更新项目集合，专用只读刷新及原full/config读取按ticket防旧列表复原；旧error/finally/卸载/账号切换不写新会话，同账号资料刷新保留当前会话。新操作22+刷新/接线15共37 passed，5目标strict前后同1项既有TS2353、新增0，子进程exit0无skip/stderr空。普通1已验收、48进行中、24 TODO，冻结25未解决，总未解决97；R60不关单，无委派/独立复核/真实服务/提交部署。真实Hook/局部JSX与控制器接线配VM/伪React/API/effects，非完整浏览器/HTTP验收。下一普通R61先定反馈输入归属卡，冻结停止。

- 当前执行：F50 / R59已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f50-r59-2026-10-24/evidence.md)。引用展示/历史重建/受理完成metadata去固定4截断，HappyHorse r2v可完整展示、逐项移除、复制/再生成9图；原provider/SKU执行限制保持，Grok/普通图像校验按真实数量拒绝超限。旧任务从已保存payload只读投影引用，不改原行，缺失档位仅补保存video_sku且已记录执行SKU优先；已知残缺阻止直接复制/再生成并提示手动重选。前端新16+R58精确1+后台纯AST精确8共25 passed/4 subtests passed，6目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、47进行中、25 TODO，冻结25未解决，总未解决97；R59不关单，无委派/独立复核/真实服务/提交部署。VM/JSX/API及AST纯函数边界替身，非真实视频/浏览器/HTTP/PG验收。下一普通R60先定个人项目异步归属卡，冻结停止。

- 当前执行：F49 / R58已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f49-r58-2026-10-24/evidence.md)。提交显式携带form/上传项/上传状态快照，历史再生成使用nextForm+nextUploads，不借当前B的图或上传busy，不修改B。视频校验与payload共用本次provider/引用解析；普通提交provider同步与成功清polished在updater核原form，保护排队换稿。22定向离线passed，6目标strict前3项既有诊断/后0项，新增0，子进程exit0无skip/stderr空。普通1已验收、46进行中、26 TODO，冻结25未解决，总未解决97；R58不关单，无委派/独立复核/真实服务/提交部署。实际Actions→Submission→纯构造配VM/伪React/API，非真实视频/DOM/HTTP验收。R59数量和历史保全仍待另卡定边界，25冻结停止。

- 当前执行：F48 / R54已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f48-r54-2026-10-24/evidence.md)。润色绑定账号/草稿谱系/节点和已提交视图、输入对象及prompt/mode/引用快照，旧成功/失败/finally不回写后来草稿；Studio与Canvas在functional updater内二次核对，prompt/flag原子应用，正常编辑保该稿历史，换稿隔离。新23+受影响原F45精确4/F46精确2共29 passed，13目标strict前后同1项既有TS2353、新增0，exit0无skip/stderr空。普通1已验收、45进行中、27 TODO，冻结25未解决，总未解决97；R54不关单，无委派/独立复核/真实服务/提交部署。实际Hook/局部消费者配伪React/effects/API/JSX/storage，非真实DOM/Router/HTTP或视频验收。下一普通R58仅先定离线表单/引用合同，冻结项停止。

- 当前执行：F47 / R52已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f47-r52-2026-10-24/evidence.md)。发布打开即固定账号/项目/viewKey/标题与深拷贝图，draft/busy/列表/请求归会话，关闭保留，明确结束才新意图；unknown只读核对不解锁，旧成功/错误/close/navigation不改新会话。复制捕获选择token，选择/新建/删当前/发布使旧copy失效，createProject内层也守激活/列表，已创建项目保留不抢选择。新25+原F08精确3共28 passed，3目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、44进行中、28 TODO，冻结25未解决，总未解决97；R52不关单，无委派/独立复核/真实服务/提交部署。实际Dialog/局部Workspace/Project Hook配伪effects/API/JSX模型，非真实DOM/Router/HTTP或后台幂等验收；会话仅本页内存。下一普通R54另卡，R53冻结停止。

- 当前执行：F46 / R51已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f46-r51-2026-10-24/evidence.md)。节点级同步run Promise贯通单节点/批量，活跃taskId只附着等终态，下游只在上游有交付物后提交；新意图以journal operation id作submission_key，未知/缺ID保原记录不自动补发，两个重新生成入口显式传意图。批量状态归scope/token，旧continuation/finally不提交新图或清新busy。新22+受影响F45精确3共25 passed，6目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、43进行中、29 TODO，冻结25未解决，总未解决97；R51不关单，无委派/独立复核/真实服务/提交部署。实际Hook/局部批量回调与按钮/图输入helper配伪effects/API/storage，非React DOM/HTTP/后台幂等竞争验收；下一R52另卡。

- 当前执行：F45 / R50已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f45-r50-2026-10-24/evidence.md)。画布异步操作按账号/实体/提交视图及节点/taskId/执行代次归属，旧poll/sync/上传/标注/拖放不写新图；观察各自取消sleep/后续读取，同任务多scope独立、回A恢复原task，不取消服务器任务。迟到路径/taskId留原画布局部恢复记录，明确恢复且输入版本匹配才应用；项目补只读loaded owner/viewKey，保存请求正文保持。新34+受影响原F43精确1/F08精确4共39 passed，4目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、42进行中、30 TODO，冻结25未解决，总未解决97；R50不关单，无委派/独立复核/真实服务/提交部署。实际Hook/局部回调配伪effects/API/storage/导出，不是真实React DOM/HTTP/浏览器持久性验收；下一R51另卡。

- 当前执行：F44 / R49已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f44-r49-2026-10-24/evidence.md)。复用F43保存队列，补同模板跨账号写入隔离：锁按templateId，原网络unknown即使Promise清理也暂停该模板后继自动写，只读核对后明确确认才解锁；本地草稿仍按账号隔离，其他模板独立。原两个并行/unknown红复现，新10+受影响F43精确6共16 passed，2目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、41进行中、31 TODO，冻结25未解决，总未解决97；R49不关单，无独立复核/委派/真实服务/提交部署。仅同JS模块Hook/替身API的发送与模拟提交序列证据，非浏览器/跨标签/真实PG/CAS验收；下一普通R50另卡。

- 当前执行：F43 / R47+R48已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f43-r47-r48-2026-10-24/evidence.md)。模板画布排队即未同步，按账号/模板/草稿ID即时本地备份；两个返回先flush等最新版本确认，失败可保留草稿离开或明确放弃。恢复/冲突/unknown先只读核对、不自动重发；图/标题写串行，旧rename不整图覆盖新视图。视图激活在layout提交阶段，未提交render不废弃当前编辑。新35+原F08实际workspace重试1共36 passed，4目标strict仅3既有JSX/0新增，exit0无skip/stderr空。普通1已验收、40进行中、32 TODO，冻结25未解决，总未解决97；不关R47/R48，无委派/复核/真实服务/提交部署。Hook/局部JSX模型非真实React Router/浏览器/存储验收，无服务端CAS/跨标签写入保证；R49另卡复用队列证据，不自关单。

- 当前执行：F42 / D-R46已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f42-r46-2026-10-24/evidence.md)。参考上传按稳定item/batch/epoch合并当前数据源，在途槽计容量、按接收顺序落列表与表单；clear/replace使旧批次失效，旧finally不清新busy/tracker。标注与人像回调核对身份/内容/取消，busy按批次与item计数，blob只撤销无人持有部分；不发明换项目清参考图规则。36离线定向passed/10844.0859ms，9目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、38进行中、34 TODO，冻结25未解决，总未解决97；不关R46，无委派/复核/真实服务/提交部署。普通/标注/虚拟与真人路径分别内存替身验证，非真实React DOM/浏览器/认证验收；原API/头像adapter/绘图/路径与上传协议保持，下一普通R47尚未实施。

- 当前执行：F41 / R44+R45已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f41-r44-r45-2026-10-24/evidence.md)。模板保存按编辑代次/目标id/草稿版本归属，迟到A不重绑B或清取消快照；当前提交与续写分开确认，render后核对排队输入。按草稿同步ref互斥，保存中按钮禁用，创建接回id后只PATCH；明确拒绝保稿可手动重试，unknown禁止直接重存、显式放弃只结束本地编辑。新27+原静态媒体参数2共29 passed，10目标strict前后0诊断，最终exit0无skip/stderr空。普通1已验收、37进行中、35 TODO，冻结25未解决，总未解决97；不关R44/R45，无委派/复核/真实服务/提交部署。实际Hook/TSX事件驱动非React DOM/浏览器；无服务端幂等/CAS/跨刷新恢复，原API/payload/媒体/存储保持，下一普通R46尚未实施。

- 当前执行：F40 / R42已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f40-r42-2026-10-24/evidence.md)。Chat历史/错误/模型/导航按账号、会话代次和请求序号归属，history在目标SDK render后应用，发送revision使旧读失效；transport元数据按scope及client message id过滤，旧提案决定不写新视图。列表独立序号不隐式清当前SDK，旧create/delete只改明确id列表不抢选择；删除序号按目标独立。新29+受影响F39原30共59 passed，两个目标strict前后0诊断，最终均exit0无skip/stderr空。普通1已验收、35进行中、37 TODO，冻结25未解决，总未解决97；不关R42，无委派/复核/真实服务/提交部署。实际SDK Chat+TSX/Hook驱动非真实React useChat/DOM；后台记录/SDK/附件与F39恢复核心保持，下一普通R44尚未实施。

- 当前执行：F39 / R41+R43已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f39-r41-r43-2026-10-23/evidence.md)。Chat发送按锁定SDK真实error/finish标记及HTTP接收状态结算，明确拒绝恢复原文/附件，网络未知只读核对或明确放弃，不自动重发；已接收后的部分回复/持久附件保留。预览按发送快照/当前composer转移所有权，旧清理不动新稿，卸载后每次metadata通知实时守挂载。最终30 passed /18602.2429ms，五前端目标strict前后0诊断，均exit0无skip/stderr空。普通1已验收、34进行中、38 TODO，冻结25未解决，总未解决97；不关R41/R43，无委派/复核/真实服务/提交部署。真实SDK Chat+Hook驱动非真实React useChat/DOM；后端只两个响应头静态AST核对，无后台运行/幂等/离页持久化。R42通用history/meta竞态仍TODO。

- 当前执行：F38 / R40已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f38-r40-2026-10-23/evidence.md)。多边形不再提交前清空，捕获当前名称/房间/模式/顶点和序号，同tick互斥，成功确认原草稿才清；明确400/404/409/413/422拒绝可修正重试。无status/408/5xx/坏响应保草稿标未知，锁定重发，只读刷新供人工核对或明确放弃，不以一次GET猜未受理。新25+受影响R38原4共29 passed，Page/API定向strict 3既有/0新增，均exit0无skip/stderr空。普通1已验收、32进行中、40 TODO，冻结25未解决，总未解决97；不关R40，无委派/复核/真实服务/提交部署。无后端幂等ID/离页持久化/真实浏览器验收；明确放弃仅清本地，不撤回或确认原请求。R39/计算原字节保持。

- 当前执行：F37 / R39已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f37-r39-2026-10-23/evidence.md)。房间/整图意见保存期间继续编辑，提交快照/序号只确认返回版本，后续或未被返回包含的输入保留dirty；外部notes变化留本地并要求明确采用或确认替换。即时请求互斥、身份/序号/mounted保护迟到响应，apply不清新意见，旧ack只消费一次。新22 passed /631.9897ms，Page目标严格类型诊断0，exit0无skip/stderr空。普通1已验收、31进行中、41 TODO，冻结25未解决，总未解决97；不关R39，无委派/复核/真实服务/提交部署。实际TSX/Hook事件驱动非浏览器DOM，未增加意见离页持久化或整记录客户端revision；R38/R40原字节保持。

- 当前执行：F36 / R38已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f36-r38-2026-10-23/evidence.md)。CAD准备条件按账号/图纸/楼层及相关内容版本保草稿，同内容新floor不重置；相关变化留输入并提示冲突，明确重核或放弃。保存/建议迟到不改新视图，同标签页切换/离页可恢复，刷新关闭提示后确认离开视为放弃，退出/换会话清内存cache。新22+原3共25定向测试通过，四业务目标严格类型诊断0，均exit0无skip。普通1已验收、30进行中、42 TODO，冻结25未解决，总未解决97；不关R38，无委派/复核/真实服务/提交部署。Hook/TSX事件驱动非浏览器DOM验收，草稿不写磁盘/跨标签页/崩溃恢复，R39/R40未改。

- 当前执行：F35 / R37已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f35-r37-2026-10-23/evidence.md)。CAD detail/list在no_autoflush内仅响应副本补兼容线字段，不flush/commit/回写；显式墙线优先、缺线False条件创建。意见/校准/布置统一源JSON比较提交，初始陈旧ORM和计算期竞争均409，原计算/F34媒体保全保持。新18+受影响原20共38 passed /81 subtests in13.32s，exit0无skip，5第三方弃用warning。普通1已验收、29进行中、43 TODO，冻结25未解决，总未解决97；不关R37，无委派/复核/真实CAD或服务/提交部署。响应为读取时快照；PG/ASGI/真实OSS未验，不提供前端旧表单version合同，R35历史物理保留限制继续。

- 当前执行：F34 / R35已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f34-r35-2026-10-23/evidence.md)。CAD edit/undo/program-apply先内存校验/绘制，再写UUID独立mask/preview/line及撤销副本，提交源JSON比较保护后才切引用；旧图/撤销源失败或ack丢失均保留。新18+原2共20 passed /47 subtests in10.84s，exit0无skip，5个第三方弃用warning；覆盖全部文件stage/flush/commit故障、重试/40项batch/CAS/假OSS/成功undo与派生路径。普通1已验收、28进行中、44 TODO，冻结25未解决，总未解决97；不关R35，无委派/复核/真实CAD或服务/提交部署。已发布历史不自动物理删除，仅确认commit后回收本请求从未发布草稿；ASGI/PG与全局历史回收未验，R37 GET未改。

- 当前执行：F33 / R34已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f33-r34-2026-10-23/evidence.md)。价格配置同步统一显式合同版本/端点/逐Profile+Rule指纹候选，image/chat/精确video和停用都受同一边界；其他渠道/未知合同/重规则歧义原样跳过，custom规则只按明确id停用。CNY自定义4K保留，外币特殊档需明确报价，合法SKU按实际家族/质量档。新16+原3联合19 passed /20 subtests in1.30s，exit0无skip，含删除/改渠道/重复/三处整批回滚/CLI AST。普通1已验收、27进行中、45 TODO，冻结25未解决，总未解决97；不关R34，无委派/复核/真实同步/核价/服务/提交部署。静态价表/实际Grok计价不改，PG与完整CLI未验。

- 当前执行：F32 / R33已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f32-r33-2026-10-23/evidence.md)。媒体False写入同步核对Local/OSS，条件创建保留旧对象，remote-only取旧bytes补local、local-only按实际旧bytes镜像，冲突报告path/SHA并保两端；本地完整临时文件+独占hardlink发布。默认True异步/重试及F20create原字节保持。新18+受影响原6联合24 passed /14 subtests in2.20s，exit0无skip，含20本地/4条件写者、SDK实际headers转发、失败/丢响应/短写清理、bin/SVG/公开URL竞争。普通1已验收、26进行中、46 TODO，冻结25未解决，总未解决97；不关R33，无委派/复核/真实OSS/服务/提交部署。非版本化条件能力要求保持，不宣称跨系统原子或真实云端验收。

- 当前执行：F31 / R32已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f31-r32-2026-10-23/evidence.md)。新单head d40e9f82b735承接c39，只纠正SQLite三表五个字面now()默认为CURRENT_TIMESTAMP；历史迁移/bootstrap/ORM/业务服务不改。真实Alembic禁create_all，正常三类省略时间写入成功；有数据旧head/扩展列/CHECK/索引/触发器/FK保全，复制/DDL/版本失败全回滚。13 passed /3 subtests in11.14s，exit0无skip；重复upgrade不变，PG仅无DDL分支非真实PG。普通1已验收、25进行中、47 TODO，冻结25未解决，总未解决97；不关R32，无委派/复核/真实DB/维护/提交部署。未知入向FK/view/自定义默认预判拒绝，SQLite降级拒绝恢复坏默认。

- 当前执行：F30 / R31已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f30-r31-2026-10-23/evidence.md)。模板outcome_totals只累计该模板/统计窗口内Intent自身事件，复用原事件计数规则；不再逐意图叠加整Session缓存，同会话混模板/无模板/窗口外事件不串入，无session也保留所属事件。新10+原2共12 passed in1.57s，exit0无skip，重复合法事件/窗口边界/缺session/缓存999/只读/原评分权重和阈值均覆盖。普通1已验收、24进行中、48 TODO，冻结25未解决，总未解决97；不关R31，无委派/复核/真实维护/服务/提交部署。仅只读模板聚合三行调整，PG/ASGI/真实历史统计未验。

- 当前执行：F29 / R29已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f29-r29-2026-10-23/evidence.md)。在线/历史补入/重算共用同user/ref内UTC时间+意图id排序、相邻0至30分钟含边界聚类，迟到可桥接，A/B/A不切断；复用既有Session ID，先迁移引用再删空组。20 passed /8 subtests in2.78s，exit0无skip，含6种顺序、全成员/分数/outcome、实际FK失败/指标/删除/补入回滚与SQLite无提前commit。普通1已验收、23进行中、49 TODO，冻结25未解决，总未解决97；不关R29，无委派/复核/真实维护/服务/提交部署。PG并发/ASGI与外部保存旧会话id未验，合并/拆分淘汰id不提供永久alias。

- 当前执行：F28 / R28已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f28-r28-2026-10-23/evidence.md)。历史回填明确1K/2K/4K/未知，以一致的执行计价/有效规格优先，原请求仅参考；缺4K价格保留原账，仅明确目录4K或逐任务确认的历史补充报价可计价，不回退低档。新16+受影响F27原18联合34 passed /37 subtests in5.48s，exit0无skip；确认报价/零价、16组快照冲突、重复/指纹和三处整批回滚覆盖。普通1已验收、22进行中、50 TODO，冻结25未解决，总未解决97；不关R28，无委派/复核/真实维护/服务/提交部署。真实合同/PG/完整CLI未验，R29尚未实施。

- 当前执行：F27 / R27已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f27-r27-2026-10-23/evidence.md)。历史费用回填只认精确目录型号/SKU、单条历史调用及明确供方/端点/期间合同，apply须逐任务费用图指纹；当前可变profile不作历史证明，USD/冲突快照/归档或账目歧义保留原账。新16+适配原2共18 passed /14 subtests passed in2.71s，exit0无skip；临时SQLite全费用图同步、重复/失效计划、apply/flush/commit整批回滚与CLI小helper覆盖。普通1已验收、21进行中、51 TODO，冻结25未解决，总未解决97；不关R27，无委派/复核/真实服务/提交部署。4K/未知规格仅预览，R28未实施；真实历史合同、PG锁与完整CLI启动未验。

- 当前执行：F26 / R18-B已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f26-r18b-2026-10-23/evidence.md)。执行端按CNY/上海自然月/无换算分币读账，非CNY月用量返回不可比较；有限hard_block以明确403要求管理员核定，不混币相加或伪称耗尽。CNY >=原阈值、soft_warn/无限额早返、suspended优先保持。13精确节点最终13 passed /10 subtests in1.93s，首轮13与后补4节点亦通过，exit0无skip；真实临时SQLite账与实际Task/Chat/confirmed入口均零新增工作/队列。普通1已验收、20进行中、52 TODO，冻结25未解决，总未解决97；F25/F26均本地待独立验收，不关R18，无委派/复核/真实服务/提交部署。真实PG/ASGI/并发预算预留未验。

- 当前执行：F25 / R18-A已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f25-r18a-2026-10-23/evidence.md)。按用户确认的CNY/上海自然月/无换算合同，模型按自身账分币，混币标量null并保留cost_by_currency；provider/总额/均次/每日同样不跨币相加。月额度独立于看板天数/项目/渠道，非CNY账的额度使用/余额不可比较，界面不把null当0。后端14 passed /3 subtests、前端8 passed、7类型/5金额消费者定向strict类型检查0诊断，均exit0无skip。普通1已验收、20进行中、52 TODO，冻结25未解决，总未解决97；不关R18，无委派/复核/真实服务/提交部署。hard_block执行面尚未修改/验收，R18-B仍待实施；真实PG/浏览器/完整类型检查未验。

- 当前执行：F24 / R17已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f24-r17-2026-10-23/evidence.md)。旧记忆清理先保护所有显式来源/暂停条目的原文原类型；未知来源/时期只预览，apply要求带历史说明与完整行指纹的明确旧自动数据计划。原删除/提炼/压缩规则在批准范围内保持，乐观条件拒绝竞争变化，DB提交成功后才同步索引。新12+适配原1共13 passed /10 subtests passed in1.19s，exit0无skip。普通1已验收、19进行中、53 TODO，冻结25未解决，总未解决97；不关R17，无委派/复核/真实清理/索引服务/提交部署。legacy_evidence是操作者确认而非自动历史证明，真实PG/索引交付与历史恢复未验。

- 当前执行：F23 / R12已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f23-r12-2026-10-23/evidence.md)。普通Chat异常/取消/提前关闭保留已收正文并附明确失败提示，error事件优先于正文、失败残篇不写长期记忆；已知usage/费用保留，持久化只尝试一次、telemetry只终结一次。新10节点10 passed in2.45s，exit0无skip；真实临时SQLite历史/账/telemetry与实际asyncio/AnyIO取消作用域。普通1已验收、18进行中、54 TODO，冻结25未解决，总未解决97；不关R12，无委派/复核/真实服务/提交部署。ASGI浏览器断线/真实PG及数据库故障后的账修补未验，原两次commit合同保持。

Last aligned: `2026-10-22`。旧任务原文与开发顺序完整保存在 `archive/document-baseline-before-2026-10-08-alignment/tasks.md`，不作为当前排期。

## Rules And Current Goal

- 状态使用 TODO / IN_PROGRESS / BLOCKED / DONE；注明本地/已提交/已部署。
- 每项限定为一个可审阅修改单元；同步 handoff，涉及架构再同步 architecture，中大型任务做 2.0 兼容检查。
- 当前是 1.0 生产稳定化：历史可靠性、减少无效刷新、文档、自动检查与媒体治理。6 月 Studio/Video 合并序列已归档。
- 角色、账号归属以代码为准；有效角色 admin/ops/designer，owner 兼容为 admin。
- 原访客样式/比较文档/临时脚本不混入本轮提交。不得按旧 stash 序号 pop。
- 2026-10-19用户最新要求覆盖10-10历史授权：未收到明确命令，不得commit/push/合并发布/部署；本地开发与留档可继续，当前v1.1不跑GPU。CAD和已明确暂缓事项保持边界。

- 用户2026-10-21最新收紧范围：停止安全专项、相关复现与攻击场景，不换方式继续验证；后续只审普通功能、状态流转、数据保存、CAD计算和测试代码。权限/安全专项标为跳过及未验证，不作为通过项。历史审查记录保留，不自动处置既有问题。

## Next Conversation Checkpoint

- 2026-10-23当前执行：F22 / R10已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f22-r10-2026-10-22/evidence.md)。反馈PATCH按字段是否出现合并最终状态与文本，最终replied/resolved必须分别保留非空回复/复测；验证先于变更/审计，省略状态也校验，不再用新值or旧值放行清空。新8节点8 passed /17 subtests passed，exit0无skip，拒绝时完整记录/审计不变，合法回退和修复历史无效终态可正常进行。普通1已验收、17进行中、55 TODO，冻结25未解决，总未解决97；不关R10，无委派/复核/真实服务/提交部署。PG行锁/ASGI未验，安全专项未恢复。

- 2026-10-22当前执行：F21 / R11已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f21-r11-2026-10-22/evidence.md)。模型已有Conversation引用先409并提示停用，检查后新引用仅在真实parent DELETE外键错误时rollback转409；其他约束/SQL/DB错误回滚后原样抛出。模型/聊天/消息/价格保全，无引用204、审计/原pricing cascade/settings SET NULL合同保持。新10节点10 passed /10 subtests passed，exit0无skip，所有SQLite外键开启，两个真实独立Session引用竞争通过。普通1已验收、16进行中、56 TODO，冻结25未解决，总未解决97；不关R11，无委派/复核/真实PG/服务/提交部署。同步函数/纯PG码分类不等于ASGI或真实PG已验。

- 2026-10-22当前执行：F20 / D09 / R13已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f20-r13-2026-10-22/evidence.md)。Agent工件追加UUID身份并使用专用不覆盖创建，5次碰撞重选/耗尽409，旧bytes与Asset/Job关系保全；Local xb原子、OSS条件确认后再新建local，远端已有但cache缺失不污染旧链接。新14节点14 passed /31 subtests passed，exit0无skip，含4并发实际SQLite/文件与20同路径竞争。普通1已验收、15进行中、57 TODO，冻结25未解决，总未解决97；不关R13，无委派/复核/真实OSS/服务/提交部署。版本化/能力不明OSS明确失败，普通上传默认异步mirror不变；真实OSS/跨存储原子未验。

- 2026-10-22当前执行：F19 / D08 / R25已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f19-r25-2026-10-22/evidence.md)。Comfy人工close保留failed/done，展开部分batch_outputs并复用R23资产补缺，checkpoint/媒体/无关附件保全；Task/Dispatch/Asset/Ledger/intent/session/audit同SQL事务，保留已知费用币种且未知单独标记，不造ProviderCall。新12节点12 passed /12 subtests passed，exit0无skip，含五处DB故障回滚与重复关闭409。普通1已验收、14进行中、58 TODO，冻结25未解决，总未解决97；不关R25，无委派/复核/真实服务/GPU/提交部署。Windows ASGI事件循环被V00阻止，仅注册同步endpoint直接执行，未宣称ASGI/真实PG/Redis原子验收。

- 2026-10-22当前执行：F18 / D07 / R26已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f18-r26-2026-10-22/evidence.md)。Comfy已有prompt先核对原history/view，丢响应按原client_id只读匹配，不再为取回重读源图或prepare新图；首次/下一张新提交仍原参考校验/尺寸准备/上传，submitting前保存execution_context。新10节点10 passed /2 subtests passed，exit0无skip；旧无新上下文的合法checkpoint可只读取回，未知匹配保owner不重POST，失效lease不保存。普通1已验收、13进行中、59 TODO，冻结25未解决，总未解决97；不关R26，无委派/复核/真实GPU/服务/提交部署。

- 2026-10-22当前执行：F17 / D06 / R24已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f17-r24-2026-10-22/evidence.md)。请求计划复制payload并统一requested/effective档位、实际SKU/size；Wan受限4K→2K、count edits→1K及既有Seedream/Grok转换与supported clamp沿同一计划计价和展示。Task/ProviderCall/Ledger保存有效档位和原请求，per_request每Task一次保持；旧缺快照/计划变化停止追加请求，已有产物及费用保全，不重算历史。联合新12+F10原10+F14原30共52 passed /17 subtests passed，exit0无skip。普通1已验收、12进行中、60 TODO，冻结25未解决，总未解决97；不关R24，无委派/复核/真实服务/提交部署。

- 2026-10-22当前执行：F16 / D05 / R21已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f16-r21-2026-10-22/evidence.md)。生成图片URL/base64、共享视频URL/bytes、Grok content及Bigjpg落盘前验证实际格式与MIME，错误页/空/截断/错配拒绝，后缀取验证字节；通用MIME允许有效媒体。原缺陷2节点2 failed；最终14 passed /31 subtests passed、exit0无skip。R20恢复保留原ID/已有资产/usage/已知费用，不重提交。普通1已验收、11进行中、61 TODO，冻结25未解决，总未解决97；不关R21，无委派/复核/真实服务/提交部署。视频仅容器/轨道/样本结构验证，不代表完整解码播放；旧7文件仅成功fixture换有效素材，原受限视频测试未跑。

- 2026-10-22当前执行：F15 / D04 / R06已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f15-r06-2026-10-22/evidence.md)。复用TaskDispatch账号/提交键unique与savepoint，Agent明确键或旧execution/request标识对、Chat proposal、同注册SDK tool_call_id重试查回原Task/Job；同键异参409，不重复审计/唤醒/执行。SQLite BEGIN IMMEDIATE避免legacy savepoint提前commit；无迁移，原模型/worker/执行/存储不改。联合新14+F07原6共20 passed /36 subtests passed；补4节点4 passed /4 subtests passed，再补三入口并发/unique/quota 3节点3 passed，均exit0。SQLite并发/真实unique冲突已验证，未宣称PG竞争/跨独立Agent注册或真实生成已验。普通1已验收、10进行中、62 TODO，冻结25未解决，总未解决97；不关R06，无委派/复核/真实服务/提交部署。

- 2026-10-22当前执行：F14 / R20-F已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f14-r20f-2026-10-22/evidence.md)。Haodeya/Toapis和ModelScope异步图像沿原image progress/聚合Call保留受理ID/查询地址、轮询usage/下一地址、URL输出引用及逐图检查点；恢复不重提已受理步骤，未提交批量后续仍按原数量执行。base64不落DB，已落库全部路径的中断可直接完成；未知无上下文与旧不完整进度待核对，明确FAILED保持终态。新30及F13原70/F10原10/F09原7联合117 passed /40 subtests passed，无skip。R20全部计划入口已完成本地实现/定向回归，仍未独立验收，不能关单或宣称真实PG/进程/供方已验证。普通1已验收、9进行中、63 TODO，冻结25未解决，总未解决97；未委派/复核/真实服务/提交部署。

- 2026-10-22当前执行：F13 / R20-D/E已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f13-r20de-2026-10-22/evidence.md)。Grok/Bigjpg接入原受理ID/polling_url/取回上下文检查点与单产物恢复；Grok URL-only受理不重提，实际SKU/分档原价保持，Bigjpg保留图片/放大metadata。已持久async进度在前置校验失败时保留ID/产物/已知费用；供方明确failed不被后续坏配置降为unknown。最终新29+F11/F12原41联合70 passed /29 subtests passed，另普通失败控制1 passed。R20仅外部异步图像剩余入口尚未接入，整项未完成，不关单；普通1已验收、9进行中、63 TODO，冻结25未解决，总未解决97。未委派/复核/真实视频服务/提交部署。

- 2026-10-22当前执行：F12 / R20-B/C已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f12-r20bc-2026-10-21/evidence.md)。Ark/Jimeng接入受理ID、URL/usage及逐产物checkpoint和同任务恢复，复用F11默认review及原定价；Jimeng保留签名POST GetResult查询、实际req_key和查询上下文，配置变化先停止，未重复生成POST。Ark保存原body解析的实际model，不改变R22请求模型合同。新28节点28 passed /14 subtests passed，合跑F11原13共41 passed /19 subtests passed，exit0无skip。Grok/Bigjpg/外部图像异步入口仍未接入，R20整项未完成、不关单。普通1已验收、9进行中、63 TODO，冻结25未解决，总未解决97；未委派/复核/真实视频服务/提交部署。

- 当前执行：F11 / R20-A已本地实施，IN_PROGRESS / review=PENDING，不关R20；[证据](archive/f11-r20a-2026-10-21/evidence.md)。DashScope提交前/受理ID/输出URL及usage逐步checkpoint，恢复只查询同ID或取回未保存输出；传输/未知提交进入pending和默认Dispatch review，不盲重POST。确定上游失败终止，过期lease旧worker不回写调度；原定价快照/per_request每Task一次保持。新13+F10原10+F09原7联合30 passed / 16 subtests passed；补per_request正反控制单节点1 passed。R20其余Ark/Jimeng/Grok/Bigjpg及外部图像异步路径尚未接入，不能宣称整项完成；下一卡继续R20-B。当前普通1已验收、9进行中、63 TODO，冻结25未解决，总未解决97；未委派/复核/真实服务/视频/提交部署。

- 当前执行：F10 / D03 / R19外部图像部分成功保全已本地实施，IN_PROGRESS / review=PENDING，不关单；[证据](archive/f10-r19-2026-10-21/evidence.md)。generation_progress逐步提交产物/usage/原定价与模型快照，下一POST前落库，部分失败保留Task/Asset/聚合ProviderCall/Ledger；未知费用明确标记，per_request每逻辑Task一次。已完成步骤恢复不重发，状态不明拒绝自动POST，模型变化停止；R20具体GET恢复尚未实施。新10节点与受影响F09原7节点合跑17 passed / 11 subtests passed；无真实供方/媒体/账/生产/委派/复核/提交部署。当前普通1已验收、8进行中（R05/R09/R19/R23/R97/R85/R55/R82）、64 TODO，冻结25未解决，总未解决97；总目标active。

- 当前执行：F09 / R23资产补齐已本地实施，IN_PROGRESS / review=PENDING，不关单；[证据](archive/f09-r23-2026-10-21/evidence.md)。仅_materialize_assets按当前Task/项目/类型及实际产物路径匹配，复用已有项、补缺项，返回集合不含无关附件；原执行流程消费asset_ids/paths已验证。7 passed / 6 subtests passed；费用/执行/模型/迁移原字节保持，未运行真实媒体/服务/后台整套。用户已确认R19保持per_request每逻辑Task一次，未知费用单独标记；该前置已明确，R19/D03下一卡继续，本卡不冒充R19完成。当前普通1已验收、7进行中（R05/R09/R23/R97/R85/R55/R82）、65 TODO，冻结25未解决，总未解决97。无委派/复核/提交部署，总目标active。

- 当前执行：F08 / D02 / R09画布保存归属和失败保全已本地实施，IN_PROGRESS / review=PENDING，不关单；[证据](archive/f08-r09-2026-10-21/evidence.md)。待保存项绑定projectId/revision/唯一saveId及图快照，切换/新建/删除先串行drain，失败留原图并重试；加载/保存/删除后选择受视图代次约束。本标签页草稿备份和跨挂载保存串行，服务器图有变化时由用户选择恢复。25项定向测试通过，类型23既有/0新增。无委派/复核/真实项目/提交部署；R50/模板编辑/后台/权限不改。当前普通1已验收、6进行中（R05/R09/R97/R85/R55/R82）、66 TODO，冻结25未解决，总未解决97；总目标继续，以下旧R09未实施/仅首批授权状态为历史。

- 当前执行：用户目标“修复完所有记录的bug”已接续普通项设计/本地实施，冻结25项仍停止。F07 / D01 / R05持久调度事务本地修复完成，IN_PROGRESS / review=PENDING，不关单；[证据](archive/f07-r05-2026-10-21/evidence.md)。Agent生图/改图和Chat确认共用提交服务，同commit创建Task/AgentJob/Dispatch，Redis唤醒失败不抹掉已接受任务；6 passed / 26 subtests passed。V00/F01已验收，F02–F07实施待复核，仍仅R98已关闭；普通1已解决、5进行中（R05/R97/R85/R55/R82）、67 TODO，冻结25未解决，总未解决97。目标仍未完成，后续逐项先定合同/白名单再修复；暂不启动复核/委派，未提交/推送/部署。

- 当前执行：用户继续修bug，F06 / repair-pilot-006 / R82已本地修复，IN_PROGRESS / review=PENDING、R82未关闭；[证据](archive/f06-2026-10-21/evidence.md)。共享纯函数按Asia/Shanghai自然日计算，路由单次快照供统计标签/跟随分组查询/CSV使用，去除页面独立UTC截日；7/30/90含当日与自定义日期意图保持。12项定向离线测试通过，类型23既有/0新增。未启动复核/委派/其他卡，未提交/推送/部署。当前普通1已解决、4进行中（R97/R85/R55/R82）、68 TODO，冻结25未解决；下方旧F06未实施状态由本条覆盖。

- 当前执行：按用户先修bug及最新继续，F05 / repair-pilot-005 / R55搜索请求归属已本地实现，IN_PROGRESS / review=PENDING、R55未关闭；[证据](archive/f05-2026-10-21/evidence.md)。结果/engine/loading绑定domain+trimmed query及effect代次，cleanup使旧回调失效，首帧不显示旧命中；[]保留零命中、失败null保留本地回退。12定向测试通过，类型23既有/0新增；两消费者/API/类型基线原字节保持。未启动复核/委派或F06。当前普通1已解决、3进行中（R97/R85/R55）、69 TODO，冻结25未解决。

- 当前执行：沿用户“先修bug”和本次“继续”，已接续完成F04 / repair-pilot-004 / R85-B润色入口本地修复。默认候选按原ID升序遍历首个启用聊天模型，显式无效ID仍按润色原合同拒绝；F03助手原fallback不变。两入口合跑12 passed / 26 subtests passed、exit0；[F04证据](archive/f04-2026-10-21/evidence.md)。F03/F04均已本地实现但尚未独立验收，状态IN_PROGRESS / review=PENDING，R85不关闭；F02同样保留待复核。未启动复核/委派/其他卡，F05–F06不自动开始。下方F04尚未实施状态由本条覆盖。

- 当前执行：用户最新要求“别老是复核了，先修bug”，暂不启动已授权的F02只读复核，F02仍IN_PROGRESS / review=PENDING。直接按已具备V00依赖的F03 / repair-pilot-003 / R85-A本地实现：助手默认/fallback改为按ID升序遍历启用配置，取首个具chat.completions的候选；显式有效优先及原无候选异常保持。6 passed / 13 subtests passed、exit0，真实SQLite ORM表/查询，无LLM/工具/密钥调用；[F03证据](archive/f03-2026-10-21/evidence.md)。F03仍IN_PROGRESS / review=PENDING，F04尚未实施，R85不关闭。本卡无委派，不因复核再打断本次实现；未自动开始其他卡。下方旧F03未启动/先复核再实现的执行排期由本条覆盖，独立验收才关单的规则保持。

- 当前执行：用户在F01验收后要求继续修bug，本次按下一张已写卡F02 / repair-pilot-002 / R97本地实施，未推定后续整批授权。F02已完成最小修复与定向离线回归，IN_PROGRESS / review=PENDING，R97未关闭；[证据](archive/f02-2026-10-21/evidence.md)。仅_segments_of增加14行标准二维POLYLINE分支、新建本卡回归及runner扩入7个精确节点。7 passed / 15 subtests passed；LINE/LWPOLYLINE/CIRCLE、R96单位逻辑及其他原改动保持。F03–F06不启动，原只读子代理授权仅用于F01，本卡未委派。下方F02未启动状态由本条覆盖。

- 最新执行：V00与F01均DONE / review=ACCEPTED；F01经用户明确授权的只读独立子代理f01_independent_review验收，R98按测试fixture问题本地解决。[F01独立复核](archive/f01-2026-10-21/independent-review.md)；[V00复核](archive/v00-2026-10-21/independent-review.md)。73普通项已验收1（R98）、其余72待实施，25冻结未解决；98总项已解决1、未解决97。仅本地、未提交/推送/部署，F02–F06不启动。下方旧状态作为历史保留。

- 最新规划：remediation-planning-001 DONE，仅目标/文档；review-remediation-001执行未开始。98项归队为73普通/25冻结；5个普通R已拆6修复卡，另有V00验证前置，全部TODO/PLAN_ONLY。入口docs/review-remediation-plan-2026-10-21.md及工作表；不从规划推定修复/委派授权。

- 最新审查：2026-10-21按用户收紧后的普通功能静态范围完成并本地留档，review-project-001 DONE。累计98项（9 P1/89 P2）全部待实施；剩余45项已分方式处置，最终651整读/32测试契约/2样式结构/1锁元数据/1安全跳过，不能称687份全部逐行整读或全项目无保留通过。安全专项继续停止，真实环境/浏览器等缺口保留。

- 最新本地工作：studio-progress-001生成进度统一百分比DONE，未提交/推送/部署；所有生成渠道共用预估进度显示、运行最高95/完成100、恢复冻结/同卡不回退。55项前端及Chrome1440/390合成状态检查通过，详见archive/handoff-2026-10-19-task-percent.md。线上仍旧版动态条。

- 最新本地工作：management-interaction-004交互反馈与动效DONE，未提交/推送/部署。按钮按压、加载骨架/保存忙碌、视图/抽屉过渡及减少动态效果；54项检查与Chrome1440/390合成操作通过。详见archive/handoff-2026-10-19-management-motion.md，线上保持。

- 最新本地工作：management-usability-003项目管理操作简化DONE，未提交/推送/部署。名称即可创建、可选资料折叠、创建后直接安排工作、关闭/冲突保护；54项检查与桌面/窄屏合成数据操作通过。详见archive/handoff-2026-10-19-management-usability.md；不代表真实业务验收。

- 最新本地工作：skill-feedback-ui-007反馈后台改版DONE，未提交/推送/部署；详见archive/handoff-2026-10-19-feedback-ui.md。Skill/人工/接入分栏，默认待核实，桌面/窄屏真实组件交互通过。原运行版本仍下述Qwen种子修复镜像，本轮没有连接生产或GPU。

- 最新入口：archive/handoff-2026-10-19-qwen-v11-seed-fix.md；v1.1已切换后用户8264暴露easy seed范围问题，修复已部署backendf8822343/worker3cc0ece1，frontend仍d5dfe72b，单图合同保持。未commit/push/GPU重跑，服务器Git仍c70eac02，运行以专用RELEASE.json为准。本地bugfix/migration-bootstrap-001/798dccd，空库迁移修复未发布；此前切换见archive/handoff-2026-10-19-qwen-v11-activation.md。

- comfyui-production-004 / comfyui-edit-002 已发布完成：持久队列/恢复/幂等、1～3张、1K/2K/4K/自定义、双图编辑及SYSTEM守护均已验证；九项真实任务十一张。以 docs/comfyui-frp.md 为准，按用户新需求，不重复GPU验收/重装守护。
- 用户已要求于 2026-10-16 先留档，后续在新对话继续。冷启动读取 archive/handoff-2026-10-16-next-conversation.md，10-13 的 next-conversation 仅保留历史，不代表当前部署。
- 管理台账与四视图工作台均已上线，admin 已明确授权；下一步按用户新需求，优先实际管理员页面/真实资料验收，不能用本地样例冒充业务记录。本次留档不新增开发范围。

## Current Queue

### repair-pilot-038 — F38 / R40多边形提交与受理未知

- 状态：IN_PROGRESS / review=PENDING，2026-10-23本地实施，不关闭R40。
- 合同：submit捕获当前extract/floor/room/action/mode/name/points和草稿标识，按钮/Enter/起点同tick只能一个POST；pending编辑/名称/键盘/楼层/房间锁定，成功确认原身份原草稿才清。明确400/404/409/413/422保顶点/名称/模式，可修改后手动重试。键盘回调读live ref，不能拿进入模式时旧名称。
- 未知恢复：断网/408/5xx/坏响应不当失败未写，保草稿并锁定写入；显式GET只读核对后人工确认已写入结束，或可明确放弃本次重发并清本地草稿。GET无变化不能证明原POST终止；不提供未知直接重试，不自动重复create。核对持续离线仍能明确放弃，不宣称成功/撤回。Page pending/unknown阻止历史切图，list/upload不自动换当前上下文，dirty/pending有beforeunload提示。
- 白名单：CadExtractResult提交/清理/核对/ref/控件锁与必要Page onEditBusy选择保护，新增cadRoomEditWasRejected；api.ts仅buildError四个返回附status，原消息/其他代码保持。R39/notesVersion/计算算法、后端/存储/权限不改；新增test-review-cad-polygon-submit.mjs与8文档/CSV只R40，10既有目标/1新增。
- 验证：原3点/5点400后清0两红；新25 passed /1350.8181ms，受影响R38精确筛4 passed /635.66ms，合29项exit0无skip。含三闭合入口/旧名称回调、同tick多入口、拒绝修改重试/快照不变、网络实际受理后GET/一次GET未变不解锁/读失败可放弃、坏响应/切图卸载/乱序/普通rename/undo/paint与Page保护。21/22一次失败为VM跨域原型比较，改逐值比较后通过；不是业务断言放宽。真实buildError元数据与原消息各分支验证。
- 类型：首次两个目标3诊断为既有ImportMeta.env；本卡前快照与当前严格比较3对3、0新增，API原reviewed baseline也有3，不改该基线。依赖诊断排除，非全项目typecheck通过。
- 依赖：V00/F35；同步8文档/证据archive/f38-r40-2026-10-23。1182基线/38前卡1013封存保全，普通1 DONE/32 IN_PROGRESS/40 TODO，总未解决97。无后端操作幂等ID，不提供离页/崩溃恢复，Hook/canvas事件非浏览器DOM；无委派/复核/切分支/提交推送部署，25冻结停止。

### repair-pilot-037 — F37 / R39意见请求与续写保全

- 状态：IN_PROGRESS / review=PENDING，2026-10-23本地实施，R39未关闭。
- 合同：允许保存期间继续编辑房间/整图意见，快照+编辑序号与返回版本确认，只同步干净草稿或本次确认版本，后续输入/服务器未包含的本地内容保留dirty。不因新notes对象/键序变化重置。外部notes冲突时保留本地，明确采用图上或确认本地替换后再手动保存，无自动重试。
- 状态边界：save/rearrange/apply即时ref互斥，mounted/extract/request序号绑定结果，切图/卸载/乱序不得改新稿；已知外部notes在请求中变化时不发布旧整记录返回。正常建议/放弃与apply后续输入保全，own ack只消费一次。
- 白名单：仅CadExtractPage.tsx内CadProgramPanel生命周期/输入onChange/冲突操作/按钮互斥及新增纯notesVersion；原normalizeNotes/gaps/writable/程序计算、R38 Result/Page/准备及R40多边形保持。新test-review-cad-program-notes.mjs；8文档/CSV只R39，9既有目标/1新增。
- 验证：两业务红均typed during request→before request，exit1；首轮18 passed /593.0185ms，补返回缺字段/归一化回原文/旧ack/apply竞争后最终22 passed /631.9897ms，exit0无skip。Page目标strict诊断0（依赖诊断排除，非全项目）。实际组件AST选载/真实buildCadProgram/Hook effect/deferred API，非浏览器或真实模型验收；未重复未受影响R38。
- 依赖：V00/F35；同步8文档/证据archive/f37-r39-2026-10-23。1181基线/37前卡982封存保全；普通1 DONE/31 IN_PROGRESS/41 TODO，总未解决97，无委派/复核/切分支/提交推送部署，25冻结停止。意见离页持久化/其他字段的全记录revision不在本卡。

### repair-pilot-036 — F36 / R38 CAD准备条件草稿保全

- 状态：IN_PROGRESS / review=PENDING，2026-10-23本地实施，不关闭R38。
- 合同：账号/extract/floor身份+相关内容指纹管理初值与dirty；无关notes/另一层/兼容URL刷新保输入，geometry/rooms/准备条件变化留草稿报冲突。明确采用最新或保留尺度/通路按当前分区重核，不能默默重基。干净草稿正常刷新，成功确认后才转saved，失败/过期/离开期间响应保草稿且不改新身份。
- 导航：同标签页内存cache保校准/用途/route草稿/宽度/入口/模式，不写磁盘。楼层/图纸可取消切换或保留后切换；Page pending阻止list或新解析自动卸载当前图纸。SPA离开可返回恢复，刷新/关闭beforeunload提示后明确确认离开可放弃；退出/访客/换会话清cache。
- 白名单：CadPreparationPanel.tsx、CadExtractPage.tsx仅准备生命周期/身份/pending/导航，AuthContext.tsx仅clear调用/导入；新cadPreparationDrafts.ts及test-review-cad-preparation-drafts.mjs。原test-cad-preparation.mjs必要新helper VM映射适配，原三场景/assert不变；12既有目标/2新增。后端/存储/算法/R39意见/R40多边形不改。
- 验证：原两红为20米被重置10米；初始驱动递归错误独立留存。新22 passed in1162.3052ms、原3正常命令passed in472.1972ms，均exit0无skip/stderr空。四业务目标strict类型诊断0（依赖诊断排除，非全项目typecheck）。包含相关/无关刷新、成功失败/过期响应、冲突重核/放弃、partial route、真实page/result按钮与pending、四会话clear回调；真实DOM/浏览器验收未做。
- 依赖：V00/F35；同步8文档/CSV仅R38和archive/f36-r38-2026-10-23。1179基线/36前卡937封存文件保全；普通1 DONE/30 IN_PROGRESS/42 TODO，总未解决97。冻结25停止，无委派/复核/切分支/提交推送部署。

### repair-pilot-035 — F35 / R37 CAD读取兼容与写入竞争保全

- 状态：IN_PROGRESS / review=PENDING，2026-10-23本地实施，R37不关闭。
- 目标/合同：GET只在响应副本补line字段，no_autoflush且不提交DB；已有显式墙线优先且不覆盖，缺线cache可独占创建。响应为读取时快照。review/preparation/fitout与F34 edit/program共用源比较，初始陈旧读或计算后竞变409，重新读取后可合法重试，不重复undo。
- 边界：三业务源文件仅本卡函数块；原权限/owner/查询limit/错误映射、prep/fitout/分区算法、F34媒体生命周期、其他端点及冻结请求保持。无前端version字段，不宣称所有旧表单被识别；失败派生cache可留、不改旧mask/preview/墙线。
- 验收：原detail/list交错成功rename两红2 failed in1.20s；修后新18+F34原20共38 passed /81 subtests in13.32s，exit0无skip。包含两GET交错paint/review/真实preparation/fitout、同/不同层CAS与重试、三写者flush/commit回滚、陈旧初读拒绝、并行缓存/赢家墙线和真实legacy初次校准/空白房间布置，5第三方弃用warning保留。尚未独立验收。
- 白名单：routers/cad.py、cad/room_edit.py的ensure_line_layers、cad/edit_persistence.py的cad_edit_source；新增test_review_cad_read_conflicts.py，runner仅18精确nodeid/说明；8文档/CSV只R37及本卡证据。
- 依赖：V00/F32/F34；真实PG/ASGI/OSS/浏览器未验，无真实CAD/视频/服务/全套/安全/GPU/付费。无委派/复核/切分支/提交推送部署，25冻结停止。
- 同步：tasks/handoff/plan/architecture/review/修复计划/原方案/CSV和archive/f35-r37-2026-10-23；1178基线、35前卡908封存文件保全。普通1 DONE/29 IN_PROGRESS/43 TODO，97未解决。

### repair-pilot-034 — F34 / R35 CAD编辑/undo版本与提交保全

- 状态：IN_PROGRESS / review=PENDING（2026-10-23本地实现/定向回归，R35未关闭）。
- 合同：先copy payload、校验action/房间/名称/顶点/容量/绘制/编码，再stage UUID新三图和undo副本，不覆盖或先删旧版本。独立新key保留-mask/.png/-lines派生，缺line只在内存剥离；所有读者按新引用取图，原分区/图形算法保持。
- 提交：两个实际写入口共用CadMediaEdit追踪成功create，源JSON对象与原文本同select；按原文本CAS写DB，竞变409，SQLite短提交段真实BEGIN/失败rollback，PG源行锁未实测。commit/响应未知时不自动重试或删stages，已提交的新引用仍指完整图；原guard/owner查询和其他端点保持，非ASGI/权限验收。
- 回收：逻辑undo最多20，只有本请求成功创建、确认commit且最终JSON任何字段未引用的从未发布草稿可本地删；已发布旧版本/trimmed undo因缺全局引用与读者协调物理保留，OSS不删，失败stages保留。这是容量/历史物理回收限制，不能宣称全量垃圾已清；不自动清理真实数据。
- 验证：原20栈空rename/undo commit失败两业务红（初始fixture漏sha256另存）；首轮共同源读取列无label导致59失败计含子例，显式label修正后最终新18+原RoomUndo/program1各一共20 passed /47 subtests in10.84s，exit0无skip。5第三方OpenTelemetry弃用warning保留未抹。27媒体写故障、10 SQL故障/重试、40项batch草稿回收/旧历史保留、CAS、ack丢失/响应失败、假OSS、4并行候选、全部正向动作和旧像素断言覆盖。
- 范围：room_edit仅生命周期/helper/等价内存lines参数，原ensure_line_layers与绘制/测量/配色/marker/名字算法原字节；新edit_persistence；router仅edit/program-apply；旧CAD测试只三像素读取跟新返回mask_file，断言保持，program测试不改。runner442精确白名单（422→442），其余代码/冻结/GET不改。
- 交付：archive/f34-r35-2026-10-23/evidence.md；12既有目标/2新增及34前卡封存保全。未真实CAD/OSS/PG/LLM/GPU/付费，无委派/复核/提交推送部署，25冻结停止，R37另项未处理，总目标继续。

### repair-pilot-033 — F33 / R34 供方价格配置同步合同范围

- 状态：IN_PROGRESS / review=PENDING（2026-10-23本地实现/定向回归，R34未关闭）。
- 合同：apply须version=1/已知目录/CNY/Haodeya/endpoint/source及逐profile id/provider/model/全Profile+Rule指纹；当前端点精确匹配，批准后变化/删除整批中止。无计划dry-run只报告指纹/原因，无计划apply先拒绝；source是操作者核定说明，不证明真实市场报价。
- 统一边界：图像/聊天/三家族精确video SKU与所有停用同候选入口；unknown/free后缀/能力不符/重复规则跳过。旧genericGrok仅逐条video_family=grok明确确认可用。Seedance按实际质量/时长档，不把fast/1080套普通720价。其他渠道全部原价/币/档/规则/enabled保持。
- 特殊合同：目录无4K且原CNY自定义价保留；外币自定义4K缺明确补价跳过，CNY补价含0可显式应用；外币其他特殊档/视频4K不随整体换CNY。custom规则默认保留，deactivate_rule_ids仅本人chat规则可停，不得与本轮标准激活矛盾。样本只列价格变更/合同来源，非价adapter字段保持。
- 验证：原other-image9USD被改、other-chat自定义规则被停两红；首轮19/17通过，增强删除/标准停用矛盾/零4K/外币特殊档后最终19 passed /20 subtests in1.30s，exit0无skip。合法image/chat/实际video正向、重复不增/不假报updated、失效指纹与apply/flush/commit全回滚、CLI parser/helper临时DB都覆盖。
- 范围：haodeya_pricing仅sync及helper/result默认字段/catalog标识/import，静态价表和所有原计价小函数原字节；CLI仅sync参数/helper/分支，F27 backfill不动；原三测试仅fixture/同步计划适配，assert与Grok计价两函数保持；runner403→422精确节点/说明，新16节点回归。
- 交付：archive/f33-r34-2026-10-23/evidence.md；12既有目标/1新增及33前卡封存保全。仅临时SQLite与AST CLI，不真实核价/同步/PG/完整CLI；无委派/复核/提交推送部署/GPU/付费，25冻结停止，总目标继续。

### repair-pilot-032 — F32 / R33 媒体False写入两端保全

- 状态：IN_PROGRESS / review=PENDING（2026-10-23本地实现/定向回归，R33未关闭）。
- 合同：Local False完整临时文件+独占hardlink原子发布，existing保留；OSS False复用F20非版本化条件create，碰撞保旧不盲重。公共False改同步：local旧/remote缺按旧镜像；remote旧/local缺以远端旧bytes补cache；皆缺以条件远端winner为准；两端原有冲突/竞变/未知错误明确抛出并保副本，诊断path+两端SHA，不输出媒体bytes。
- 保持：默认True原local先写/异步镜像/backoff，F20全部create/Agent专用接口原字节。旧False background走同helper并保logger；ensure_public_object_url仅missing分支使用保全helper。.bin/SVG真实调用点源代码保持，不能因exists竞态覆盖远端新winner。
- 验证：原镜像(local old,remote new)与直接OSS False两红；修后最终新18+F20原4+media原2联合24 passed /14 subtests in2.20s，exit0无skip。20本地完整文件竞争、4远端条件竞争、矩阵/冲突哈希/丢响应重试/读写失败/短写清理、真实SDK headers离线转发及默认True兼容覆盖。首轮仅SDK替身缺request_id失败（23 passed），修正后通过，日志保留。
- 范围：media_storage仅False早分支/helper/冲突异常、missing分支/说明与必要imports；runner383→403（新增18+原media2，F20原4已在白名单），新18节点测试。其他存储/上传/URL/render与create接口不改，旧测试文件全原字节。
- 交付：archive/f32-r33-2026-10-23/evidence.md；10既有目标/1新增、32前卡封存保全。False在OSS时增加同步I/O；hardlink能力缺失/版本化或未知新写能力明确失败；远端成功local失败可留单端供重试，不宣称跨存储或与外部True并发原子。未真实OSS/维护，无委派/复核/提交推送部署/GPU/付费，25冻结停止，总目标继续。

### repair-pilot-031 — F31 / R32 SQLite Agent时间默认值纠正迁移

- 状态：IN_PROGRESS / review=PENDING（2026-10-23本地实现/定向回归，R32未关闭）。
- 合同：新增d40e9f82b735/down=c39d8e71a624，只SQLite policy.created_at/updated_at、memory.created_at、catalog.created_at/updated_at字面now()改CURRENT_TIMESTAMP。其他可用默认/PG不改；静态盘点仅五处，原bootstrap/历史迁移/ORM/业务服务字节保持。
- 保全：三表批量重建保行/原时间/扩展列/FK/unique/匿名CHECK/表达式及部分索引/触发器；SQLite真实BEGIN+savepoint包住修正，版本失败由外层回滚。未知入向FK/依赖view/自定义默认/缺表字段先拒绝，不关闭foreign_keys。SQLite downgrade拒绝恢复坏默认；PG升降仅no-DDL分支，非真实PG验收。
- 验证：真实旧链/新head阶段禁止MetaData.create_all，无SQLite自定义now函数。原三类正常写入3 failed in5.92s；修后最终新12+旧单head1共13 passed /3 subtests in11.14s，exit0无skip，含memory实际service、policy正常ORM、catalog实际service、有数据保全/约束行为、复制/DDL/版本故障、二次upgrade/直接重入和metadata对照。首轮测试差异/注入/对照依赖问题另留日志，不冒充全程绿。
- 范围：新纠正migration+新12节点测试，旧migration测试只首个head断言增改两行；runner370→383精确节点/说明。无三类HTTP/权限/安装专项，不运行旧bootstrap整组、冻结测试或真实数据库。
- 交付：archive/f31-r32-2026-10-23/evidence.md；10既有目标/2新增及31前卡封存保全。扩展入向FK/view需要另核迁移保全方案，SQLite降级不自动恢复坏默认；无委派/复核/提交推送部署/GPU/付费，25冻结停止，总目标继续。

### repair-pilot-030 — F30 / R31 模板事件按所属意图归集

- 状态：IN_PROGRESS / review=PENDING（2026-10-23本地实现/定向回归，R31未关闭；下一普通项，不展开冻结编号）。
- 合同：按template且当前窗口内每个Intent.outcome_signals汇总一次，复用原summarize_session_outcomes；同意图多次真实事件保留，settled/submission不是事件。不取Session缓存，混模板/无模板/outside-window不串入，无session仍保留事件。
- 保持：gacha/explore/settle/completion原每意图权重、quality_score和settled/session计数公式、窗口/rollout裁剪、阈值/排序/元数据/字段原样；overview与其他函数不改，原事件/缓存/Task不写，不借此重算真实历史。
- 验证：原1下载→3、混模板下载2+书签2两红；修后新10+原2精确节点一次12 passed in1.57s，exit0无skip。实际临时FK库/真实outcome登记，重复合法count、窗口含边界/rollout、缺session、缓存999只读、原评分0.675/权重、阈值/元数据覆盖。
- 范围：dashboard service仅原helper导入+按Intent合并一行/删Session合并一行；runner358→370只12精确节点/说明，新增10节点组合FK回归，原analytics测试不改。Session/outcome服务/模型/迁移/路由/前端原字节。
- 交付：archive/f30-r31-2026-10-23/evidence.md；10既有目标/1新增与30前卡封存保全。未PG/ASGI/真实维护，无委派/复核/提交推送部署/GPU/付费，冻结25停止，总目标继续。

### repair-pilot-029 — F29 / R29 统一在线/补入/重算会话聚类

- 状态：IN_PROGRESS / review=PENDING（2026-10-23本地实现/定向回归，R29未关闭）。
- 合同：同user/ref（空ref归空串），UTC submitted_at/id稳定顺序，相邻0<=gap<=30分钟连通；其他ref交错不切，同ref跨project/provider仍原key。在线迟到接前/后/桥接，三入口共用纯聚类和成员对齐，原metrics公式/outcome/Task不变。
- ID：片段按key/时间序复用成员原Session中未占用且key匹配的最小id；拆分较早段保旧id，合并取最小id，先迁移所有Intent引用后仅删空旧组。不全删重建，不对已淘汰id提供alias；仓库仅Intent一处FK，真实外部保存id无法证明不存在。在线相关跨key异常拒绝，全量明确重算可校正。
- 事务：内部savepoint不commit；SQLite实际BEGIN IMMEDIATE再SAVEPOINT，维护失败可被捕获后commit仍无部分重分组。backfill整批回滚新增意图和派生outcome；新Task/Intent创建先于assignment，在线失败仍由调用方回滚整次提交事务。路由原commit不改，PG并发未验。
- 验证：原倒序0/60/2880三任务误并一组、A/B/A重算2变3两红；首轮19/6通过，增强实际FK/在线桥接/空库及计数后最终20 passed /8 subtests in2.78s，exit0无skip。覆盖成员/分数/ID与全原字段、6顺序、含30/超界、相同时间、空ref/跨user/project、桥接/旧组拆分、部分已有/重复及多故障回滚，无提前commit。
- 范围：generation_session_service仅两入口和聚类/成员对齐/savepoint helper/import；generation_intent_service仅backfill稳定tie/批次savepoint/import，原record/sync和指标/outcome公式不改。runner338→358只精确节点/说明，新增20节点临时FK回归；模型/迁移/路由/看板/前端/正式Task执行不改。
- 交付：archive/f29-r29-2026-10-23/evidence.md；11既有目标/1新增与29前卡封存保全。未真实维护/服务/PG/ASGI，无委派/复核/提交推送部署/GPU/付费，25冻结停止，总目标继续。

### repair-pilot-028 — F28 / R28 历史回填有效档位与明确4K价格

- 状态：IN_PROGRESS / review=PENDING（2026-10-23本地实现/定向回归，R28未关闭）。
- 合同：执行billing/effective_resolution/progress计价与计划档位一致优先，result实际档位也须一致；payload保留原请求参考，无执行依据时旧显式字段须一致。明确返回1k/2k/4k/未知，像素尺寸不猜历史档价。
- 4K：目录无明确unit_price_4k则跳过；允许批准任务image_4k_quote补充version=1/4k/CNY/per_image/非负有限单价及source，仍绑定F27历史身份/期间/图指纹。目录冲突/非4K报价/无价/不明规格及Task/Call/progress费用快照冲突保留原图。真实历史报价由维护者核定，本地合成9不是实际报价。
- 验证：新16+F27原18联合34 passed /37 subtests in5.48s，exit0无skip。原解析把4K/未知当1K的5子反例和合法目录4K被跳过已红；首轮33通过/1断言失败（正确账unchanged应保持，已修测试）。最终零价4K、16类快照冲突、12无效报价、历史降档、缺价9 CNY保全、批次指纹/重复及apply/flush/commit回滚覆盖。
- 范围：回填服务图像档位/报价/候选小helper与math；runner322→338白名单/说明，新增组合复用F27临时FK fixture的16节点。CLI、价表、通用金额helper、正式执行/模型/ledger及F27原测试文件不变；原Grok/事务/图apply/指纹/输出数量字节保持。
- 交付：archive/f28-r28-2026-10-23/evidence.md；10既有目标/1新增及28前卡封存保全。未真实维护/PG/CLI启动，无委派/复核/提交推送部署/GPU/付费，25冻结停止，总目标继续，未开始R29。

### repair-pilot-027 — F27 / R27 历史回填供方/SKU与明确合同范围

- 状态：IN_PROGRESS / review=PENDING（2026-10-23本地实现/定向回归，R27未关闭）。
- 合同：仅明确历史单Call/精确SKU/历史端点和带来源、期间、CNY的version=1计划；每任务完整费用图SHA256拒绝批准后变化。当前profile/共享adapter/模糊子串不作历史身份。合同来源由操作者确认，静态目录日期不代表真实合同生效日。
- 保全：USD、各层币种或价格快照冲突、实际收费、缺历史端点、多Call/缺归档Call/不明Ledger来源不改。合法2K/Grok同步Task/Call/Archive/ArchiveCall/Ledger；Task对而账错仍修，旧计划重复拒绝，新指纹且费用全对unchanged不增账。4K/缺失/冲突规格仅预览，R28另卡。
- 验证：原官方5 USD被改1.62 CNY、HappyHorse12 CNY被改Grok3.33 CNY，两节点红；修后最终18 passed /14 subtests in2.71s，exit0无skip。包含批准期间左右边界、11类币种/快照/身份冲突、脏Session拒绝、dry-run no_autoflush、批次失效与三处故障全图回滚；CLI仅真实parser/helper的AST载入，不启动模块。
- 范围：task_cost_backfill合同匹配/候选/事务；CLI仅backfill参数/执行helper；原2测试仅fixture/明确计划适配。原两个tier resolver/输出数量/apply helper、价表/执行/模型/ledger服务原字节保留，runner仅304→322精确白名单及说明。
- 交付：archive/f27-r27-2026-10-23/evidence.md；12既有目标/1新增及27前卡封存保全。真实历史维护/PG/生产服务未验；无委派/复核/切分支/提交推送部署/GPU/付费，25冻结停止，总目标继续。

### repair-pilot-026 — F26 / R18-B CNY月额度执行不可比状态

- 状态：IN_PROGRESS / review=PENDING（2026-10-23本地实现/定向回归；F25/F26均待独立验收，R18不关闭）。
- 合同：沿已确认CNY、上海自然月、无换算；只读月账按币种汇总，有非CNY返回None。有限hard_block无法核定预算时403明确要求管理员核定，不把110原币合计当CNY或误报额度耗尽；同CNY维持>=阈值/低于允许，soft_warn/无限额不新增阻断，suspended仍最高优先。
- 范围：billing.py仅月金额helper、必要分币helper/上界、None guard/CNY文案与timedelta导入。原Chat计价/normalize/月初helper与三生产调用点、F25前后端/模型/迁移/原账全保持；不做并发金额预留、汇率或自动调账。
- 验证：13精确节点首轮13 passed /10 subtests in1.94s、exit0无skip；补强空账/空币种和三入口实际拒绝文案后只重跑受影响4节点，4 passed in1.17s；组合复用fixture避免继承旧测试后最终13/10 in1.93s通过。混币110与误含下月9原红2失败。月界/年界/闰月、他用户/供方重复排除、0外币声明、阈值/早返/暂停/只读均覆盖。
- 三入口：源Task create、普通Chat async send、Chat confirmed task真实函数与submit_once/临时DB实际调用guard；正常前置身份/配置为离线替身，拒绝后新Session Task/Dispatch/Message/ProviderCall全0，prepare/stream/executor/enqueue/BackgroundTask零调用。非ASGI/真实服务/实际Redis或模型验收。
- 交付：archive/f26-r18b-2026-10-23/evidence.md；10既有目标/1新增与26前卡封存保全，F25未改且不重复无影响检查。无委派/复核/提交推送部署/生产/GPU/付费，25冻结停止，总目标继续。

### repair-pilot-025 — F25 / R18-A分币统计与CNY月额度展示

- 状态：IN_PROGRESS / review=PENDING（2026-10-23本地实现/定向回归；R18-B执行门禁未实施，不关闭R18）。
- 用户已确认：月额度按人民币CNY、上海自然月、无汇率换算；非CNY支出保留月分币明细，额度使用/余额不可比较，不再重复询问此合同。
- 结果：单币模型使用自身币种，同名模型跨币/Task+Chat保留明细并返回null标量；总额/均次/provider/每日同样分币。总额/每日/provider仍Task-only，模型/账号窗口Task+Chat，不重复计provider_call。0金额保留声明币种，空数据0 CNY；不改价格/原账。
- 月额度：独立查询用户本上海月task.finalized/chat.message.completed，含原legacy账、排除重复供方明细，不受展示days/project/provider过滤；固定CNY，外币账（含0币种声明）不可比较，quota_used/remaining=null，有限额incomparable、无限额unlimited；新增月明细/月标签。展示窗口保留原legacy排除，实际quota不遗漏原月账。
- 验证：后端14 passed /3 subtests in1.68s，前端8 passed，7真实Dashboard类型与5金额函数strict片段0诊断，均exit0无skip；真实临时SQLite/FK/账/Schema、当前源get_stats/helpers、正常ops，前端当前TS/JSX合成渲染。不是ASGI/PG/浏览器或全项目tsc。
- 边界：仅dashboard金额/额度消费者、三Schema/三API类型、Page格式/账号额度块及测试，原日期/活动/权限/其他endpoint/先前改动原字节保持。billing.py/hard_block未改/未验，不因本卡绿把R18整体标完成；旧F07日期源码完整保持，其未受影响检查不重复跑。
- 交付：archive/f25-r18a-2026-10-23/evidence.md及前后SHA/增量diff/保全。13既有目标/2新增和25前卡封存保全。无委派/复核/提交推送部署/真实服务/GPU/付费，25冻结停止，总目标继续。

### repair-pilot-024 — F24 / R17显式记忆保全与旧自动清理范围

- 状态：IN_PROGRESS / review=PENDING（2026-10-23本地实现/定向回归，不关闭R17）。
- 结果：先保护tool/manual/HITL/确认/暂停等所有类型原文，未知来源/时期仅候选预览；apply只接受确认旧自动来源的version1行级指纹计划，动作/预期结果也须匹配。缺清单/证据/用户范围/行变化拒绝，重复apply幂等，不猜日期或自动修历史。
- 验证：V00新12节点+适配旧1节点，最终13 passed /10 subtests passed in1.19s、exit0无skip。真实tool保存、ORM/临时SQLite/FK/原分类提炼与乐观写入，两个真实Session竞争回滚；dry-run不flush pending，apply拒绝带未提交ORM内容的Session。SQLite默认秒级时间按DB同次读取原文本匹配，不丢精度。
- 索引：清理服务只返回冻结快照/id，CLI提交成功后再best-effort同步；rollback/flush/commit失败零调用。索引失败不能回滚已提交DB，可重放原计划；原index adapter会吞部分服务错误，failed_ids只表示捕获到的异常，不是实际交付确认，真实索引/PG未验。
- 范围：仅service的旧清理尾区/必要导入、该维护CLI/原单条回归和新测试；store/tool/抽取/暂停/权限/搜索adapter/models/schema/其他函数保持。原全组不跑，实际CLI模块被V00禁入，只选载当前main AST绑定临时DB，不执行正式维护命令。
- 交付：archive/f24-r17-2026-10-23/evidence.md、前后SHA/相对dirty局部diff/保全。12既有目标/1新增、24前卡封存保全。无委派/复核/提交推送部署/生产/GPU/付费，25冻结停止，总目标继续。

### repair-pilot-023 — F23 / R12普通聊天部分回复失败收尾

- 状态：IN_PROGRESS / review=PENDING（2026-10-23本地实施/定向回归，不关闭R12）。
- 目标/结果：异常/取消/提前关闭保存部分正文与现有失败formatter文本；error事件优先分类，失败残篇不写长期记忆。已知usage/账保留，AnyIO shield收尾后传播取消，重复finally不再次持久化或记账。
- 验证：V00新增10精确节点，红2 failed、最终10 passed in2.45s /exit0无skip；真实临时SQLite消息/账/telemetry/计费、asyncio Task取消及有效AnyIO CancelScope。正常完整成功/记忆保持、零正文错误/空结束/附件失败/aclose和账异常防重复覆盖。
- 边界：仅普通generate/必要AnyIO导入；原agent/提交/鉴权/共享persist helper与计费服务原字节保持，runner仅扩节点。原helper两次commit未重构，后段账失败可能已提交消息且telemetry不能关联该id，不自动修账或重试。测试AST选载普通生成器，不代表ASGI断线/真实PG/实际长期记忆管线已验。
- 交付：archive/f23-r12-2026-10-23/evidence.md及前后SHA/局部diff/保全。无委派/复核/提交/推送/部署/真实服务，25冻结停止，总目标继续。

### open-source-promotion-001 — ppt-master传播研究与QMDH推广指导

- 状态：DONE（2026-10-22仅本地研究/文案，无公开发布或业务实现）。
- 目标：回答开源发行版与现有项目的差异，依据用户提供的ppt-master主仓库/B站作者资料提出个人影响力与解决方案求职的推广建议。
- 交付：docs/ppt-master-promotion-study-2026-10-22.md；原筹备方案增加澄清与研究入口。一套业务源码、公开示例/配置/安装资料；宣传聚焦不等于已决定删功能或维护第二套产品。
- 验收：主仓库/作者文档和个人主页为主要来源；B站直读受限，只引用公开索引标题/简介/日期，不声称观看完整视频、确定爆火因果或取得渠道转化。事实、机制推断与QMDH建议分开。
- 边界：原业务与修复状态保持，禁止委派/提交/推送/发布/外部消息/生产/GPU/付费，暂停专项不恢复。
- 后续：一个可演示、可复现主案例与传播包，接续OS02/OS03；源码/演示/作者案例串联，不强制另开对话或重审全项目。实际发布仍等待具体候选内容确认。
- 同步：tasks/handoff/review及原筹备方案；旧handoff原字节归档，2.0仅保持现有结构，无新引擎/迁移。

### open-source-prep-001 — 面向解决方案求职的开源筹备

- 状态：DONE（2026-10-22仅本地筹备文档；社区包未制作/验证/发布）。
- 目标：按用户确认的“解决方案”方向，形成开源定位、首发范围建议、演示/案例与README草稿；用户确认个人项目且对外开源权利归本人。
- 边界：仅新筹备文档与本条状态/交接/文档核对留档；原修复任务、R编号状态和业务代码保持，不恢复冻结范围，不提交/推送/发布/生产/GPU/付费/委派。
- 交付：docs/open-source-solution-portfolio-2026-10-22.md、docs/open-source-README-draft-2026-10-22.md。OS01文案完成，OS02发行清单及后续代码/演示/许可/发布均TODO。
- 验收：定位与用户回答一致，现有能力和候选交付分开，资料不虚构效果/链接/一键启动；本地链接和原改动保全核对；未运行功能测试或宣称发行就绪。
- 后续：先确认社区候选范围，保留当前工作区和原作者/第三方署名；不强制新对话或重新审查全项目。此文档任务DONE不关闭review-remediation-001。
- 同步：tasks/handoff/review；原handoff原字节归档。2.0仅保持任务/资产/来源兼容，无新引擎/迁移/合同。

### remediation-planning-001 — 较低能力模型分批修复计划

- 状态：DONE（2026-10-21仅本地文档，无实施/派发/提交/部署）。
- 目标：98项唯一归队，73普通/25冻结，首批6修复卡+1验证前置，明确模型分工/依赖/文件白名单/验收/返工。
- 边界：只规划；原业务/测试/配置和保护项不修改，安全专项继续停止。新计划覆盖旧排期建议，不改问题事实或擅自关闭R项。
- 验收：98行唯一编号和严重性匹配原报告，7卡依赖无环/路径有效或明确新建，全部TODO/PLAN_ONLY，修复验收0；新计划/CSV与plan/tasks/handoff/review及原方案入口同步。
- 依赖：review-project-001普通静态交付。文档：review-remediation-plan-2026-10-21.md、review-remediation-work-items-2026-10-21.csv。2.0只保留来源/版本/工件/失败与用量可追踪，不新增编排。

### repair-verify-000 — V00 定向离线验证入口

- 状态：DONE（2026-10-21，独立复核Codex当前会话，review=ACCEPTED；仅本地，未提交/推送/部署）。
- 目标：普通功能验证前置；只完成新计划的V00单卡，实施与独立复核分开。
- 边界/禁止：业务和测试文件严格按V00白名单；保护原未提交内容，继承新计划全部冻结/生产/提交/付费/范围限制，不扩展相邻问题。
- 验收：该卡反例、正常控制、隔离与保全证据齐全，经独立复核才DONE；仅实现仍IN_PROGRESS/待复核。
- 依赖：无后台硬依赖；试点交付仍串行。文档同步：新计划进度、98项工作表、原R方案状态与tasks/handoff/review；不得先把R记已解决。

- 本卡交付：新建check_review_subset.py与test_review_check_runner.py；独立重放9 passed / 3 subtests passed、exit0，实际diff/前后SHA/原改动保全核对通过，见[独立复核](archive/v00-2026-10-21/independent-review.md)。实施历史见[证据](archive/v00-2026-10-21/evidence.md)。用户随后追加授权仅F01，任何R项不因此关闭。

### repair-pilot-001 — F01 视频测试实际媒体目录隔离

- 状态：DONE（2026-10-21，review=ACCEPTED，独立复核者f01_independent_review；R98测试fixture问题本地解决，未提交/推送/部署）。
- 目标：R98；只完成新计划的F01单卡，实施与独立复核分开。
- 边界/禁止：业务和测试文件严格按F01白名单；保护原未提交内容，继承新计划全部冻结/生产/提交/付费/范围限制，不扩展相邻问题。
- 验收：该卡反例、正常控制、隔离与保全证据齐全，经独立复核才DONE；仅实现仍IN_PROGRESS/待复核。
- 依赖：V00。文档同步：新计划进度、98项工作表、原R方案状态与tasks/handoff/review；不得先把R记已解决。

- 本卡交付：fixture直接绑定settings.media_root及local，以enterContext在正常/测试体异常/setUp异常后恢复并删除仅自身临时目录；移除6处无效env覆盖，HTTP/等待替身和原断言保留。独立复核重放控制1 passed、顺序8 passed / 2 subtests passed、6个原节点各自独立进程均1 passed，全部exit0、无skip；SHA/diff/原改动保全通过，无阻断项。[独立结论](archive/f01-2026-10-21/independent-review.md)；[实施时点证据](archive/f01-2026-10-21/evidence.md)。仅R98工作表更新DONE/LOCAL_AUTHORIZED，其他97行原字节不变。停在F01，不开始其他卡；真实视频/供方/OSS/生产等未验证。

### repair-pilot-002 — F02 标准二维POLYLINE轮廓

- 状态：IN_PROGRESS（2026-10-21用户要求继续修bug后，本卡本地实现和定向回归完成；review=PENDING，R97未关闭；未提交/推送/部署）。
- 目标：R97；只完成新计划的F02单卡，实施与独立复核分开。
- 边界/禁止：业务和测试文件严格按F02白名单；保护原未提交内容，继承新计划全部冻结/生产/提交/付费/范围限制，不扩展相邻问题。
- 验收：该卡反例、正常控制、隔离与保全证据齐全，经独立复核才DONE；仅实现仍IN_PROGRESS/待复核。
- 依赖：V00。文档同步：新计划进度、98项工作表、原R方案状态与tasks/handoff/review；不得先把R记已解决。

- 本卡交付：仅_segments_of增加标准二维直线POLYLINE连续顶点/闭合边，按ezdxf OCS-to-WCS及块虚拟实体合同取坐标；明确排除3D、bulge、曲线/样条拟合。7个精确节点7 passed / 15 subtests passed，真实分区/栅格/PNG/最终polygon和usable附加均运行，无替身；修前同形状矩形反例2 failed / 2 subtests passed、exit1（一个nodeid的失败子场景及后续完整性断言），LINE/LWP控制通过。原字节、14行局部diff、前后SHA及命令见[证据](archive/f02-2026-10-21/evidence.md)。R97工作表IN_PROGRESS / LOCAL_AUTHORIZED，已关闭仍仅R98；停在F02待复核，不自动开始其他卡。

### repair-pilot-003 — F03 助手默认聊天候选选择

- 状态：IN_PROGRESS（2026-10-21用户要求先修bug后，本卡本地实现和定向回归完成；review=PENDING，R85未关闭；未提交/推送/部署）。
- 目标：R85；只完成新计划的F03单卡，实施与独立复核分开。
- 边界/禁止：业务和测试文件严格按F03白名单；保护原未提交内容，继承新计划全部冻结/生产/提交/付费/范围限制，不扩展相邻问题。
- 验收：该卡反例、正常控制、隔离与保全证据齐全，经独立复核才DONE；仅实现仍IN_PROGRESS/待复核。
- 依赖：V00。文档同步：新计划进度、98项工作表、原R方案状态与tasks/handoff/review；不得先把R记已解决。

- 本卡交付：业务仅_resolve_provider内5行替换/5行新增，按原SQL启用条件和ID升序遍历首个聊天候选，显式ID分支和原错误文案不变。原6个回归6 passed / 13 subtests passed；F04接续扩展共享测试后，F03全部6节点继续通过。[F03实施时点证据](archive/f03-2026-10-21/evidence.md)。F04已在本次明确“继续”后接续本地实现，但两个入口仍未独立验收，R85保持IN_PROGRESS，不声称路由/真实LLM通过。

### repair-pilot-004 — F04 润色默认聊天候选选择

- 状态：IN_PROGRESS（2026-10-21用户要求先修bug并继续后，本卡本地实现及与F03联合定向回归完成；review=PENDING，R85未关闭；未提交/推送/部署）。
- 目标：R85；只完成新计划的F04单卡，实施与独立复核分开。
- 边界/禁止：业务和测试文件严格按F04白名单；保护原未提交内容，继承新计划全部冻结/生产/提交/付费/范围限制，不扩展相邻问题。
- 验收：该卡反例、正常控制、隔离与保全证据齐全，经独立复核才DONE；仅实现仍IN_PROGRESS/待复核。
- 依赖：V00, F03。文档同步：新计划进度、98项工作表、原R方案状态与tasks/handoff/review；不得先把R记已解决。

- 本卡交付：业务仅resolve_prompt_polish_provider内5行替换/5行新增，原显式ID拒绝分支、两种错误文案、函数外原字节及空行/CRLF保持。共享测试只追加润色6节点，原F03类/方法字节保全，真实ProviderProfile表+合成PlatformSettings；F03/F04合跑12 passed / 26 subtests passed。runner仅追加润色6精确节点；[前后SHA/diff/命令/保全](archive/f04-2026-10-21/evidence.md)。R85工作表原字节不变仍IN_PROGRESS / LOCAL_AUTHORIZED，未独立验收不关闭；未改请求/提示词/引用/usage/额度/密钥/schema，未启动复核或F05。

### repair-pilot-005 — F05 搜索请求与查询归属

- 状态：IN_PROGRESS（2026-10-21用户继续后本卡本地实现/定向测试完成，review=PENDING，R55未关闭；未提交/推送/部署）。
- 目标：R55；只完成新计划的F05单卡，实施与独立复核分开。
- 边界/禁止：业务和测试文件严格按F05白名单；保护原未提交内容，继承新计划全部冻结/生产/提交/付费/范围限制，不扩展相邻问题。
- 验收：该卡反例、正常控制、隔离与保全证据齐全，经独立复核才DONE；仅实现仍IN_PROGRESS/待复核。
- 依赖：无后台硬依赖；试点交付仍串行。文档同步：新计划进度、98项工作表、原R方案状态与tasks/handoff/review；不得先把R记已解决。

- 本卡交付：仅useServerSearch.ts与新test-review-search-lifecycle.mjs。复用已有槽位/effect驱动模式，真实Hook、Promise延迟响应、虚拟300ms定时器及排队状态更新，执行模板/灵感实际过滤表达式和真实filter helper；12 passed / 0 failed / 0 skipped。初始2通过/9失败；补畸形响应排队回归后11通过/1失败，局部修正响应映射位置后12全过。类型检查修前/修后均23既有/0新增，未改基线/消费者/API/依赖。R55行IN_PROGRESS / LOCAL_AUTHORIZED，其余97行保持；不自动启动F06，证据含前后SHA/diff/替身及限制。

### repair-pilot-006 — F06 上海业务日期窗口

- 状态：IN_PROGRESS（2026-10-21本地实现及定向测试完成，review=PENDING，R82未关闭）。
- 目标：R82；只完成新计划的F06单卡，实施与独立复核分开。
- 边界/禁止：业务和测试文件严格按F06白名单；保护原未提交内容，继承新计划全部冻结/生产/提交/付费/范围限制，不扩展相邻问题。
- 验收：该卡反例、正常控制、隔离与保全证据齐全，经独立复核才DONE；仅实现仍IN_PROGRESS/待复核。
- 依赖：无后台硬依赖；试点交付仍串行。文档同步：新计划进度、98项工作表、原R方案状态与tasks/handoff/review；不得先把R记已解决。
- 本卡交付：businessDateWindow.ts共享纯函数，router日期状态/消费者和DashboardPage日期展示，新增本卡VM定向测试。业务修前2过/9失败（另一次驱动标签错误单独记录），修后11过、补跨午夜恢复跟随后12过；真实路由函数体和完整页面函数+JSX对象替身，查询/CSV均mock。覆盖上海00:00/03:30/07:59/08:00/13:30、月年/闰日、7/30/90及UTC/洛杉矶/东京进程。原refresh/请求effect/自定义验证/导出函数字节保持，不顺改R77；类型基线未写。范围快照在初始/天数切换/恢复跟随生成，没有新增午夜定时刷新，真实后台账/CSV/浏览器未验证。

### repair-pilot-007 — F07 / D01 / R05 Agent/Chat持久调度事务

- 状态：IN_PROGRESS（2026-10-21本地实现和定向回归完成，review=PENDING、R05未关闭）。
- 目标/依赖：先明确D01事务/唤醒合同，复用V00入口及主Task的add_dispatch，不新增队列/迁移或重跑历史。
- 白名单：agent.py的_create_image_task、两图片提交的Redis异常分支及import；chat_agent_task_service.py的submit_confirmed_chat_agent_task及import；新增test_review_agent_dispatch.py，runner仅扩6个精确节点；文档同步另列。
- 交付：Redis模式Task+Job+Dispatch同commit；重启后claim原task，唤醒失败不标failed、不记失败账；lane匹配provider。sync/后台按主入口state=done，原执行分支保持，不宣称非Redis崩溃恢复。R06稳定幂等键未设计/未顺改。
- 验证：6 passed / 26 subtests passed、exit0；真实SQLite依赖表/外键、Task/Job创建/事务、原add_dispatch/claim/recover。API注册/鉴权/供方/额度/序列化/审计helper和执行唤醒为合成边界，未运行真实执行器；不能称真实PG并发或端到端认证验证。
- 验收/限制：独立复核未启动不自关；真实PG抢占、供方执行/费用、非Redis崩溃恢复和历史遗漏补偿未验证/未实施。原字节/SHA/增量/精确命令见[证据](archive/f07-r05-2026-10-21/evidence.md)；保护其他未提交内容，冻结范围停止，无提交/部署。

### repair-pilot-008 — F08 / D02 / R09 画布保存来源与失败保全

- 状态：IN_PROGRESS（2026-10-21本地实现/定向回归完成，review=PENDING；未独立验收、R09未关闭）。
- 目标/合同：待保存数据绑定来源项目/编辑序号/唯一saveId，单一保存链及同标签页跨挂载串行；切换/新建/复制/删除前flush，失败保留来源项目/草稿和重试。旧加载/错误/finally/删除后选图不覆盖新视图，同项目GET期间新编辑不回退。
- 白名单：useCanvasProject.ts生命周期；CanvasWorkspace.tsx仅现有身份参数、重试按钮、库事件失败捕获及删除后选择消费者；新增canvasProjectDrafts.ts和test-review-canvas-project-save.mjs。其余图算法/模板编辑/上传/任务回写/R50/API/后端/权限只读。
- 保全：编辑同步备份sessionStorage，按用户id/项目分键，ack按唯一saveId只清理对应备份；同标签页重开恢复、服务器图已变需明确选择（取消保留两份）；备份不可用显式提醒保持页面/重试及beforeunload提示。关闭标签页/浏览器不保证恢复，不引入永久历史/跨标签/后台CAS。
- 验证：初始16项1过/15失败；修后16过；补同项目GET与跨挂载反例19项17过/2失败，修正后20过，补冲突/缓存/删除消费者正常控制后最终25 passed / 0 failed / 0 skipped、exit0。业务最新类型23 current / 23 baseline / 0 new，基线未写。
- 交付/限制：真实Hook/共享草稿模块、deferred内存API、虚拟timer/storage、排队state updater；实际Workspace重试JSX和删除函数执行，非完整React/XYFlow/浏览器/真实SQL。[证据](archive/f08-r09-2026-10-21/evidence.md)含精确命令/前后SHA/原增量保全。独立复核未启动不自关，继续普通项，冻结和生产/付费/提交边界保持。

### repair-pilot-009 — F09 / R23 按实际产物补齐资产

- 状态：IN_PROGRESS（2026-10-21本地实现和定向测试完成，review=PENDING，R23未关闭）。
- 目标/边界：R19所需的逐项资产复用；只改task_executor.py::_materialize_assets，runner仅加7个精确节点，新建test_review_output_assets.py；正式文档同步另列，不改执行/计价/权限/R15冻结逻辑/模型/迁移。
- 合同：同Task/同project/预期type/同path复用最早Asset；按实际产物路径顺序去重补缺项，返回值仅为本次产物。所有附件/旧重复行/其他Task数据保留，既有名称/标签/提示词不重写；不新增并发唯一约束或删除历史。
- 回归：修前9 failed / 1 passed（包含3个subfailed），修后7 passed / 3 subtests passed；补图像编辑/放大/视频类型正常对照后7 passed / 6 subtests passed、exit0。真实ORM/SQLite外键、原execute_task成功消费者（适配器/usage-intent边界替身），无真实图片生成/存储/费用/视频。
- 验收/限制：独立复核未启动，真实PG并发未证明；[证据](archive/f09-r23-2026-10-21/evidence.md)含原副本/SHA/增量/命令/保全。R19计价已获用户确认保持每逻辑Task一次并标未知费用，下步单卡设计/实现，不把R23算成R19完成。

### repair-pilot-010 — F10 / D03 / R19 外部图像部分成功持久化

- 状态：IN_PROGRESS（2026-10-21本地实现/定向回归完成，review=PENDING，不自关R19）。
- 依赖/合同：V00/F09本地基础，用户明确per_request每Task一次、未知费用单独标记。Task.result.generation_progress v1含step状态/路径/usage/请求标识及原定价/模型，响应与逐图保存检查点同事务写Task/Asset/聚合ProviderCall/UsageLedger，后续POST前必须commit；失败保持partial_outputs且Task failed。
- 白名单：task_executor图像适配器/进度helper/执行器绑定及成功失败保全；base.ProviderExecutionError可选partial_outcome；usage_ledger图像usage/未知费用元数据；runner仅增10精确节点；F09夹具仅补2个类型globals，F09_materialize函数/其余断言保持。无模型/迁移/原定价函数/ComfyUI/视频/权限/媒体存储/Chat计价变化。
- 恢复：已完成步骤复用，不POST原步骤；原价格固定，模型变化停止；不明步骤拒绝自动重提，不伪称R20供方GET恢复或默认lane调度review均完成。持续DB故障传播异常，不能冒充失败状态已提交；旧lease不能写新检查点/下一POST。
- 回归：原新10节点12 failed / 2 passed（含subfailed），修正子场景独立初始化后poll/download两反例仍丢storage_paths；首轮合跑17过/10子场景，补同响应内下载失败/持续DB故障后17过/11；恢复模型漂移反例1失败后补guard，最终17 passed / 11 subtests passed in 2.95s。合法PNG仅写测试临时目录，真正源函数/ORM/ledger/计价纯函数执行，网络/供方/媒体I/O边界替身。
- 限制/证据：[证据](archive/f10-r19-2026-10-21/evidence.md)含精确nodeid、前后SHA/增量和保全。未知费用在billing_note/usage_payload/error_summary保留，数值仅已知配置费用，不当真实上游支付。真实PG竞争/跨进程重启/供方账/浏览器/生产未验；既有类型基线不变，未重跑无关前端/视频/安全专项。

### review-baseline-001 — 全项目审查前留档

- 状态：DONE（2026-10-19 本地，无提交/推送/部署）。
- 目标：固定当前代码基线、各任务状态、生产差异和恢复依据。
- 边界：仅本地快照/文档，禁止改功能代码、原保护项、生产配置或GPU执行。
- 验收：pre-review-20261019-225451含补丁/Git状态/145条dirty哈希/55正式文件副本，副本SHA全部一致；90旧_tmp仅哈希，原94保护文件不变。最新前端55项/类型既有23零新增/构建及历史专项证据留档，未重复运行功能测试。
- 文档：archive/handoff-2026-10-19-pre-review.md、tasks/handoff/review及code-review-2026-10-19.md；快照不含生产DB/媒体/忽略配置，不能称完整生产灾备。

### review-project-001 — 全项目分模块只读代码审查（按收紧范围交付）

- 状态：DONE（2026-10-21仅本地审查留档；用户限定的普通功能静态范围已完成，安全专项跳过，不代表完整安全/动态验收；问题均未修复）。
- 接手：最终archive/code-review-2026-10-21-final-evidence.md、final-coverage.csv及累计报告/方案；旧证据不重写，不自动开始修复或恢复安全专项。
- 累计发现：98项（9 P1/89 P2），全待实施；新增R96 CAD单位覆盖/R97经典POLYLINE漏分区/R98视频测试媒体配置未隔离，O01–O04不变。当前审查DONE不等于任何R项已解决或获准发布。
- 实际覆盖：687份132877行，651整读/32测试契约/2样式结构/1锁元数据/1整文件安全跳过。上批剩45份33039行已分方式处置；9份4900行整读，43份HEAD文本同，两原未提交CSS字节不变。36份不属于人工逐行整读，不能用覆盖台账替换审查强度说明。
- 验证：10个普通CAD隔离场景含控制；原AST/ezdxf/Pillow内存执行，轮廓附加边界替身，无原应用/配置/真实图纸/网络/模型。R98为静态调用链，未运行问题视频测试。40测试源273个静态测试函数，242普通契约/31保守排除，非运行数；本批未运行既有套件，72历史参与文件不增。
- 样式/依赖：两CSS2440规则/8719声明完整解析加响应式/层叠/变量/动效重点核对；锁244 packages登记/15直接版本范围与manifest一致。无安装/更新/联网、依赖安全评估或浏览器验收，未重跑typecheck/build。
- 最新执行边界：安全专项、相关复现与攻击场景停止，不换方式验证；权限/安全相关部分跳过且不算通过。业务文件只读，不修复/委派/提交/推送/部署/生产/GPU/付费/旧_tmp/维护CLI；历史方案不是实施或恢复授权。
- 剩余限制：真实PG/Redis竞争、Meili/OSS/供方、真实图纸/转换器、历史价格/附件合同、浏览器/视觉和全部时序未完成；不作为本次可自动执行工作，保留在最终证据。下一步等待用户另行明确安排，不自动领取修复。
- 同步：报告/方案/tasks/handoff/review、最终coverage/evidence，旧round6d主交接原字节归档，主handoff3条。2.0保持单位/坐标/实体与房间工件来源、保存版本和计算结果可追踪，不扩展业务范围。

### studio-progress-001 — 生成任务统一百分比进度

- 状态：DONE（2026-10-19 本地，未提交/推送/部署）。
- 目标：所有生成渠道统一百分比体验，保留队列/恢复上下文并明确预估性质。
- 边界：仅进度显示/既有hook及专项回归；不改后台/工作流/调度/接口/权限/媒体或原styles.css，不运行GPU、不发布。
- 实现：共用StudioTaskProgress，沿用时间预估，运行0～95，只有completed为100，结果图库上方也显示完成条；保存checkpoint中文提示，恢复冻结计时、同一卡不回退、切任务重置、失败无完成条，支持减少动态效果。不代表采样实测比例，刷新页面重新估算。
- 验收：前端55项/23既有TS零新增/构建通过，Chrome1440/390合成任务验证计时推进/暂停/回退保护/图库100/失败/非法日期/减少动态效果及无溢出/错误。图库演示用占位，无真实媒体或生产GPU验收。
- 依赖与文档：现有inferVirtualTaskPercent/任务状态与ComfyUI checkpoint；同步checks/architecture/comfyui-frp/tasks/handoff及专项归档。2.0任务/工件/审计模型不变。

### management-interaction-004 — 项目管理交互反馈与动效

- 状态：DONE（2026-10-19 本地，未提交/推送/部署）。
- 目标：改善点击、切换、加载和保存的可感知反馈，保持简洁操作。
- 边界：仅管理页面及独立样式，依赖management-usability-003；不改后端/权限/API/业务数据/迁移/依赖或原styles.css，不发布/运行GPU。
- 实现：按钮按压、主按钮渐变阴影/输入聚焦/选人高亮，视图与抽屉入场、阶段添加，骨架加载/保存转圈和禁用/明确文案，台账保存成功通知；系统减少动态效果时关闭动画与平滑定位。
- 验收：54前端检查/管理9项、23既有TS/0新增、构建通过；Chrome1440/390合成慢API验证动画/按压/骨架/保存禁用单次写入/高亮/减少动态效果、无溢出/页面异常；原名称创建/排期/甘特/冲突和隐藏数据保持回归通过。不能代替生产真实资料验收。
- 文档与兼容：management-projects/checks/architecture/handoff及motion专项归档；纯展示反馈，不改2.0任务/工件/证据结构。

### management-usability-003 — 项目管理操作简化

- 状态：DONE（2026-10-19 本地，未提交/推送/部署）。
- 目标：让用户先创建项目、安排工作，再逐步补齐台账资料。
- 边界：管理页面/独立样式/既有管理回归；不改权限/API/后端/迁移/依赖，不触碰原styles.css13行或未跟踪脚本，不发布或运行GPU任务。
- 实现：名称唯一必填、负责人/截止/当前工作常显；其他基本资料/分工/费用按需展开，阶段高级设置收起，空白总览三步引导，次要筛选收起；创建后直达排期。未修改关闭无需确认，修改与冲突保留输入，年度切换清理创建提示。
- 验收：前端54项、管理专项9项、23既有TS/0新增、构建通过；Chrome1440/390名称创建/无名册/无自动阶段→工作安排→甘特、冲突保持/关闭保护/隐藏旧数据保持，无页面错误或整体横向溢出。只用本地合成API，不代替生产业务验收。
- 依赖与兼容：复用management-workbench-002和现有项目版本/财务null语义，隐藏字段保留；无新工作流/数据抽象，2.0任务与证据边界保持。真实资料验收、导入及自动排程仍未完成。
- 文档：management-projects/checks/architecture/tasks/handoff及专项归档。

### skill-feedback-ui-007 — 反馈后台界面整理

- 状态：DONE（2026-10-19 本地，未提交/推送/部署）。
- 目标：解决接入说明、核实证据、改进表单和人工对话挤在同页的问题，优先呈现待处理事项。
- 边界：FeedbackOpsPage/SkillFeedbackPanel/FeedbackCredentials与独立feedback-ops.css、反馈渲染回归；不改后台接口/权限/数据，不改原styles.css13行，不自动发布或发送外部消息。
- 实现：Skill/人工/接入三个栏目，Skill默认待核实，原始JSON/技术信息/统计折叠；改进问题列表与详情、人工搜索/状态过滤/更新时间排序、管理员接入设置独立；切换处理栏目保留草稿，核实说明必填与不可信文本转义保持。
- 验收：前端54项通过、23既有TS/0新增、构建通过；本地Chrome1440/390真实组件演示验证核实/搜索/筛选/回复/改进保存/栏目草稿保留/折叠接入与ops无入口/无溢出/无页面错误。仅合成测试数据和API替身，不能视为生产业务验收。
- 文档：handoff/checks/architecture及archive/handoff-2026-10-19-feedback-ui.md；纯UI布局和本地筛选，不改任务/证据/审计结构，2.0边界保持。skill-feedback-004真实客户端产物验收仍未完成。

### qwen-v11-009 — easy seed 范围修复

- 状态：DONE（2026-10-19，已部署；不commit/push/GPU重跑）。
- 问题：用户任务8264在/prompt被400拒绝；随机seed1374080225793968超过easy seed486最大1125899906842624（2^50），切换时漏核对节点输入数值范围。
- 边界：仅ComfyUI适配器和回归；按映射节点类型生成/校验/批量回绕种子，Qwen使用0..2^50含上界，Z/旧图保持0..2^53-1。超限显式seed在创建前拒绝，不改用户值、不重跑8264。
- 验收：随机最大值、0/上界/超界、批量回绕和旧图范围回归；Linux隔离测试与真实object_info范围只读核对，后端/worker按排空门禁发布，模板/前端/启用状态/超时/数据保持。
- 结果：Windows/Linux专项27 passed+12sub；本地完整236 passed/28sub/5skip（4PG未配置+1Windows链接既有跳过），本轮未重跑PG迁移。backendf8822343/worker3cc0ece1三副本已运行，仅适配器源码改变；真实object_info上界与边界校验、六CAD401/health通过，两端21文件备份SHA一致，5828媒体/0增量。任务8264保持failed/rejected且无prompt_id，无自动重跑；模板/前端/其他容器/env/挂载/网络/迁移保持。
- 文档：tasks/handoff/qwen-v1.1-preparation/comfyui-frp及专项归档；不改变2.0任务/工件/checkpoint结构。

### qwen-v11-008 — v1.1 运行版本切换

- 状态：DONE（2026-10-19 已部署运行版本；无commit/push、未跑GPU，性能/效果不属于本次已验收项）。
- 目标：部署已准备的03e845d适配及v1.1文生图/单图模板，API与上传合同一致，展示名明确版本和单图。
- 边界：原运行镜像上只加入本任务变更，保留生产差异、三worker/FRP/ODA/FFmpeg；原启用状态、Z/600秒预算不变。本地空库迁移修复与原未提交文件不混入。
- 验收：发布备份与两端SHA、任务/上游排空、隔离后端与前端回归、在用模板/单图API/公网资源和健康/原容器配置保留；不把静态通过称为GPU耗时/显存/效果验收。
- 结果：backend6d3c4d91/workerfa6f6e69三副本/frontendd5dfe72b；前端53项/类型0新增/构建、Linux后端23+8sub/三图合同、公开单图API/三份bundle SHA/六CAD401/health通过。env/挂载网络与其他容器保持，迁移仍b27；两端27份发布证据SHA一致，5828媒体/5增量51190080字节及旧全链可恢复。
- 文档：qwen-v1.1-preparation/comfyui-frp/server-operations/tasks/handoff及切换专项归档；沿用既有任务/工件与checkpoint，2.0追溯边界保持。

### qwen-v11-007 — v1.1 模板与适配准备

- 状态：DONE（准备阶段03e845d已推codex/qwen-v11-preparation；随后已按qwen-v11-008命令切换运行版本，未合main）。
- 目标：共享easy seed/50步GPU缓存、单图合同与前后端校验兼容；服务器独立目录同步模板/哈希/源码并离线验证；核对600秒预算。
- 禁止：改provider启用状态、覆盖在用map、发布运行镜像、提交GPU任务、修改Z/原styles13行/原未跟踪文件。
- 验收：原始SHA、共享种子链接/一图/输出、后台测试/前端回归；服务器隔离无网络合同检查，active文件/provider/容器不变。
- 文档：qwen-v1.1-preparation/tasks/handoff/comfyui-frp；后续激活/实际耗时输出为独立待授权验收，不混作完成。模板合同与checkpoint版本保留未来多步骤追溯。

### comfyui-feedback-006 — 执行进度与双图提交引导

- 状态：DONE（功能c048893已推main，生产合并95794424，仅frontend部署）。
- 目标：补无百分比动态条；本机编辑两图条件在标题/提示/按钮一致，单图不再显示可提交；提交阶段中文。
- 禁止：取消后端两图验证、开放未验证单图变体、改后端/FRP/Windows/原styles.css。
- 验收：52前端检查、TS零新增/构建；Chrome1440/390动态/双图条件/无溢出，公网bundle和容器SHA一致。
- 文档：tasks/handoff/comfyui-frp；仅展示与输入引导，无2.0结构变化。

### comfyui-composer-layout-005 — 创作框布局回归

- 状态：DONE（0a83c2a已推main，生产合并d5311599；仅frontend部署）。
- 目标：恢复三行创作框，连接状态/自定义宽高移入既有显示菜单；保留所有生成参数功能。
- 禁止：原styles.css未提交13行、后端/数据/FRP/Windows运行状态。
- 验收：51前端检查/TS无新增/构建；Chrome真实组件1440/390宽度截图、无溢出、尺寸交互；公网包与容器一致，仅frontend替换。
- 文档：tasks/handoff/comfyui-frp；纯展示位置调整，无2.0结构影响。

### comfyui-production-004 — 生产任务闭环

- 状态：DONE（已提交/推送main/部署，功能7a9874b，迁移b27d0f85c932）。用户2026-10-19授权全部解决审计缺口。
- 目标/边界：同事务持久待办、领取租约/心跳/恢复、本机串行与多张逐张执行、提交幂等、断线核对与人工处理入口；统一参数/真实状态；分辨率与双图编辑；Windows 守护、重连/证书运维。
- 禁止：覆盖原 styles.css +13 或原未跟踪文件、重置库/媒体/key、改 CAD/18010；不盲重交不确定 GPU 任务。
- 验收：九项真实任务十一张（8245～8250、8253～8255）及SHA/归属/账、SYSTEM重拉/FRP断线/worker恢复；PG副本49表保留/并发领取/同键唯一/容量、最终Linux隔离30项与CI后端227+24sub/前端50通过。25份发布备份、10份后验收备份两端SHA一致。未做整机重启/长期压测，不伪称该项通过。
- 文档：tasks/handoff/comfyui-frp/architecture/server-operations；新增业务工件仍沉淀既有 Task/Asset，持久调度单独建表，为多步骤执行保留扩展边界。

| ID | 事项 | 状态 | 下一步或事实 |
|---|---|---|---|
| comfyui-provider-ui-003 | ComfyUI 图片渠道前端接入 | DONE（已发布，01d6c11/13bbe74） | 补 ComfyUI adapter 标签、未知类型不再默认视频；生成页图片白名单包含 ComfyUI，本机独立分组，图片/视频/编辑菜单与后台真实组件回归 |
| comfyui-frp-001 | Windows ComfyUI 私有隧道与文生图 | DONE（已上线并真实验收） | 回环收口；Z Image task8237/asset9263、Qwen task8238/asset9264 实跑、媒体SHA/归属/账记录通过；id60/61启用；后续生产闭环/多张/尺寸/守护与编辑见004/002 |
| comfyui-edit-002 | ComfyUI 双图编辑 | DONE（已发布） | id62启用，目标图+参考图归属/上传/绑定/回存；8248/8254/8255为1K/2K/4K实跑，单图变体不在批准范围 |
| management-workbench-002 | 管理工作台与交互排期 | DONE（已部署，514a8cb/ce31075） | 四视图、列分组排序/右侧详情/搜索选人；DHTMLX 10.0.3 MIT，拖动预览/版本保存/失败保留；本地 Chrome 操作与窄屏检查、CI 后端 197/前端 43 通过，仅替换 frontend，六人授权/API/业务数据保留，无迁移 |
| management-projects-001 | 公司管理层年度台账与人员甘特排期 | DONE（已部署，db376ec） | 独立公司权限/单位隔离，五位已核对账号及后续明确授权的 admin 已开通；台账全字段、人员、阶段甘特/里程碑/重叠、CSV、归档/版本保护；迁移 a16c9e74b821，生产副本与线上只读验证通过，无示例项目；真实浏览器点击因工具故障未验收 |
| migration-bootstrap-001 | 历史空库迁移链完整性 | DONE（本地，未提交/部署） | 聊天表空迁移、SQLite ALTER兼容、URL编码修复；新增c39d8e71a624补画布/项目归属；SQLite与隔离PG16专项8项通过，CI配置已加入但未执行；生产未升级 |
| cad-auto-route-001 | 系统通路建议与人工修改 | DONE（已部署，23ccfa8） | 只读建议、完整宽度避障/部分连通提示；预览采用保留手画，支持修改折点/宽度/起点与删除 |
| cad-preparation-001 | 布置前尺度、功能与主通路确认 | DONE（已部署，cfdccca） | 每平面两点校准、明确用途/保留空白、手动主通路家具禁放；旧方案保留，条件失效须重确认；不自动重跑旧图 |
| cad-fitout-timeout-001 | 布置结果被外层代理超时截断 | DONE（已部署） | 宝塔 CAD extracts 前缀等待 300s；已纠正前缀尾斜杠导致列表循环跳转，内部 rewrite 兼容浏览器已缓存的 301，补六条只读路由检查；已存三套方案，不重跑原记录；ops/nginx/cad-extracts.conf 可恢复 |
| gif-info-001 | GIF 原始与结果实际参数 | DONE（已部署） | 1997c3f；原始/结果实际尺寸、平均 fps、用色等可见，旧历史可按需补读，无迁移 |
| gif-edit-001 | 统一其他导航与压缩记录复用 | DONE（已部署） | f18b5d6；两套侧栏共用其他入口，历史/当前结果可复制原件与参数，新结果另存 |
| gif-history-001 | GIF 持久历史与资产库 | DONE（已部署） | 9b89b53；历史/资产库 GIF 分类按账号持久保存，迁移 f7g8h9i0j1k2，旧未知归属文件不自动补录 |
| gif-batch-001 | GIF 推荐压缩参数与批量处理 | DONE（已部署） | 1fc9174；344/12.5fps/96 色，20 文件顺序处理与 ZIP 下载；运行 GIF 5707655→488082 字节 |
| other-gif-001 | 其他模块与手动 GIF 压缩界面 | DONE（已部署） | 52276de；侧栏其他含图纸解析/GIF 压缩，默认 500KB 可调，预览/下载；生产真实压缩 1597553→258959 字节 |
| gif-upload-001 | 新上传 GIF 自动压缩 | DONE（已部署） | a655596/55bd284，生产镜像含 FFmpeg；500000 字节目标，运行容器上传验证 1597553→453484 字节 |
| video-template-001 | 视频生成提示词模板库 | DONE（已部署） | a655596，迁移 e6f7g8h9i0j1；前后端已发布，21 个旧公共图片模板保留，视频公共内容待管理员添加 |
| skill-feedback-004 | 外部客户端接入与真实平台验收 | IN_PROGRESS | 已发现三个配置 ID 与真实 HTTP 客户端；0.1.4 生产三事件提交/去重通过。生产最新事件 13/14/15（run_id=6）；三个 ID 启用，当前客户端 14 项离线通过。run_id=2 经 SSH 核实并聚合 issue_id=1（2 证据/1 匿名），真实产物未获取，事件 13 完成统计字段不符；详见 archive/handoff-2026-10-13-feedback-live-verification.md |
| skill-feedback-006 | 反馈时间展示 | DONE（已部署） | b619413 / 生产合并 b04ffb53；聚合问题与原始事件统一北京时间，公网新包与健康检查通过 |
| skill-feedback-005 | 真实 IP 与代理信任核验 | TODO | 当前代理信任为空、公开用户共享来源预算；扩大使用前先核验链路，不直接开放全网信任 |
| skill-feedback-003 | 外部 skill 自助临时凭证与入口修正 | DONE（已部署） | 514de69 / 生产镜像 7b310f9 / 迁移 d5e6f7g8h9i0；Linux 123 后端/16 前端、PG/nginx/公网通过，真实 ID/平台联调待做 |
| skill-feedback-002 | 反馈防滥用 | DONE（已部署） | 55216ab / 生产 30dfe26，迁移 c4d5e6f7g8h9；专用凭证尚未发放，平台联调待做 |
| skill-feedback-001 | Skill 自动采集与改进后台 | DONE（已部署） | 08a2884 已发布，迁移 b3c4d5e6f7g8；平台采集 skill 与浏览器联调待做 |
| studio-perf-003 | 历史分页与运行任务跟踪 | DONE（已部署） | 08a2884 已发布，运行镜像来自生产合并 861a49a |
| studio-perf-005 | 后台暂停与配置刷新 | DONE（已部署） | 随 08a2884 发布，加载器 10 项回归 |
| docs-align-001 | 正式文档对齐 | DONE（已提交） | 已归档并发布，最新部署记录补实际验证 |
| quality-gate-001 | 最小自动检查 | DONE（已提交/CI 通过） | 最新 GitHub Linux 后端 123 passed + 16 subtests，前端 16 项检查通过 |
| ops-storage-001 | 媒体治理 | IN_PROGRESS | 只读工具已发布，生产容量复测 63%/18GB；未执行引用审计或清理 |
| studio-perf-001 | ECS 容量评估 | TODO | 旧 9 月负载记录只作线索，升配/swap 前重新测量 |
| studio-perf-002 | nginx 媒体直出 | DONE（代码已存在） | nginx alias + frontend 只读卷；本轮未复核生产运行配置 |
| studio-perf-004 | 缩略图派生与懒加载覆盖 | TODO | 已有部分 lazy-load，不再描述全部 eager；缩略图仍待规划 |
| cad-extract-001 | CAD 图纸提取 | DONE（已部署） | DXF 解析与 Linux ODA DWG 转换均可用，旧记录不自动重转 |
| cad-dwg-002 | Linux ODA 接入 | DONE（已部署） | 0346eee/b1532b1；官方 ODA 27.9 与 Xvfb 容器内持久接入，新公开 DWG 转换/实体/预览/隔离上传通过，旧图不重跑 |
| video-grok-timeout-001 | Grok 轮询超时 | TODO | 9 月上游问题；复核当前失败记录再处理，不自动重提任务 |
| video-seedance-502-001 | Seedance 参考图代理/DNS | TODO | 历史上游问题；先确认当前是否仍发生 |

## Current Task Details

### Task: [migration-bootstrap-001] 历史空库迁移链完整性

- 状态：DONE（2026-10-19 本地；未提交/推送/部署）。
- 目标：真实 Alembic 从空库升到 head，无需应用 create_all/ensure_schema；补入离线检查防止回归。
- 边界：历史缺失建表迁移、直接阻断完整链的数据库兼容问题、补齐仅启动时创建的画布表/项目归属字段、迁移回归与文档；已有库数据保留，不猜测归属。
- 禁止修改项：生产数据库/配置/媒体、Qwen模板或provider、GPU、CAD算法、原styles.css与原未跟踪文件；不得提交/推送/部署。
- 验收：临时空库完整升级、重复head无改写、历史记录升级保留；明确SQLite/PostgreSQL实际验证范围，不能以模型建表冒充迁移成功。
- 结果：SQLite/PostgreSQL16临时库8项通过；最终后端236 passed/24 subtests/1既有Windows链接跳过。从零完整迁移覆盖全部模型表/列，聊天/任务/账/provider测试凭证字段/画布/既有归属与扩展列保留，记忆SET NULL生效；新增head c39d8e71a624，拒绝自动降级删除聊天/画布与归属。配置已入CI，不代表GitHub已执行。
- 依赖/文档：现有Alembic/psycopg依赖；本机venv补装requirements已锁定的psycopg[binary]3.2.9；同步tasks/handoff/architecture/checks与archive/handoff-2026-10-19-migration-bootstrap.md。
- 2.0兼容：补齐可追踪结构升级路径，保持既有业务归属与执行模型。

### Task: [comfyui-provider-ui-003] ComfyUI 图片渠道前端接入

- 状态：DONE（2026-10-19 已前端发布，01d6c11/13bbe74；生产运行合并ae2901af）。用户反馈本机图片模型显示到视频渠道；API的image.generate能力正确，根因是ModelsPage未知adapter回退到第一项Haodeya视频，以及Studio图片adapter白名单遗漏comfyui。
- 边界：ModelsPage的适配器选项/未知标签、modelAdminUtils图片可用性/ComfyUI来源分组、真实前端组件与菜单回归；不修改模型能力/秘密/价格、后台生成链路或原styles.css改动，不再跑GPU任务。
- 验收：后台显示ComfyUI本机图片，未知adapter保留自身标识/未适配；两模型出现在文生图本机分组，不进入视频或未实现的图像编辑模式；46前端回归、无新增TS错误、构建及公网新chunk验证通过。保护真实记录和现有backend/worker/FRP运行，发布只换frontend。
- 发布：仅frontend换为623a18419d7cbeea2f507d95d6a508c571d9780a624f45b7dbff98131d3ef1df；其他容器ID/启动时间/镜像、env保持。公网新ModelsPage/共享helper chunk与容器字节SHA一致，入口指向新bundle，health与六CAD路由通过。两端13份恢复证据SHA一致、5802媒体/0增量，引用上一真实生成完整恢复链；没有重跑GPU。
- 依赖/同步：现有真实provider id60/61、docs/comfyui-frp.md；更新tasks/handoff，架构图片入口说明。2.0仅纠正已有能力展示与路由筛选，不变数据/执行/归属。

### Task: [comfyui-edit-002] ComfyUI 双图编辑

- 状态：DONE（2026-10-19已发布，id62启用）。批准双图图已接入既有账号/项目/私网；1K/2K/4K真实任务8248/8254/8255、资产9273/9279/9280及SHA/归属通过。
- 边界：两张当前账号可访问图片的上传、准确LoadImage绑定、批准工作流参数、既有Task/Asset/ledger持久化；不改原示例图或原图生图模板，不增加单图变体/任意graph/节点安装；守护另在004完成。
- 禁止：跨账号读图、传服务器本地路径给Windows、以模板示例图补缺图、全局interrupt/clear或重复执行状态不明任务，修改env/key/CAD/原未提交文件。
- 依赖：本机API-HANDOFF与workflow-map的编辑图、LoadImage470/475及输出461；单图变体尚未实跑，另行定义。
- 验收：双图上传返回值准确绑定，非本人图片拒绝、少图明确报错；真实history/图片下载/归属与SHA一致，原图不改，故障不混任务；每次真实GPU运行须在授权范围内。
- 文档同步：tasks/handoff/comfyui-frp，涉及接口边界更新architecture；2.0沿用workflow hash/prompt_id/Task与资产归属，不引入任意工作流执行器。

### Task: [comfyui-frp-001] Windows ComfyUI 私有隧道与文生图

- 状态：DONE（2026-10-19 已部署/已启用/真实验收）。边界：FRP服务端、专网、证书/认证、两个文生图adapter、Task checkpoint/GPU锁、图片回存；不含图生图或Windows服务/长稳。
- 结果：回环127.0.0.1:8188；公网mTLS和错误凭证拒绝；frontend阻断、backend/三worker只读通路通过。正常公网网站API/现有admin账号与既有项目生成两张1024²，Z8237/9263/32480ms、Qwen8238/9264/46526ms；Task/Asset/ProviderCall/UsageLedger及本机/服务器/下载SHA一致，id60/61启用，GPU锁释放。
- 配置：原启动器已停、listen=false与回环保留。后续004已由SYSTEM开机守护接管ComfyUI/frpc，旧PID不再有效，运行材料C:/ProgramData/QMDH-FRP。001阶段原无schema变化，004追加两表；不导出私钥、不公开8188、不改env/key/CAD/18010/卷及原未提交文件。
- 检查：此前本地232/24subtests、隔离14与功能CI通过；本轮只改本机运行配置/模型启用和正式验收记录，无源码变化，不重复全站测试。
- 回退：先禁用id60/61再回旧镜像，不删除真实任务/媒体。最新DB/媒体增量恢复备份已配对，2文件3318213字节/7备份SHA一致。
- 2.0：沿用Task/Asset/ProviderCall/ledger，workflow hash/prompt_id追踪，不引入新编排。同步tasks/handoff/architecture/server-operations/comfyui-frp。

### Task: [cad-auto-route-001] 系统通路建议与人工修改

- 用户明确要求由系统先生成，同时保留手画和修改权。新增账号归属只读 POST /cad/extracts/{id}/route-suggestions；尺度/功能确认后生成建议，不写正式条件/方案/媒体。用户预览并采用后另点保存。
- 基于 mask/墙线、已知楼梯电梯包围框、校准比例构造完整宽度可行域；仅合拢微小分割缝，原墙线不跨越；保守方形净空侵蚀＋连通分量＋四邻域最短路树。优先入口分区/接待/大分区，未知入口标建议；可指定起点。无法连通/太窄/缺墙图明确报告，不用直线穿墙补接。
- 采用时只替换未修改的系统通路，保留旧无来源和手画通路；用户改折点或宽度后成为 manual，后续建议不覆盖；12 条/30 折点限额不静默丢弃。保留手画、删除、取消修改、指定/恢复起点。
- 校准与确定用途仍需输入，建议不等同实际入口/门洞或疏散验收。当前三种家具策略共用用户采用的通路网络，不新增目标型方案。无迁移，复用 CAD JSON，旧签名兼容。
- 禁止自动重算保护旧图/覆盖原 styles.css、比较文档与 _tmp_*；key/18010/数据卷保持。只读真实图副本试跑可做，但不保存或生成其正式家具方案。
- 检查：后端新 9 项、完整本地 181 passed/1 skipped/16 subtests；Linux CI 182 passed/16 subtests；前端 34 项/23 既有、0 新增类型错误/构建，组件事件测试覆盖预览/采用/手画保留/改宽/移点/取消。当前 cua 浏览器连接因 kernel assets 路径缺失失败，未宣称新拖点已做真实浏览器验收。
- 23ccfa8 已部署，生产运行合并 f060300c；新镜像隔离 HTTP 建议/不写记录/采用保留手画/保存/三家具方案避让/跨账号拒绝通过。原 ce_1e513e72a64e 两平面按既有估算比例、1.2 米宽只读试跑均 partial，分别 2/1 条建议、1/1 分区连通、4/2 未连通，耗时 6.6/3.52 秒；SQL READ ONLY + 媒体只读挂载，不保存/重算正式条件和家具。
- 发布备份 release-20261016-cad-auto-route 两端 SHA256、空媒体增量与 env 不变核验；媒体恢复链明确引用前次私有备份包，未删除/重新复制旧包。新备份及前次目录 ACL 修正为仅 Admin/SYSTEM 可继承，以保证原受限文件可读。

### Task: [cad-preparation-001] 布置前确认第一阶段

- 用户授权按分析改进，先落实尺度确认、功能确认与主通路预留。范围：新增账号归属 POST /cad/extracts/{id}/preparation，复用 payload_json；每平面独立两点米制校准，重算房间面积/多边形/可摆区域并同步撤销快照比例；保留原件、图像、旧布置，不自动重新生成。
- 明确九种用途含保留空白，不再用模糊名称决定新布置；手动标注最多 12 条通路（每条 2–30 点、宽 0.8–4 米），三方案放置前预留、放置后逐像素校验家具轮廓。密度/铺开评分排除预留带；界面说明它只是排布参考分。
- 条件签名覆盖分区/几何/原 mask 和标注参数，修改/撤销分区后须重确认；旧方案与新条件不一致时明示。已确认分区不再被布置接口隐式拆分，旧 clear 操作仍可用。
- 限制：本阶段不自动识别核心筒、不承诺墙体连通/门洞/疏散验证，也未实现人数容量优化和服务/交流等目标型方案；后续按实际验收再推进。使用者需手动标注主通路，宽度是可调设计输入。
- 验收：新增后端 11 项、原 CAD 31 项；Linux CI 173 passed/16 subtests；前端 32 项/23 既有类型错误、0 新增/构建；独立浏览器预览点选两点、选择功能、绘制/保存通路并恢复通过。隔离测试不得写正式 DB/媒体，不重算保护旧图，不提交原 styles.css/比较文档/_tmp_*，不动 key/18010/数据卷。
- 2.0：条件与方案签名是既有 CAD 工件输入快照，无新迁移/编排，后台归属权限保持。同步 architecture/handoff/server-operations；发布前配对备份 release-20261016-cad-preparation，原 env 不变。

### Task: [gif-info-001] GIF 原始与结果实际参数

- 状态：DONE（已提交/推送/部署），功能 1997c3f、生产运行合并 cd60dab3，分支 codex/gif-media-parameters。
- 目标：补上原始 GIF 的实际尺寸/帧率/用色等信息，支持压缩结果对照，避免把初始上限误认为实际参数。
- 边界：新增鉴权只读 POST /assets/gif-inspect（不保存文件/记录），选中文件后显示参数；原件/结果实际信息写入既有 compression JSON，无迁移；旧记录详情 inspect_metadata=true 在原归属校验后按需读取文件，不改写旧记录。
- 验收：尺寸/帧数/总时长/平均 fps/变帧率/每帧最多实际用色/循环/透明可见；新历史持久，旧记录缺参数可读，不跨账号读文件；读取超时/繁忙/文件无效提示真实状态，不影响已验证压缩结果保存。
- 禁止：覆盖原 styles.css/比较文档/_tmp_*，改 CAD/key/卷/18010，伪造帧率或把请求颜色上限当实际用色。
- 依赖：既有 GIF 解码预算与存储接口；同步 architecture/handoff/archive。2.0 兼容：工件元信息复用 JSON，不扩展任务编排/数据库结构。

### Task: [gif-edit-001] 统一其他导航与压缩记录复用

- 状态：DONE（已提交/推送/部署），功能 f18b5d6、生产代码合并 ce56c34d，仅前端更新，分支 codex/gif-copy-and-navigation。
- 目标：修复生成页仍显示图纸而通用侧栏显示其他；支持历史记录复制到压缩区并调整后新建结果。
- 边界：OTHER_TOOLS_NAV 共享名称/入口，两套侧栏复用；当前结果/历史回看增加复制按钮，读取原件为 File 并恢复全部初始参数，清除 record_id 查询、返回表单，等待用户点击压缩；新结果走既有接口另存，原记录/文件不改。
- 验收：两侧栏实际渲染均为其他、点击同到 /studio/other；复制取原件而非派生结果，保留文件名/0 值/false 选项，读取失败或非 GIF 明确报错；参数仍可调整，处理中禁止冲突操作/忽略卸载后响应；前端 30 项/23 既有、0 新增类型错误/构建通过。
- 禁止：覆盖原 styles.css/比较文档/_tmp_*，修改 CAD/key/卷/18010、覆盖旧记录或虚构新后台接口。
- 依赖：已上线历史与单件压缩接口；无新迁移/后端改动。同步 architecture/handoff/archive；2.0 沿用既有工件与参数快照，不扩展编排。

### Task: [gif-history-001] GIF 压缩持久历史与资产库

- 状态：DONE（已提交/推送/部署），功能 9b89b53、生产运行合并 e6d98efa，分支 codex/gif-persistent-history。
- 目标：解决压缩结果仅在页面内存、刷新丢失且资产库无记录的问题。
- 边界：新增账号归属的 gif_compression_records，记录原件/结果路径、文件名、参数、大小与达标状态；单件成功请求提交 DB 后才返回成功，包括未达标/无需压缩结果；历史列表/详情与资产库 GIF 分类复用此记录，无虚构生成任务。
- 验收：刷新后最近 20 条可回看，资产库全部/GIF 分类可检索和回跳；原件与结果可下载，跨账号含 admin 拒绝访问，迁移保留旧数据；旧无归属 UUID 文件不自动猜测归属补录。
- 禁止：修改 CAD/key/18010、覆盖原 styles.css/比较文档/_tmp_*、清理历史媒体或向正式库写测试账号/夹具。
- 依赖：新增迁移 f7g8h9i0j1k2，发布先备份/隔离迁移验收再应用；同步 architecture/handoff/archive。
- 2.0 兼容：记录是账号所有的工具工件，复用现有存储与库聚合，不改生成资产权限/不新增编排。

### Task: [gif-batch-001] GIF 推荐参数与批量处理

- 状态：DONE（已提交、推送、部署），功能 1fc9174、生产运行合并 0449ec4b，分支 codex/gif-batch-presets。
- 目标：采用用户建议的最长边 344、12.5fps、最多 96 色与抖动，继续以 500000 字节为目标；支持批量上传与下载。
- 边界：新上传自动处理与手动工具默认值对齐，保留单次参数、Lanczos 等比不放大、循环/时长/透明校验和超预算回退；批量复用单文件鉴权接口，逐个发请求，不增加后台任务或新数据库表。
- 验收：真实 25→12.5fps、720×360→344×172，有限/无限/无循环及颜色限制通过；20 文件/单件 20MiB/总计 100MiB 校验、单件失败续跑、卸载停止后续上传、ZIP 重名/中文安全文件名与内容通过。
- 禁止：修改 CAD/key/历史数据/卷/18010、覆盖原 styles.css/比较文档/_tmp_*、将单件失败或未达标虚报为达标。
- 本地后端 152 passed/1 skipped/16 subtests；前端 26 项、23 既有/0 新增类型错误与构建通过。
- 文档同步：architecture、handoff、archive/handoff-2026-10-15-gif-batch.md。2.0 兼容：UI 队列和不可变请求选项复用既有媒体服务，无编排扩张。

### Task: [other-gif-001] 其他模块与手动 GIF 压缩

- 状态：DONE（已提交、推送、部署），功能 52276de，生产运行代码合并 6c09498e，分支 feature/other-gif-001-ui。
- 目标：侧栏“图纸”改“其他”，保留现有图纸解析，提供可见、可操作的 GIF 压缩工具。
- 边界：导航与路由包裹、独立 GIF 页/CSS、鉴权手动压缩接口及请求局部参数；不修改 CAD 算法/组件/数据，不改旧自动上传压缩策略。
- 验收：旧 /studio/cad（含查询参数）继续使用原组件；/studio/gif 显示上传/500KB 默认目标/高级参数/双预览/大小对比/下载；只挂载当前工具；手动请求不修改全局配置；鉴权/输入/服务不可用有明确错误。
- 禁止：覆盖原 styles.css 13 行、比较文档/_tmp_*，修改 CAD/key/卷/18010；不登记新账号或向正式库写验收模板。
- 依赖：已发布 FFmpeg 服务；无新迁移。文档同步：handoff、architecture、archive/handoff-2026-10-15-other-gif-tool.md。
- 2.0 兼容：复用存储和压缩服务，以不可变请求配置隔离参数，无新增任务编排或数据模型。

### Task: [gif-upload-001] 新上传 GIF 自动压缩

- 状态：DONE（2026-10-15 已提交/推送/部署），功能 a655596、构建 55bd284；发布验收见 archive/handoff-2026-10-15-video-gif-release.md。
- 目标：所有新上传 GIF 自动按统一规格压缩；用户已确认全量新上传范围。
- 实现：默认目标 500000 字节；按颜色/帧率/尺寸逐档优化，支持锁定尺寸/帧率和配置质量下限，API 返回实际大小/达标状态；上传原件另存，只有更小且动画/循环/透明与时长验证通过才返回派生 GIF；超时/失败/繁忙回退原件。三个上传入口复用同一 helper；同步处理受 20 秒软预算约束。
- 边界：上传入口、独立压缩服务、镜像 FFmpeg 和离线测试/文档；不重压历史、生成结果/CAD/灵感下载；不改 key、卷、18010 或原样式/临时文件。
- 验收：真实 FFmpeg 的动画/透明/循环/尺寸及体积测试，原件保留与失败回退，多入口一致性；最终专项 16 项通过。后端全量 141 passed/1 skipped/16 subtests，前端 19 项/类型基线/构建通过；额外附件/存储 17 passed/6 subtests。
- 依赖：容器需包含 FFmpeg，Dockerfile/CI 已补；生产已含 FFmpeg 7.1.5，默认压缩已启用。无本功能数据库迁移，视频模板迁移已同步执行。
- 文档：handoff、architecture、archive/handoff-2026-10-15-gif-upload-compression.md；2.0 兼容：原件/派生分离、复用存储、日志可追踪，不改变任务执行模型。

### Task: [video-template-001] 视频生成提示词模板库

- 状态：DONE（2026-10-15 已提交/推送/部署）；a655596，生产迁移 e6f7g8h9i0j1。
- 目标：视频生成可浏览/套用公共模板，保存/编辑/删除个人模板，后台维护视频公共模板。
- 实现：复用现有 CRUD/权限/分类搜索；新增 media_type=image/video，旧模板默认 image；视频套用保留模型、SKU 时长、画幅、分辨率、参考图，仅应用提示词/风格/说明，修改正文解除绑定，跨类型不套用；切类型清理模板编辑状态。
- 边界：提示词模板相关前后端、迁移与测试；不调用收费生成，不改 CAD、反馈接口、密钥、卷或原样式；不创建生产模板内容。
- 验收：类型隔离、视频参数保护、旧模板兼容、个人权限隔离、增改删、迁移保留原数据。测试结果见 archive/handoff-2026-10-14-video-templates.md。
- 依赖：配对备份、隔离 PostgreSQL 迁移及正式迁移、前后端发布均完成；浏览器交互未独立验收。
- 文档：handoff、architecture 与本轮详档；2.0 兼容：类型字段可延续到工作流，模板 ID/归属/统计不变，无新增执行引擎。

### Task: [skill-feedback-004] 外部客户端接入与真实平台验收

- 状态：IN_PROGRESS（2026-10-13 只读生产复核：最新真实 run_id=6 已回传，当前客户端 14 项离线通过；run_id=2 服务端核实/聚合通过，网页视觉与真实产物核验未完成）。
- 目标：正式 skill_id 交付开发者，真实平台完成申请/回传，管理员可核实和聚合。
- 边界：按 skill-feedback-integration.md 配合外部实现并验收；不重复开发已上线接口，不擅自安装外部 skill 或采集用户数据。
- 禁止项：不编造 ID、不用零值示例、不写 token/敏感信息到仓库或日志；不改 CAD、key、卷、18010 或无关文件。
- 验收：正常交付只统计；问题/人工纠正先核实；任务关联与幂等有效；额度/退避/错误不阻断主任务。真实生产测试先明确授权范围。
- 依赖：三个 ID 配置及外部客户端已找到；skill-feedback-loop 正式 ID 已由本轮生产申请/提交成功验证。三个 ID 已于 2026-10-13 只读查询确认均启用。用户已授权明确标注 integration_test 的交付/问题/人工纠正测试及后台核实聚合；用户已确认登录，工具可见后台标签但读取超时；服务器核实已完成。
- 文档：handoff 与 archive/handoff-2026-10-13-feedback-live-verification.md；run_id=2 事件 3/4 已 accepted、同 issue_id=1；网页读取超时，服务器最新真实反馈无原文件地址；事件 13 缺 evaluation.outcome=completed，后续修正外部生成端，不改原事件冒充幂等重试。

### Task: [skill-feedback-005] 真实 IP 与代理信任核验

- 状态：TODO；扩大公开使用前处理。
- 目标：确认宝塔/frontend/backend 的真实来源传递，评估合理的来源限额。
- 边界：先只读核验配置/链路，再决定最小可信代理范围；没有证据不改环境。
- 禁止项：禁止全网可信 CIDR、信任调用者 X-Forwarded-For、换 token 绕过额度；保留 key/卷。
- 验收：可信入口覆盖来源头，伪造头不能绕过配额，合法来源划分有可复核证据。
- 依赖/文档：server-operations Daily Update、skill-feedback.md、最新发布交接；配置变更另记录验证和部署。

### Task: [skill-feedback-003] 外部 skill 自助临时凭证

- 状态：DONE（已提交/push/部署，用户授权）；功能 514de69，运行镜像来自生产合并 7b310f9，生产迁移 d5e6f7g8h9i0。分支 feature/skill-feedback-003-public-sessions。本地后端 122 passed + 16 subtests/1 skipped，GitHub Linux 123 passed + 16 subtests，前端 16 项/0 新增 TS 错误；隔离 PG、nginx 实际限流、生产公网/只读查询通过。
- 目标：无需公司账号的 skill 按单次任务申请反馈专用凭证；修正隐藏在加载按钮后的创建入口，公司用户下拉选择；管理员登记固定 ID、改名/升级沿用 ID、停用/开放、匿名身份和统计、全局/来源持久配额。
- 边界/禁止项：不安装平台 skill、不采集真实用户数据、不分发真实密钥、不动 CAD/ODA/生成算法/18010/key/数据卷；原 styles.css/比较文档/临时脚本未提交，生产 .env 校验一致。新配对备份和 :20261010-public 老镜像保留。
- 验收：未开放拒绝；版本/任务/平台/来源/有效期/十次总量限制；轮换会话与伪造 IP 不能绕过配额；关闭并重开不恢复旧 token；问题 pending、匿名不算人；旧公司凭证与历史保留；前后端检查、迁移拒绝破坏降级。
- 后续：生产尚无登记 ID/凭证；先在反馈后台登记实际 skill 并交付 ID，再联调。生产代理信任保持空，用户共享来源预算；扩大使用前核验真实 IP 链路。真实浏览器/平台操作待验收，详见 archive/handoff-2026-10-10-feedback-public-release.md。
- 文档：skill-feedback、architecture、decisions、checks、handoff、skill-feedback-integration 与 public-sessions 归档；2.0 不引入编排引擎，任务和证据关联保留，运行配额与业务历史分层。

最新阶段覆盖：本节本地/暂停/未部署描述为开发验收记录，当前已提交部署与 CI 状态以上方队列和生产归档为准。

### Task: [skill-feedback-002] 反馈防滥用

- 状态：DONE（已提交/push/部署）。用户 2026-10-10 授权；GitHub 功能 55216ab，运行镜像来自生产合并 30dfe26，迁移 c4d5e6f7g8h9。
- 分支：feature/skill-feedback-002-security；原访客 styles.css、比较文档和临时脚本保持原状。
- 目标/实现：反馈独立凭证不能调业务接口；用户/设备/skill 版本、过期/停用/撤销、原子额度、解析前大小和 nginx IP 限制；未经核实问题不进收件箱/不重开，admin/ops 确认后聚合，恶意文本只存为数据。
- 验证：本地 102 passed + 16 subtests/1 skipped，GitHub Linux 103 passed + 16 subtests；前端 15 项、23 既有/0 新增 TS 错误及构建通过。隔离 PostgreSQL 迁移/认证/核实/并发硬限额、nginx 实际 413/429，公网和生产只读查询通过；没有合成业务数据写入生产。
- 风险/后续：生产凭证数量 0；平台 skill 与真实浏览器操作待验收。旧来源声明仍非真实性证明；创建新凭证后不做破坏性 downgrade。旧镜像、配置/DB/整包+增量媒体备份保留。
- 边界：不分发真实凭证、不安装平台 skill、不改 CAD/18010/key/媒体数据；生产保留 Nano Banana 四文件。
- 文档：skill-feedback、architecture、decisions、checks、handoff 与 archive/handoff-2026-10-10-feedback-security-release.md。
- 2.0：凭证、原始事件、核实、改进分别追踪/审计，不扩成编排引擎。

### Task: [skill-feedback-001] Skill 自动采集与改进后台

- 状态：DONE（2026-10-10 本地，未提交/push/部署）。用户在部署前要求先调整反馈，发布保持暂停。
- 目标：WorkBuddy/Codex 反馈采集无需填表；任务内关联执行/评测/交付后纠正，原始事件和需关注问题分开。
- 边界：新增 runs/events/issues 模型、迁移 b3c4d5e6f7g8、采集/管理接口与后台面板；原人工线程兼容，独立改进状态。不编写/安装反馈 skill、不发送外部消息、不采集真实用户数据、不改 CAD/执行算法/生产配置/无关文件。
- 实现：Agent 鉴权、客户端范围事件幂等与关联 ID、来源声明、skill 名/版本；按版本与稳定问题代码聚合并保留每次证据。普通执行只统计；明确问题/纠正进入收件箱。沟通待回复/已回复，与改进待分析/待修改/待验证/已解决分开；评分、根因、建议、复测展示，更新有审计记录。
- 验收：正常数据不创建问题，重试不重复，版本不混，任务元数据不变；来源/权限/体积限制，旧表单兼容、双状态独立与解决后纠正重开；SQLite 升降级保留旧反馈。后端完整 93 passed + 16 subtests、1 skipped；最新反馈专项 23 passed；前端统一检查通过，0 新增类型错误。
- 依赖与限制：发布须先备份并执行新增迁移，前后端一起更新；真实 PostgreSQL、并发压力、平台联调、浏览器交互未验收。不是任意文本自动语义聚类；外部采集端需生成稳定任务/事件 ID 并声明来源。
- 文档同步：docs/skill-feedback.md、handoff、architecture、checks、plan 与反馈归档。
- 2.0 兼容：结构化长期业务历史与执行模型解耦，保留来源/证据，不新增编排引擎、不覆盖原始事件。

### Task: [studio-perf-005] Studio 后台暂停与配置低频刷新
- 状态：**DONE（2026-10-08 本地；未提交、未部署）**
- 目标：减少后台无效请求，同时保持长时间打开页面时配置可更新。
- 分支与依赖：继续 `feature/studio-perf-003-history-pagination`；依赖上一轮未提交的分页/任务跟踪改动，两项在同一加载器内顺序完成。
- 实现：Page Visibility 隐藏时清除轮询定时器，返回时立即同步；已有请求运行时排队一次返回同步。运行/空闲仍分别 4/12 秒，使用最新回调，避免每次 tasks 更新重建定时器。
- 配置：health、projects、providers、workflows、promptTemplates 每 5 分钟按需刷新；失败保留原配置，显示错误，5 分钟后再尝试。初始和显式 full 加载仍即时刷新配置。配置错误不阻断任务进度，成功后清除对应错误。
- 边界与禁止项：仅 Studio 登录态加载器；不暂停服务端任务、不强行中断已发请求、不改访客行为、不改其他页面；CAD、生产配置、业务数据及原工作区改动保持不动。
- 验收：隐藏不轮询，返回更新旧任务；长时间隐藏后刷新到期配置；失败不清空原值；切账号/卸载清理监听器并忽略旧响应；已加载历史和游标保留。
- 验证：加载器 hook 回归 10 passed（包含上一轮 4 项），Vite build 通过；全量类型检查仍有基线问题，无本轮新增错误。
- 文档：`docs/handoff.md`、`docs/architecture.md`、`docs/archive/handoff-2026-10-08-studio-history-pagination.md` 同步；无迁移、新依赖或服务端修改。
- 2.0 兼容性：只调整客户端查询时机，持久任务仍由服务端执行，状态可追踪；不改变未来工作流执行/恢复/审计模型。

### Task: [studio-perf-003] Studio 历史分页与运行任务跟踪
- 状态：**DONE（2026-10-08 本地；未提交、未部署）**
- 目标：历史可按需加载，较老的运行任务仍能更新到终态。
- 分支：`feature/studio-perf-003-history-pagination`，基于 `65c47a0`。
- 实现：`/tasks` 新增 `before_id`、`task_ids`，按 ID 降序；`/assets` 新增 `task_ids`，权限与收藏过滤在 limit 前执行。前端 API 真正传递参数；历史每页 120 条，按任务取齐资产；刷新保留已加载历史。
- 跟踪：轮询最近 40 条 + 全部 pending/running，对离开运行列表的已知任务按 ID 补查终态；已删除任务从跟踪中移除。空闲刷新也仅刷新任务/资产。
- 边界：项目/类型/模型/状态筛选仍在已加载记录上执行，页面有提示；不做全库搜索、独立资产库分页、虚拟列表；隐藏页面暂停由后续 studio-perf-005 完成。
- 禁止修改项：CAD、布置算法、生产配置、用户数据、访客样式和无关工作区文件。
- 验收：新增/删除不使 ID 游标漂移；较老任务完成可见；跨用户资产不挤掉当前用户结果；翻页失败可重试，账号切换清空历史。
- 验证：后端列表测试 33 passed，前端 hook 回归 4 passed，Vite build 通过。扩大回归 45 passed/2 failed，两项失败在基线代码复现（Meilisearch 未启动、旧 dashboard 权限断言）。tsc 当前 23 项、HEAD 27 项，新增错误 0。
- 依赖与文档：无迁移，无新增包；前后端须同时部署。同步 `docs/handoff.md`、`docs/architecture.md`、详档 `docs/archive/handoff-2026-10-08-studio-history-pagination.md`。
- 2.0 兼容性：只增加查询参数，保留任务/资产关联和持久历史，不改变执行或审计模型，后续工作流可复用查询能力。

### Task: [cad-extract-001] 居委会图纸分区、审查与家具
- 状态：**DONE（2026-10-08 已部署生产）**
- 详档：`docs/archive/handoff-2026-10-08-cad-geometry-fitout-wip.md`（09-29「还是不对」已过时）
- 已做：几何分区、多边形与可摆区域、组团、评分改写、咖啡厅吧台/操作台；男女卫生间与厕位门保留
- 部署：GitHub `65c47a0`（功能 `872dc3f`）；按用户冷启动补充，生产 git `fe3adb5`，运行镜像仍来自 `1783bec`。迁移 **`z1a2b3c4d5e6`**，`/studio/cad` 200。生产无 DWG 转换器，等待用户提供官方 Linux ODA 安装包，此前只收 DXF。现有 `ce_0abae8a9402f` 为需转 DXF，不自动重转；不要重跑 `ce_94778ce26c6e`。本轮未连接生产复核。
- 非目标：线稿、ControlNet、Canvas 生图；不要再改布置算法，不要拆卫生间
- 本地图：`ce_94778ce26c6e`（09/28 15:02），一层网格 4.74。不要生成 `ce_d2955df6f9b9`。不要改旧图 `ce_b121e1b892de` 的咖啡厅

### Task: [quality-gate-001] 最小自动检查
- 状态：DONE（2026-10-10 本地，未提交/push/部署）。
- 目标：前后端关键回归可统一执行，新增类型错误不能静默通过。
- 边界：frontend/package.json、scripts/typecheck-baseline.mjs、类型基线/检查器测试、backend/requirements-dev.txt、scripts/check.py、软删除测试权限夹具、.github/workflows/check.yml、文档。
- 实现：前端 npm run check 串联 13 项回归、全源码类型基线对比与构建；后端明确离线关键检查集，忽略项目 .env、临时存储/SQLite、关闭外部搜索。CI 两个 job，不部署、不使用生产秘密。
- 验收：本地统一命令通过；基线逐项匹配并阻止新增/重复增加；完整 typecheck 仍保留非零失败；测试不读取业务数据。GitHub 执行须提交后验证，不声称已运行。
- 依赖/限制：Node22/Python3.12；已有 TypeScript 错误未修复；不是全后端/外部服务/浏览器验收。修复旧 dashboard 测试以 admin 核对并断言 ops 403，不改生产权限。
- 文档同步：docs/checks.md、handoff、continuity、plan 与本轮归档。
- 2.0 兼容性：仅增加开发验证，不改变工作流、持久记录、执行或审计行为。

### Task: [docs-align-001] 正式文档对齐
- 状态：DONE（2026-10-08 本地，未提交/部署）。
- 目标：正式文档能区分当前代码、本地 WIP、生产快照与历史。
- 边界：plan/tasks/continuity/architecture/decisions/handoff 及对应归档；不改产品行为，不操作生产或无关文件。
- 实现：完整保存对齐前 5 份文档；归档旧 June 合并顺序、完成任务和重构过程。保留尚未完成/需核对任务索引。更新 ops 权限、真实能力、测试/迁移、媒体直出、启动兼容补列与服务器版本。
- 验收：当前文档路径/链接可解析；过时排期不再高于当前任务；不把未部署改动写成已上线，不丢失原始任务说明。
- 依赖：本轮代码只读核对与用户提供的生产事实；生产时点信息明确标注未重新连接复核。
- 文档同步：handoff、archive/handoff-2026-10-08-docs-alignment.md。

## Deferred And Verification Index

下列事项没有被这次文档整理判为完成，也不自动开工；原说明见完整任务归档或原专项档。

| ID | 当前处理边界 |
|---|---|
| chat-b2-001 | HITL 生图/视频切片仍待收口，助手 UI 不自动开放 |
| agent-wip-001 / agent-codex-harness-001 | harness/memory/gov 代码已有；旧记录部署状态不统一，续做前核对专项代码和最近生产交接，不整包合并 WIP |
| canvas-20260721 | 画布复制/批量运行 stash，先核对 stash 内容；保持暂缓 |
| chat-nav-001 | 旧记录“本地 DONE 未提交”是否已并入后续提交需核对，不照旧描述直接部署 |
| image-vip-001 | 旧 READY_TO_CONFIGURE 与 UA 热修记录需按当前适配器及生产配置核对 |
| guest-001 | P0/P1 已部署；P2 匿名限流/清理/smoke 仍是后续候选 |
| inspiration-001 | 新功能和内容运营搁置，只读维护 |
| hh-i2v-004 | 可选多 Key/试错 Key 隔离，正式量增加后再评估 |
| prod-001 | 已存在拆分后的 hooks/panels；继续大拆曾被要求停止，仅必要问题修复，不恢复旧重构排期 |
| prod-005 / prod-006 / prod-007 | CORS/限流/会话清理已有代码；生产配置与启用状态需专项核对，不重新立项为零实现 |
| prod-008 | OSS 代码和同步脚本已有；生产仍按交接为 local，切换需专项备份/验证与用户要求 |

其余 DONE 的历史验收保留在归档。微服务、多租户、替换 Redis 不列入当前迭代。

### Task: [ops-storage-001] 媒体治理

- 状态：IN_PROGRESS；只读预览子步骤 DONE（2026-10-10 本地，未提交/部署）。
- 目标：按 30 天 mtime 预览 generated 图片/视频占用，保护数据库引用，输出可复核报告。
- 边界：新增 media_audit 服务、audit_generated_media CLI、临时数据测试及文档；仅 SELECT/只读事务，无删除入口。不触碰真实业务库、生产卷、CAD、环境配置或无关工作区文件。
- 实现：实际 schema 文本/JSON 列扫描，包括归档/软删除行；URL 编码与 Markdown 路径解析，.bin 同名别名保守保护；过期无引用只列候选；报告不输出业务字段值与连接秘密，拒绝覆盖报告/在媒体目录写报告。
- 验收：临时库/文件分类、JSON 与缺失引用、数据库写入拒绝、不创建缺失数据库、路径越界/链接隔离；Windows 链接权限不足项跳过，待 Linux 验证。前序离线 66 项回归保持通过。
- 限制：PostgreSQL 真实连接、Linux 链接测试与生产容量未验证；不透明引用/OSS/其他 schema 不保证覆盖，候选不授权删除。没有清理计划或执行器。
- 依赖/文档：不新增依赖/迁移，详见 docs/media-audit.md 与 docs/archive/handoff-2026-10-10-media-audit.md。
- 2.0 兼容性：独立只读运维工具，不改变应用执行、数据留存、审计或工作流。

## Next Step

视频模板与 GIF 自动压缩已上线，发布/备份/回退和验收详见 archive/handoff-2026-10-15-video-gif-release.md。

后续继续已记录的反馈客户端真实产物、浏览器视觉及真实 IP 信任链验收；不重复核实已 accepted 的测试事件或重做已上线接口。

最新验收见 archive/handoff-2026-10-13-feedback-live-verification.md；冷启动红线见 archive/handoff-2026-10-13-next-conversation.md。反馈时间展示 b619413 已部署，生产 git 0a41ad8c，运行前端来自 b04ffb53；不要重做已上线接口。先直接只读查服务器反馈与正式 ID，并核对外部 E:/projects/test/agent-skills 当前版本；已有真实检索回传不等于素材核实通过。run_id=2 的核实/聚合已通过 SSH 完成；继续时间 UI 视觉与真实平台产物验收；扩大使用前核验真实 IP 信任链。媒体/类型基线/容量/缩略图/历史视频随后处理，CAD Linux ODA 已于 2026-10-16 部署，旧图不自动重转。原访客样式、比较文档、_tmp_* 保留。


### Task: [cad-dwg-002] Linux ODA 转换器接入（2026-10-16）

- 状态：DONE（已提交/推送/部署），功能 0346eee、Qt 依赖修复 b1532b1，生产运行合并 26095b9d，分支 codex/linux-dwg-converter。
- 授权：用户明确要求配置服务器转换器，覆盖此前等待安装包/不自行下载安装的暂缓状态；其余旧图保护继续有效。
- 目标：生产 DWG 上传经官方 ODA 27.9 Linux 转 DXF，再复用原解析链。
- 边界：官方 amd64 .deb 作为服务器私有构建输入（不入 Git），SHA256 校验、可选 Docker/Compose build args，Xvfb 包装命令持久配置；不改 CAD 分区/布置/生成算法，不重转历史记录。
- 安全：命令模板先分词后填路径、shell=False，转换临时源名固定 source.dwg；Linux 超时终止整组进程，包括 Xvfb/ODA，保留 Windows 直指 exe 支持。
- 验收：无包构建仍可用；安装包/哈希/版本可追溯，合成新 DWG 通过转换与 DXF 解析/预览；记录正式 env 允许变化的三个转换器字段、其他配置/key 保持，备份后发布/可回滚。
- 禁止：旧图 ce_94778ce26c6e/ce_b121e1b892de/ce_d2955df6f9b9/ce_0abae8a9402f 重跑或修改，动 18010/key/历史媒体/数据卷，提交安装包或原样式/比较文档/_tmp_*。
- 文档同步：architecture/server-operations/handoff/archive；2.0 兼容：仍为既有可选文件转换能力，不引入新生成/编排模型。

## repair-pilot-011 · F11 / R20-A

状态IN_PROGRESS，review=PENDING，本地未提交。DashScope受理上下文+同ID恢复、默认调度review与有效lease收口已实施，联合30节点/16子用例通过；原F09/F10函数/测试/计价/ledger保持。其余R20入口未实施，不自关单、不启动复核。证据见archive/f11-r20a-2026-10-21/evidence.md；串行后续R20-B先写卡。

## repair-pilot-012 · F12 / R20-B/C

状态IN_PROGRESS / review=PENDING，本地未提交。Ark/Jimeng两入口已实施受理持久化及原任务查询/下载恢复，28新+13原回归共41节点/19子用例通过。仅增加可选查询上下文身份；原执行器函数/账/资产/价格/Comfy/原测试均保持，R20剩余Grok/Bigjpg/外部图像下一卡继续。未独立验收不关单、不委派。证据archive/f12-r20bc-2026-10-21/evidence.md（目录沿开工日期，完成2026-10-22）。

## repair-pilot-013 · F13 / R20-D/E

IN_PROGRESS / review=PENDING，本地未提交。Grok/Bigjpg原任务恢复、URL-only受理、原SKU/计价与upscale结果保全已实施。补前置失败保留已commit进度、确定上游failed不可降级；最终70节点/29子用例通过，普通非异步失败控制1节点通过。原storage/定价/其他适配器/dispatch/旧测试字节保持；外部异步图像入口仍待F14，不关R20、不委派/复核。证据archive/f13-r20de-2026-10-22/evidence.md。

## repair-pilot-014 · F14 / R20-F

IN_PROGRESS / review=PENDING，本地未提交。两个外部异步图像协议已完成原受理恢复/逐图保全/查询响应checkpoint与默认review接入，117节点/40子用例通过。F10夹具仅AST必要上下文/callback兼容和原异步poll期望改pending，其余断言保持；原同步执行主体/发送下载/计价资产/五专用适配器/dispatch/ledger字节保持。R20计划内入口全部本地实施仍待独立复核，不关单；按总目标继续普通项，下一步R06设计/卡片，不启动复核或恢复冻结。证据archive/f14-r20f-2026-10-22/evidence.md。

## repair-pilot-015 · F15 / D04 / R06

IN_PROGRESS / review=PENDING，本地未提交。原TaskDispatch唯一约束复用，Agent/Chat确认/自动写工具同逻辑提交原子查回，冲突409、创建一次、只赢家调度。原F07事务/模式合同保持；20节点36子用例通过，补参数域/trace/历史缺Job4节点4子用例通过，再补三入口双Session竞争/unique/quota 3节点通过。无新迁移/模型/队列，PG实际竞争与跨新注册模型运行不在本地验证内，不关闭R06。证据archive/f15-r06-2026-10-22/evidence.md；继续普通项，不启动独立复核/冻结。


## repair-pilot-039 · F39 / R41+R43

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，未提交/部署。
- 目标/结果：保Chat拒绝后的原草稿、发送未知防误重发和消息持久附件；HTTP接收/流完成分开，失败与SDKresolve不等价。仅同源且空composer自动还原，其他场景明确恢复；blob按localId所有权take/restore/release。
- 边界：13既有目标/2新增见F39卡，backend仅两个StreamingResponse响应头；原loadConversation/refreshConversations及metadata回调正文保持，R42待后卡。正式存储/上传规则/模型/计价/R12持久化不改。
- 验证：真实锁定SDK Chat+实际TSX/Hook驱动30通过，五目标strict0诊断；后端仅AST不导入应用。先两业务红及中途reader取消/卸载竞态均留档修正。
- 限制：不是实际React useChat/DOM/真实服务验收，不提供服务端幂等、磁盘恢复或未知POST自动重试；25冻结停止，不关R41/R43。
- 文档/依赖：V00/F39卡/8文档CSV两行同步，archive/f39-r41-r43-2026-10-23/evidence.md；目录沿开工23日。2.0兼容：本地生命周期独立，不改变工作流持久化/工具执行/价格合同。
- 下一步：按总目标继续普通R42，先写局部卡；不启动独立复核。


## repair-pilot-040 · F40 / R42

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，未提交/部署。
- 目标/结果：A/B、A/B/A、同会话逆序历史及错误只投当前来源；等SDK选择render后应用，发送开始使旧读失效，失败保已有消息。transport按不可变scope与当前client message id过滤每次通知，旧提案决定被拒绝。
- 边界：Page与transport仅请求/显示来源生命周期；10既有目标/1新增见F40卡。F39附件、结算、unknown核对与恢复核心原函数保持；后端/正式存储/SDK/权限/模型请求合同不改。
- 验证：新29通过/18270.3069ms，受影响F39原30通过/19210.954ms，两个业务目标strict前后0诊断，最终exit0无skip/stderr空。2条原业务红、后补轮次/同会话导航/提案红及实施中删除序号回归均留档修正。
- 依赖/限制：V00/F39，真实锁定SDK Chat与可变setter桥+TSX Hook事件驱动，不运行实际React useChat/DOM；不提供后台记录重写/请求撤回/新持久缓存，不自关单，25冻结停止。
- 文档/2.0：8文档/CSV仅R42同步，archive/f40-r42-2026-10-24/evidence.md；局部显示来源保护不改变工作流/执行/持久化。下一普通R44先写卡，无独立复核。


## repair-pilot-041 · F41 / R44+R45

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，未提交/部署。
- 目标/结果：编辑会话代次、目标和保存快照防迟到重绑；同tick与跨render同草稿只一个请求，当前创建成功即接回ID，后续PATCH。保存期间续写保原文和取消快照，确认版本在render后检查，不把提交完成说成当前草稿全保存。
- 边界：9业务既有+8文档、2新增见F41卡；模板API/后端/所有权/存储/计价/生成及R46上传不改。delete仅共用会话/反馈来源守卫；apply只结束旧编辑，不改媒体字段/绑定主体。
- 验证：原两业务红复现；新27通过/1759.4033ms，原静态模板媒体参数2精确节点通过/376.2016ms，10业务目标strict前后0诊断，最终exit0无skip/stderr空。排队输入/编辑form更新/独立delete反馈覆盖实施中回归均留档修正。
- 限制：实际Hook/TSX驱动非真实React DOM/浏览器；未知无自动重发，明确放弃只结束本地会话，无服务端幂等/CAS/刷新恢复，跨客户端/不同编辑会话并发写同记录的服务端冲突未解决。
- 依赖/文档/2.0：V00与F38结构化status沿用，8文档/CSV仅R44/R45同步，archive/f41-r44-r45-2026-10-24/evidence.md；局部编辑生命周期不改变工作流/执行/持久化。下一普通R46先写卡；25冻结停止，无独立复核/关单。


## repair-pilot-042 · F42 / D-R46

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，未提交/部署。
- 目标/结果：item本地ID、batch票据、reset epoch消除旧列表整体覆盖；预留容量与接收顺序稳定，列表与form同源。明确clear/replace使旧结果丢弃并释放孤立blob，remove/replace按身份不按迟到index。
- 业务边界：8既有业务+新纯session helper，16既有目标/2新增见F42卡；原API/普通upload transport/头像adapter/大小格式/绘图与media/asset协议保持。标注取消守卫与真人可选AbortSignal仅本地UI生命周期，不改认证/审核/服务。
- 验证：两个原业务红复现；扩展31通过，补真人连点/供方旧modal两红并修复，中间taskId过早看未render列表导致1失败已修。最终36通过/10844.0859ms，9目标strict前后0诊断，exit0无skip/stderr空。
- 限制：实际Hook/TSX+真实普通上传/helper/人像adapter配内存API/导出替身；非真实React DOM/浏览器/图像导出/真人认证或供方验收。已发HTTP不能被本地取消撤回，不删除已上传媒体；不提供跨刷新恢复/服务端幂等。
- 依赖/文档/2.0：本卡D-R46已定稿局部合同，V00沿用，8文档/CSV仅R46同步，archive/f42-r46-2026-10-24/evidence.md；本地参考来源保护不变更工作流/执行/持久化/计价。下一普通R47先写卡；25冻结停止，无独立复核/关单。


## repair-pilot-043 · F43 / R47+R48

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，未提交/部署。
- 目标/结果：700ms前离开不丢模板图；排队同步备份，显式返回等最新graph/title确认，旧scope/rename不整记录替换当前对象；已排队新版本保dirty。重开显式恢复再核对，unknown不自动重试。
- 边界：hook/Workspace模板来源与保存恢复、router仅templateId key，11既有目标/2新增见F43卡。项目R09/F08、原API/后端/图解析/序列化/画笔/历史/生成不改；owner只用于本地备份键，不改鉴权。
- 验证：原两个业务红；新35/1114.2477ms与原F08实际workspace重试1/385.1554ms共36 passed；4目标strict前后同3既有JSX/新增0，最终exit0无skip/stderr空。补未提交render使当前A停用红，layout激活后通过。
- 限制：实际hook、局部JSX/依赖数组/事件模型非完整React DOM/Router/浏览器存储验收；localStorage失败明确告知，仅内存稿时不能承诺关闭恢复。无服务端CAS/跨窗口写顺序或请求撤回保证，取消/放弃只处理本地。
- 依赖/文档/2.0：8文档/CSV仅R47/R48，archive/f43-r47-r48-2026-10-24/evidence.md。本地恢复不变更工作流/执行/价格/后端持久化合同。下一R49先定稿卡片并复用本队列/已有证据，不重复未受影响检查、不重写同类队列；25冻结停止，R49仍TODO。


## repair-pilot-044 · F44 / R49

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，不关闭R49。
- 目标/结果：每templateId仅一在途写，最新pending快照续存；账号切换仍等待原模板写，不因旧Promise清理放行unknown。恢复核对与明确确认复用F43；草稿按账号/独立ID保全，不加载另一账号稿。
- 边界：canvasTemplateDrafts.ts仅末尾串行helper/unknown屏障与明确释放helper；useCanvasTemplateEditor.ts仅导入和原明确确认分支调用。新test-review-canvas-template-order.mjs复用未改F43 fixture，不重写队列或原测试。
- 禁止修改：原API/后端/Workspace/router/其他hooks/图/历史/绘图/生成/正式存储/依赖；无全套/视频/安全/真实服务/PG/提交部署，25冻结停止。
- 验证：原两红0/2 /545.1095ms；新10 /667.8075ms与受影响F43精确6 /660.4862ms共16通过，2目标strict前后0诊断，exit0无skip/stderr空。旧未受影响测试/4目标既有JSX不重跑。
- 限制：实际Hook+内存API/storage/effects模型，模拟服务器提交发生在gate解除后，非真实HTTP/浏览器/DB竞争。屏障只同JS模块，跨标签/进程/刷新不共享；明确确认是用户判断，不代表GET已证明旧请求结束。
- 依赖/交接/2.0：F43局部实施结果沿用，不冒充其ACCEPTED；10既有目标/1新增，CSV仅R49，同步8文档并留前后SHA/增量。保全1192基线与44旧档封存，下一普通R50另卡；本地写序列不改工作流/持久化/计价合同。


## repair-pilot-045 · F45 / R50

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，未关闭R50。
- 目标/结果：scope在layout提交激活，账号/项目或模板/加载代次隔离，poll/sync再核nodeId/taskId/nodeKind/执行代次。旧响应/错误/排队state updater不改新scope。各观察自有Promise/controller，重复resume等待原Promise，其他视图同task可独立观察；卸载清timer、后续GET/写回失效，回A按原taskId恢复，不取消后台任务。
- 上传/恢复：节点上传、标注、拖放和迟到create受理ID即时本地journal。捕获底图/笔画/节点输入版本，旧来源成功路径保原账号/画布记录，回A明确恢复且输入仍匹配才应用；冲突保路径/taskId，不自动重传/新建任务；存储失败保同运行期内存并告知关闭风险，不删除媒体。
- 边界：useCanvasNodeGenerate观察/来源；Workspace只scope、guarded patch、三上传及恢复UI；useCanvasProject仅loaded owner/view代次只读元数据。新canvasAsyncScope.ts与新局部回归；原F43测试只定位graph effect改认layout，其状态/依赖断言保持。12既有目标（3业务+1旧测试+8文档）、2新增，原保存/Task payload/图/绘图/权限/存储/API/后端/依赖保持；R51批量和R52发布正文不改。
- 验证：原poll/拖放两红复现，2修后通过；扩展22/24/31通过后补节点类型同taskId红复现，修后最终新34/2181.6402ms、原F43精确1/441.0089ms、F08精确4/523.9349ms，共39 passed；4目标strict前后0诊断，exit0无skip/stderr空。
- 限制：实际poll/hook/局部Workspace/JSX配伪React effects/内存API/storage/导出，非真实DOM/Router/HTTP/像素/浏览器存储或PG验收。已发GET只能忽略结果，不能撤回已受理Task/上传；journal只有元数据，存储失败/清除时不保证关闭恢复。批量去重/迟到发布另卡，冻结25停止。
- 依赖/文档/2.0：F08/F43/F44现有局部实现沿用不冒充ACCEPTED，8文档/CSV只R50，1193基线/45旧档1321封存文件保全。下一普通R51另卡；本地来源保护不变更工作流/执行/计价/正式持久化合同，无委派/独立复核/关单/提交部署。


## repair-pilot-046 · F46 / R51

- 状态：IN_PROGRESS / review=PENDING，2026-10-24本地实施，R51未关闭。
- 目标/结果：单节点和批量共用scope/node run Promise，登记在执行前，同tick/旧闭包复用同一操作；已有活跃taskId仅观察并等终态，其他节点独立。批量完成上游且有产物后再处理下游，实际最新图/边传入参考；已完成有结果保持跳过，失败/未知/无交付物停止不伪报完成。
- 新提交：journal operation id作submission_key，POST前登记；不同节点/明确新意图分开key，不按内容合并。unknown/408/5xx/坏受理及活跃无ID保原来源记录，重开仍不自动POST；用户核对并明确处理原记录后才可新意图。普通拒绝可修正，显式重新生成保原任务观察与代次隔离。
- 边界：scope只新run/保稿release/只读图getter，Generate Hook仅门禁/附着/key/未知保全；Workspace仅options、batch token/等待/收尾和图getter接线，context/Node/Inspector只可选regenerate及两个按钮。旧F45 fixture仅taskId=null新节点从pending改idle，断言与正文保持。原API/后台/供方/计价/Task参数（除key）/保存/上传/图算法/发布/依赖保持。
- 验证：原活跃仍POST和同tick两POST两红；修后2通过，扩展14/21通过；原迟到受理回归发现微任务推迟启动，改为先登记锁再立即开始后原3通过。补本地重新生成校验失败误标旧任务failed红，保awaiting_result后最终新22/2842.0142ms+原3/762.2622ms共25 passed；6目标strict前后0诊断，exit0无skip/stderr空。
- 限制：实际Hook/scope/局部runWorkflow/两个真实按钮与4个未改图helper，React/API/storage/任务payload builder替身，非真实DOM/路由/HTTP/PG/后台幂等竞争/生成验收。既有后端key合同只读核对，不运行Task；存储失败仅同运行期内存，明确放弃记录不取消原服务器任务或证明未受理。
- 依赖/交接/2.0：沿用F45实施及现有Task幂等字段，不冒充ACCEPTED。15既有目标/1新增，1195基线/46旧档1368封存SHA保全，8文档/CSV仅R51同步，handoff留F46/F45/F44，原F43在original。下一R52另卡，25冻结停止；本地操作身份不改执行/工作流/计价/正式存储。


## repair-pilot-047 · F47 / R52

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，R52未关闭。
- 目标/结果：发布打开即深拷贝源图并捕获owner/project/viewKey/title，模型会话id绑定草稿/目标/列表/请求phase；标题或来源变化不重置在途锁，不拼A标题/B图。关闭保留原会话，再开先恢复；明确结束旧本地会话才能新意图，结束不撤回已发请求。旧返回只登记原模型结果，不改后来会话/error/busy/close/navigation。
- 复制/选择：GET先验选择token/owner/viewKey，选择另一项目/新建/删除当前/打开发布撤销旧意图；已POST的复制在createProject内也校验可选guard，不能靠外层忽略结果掩盖内层activate。已受理新项目保留，旧来源不刷新新账号列表；自己的loading仍释放，不能清后来请求的loading。
- 边界：Dialog会话/草稿/提交/列表/只读核对/关闭结束；Workspace仅复制/发布token/ref/固定props和回调、项目库选择消费者；Project Hook仅createProject可选isCurrent/onActivated及请求/列表/loading归属。其他原函数/Task/媒体/保存/批量/图/API/后台/权限/计价/正式存储/依赖保持。11既有目标（3业务+8文档）、1新增回归。
- 验证：原标题/在途重置与copy抢选两红0/2 /437.4349ms；修后2/454.6093ms，扩展21中1个fixture未flush Project状态失败已修，21/866.8403ms。补旧copy刷新新账号列表红/395.6701ms与删当前旧GET另起copy红/435.3221ms均修，最终新25/962.1924ms+原F08精确3/485.417ms共28通过；3目标strict前后0诊断，exit0无skip/stderr空。
- 限制：实际Dialog Hook/JSX、Workspace局部复制/发布与真实Project Hook驱动配伪React/effects/API/storage；非真实DOM/Router/HTTP/模板API幂等/PG/存储持久性验收。unknown只读列表不能证明未受理；会话仅本页内存，关闭浏览器无恢复承诺，明确结束也不取消服务器请求。
- 依赖/交接/2.0：沿用F08/F45/F46实施不冒充ACCEPTED，1196基线/47旧档1414封存文件保全，CSV只R52、8文档同步；handoff留F47/F46/F45，移出F44在original。下一普通R54另卡，R53及25冻结停止；本地来源/选择不改执行/工作流/计价/正式持久化。


## repair-pilot-048 · F48 / R54

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，R54未关闭。
- 目标：隔离旧润色结果，保护新草稿/节点与该稿历史。

- 合同与实现：request捕获源会话、对象版本、prompt/mode/有序引用路径及serial，layout commit才切换当前观察，ABA/卸载/未提交render有门禁。同tick共享在途Promise，失效结果不自动重发；不承诺取消服务器LLM。源草稿WeakMap谱系只存opaque token，不写form/graph/Task或正式存储，不保留原form链。
- 原子回写：Studio builder在setStudioForm updater核expected对象及isCurrent，文本/标记一次更新；正常prompt/provider/mode/SKU等编辑只包谱系元数据，原字段不变。Canvas两个真实消费者传expectedData，patchNode在queued updater核scope/data后才改history/ref/state/persist。Project仅增只读isCurrentView，以防新项目已激活但尚未render的窗口。
- 历史/反馈：普通同稿编辑失效旧请求而保已确认历史，自身apply/历史应用保最大5项，恢复原文把polished置false。旧失败/finally不改新error/notice/busy；节点/种类/画布切换重置局部busy。
- 增量边界：12既有业务、1旧fixture、8文档共21既有目标，新增纯ownership helper和离线回归2文件。旧F45 fixture仅注入纯helper，断言和测试正文未改；原Task/生成提交/供方/计价/保存请求/媒体/发布/图算法/API/后台/权限/依赖保持。source-scope-audit.json记录反向还原/其余函数变量字节核对，非独立验收。
- 验证：原2红/387.3024ms，修2/395.8097ms。扩展21中2项fixture默认导出替身错误，修fixture后21/1088.019ms，扩展23/1146.0224ms，最后opaque token改动后23/1156.1501ms；原F45精确4/906.8796ms、F46精确2/701.4882ms，共29 passed，0失败/skip/cancel，子进程exit0/stderr空。13目标strict保留既有maxReferenceCount TS2353一项，新增0；不是全项目类型通过。
- 限制：真实core/Studio wrapper/builder局部callback/Canvas字段与两个节点回调/Workspace patchNode/Project hook执行于模型；React/effects/JSX/API/storage替身，task-copy表单派生为合成视频B，binding guard为spread替身。未运行真实DOM/Router/HTTP/LLM/媒体/视频Task/后台/全套/安全专项。旧6节点早于opaque token内部表示修正，输入输出/谱系语义未变，沿用未受影响结果；最后新23与类型检查已重跑。
- 状态与保全：1197基线、48旧档1456封存SHA保全，CSV只R54，其他97行字节不变；普通1 DONE/45 IN_PROGRESS/27 TODO，路由PILOT_SPECIFIED46/NEEDS_CARD14/NEEDS_DESIGN13/FROZEN_SCOPE25，仍97未解决。handoff留F48/F47/F46，移出F45全本在original/docs/handoff.md。2.0兼容为本地草稿观察/回写，不改变执行/工作流/计价/正式存储。下一普通R58先定离线表单引用边界，不运行视频任务；25冻结停止。


## repair-pilot-049 · F49 / R58

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，R58未关闭。
- 目标：历史再生成仅使用自身引用快照，保护当前创作草稿。

- 合同/结果：submitStudioTask接受显式{form,referenceUploads,uploadingReference,updateComposer}，入口拷贝form/referenceImages及各上传项。普通提交用本稿快照，历史再生成使用真实buildStudioFormFromTask的nextForm/nextUploads及updateComposer=false，历史已保存图不被当前B上传busy阻塞。视频校验路径按本次provider/既有resolver派生，payload使用同一快照，Seedance active asset与原始媒体/HTTPS fallback保持。
- 回写：provider fallback仅在current===sourceForm的functional updater应用，返回稳定目标对象；成功只清该对象的polished。历史不调用form回写、不清/替换全局上传项、不先将A带入B；成功反馈改为按历史输入提交。原busy锁/tracker/加载/API与上游受理合同不变，没有新增自动重发或后台幂等保证。
- 范围：6业务+8文档共14既有目标，新增test-review-studio-submission-source.mjs。Actions仅输入参数，Submission仅快照/同源解析/源form写回，Types仅完整输入，State仅provider源门禁/稳定返回，ActionUtils仅成功反馈；Validation仅avatarStatus联合补verifying一词（运行时早已检查），不改校验逻辑。payload/provider/SKU/reference helper、image/edit/数量上限、历史截断、upscale/copy/reference其他函数/API/后台/执行/正式存储/依赖保持；R59未修。
- 验证：最初2项fixture因provider缺outbound未进入提交，保留失败日志；修fixture后原2红复现实际POST图为[B]及新C.promptPolished被清，591.8204ms，修后2/580.361ms。扩展17首次16通过/1项fixture误用i2v两图，改真实ref SKU后最终22/1928.1528ms，0失败/skip/cancel，exit0/stderr空。6目标strict前3既有诊断（2个TS2322及1个TS2367）/后0，新0；首次5目标类型阶段的失败也保留。
- 限制：真实Actions/Submission/validation/表单还原/payload/provider/SKU/reference helper在VM运行；React/useCallback/state、API、Auth读取、DOM/统计事件边界替身。barrel仅选择真实所需导出，时间格式/图片尺寸等未走边界为拒绝或空替身。未执行真实Task/HTTP/视频/LLM/媒体/浏览器/后台/全套或安全专项。只证明本地参数构造/回写，不证明真实生成或未知受理重试安全。
- 保全/交接：1199基线/49旧档1508封存SHA保全，CSV只R58，其余97行字节不变；普通1 DONE/46 IN_PROGRESS/26 TODO，路由PILOT_SPECIFIED47/NEEDS_CARD14/NEEDS_DESIGN12/FROZEN_SCOPE25，仍97未解决。handoff留F49/F48/F47，移出F46全本在original/docs/handoff.md。2.0兼容为本地操作快照/回写，不改工作流/执行/计价/持久化。R59数量与历史保全仍待另卡，25冻结停止，不跑真实视频。


## repair-pilot-050 · F50 / R59

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，R59未关闭。
- 目标：HappyHorse九图展示与历史记录完整，执行仍服从各自档位合同。

- 合同/界面：Dropzone按既有maxReferenceCount控制新增（异常回4、0禁新增），全部已存在图可查看/逐项移除，换小档位不删藏超量图。CanvasProps补原传值的可选maxReferenceCount；history taskReferenceImages/buildReferenceUploadsFromPaths无损重建，不改变上传session/供方/SKU/头像流程。
- metadata/旧记录：新增无import/启动副作用纯task_reference_metadata，完整保存已提交引用的count/primary/paths。router仅两wrapper和_to_task_out result副本投影，按已有payload重建引用，不暴露完整payload、不改数据库行，缺失档位仅补保存video_sku且已记录执行SKU优先；无保存输入时保留recorded_result/unavailable来源，已知数量大于路径或已知有图但路径缺失标incomplete。executor仅metadata函数调用新helper，原执行_extract_reference_images四图限制及全部执行/供方/存储正文保持。
- 校验/失败：Grok/普通图像原先计数clamp到4使>4拒绝失效，现按实际非空数检查；HH9/10拒绝、t2v0/i2v1、Seedance4、Comfy1/2等既有合同保持。已知incomplete历史在copy/regenerate通过既有feedback拒绝，提示手动重选，不猜补丢图。只有4项且缺payload/丢图证据的旧记录不能证明原来9，不虚构修复或数量。
- 范围：17既有（8业务+1runner+8文档）、3新增（纯metadata/前后端回归）。runner反向仅删8精确nodeid后全文等于前像，dotenv/网络/startup/插件/collect门禁保持；旧测试未改。其他API/权限/正式存储/迁移/价格/执行/恢复/媒体/图算法保持，未运行问题视频测试。
- 验证：原前端3红/583.5235ms（只见4/历史4/Grok5仍提交）及后台2红/0.16s（受理/完成均4）修复。修后前端3/585.8471ms、后台8及4子场景/0.44s，补历史SKU来源断言后后台8及4子场景/0.38s；扩展16首次12通过/4跨VM数组prototype断言失败2247.192ms，统一JSON值比较后最终16/2425.8423ms，加R58精确1/487.158ms与后台8，共25 passed/4 subtests passed，0失败/skip/cancel，exit0/stderr空。6前端目标strict前后0诊断，不是全项目类型通过。最初相对venv解释器Windows启动失败未执行测试，改绝对路径后运行，失败记录保留。
- 限制：前端实际Dropzone JSX/引用与历史helper/R58 Actions→Submission管道/provider构造运行于VM，伪React/effects/API/DOM边界；仅复用F49 driver定义，未注册其原全组测试。后台仅AST载入metadata/router projection/适配器纯请求构造，TaskOut/storage resolver/ORM object_session和public URL为替身；未导入app执行器或adapter模块，未执行真实Task/视频/HTTP/PG/存储/完整DOM/全套或安全专项。不证明真实生成/浏览器、数据库持久性或供方接收。
- 保全/交接：1200基线/50旧档1551封存SHA保全，CSV只R59/其他97行字节保持；普通1 DONE/47 IN_PROGRESS/25 TODO，路由PILOT_SPECIFIED48/NEEDS_CARD14/NEEDS_DESIGN11/FROZEN_SCOPE25，仍97未解决。handoff留F50/F49/F48，移出F47全本在original/docs/handoff.md。下一普通R60需先定异步项目归属边界，25冻结停止；2.0兼容为完整输入记录与只读投影，不改工作流/执行/计价/正式持久化机制。


## repair-pilot-051 · F51 / R60

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，R60未关闭。
- 目标：个人项目变更只作用于原操作/草稿，保留后来选择、编辑和已成功列表变更。

- 编辑/操作合同：create/rename各自model、草稿版本和同步pending，取消重开/换目标/同文本ABA/账号有独立身份，只有原model同版本成功才关闭。普通输入变化保稿，独立项目可并行；同editor/同项目pending门禁不重发，内部busy只由自身operation释放，原UI不被全局禁用。实际POST/PATCH/DELETE目标与trim名称一次捕获，失效只停止本地观察，不取消服务器或自动重试。
- 删除/反馈：functional updater当前仍是删除code才按最新集合回退，排除正在删除的候选；已选C保留，外部queued选择也二次校验。无项目只清code保其他草稿；A/B/A若当前又是已删A，按最新有效列表回退而非保已删实体。删除不清B rename；旧失败/刷新失败/queued error updater按意图serial门禁，成功后刷新失败明确变更已成功，不误报可重复写。
- 列表：新增纯内存StudioProjectCollection，用collection身份/revision/read serial隔离读取与已确认删除tombstone；成功返回记录先upsert、delete先remove，专用GET /projects核对，失败保确定结果。原full/config仅projects投影接ticket，旧读取与queued updater不复原旧列表；tombstone在最新列表确认不存在后释放，明确新建同code可upsert。账号按公开id/name/isGuest在layout commit换collection，同身份资料刷新保留当前观察，放弃render不废弃当前观察。
- 范围：4既有业务（useStudioProjects项目操作model；studioControllerDataOptions项目接线/初始列表/queued error guard；useStudioDataLoader仅项目collection/专用refresh和两原读取projects门禁；useStudioDefaults仅最后项目默认选择updater二次校验），加8文档共12既有；新增纯helper及两个定向脚本3文件。loader/options/defaults反向局部替换后全文等于原像，原Task/Asset/分页/定时器/模板/默认provider等正文保持，后端/API/权限/数据库/执行/计价/媒体/正式存储/依赖/旧测试未改。
- 验证：原3红/395.4117ms复现C被切B、新rename B及新create B被清；首修2通过/1失败463.0746ms，自验发现漏回传原startProjectRename，补回后3/453.1547ms。新操作扩展21/899.4359ms，列表首12/493.1698ms，补真实controller→两Hook接线与queued error guard后14/601.7005ms；补同账号资料刷新2红/424.3708ms后，最终操作22/919.9628ms+刷新15/608.334ms共37 passed，0失败/skip/cancel、exit0/stderr空。5目标strict前后同1项既有useStudioDefaults.bindTemplate TS2353、无新增，不是全项目类型通过。
- 限制：实际Projects Hook、表单输入/项目选择JSX、原loader相关回调、controller options和defaults局部effect配VM React/state/layout/API/DOM边界；普通loader启动/轮询effects不自动执行，显式调用原full/poll驱动project读取，不运行真实项目API/浏览器/Router/数据库/服务。hook操作fixture的refresh是纯collection边界替身，另有真实两Hook接线模型验证；不证明HTTP并发/服务端事务/多标签一致性。集合与editor仅本页内存，不承诺关闭恢复。
- 保全/交接：1203基线/51旧档1603封存SHA保全，CSV只R60，其余97行字节保持；普通1 DONE/48 IN_PROGRESS/24 TODO，路由PILOT_SPECIFIED49/NEEDS_CARD13/NEEDS_DESIGN11/FROZEN_SCOPE25，仍97未解决。handoff留F51/F50/F49，移出F48全本在original/docs/handoff.md。下一普通R61先定反馈输入归属卡；25冻结停止，不委派/复核/提交推送部署。2.0兼容为本地项目意图/集合观察，不改执行/工作流/计价/持久化机制。


## repair-pilot-052 · F52 / R61

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，R61未关闭。
- 目标：反馈发送只清原稿，保留后来输入与仍被使用的附件，线程独立管理在途观察。

- 草稿/发送：账号scope按公开id/name/isGuest在layout commit激活，资料对象刷新保持、真实换人/卸载失效，放弃render不破坏可见观察。主稿对象+递增版本、线程草稿对象+线程session同步记录输入，发送捕获trim正文/标题/附件路径，不把新输入当已交付；只有原稿未变才清空，变更时整稿保留。主发送/同线程session各有同步operation门禁，不锁其他输入/线程，旧finally不清新busy，未知不自动重发。
- 附件：已commit blob预览按当前草稿/列表owner维护，未修改原稿发送成功移除后才释放，保留到B的旧A附件不撤销；Strict effect重放和真卸载区分、一次释放。移除按原item对象，不用旧index闭包误删新项；上传开始推进主稿版本，全部活跃batch计数供send门禁，账号/卸载旧上传不晚创建预览或改当前file input。R62的nextAttachments旧列表覆盖、并发容量预留、未commit部分上传结果/资源仍未修，不借共用生命周期关R62。
- 错误/consumer：onSetError使用React Dispatch（原唯一consumer直接传setError），Page发送反馈及清错在真正error updater执行时核scope/intent。必要追加router.tsx仅StudioFeedbackRoute.refresh可选error guard、两处error functional updater及onRefresh转交guard；记录仍可刷新，新输入的error保留。原初始/手动GET、列表结果归属和其他路由不改，不宣称全部列表竞态修复。callback同步/可观察Promise失败说明已发送/刷新失败，不自动重发。
- 范围：10既有（2业务+8文档）、2新增（纯feedbackDraftSession/preview helper、新定向回归）。Page仅草稿/发送/反馈/必要上传及preview接线；消息作者/列表渲染/统计、API三方法/字段、4图/尺寸/类型校验、父路由其他代码/后端/权限/通知/正式存储/旧测试/依赖保持。router追加前SHA仍等于1206基线并补original/白名单，源码反向局部替换后两文件全文原像一致。
- 验证：最初2失败为fixture递归walker对undefined重走root，保留日志，不计业务红；修fixture后原2红/386.7068ms复现新主稿与补充B被清，修后2/421.7366ms；扩展23/743.0191ms。实际父router旧刷新清错补红1/332.3883ms，传guard后26/787.1202ms；补父回调成功/失败两分支排队断言，最终26/784.0949ms，0失败/skip/cancel、exit0/stderr空。3目标strict前后同3项router JSX TS2503、新0；Page/helper前后0诊断，不是全项目类型通过。
- 限制：实际Page JSX事件/纯session/已commit preview owner及实际父route.refresh/onRefresh callback通过VM；React/state/layout/effects、API/FileReader/URL/格式为替身，非DOM/Router/真实反馈/上传/邮件/通知/生产验收。Strict effect为显式cleanup/setup模型，非完整React StrictMode。父route初始/手动刷新及多个GET列表顺序、R62部分上传资源/合并仍未验证或修复；不把mock成功当服务端受理/幂等。
- 保全/交接：1206基线/52旧档1652封存SHA保全，CSV只R61，其余97行字节保持；普通1 DONE/49 IN_PROGRESS/23 TODO，路由PILOT_SPECIFIED50/NEEDS_CARD12/NEEDS_DESIGN11/FROZEN_SCOPE25，仍97未解决。handoff留F52/F51/F50，移出F49全本在original/docs/handoff.md。下一普通R62先定上传合并/资源卡；25冻结停止，不委派/复核/提交推送部署。2.0兼容为本地发送快照/观察/资源owner，不改执行/工作流/计价/持久化机制。


## repair-pilot-053 · F53 / R62

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，R62未关闭。
- 目标：截图并发/移除/重置不覆盖当前列表，容量与部分成功、预览资源有明确归属。

- 合同/合并：每批捕获主稿attachment epoch，按实际当前项+全部pending slot同步预留，不超过4；slot稳定localId/全局选择序，只一次append到当前模型，不再赋nextAttachments旧列表。多批/多文件逆序仍保选择顺序，移除/重置不复活，旧批次不释放新busy。item按稳定ID移除，JSX key也用localId，ID不进入反馈API payload。
- 失败/容量：每项成功立即入稿，后项尺寸/读取/API/空路径失败保留成功项，释放剩余预留，不启动后续文件、不自动重试。提示保留数量和未完成截图需重选；并行失败另保当前上传组uploadIssue，不被另一成功覆盖、不覆盖新表单全局error，相同message不重复显示。下一上传组重选或reset清提示；4图/类型/尺寸限制保持，超量/非图片明确排除。
- 资源/重置：新URL立即adopt，暂定model owner保留到commit；reset前未commit项失去model也会回收，拒收结果discard一次，draft/list仍使用的预览保留。真卸载/换账号取消旧批次reservation，Strict cleanup/setup复活同scope不误取消。文件选择同步拷贝FileList并清该次input，不在旧finally清新选择。main成功清稿统一resetDraft(false)，R61新稿/线程/error与父router逻辑保持。
- 范围：10既有（2业务+8文档）、1新增回归；Page仅上传/移除/清稿reset/key/本地上传status及lease接线，helper仅batch/slot/epoch/合并/资源暂定owner。反向局部替换后两业务全文等于原像，父router、消息/统计/后台/API/权限/通知/正式存储/依赖/旧测试未改。API仍原三方法及字段，不读写远端媒体清理接口。
- 验证：原2红/431.216ms复现移除A后恢复[A,B]及并发B丢失，修后2/437.5882ms。扩展23首次22通过/1跨VM Error身份fixture失败774.9485ms，统一同浏览器Error构造器后23/785.1351ms。补并行失败被新意图掩盖红1/402.3531ms，保上传status后最终24/831.0613ms；受影响R61精确9/578.1511ms，共33 passed，0失败/skip/cancel、exit0/stderr空。2目标strict前后0诊断，不是全项目类型通过。旧9在最后仅本地issue/status补丁前通过，上传/发送/lease算法未再变，沿用未受影响结果。
- 限制：实际Page/JSX文件事件/helper通过VM，React/layout/state、API/FileReader/URL为替身。复用F52仅driver定义且Error共用，构造器只记录实例，方法未重写；reset/未commit owner为模型边界，Strict为显式cleanup/setup。未运行真实上传/反馈/邮件/通知/浏览器/Router/HTTP/媒体删除或全套。已发上传可能服务端完成，失效只停止观察/后续POST，不声称撤回服务端或清除已上传文件。
- 保全/交接：1208基线/53旧档1696封存SHA保全，CSV仅R62，其余97行字节保持；普通1 DONE/50 IN_PROGRESS/22 TODO，路由PILOT_SPECIFIED51/NEEDS_CARD11/NEEDS_DESIGN11/FROZEN_SCOPE25，仍97未解决。handoff留F53/F52/F51，移出F50全本在original/docs/handoff.md。下一普通R63先定查询归属卡；25冻结停止，不委派/复核/提交推送部署。2.0兼容为本地输入工件/观察/资源owner，不改执行/工作流/计价/正式持久化机制。


## repair-pilot-054 · F54 / R63

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，R63未关闭。
- 目标：初始、分类及变更后读取共用归属，旧结果不覆盖当前查询和后来选择。

- 合同/列表：新useInspirationList只存页面内存，按公开账号id/name/isGuest及mode建scope，在layout commit激活，放弃render不废弃当前观察。同账号资料对象刷新保scope；换账号/访客/卸载使旧请求失效。每次GET捕获完整服务端category+递增request，当前最新查询才更新posts/loading；同分类刷新、A/B/A也分代。search/source仍原本地/R55逻辑，不重置或另造服务端查询。
- 初始/刷新：两父route移除独立初始GET及posts传递，Page负责唯一初始读取；8处现有刷新接线统一无参数loadPosts读取当前分类，旧mutation完成不再用捕获A覆盖B。失效scope拒绝新GET；不声称取消已发HTTP/撤回服务端变更。切分类同步清旧数据，刷新同分类保旧数据；当前空数组有效，失败明确提示/解除本次busy，手动重试，无自动重发。
- 错误/选择：GET的catch/finally同时核scope/request/query，错误另核errorIntent，不盖后来操作提示。选中ID属于页面会话，GET不清选；切分类保搜索/来源/跨分类已选ID，原toolbar解释可见与总选中数。批量分类/删除成功只有当前数组仍是原选择对象才清空，后来选择/取消重选ABA保留；单删仅移除被删ID。既有跨分类batch tags只处理当前posts中匹配对象的行为未扩展，不宣称重做全部选择语义。
- 范围：10既有（2业务+8文档）、2新增（Hook/定向回归）。Page仅列表/错误/选择接线、8刷新调用及两个清原选择updater；router仅两个灵感入口与唯一type import，其他正文全文保持，包括R61反馈刷新。API/mutation目标与payload、弹窗/上传/抽取归属/R64、媒体渲染、搜索Hook/后台/权限/正式存储/旧测试/依赖保持，不修弹窗晚响应或所有mutation error/busy归属。
- 验证：原2红/463.1323ms分别复现逆序分类与初始全量迟到把22覆盖为11；修后2/481.2005ms。扩展27/1154.9492ms通过，补齐标签/编辑/导入接线和mutation失败后最终31/1238.4781ms，0失败/skip/cancel、exit0/stderr空。3目标strict前后同3项router既有TS2503，行号因删除import前移1，新增0；Page/Hook无目标诊断，不是全项目类型通过。只新文件，旧未受影响测试/检查不重复。
- 限制：实际Page JSX事件、两父route函数及真实新Hook通过VM；React state/memo/layout/effects/JSX/API替身。选择/放弃render/排队redraw/Strict cleanup-setup为显式模型，不是完整React并发调度/浏览器StrictMode。extractImages只回mock-local字串与标题，未提取/下载/上传图片或联网；所有mutation仅内存Promise。未跑浏览器/HTTP/真实搜索写入删除索引/服务/视频/DB/全套/安全专项，不宣称端到端验收或独立复核。
- 保全/交接：1209基线/54旧档1741封存SHA保全，CSV仅R63，其余97行字节保持；普通1 DONE/51 IN_PROGRESS/21 TODO，路由PILOT_SPECIFIED52/NEEDS_CARD10/NEEDS_DESIGN11/FROZEN_SCOPE25，仍97未解决。handoff留F54/F53/F52，移出F51全文在original/docs/handoff.md。下一普通R64另定弹窗归属卡；25冻结停止，不委派/复核/提交推送部署。2.0兼容为页面查询/观察owner，不改执行/工作流/计价/正式持久化。


## repair-pilot-055 · F55 / R64

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，R64未关闭。
- 目标：导入/编辑会话与字段版本隔离，旧提取/上传/保存不接管后来草稿。

- 会话：useInspirationDialogs按公开id/name/isGuest/mode建scope，layout commit激活，换人/卸载拒绝旧观察，资料对象刷新/放弃render保当前会话。导入/编辑每次open有独立session，即使同post重开也不同；close与字段事件闭包绑定原session，失效旧callback不修改或关闭B。草稿对象按当前值合并，不把old dialog整对象写回。
- 输入/操作：每次输入推进draft revision，标题/URL/图片各有版本，ABA也识别。提取按URL版本+operation接受images，仅对应title/image版本未变才填标题/封面；新上传/手动选图胜过早提取，其他字段保留。上传按会话/image版本/operation接受，改source URL或图片使旧观察失效，读取完成再检查才POST；当前失败在本地uploadError展示，不因无关标题编辑丢失。旧catch/finally不改新busy/error，不删除已上传媒体。
- 保存：捕获postId与所有API字段快照，未完当前上传/提取由button和handler双重拒绝；明确替换图片/URL可结束旧观察再提交。只原session/operation/未改version才关闭，后来B/同post重开/ABA保稿；同会话改动时说明原稿已保存、当前修改未保存。保存错误仅原未改草稿显示，旧失败不覆盖新输入/新弹窗。成功后当前页面刷新沿用R63当前category，换账号/卸载不新发GET；失败无自动重试。
- 范围：10既有（Page、受影响F54 driver、8文档）、2新增（dialog Hook/定向回归）。F54必要fixture在修改前确认SHA仍等1211基线并补快照，只加载实际新Hook、31旧test body全保留。Page仅弹窗/字段/上传/提取/保存/反馈接线；R63 Hook/router、搜索投影、其他操作/媒体/后台/API/权限/正式存储/依赖保持。保存按钮已有saving外观禁用，但无同步mutex/未知受理合同，不能当R65修复，不关R65。
- 验证：原3红/512.4793ms复现A图污染B、提取取消被撤销、A保存关B；修后3/529.4494ms，扩展30/1576.7794ms。原F54精确2首次因未声明新Hook import失败/441.7244ms，未到业务断言；保留日志不算业务红，补真实Hook加载后2/486.4086ms。清理无用字段后最终30/1788.5151ms，共32 passed，0fail/skip/cancel、exit0/stderr空。Page/新Hook两目标strict前后0诊断，依赖诊断排除，不是全项目类型通过。
- 限制：实际Page/JSX事件/两父route/新Hook通过VM，React/state/memo/layout、API/FileReader/URL为替身。测试复用F54仅driver定义，不注册旧全组；新driver提供可控读取，仍执行实际Hook，不改方法。Strict/放弃render是模型，非完整React/DOM/Router/HTTP；未真实提取/上传/保存/索引/删除媒体/服务/视频/DB/全套/安全专项/GPU/付费。失效只拒绝本地观察，已发请求可能服务端完成；不自动清理或保有跨会话远端产物恢复账本，不宣称R65幂等/受理不明已修。
- 保全/交接：1211基线/55旧档1781封存SHA保持，CSV只R64，其余97行字节保持；普通1 DONE/52 IN_PROGRESS/20 TODO，路由PILOT_SPECIFIED53/NEEDS_CARD9/NEEDS_DESIGN11/FROZEN_SCOPE25，仍97未解决。handoff留F55/F54/F53，移出F52全文在original/docs/handoff.md。下一普通R65另卡修同步门禁/未知受理，不自动展开其他卡；25冻结停止。2.0兼容为本地草稿/输入/异步观察owner，不改执行/工作流/计价/正式持久化。


## repair-pilot-056 · F56 / R65

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，R65未关闭。
- 目标：一次导入意图同步互斥，取消重开/未知受理不重复创建，独立新意图可另建。

- 同步意图：save改为同步入口，在POST前登记create对象/Promise；pending/unknown/accepted重复事件直接返回同操作，不依赖渲染或disabled。同一意图换字段/ABA不改已捕获payload，成功只一次记录；已成功但有新输入保稿/receipt并锁住旧意图，另建必须显式“新建另一条导入”。不同明确意图允许相同title/URL，不按内容全局去重。
- 恢复：已POST意图close只隐藏，默认open接回原草稿/操作状态；新意图单独创建session，旧操作保scope内恢复按钮。旧成功/失败/finally只更新原意图记录，不解锁B；回到pending/unknown/accepted均不重POST。未POST取消仍按R64新会话，编辑/上传/提取和输入版本保持；上传/提取正文全文未变。
- 受理合同：仅number status 400/401/403/404/405/413/415/422明确拒绝可显式重试；无status、5xx/408/429/陌生或错误类型status、无有效正整数receipt id均unknown并锁定。后端commit后仍索引/序列化，500可能已创建；错误文本不证明拒绝。刷新列表核对只GET，即使空结果/失败也不解锁或补POST。成功receipt优先于刷新失败，不把已创建当未创建重发。
- 范围：11既有（Page/原dialog Hook/F55定向脚本/8文档）、1新增定向回归。Page只导入状态/恢复/明确新建/只读核对按钮，Hook只create gate/phase/恢复/保存Promise接线。F55两处测试因合同明确调整：B用显式新意图、已成功新输入仍保稿且确认锁住；其他旧断言保持。API/transport/后端/权限/正式存储/索引/媒体/搜索/R63查询Hook/router/依赖不改，无全局唯一、服务器幂等键或真实重复项清理。
- 验证：最初新driver嵌套import.meta替换fixture失败1/325.6397ms；修加载后初3节点2红1绿/560.2189ms，补重开应恢复原稿断言后原3红/546.9039ms，修后3/569.4731ms。扩展21首次20通过/1未flush的Strict按钮文案fixture失败/1893.8482ms，补事件后commit渲染，最终21/1952.7828ms；原F55精确11/1061.4513ms，共32 passed，0fail/skip/cancel、exit0/stderr空。2目标strict前后0诊断，依赖诊断排除，不是全项目类型通过；代码未在该typecheck后再变。
- 限制：VM运行实际Page/dialog Hook/局部父route，复用F55定义（不注册旧全组），React/state/memo/layout/API/FileReader/URL为替身，隔离Map记录受理行数/丢响应，不是SQL/真实HTTP。Strict/放弃render是模型；未知操作仅本页/账号内存，卸载/重载/多标签/其他客户端无服务器幂等保证。只读列表无操作键不能证明未创建，因此不自动解锁；用户明确新建是独立意图。未运行真实图片/提取/上传/创建/索引/媒体清理/服务/DB/视频/全套/安全专项/GPU/付费，无委派/复核/提交部署。
- 保全/交接：1213基线/56旧档1826封存SHA保持，CSV只R65，其余97行字节保持；普通1 DONE/53 IN_PROGRESS/19 TODO，路由PILOT_SPECIFIED54/NEEDS_CARD8/NEEDS_DESIGN11/FROZEN_SCOPE25，仍97未解决。handoff留F56/F55/F54，移出F53全文在original/docs/handoff.md。下一普通R66另卡，25冻结停止。2.0兼容为页面内操作意图/受理观察，不改工作流/执行/计价/正式持久化。


## repair-pilot-057 · F57 / R66

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，R66未关闭。
- 目标：GIF深链/补读不接管后来显示选择和下载工件，显示观察与批次执行分离。

- 显示合同：useGifDisplay按公开id/name/isGuest建立layout commit scope，每次query/历史/本地/复制观察有独立selection。query切换/清空、ABA、手动后选、账号/卸载拒绝旧详情/error，response record_id必须匹配所选工件；preview/download共享result。queryKey已消费且当前非query时重放setup保手动选择，不让旧深链重夺结果。
- 补读：缺source/output info仅当前base/selection可补，历史补读只本选择，本地补读以原job result对象为base投影，不赋持久historyResult；换本地项/同槽新批次即失效。每次选择对同base只补一次，缺参数/失败不循环，可显式重选重读；Strict中未完成观察cleanup后可重订阅，旧补读不写后来选择/error。
- 执行/复制：显示token不接原request计数，历史浏览不取消批次/下一文件或结果进历史。copy捕获当前显示guard，读取原件后仍属当前选择才回填文件/参数/URL/error；换历史/query不晚写A。账号/卸载layout切断旧执行观察，batch jobs/history functional updater再次核id，列表GET按账号guard；下载finally也核id不写卸载或清新账号busy。已发服务不撤回，无真实工件删除。
- 范围：10既有（Page/必要旧静态fixture/8文档）、2新增（Hook/定向回归）。Page仅显示/详情接线、选择/复制观察、账号/queued列表批次/下载finally必要guard；gifToolBatch/校验/参数/下载存储helper/API/后端/权限/正式媒体/依赖保持。旧静态driver加载实际Hook并经showHistory载入原preset，原history状态槽位仍消耗，全部test body/assertion保持；canRead=false且passive不执行，不读取媒体。
- 验证：原2红/418.9472ms复现迟到101覆盖历史202及本地批次303；首轮修后因新Hook空hydration与undefined比较造成2代码失败/448.5992ms，修显式非空后2/441.2177ms。扩展23/1011.1408ms通过；补Strict手动选择及下载卸载2红/430.9654ms，修queryKey/下载observer后最终26/1121.699ms；原静态精确3/552.7895ms，共29 passed，0fail/skip/cancel、exit0/stderr空。Page/Hook两目标strict前后0诊断，依赖诊断排除，不是全项目类型通过；其后只fixture/文档变更，业务未再变。
- 限制：实际Page/Hook与真实runGifBatch/validateGifBatch/gifParametersFromRecord纯逻辑通过VM，React/state/layout/effects/URL/API/fileToDataUrl/restore/download边界替身；压缩只mock API结果，下载只记录路径，未解码/压缩/读取/保存真实GIF或打包ZIP。静态三个节点仅HTML，实际DOM/Router/HTTP/压缩质量/完整React并发未验。Strict仅查询/补读显式重放，不宣称执行批次在任意Strict重放中保活；account/卸载取消的是本地执行观察，不撤回服务端。无全套/安全专项/视频/GPU/付费/生产/数据库/服务/委派/复核/提交部署。
- 保全/交接：1214基线/57旧档1873封存SHA保持，CSV只R66，其余97行字节保持；普通1 DONE/54 IN_PROGRESS/18 TODO，路由PILOT_SPECIFIED55/NEEDS_CARD7/NEEDS_DESIGN11/FROZEN_SCOPE25，仍97未解决。handoff留F57/F56/F55，移出F54全文在original/docs/handoff.md。下一普通R67先定预设字段/价格/档位/映射合同，25冻结停止。2.0兼容为本地显示观察/工件identity，不改执行算法/工作流/计价/正式持久化。


## repair-pilot-058 · F58 / R67

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，R67未关闭。
- 目标：预设受管理档价/分辨率/映射不在保存时丢失，合法零价与用户手填保留。

- 设计/优先级：实施前contract.md先明确默认草稿<JSON受管理字段<预设显式非undefined字段，应用预设最后仅保current apiKey/apiSecret/enabled。明确换预设不继承旧模型专属价/映射/扩展JSON；应用后手填结构字段为保存真值。“自选/空白”仍只取消preset标识而保草稿。原preset价格/内容全文未改，不代表供方现时报价或合同，也不补算历史账/R34同步。
- 字段：readManagedAdapterDraft供preset和已有profile共用，1k/2k/4k价、支持flags、三上游model/四video SKU统一读写；5s/10s仍原alias读入前两档、原canonical1k/2k写回，不另建价目真值。单upstream_model/未知扩展键保JSON，managed键先提取到字段再strip，无JSON盲并后丢失。已存profile基础unit_price原fallback和resolution defaults保持。
- 输入：0为合法显式价格，空白仍原base0/档位省略，不擅自要求全部正价或补4K价。保存非空档价须有限且>=0；Adapter Config须对象，null/array/primitive及非法JSON保稿并显示本地错误，不发API。预设解析在React updater前完成，异常不破坏当前草稿；只有本卡typed验证错误新增具体提示，原JSON语法提示保持。未知SKU类型/非法resolution沿原读取/省略策略，未创造新档位或上游SKU。
- 范围：9既有（ModelsPage+8文档）、1新增前端定向回归，archive内另存纯AST测试/样本导出工具。Page仅共同mapping/normalize preset/必要价格和对象校验/保存错误提示，全部JSX/预设值/API方法与payload字段保持。R68规则身份、R69异步完成/启停/删除/预览、发现/导入/后端/schema/计价公式/正式配置/存储/依赖/旧测试不改，不将本卡当R68/R69完成。
- 验证：原2红/511.3015ms真实Sync/Seedance表单提交base0；修后2/532.595ms。扩展21/1367.0766ms，补secret/enabled与坏预设保稿后最终23/1458.0114ms，0fail/skip/cancel、exit0/stderr空。实际form生成6个无凭证字段payload投影，真实纯计价/映射AST8通过/0.000s，stdout OK/exit0/stderr空：Sync1k/2k两张3.24/5.34，4K沿原2K fallback；Sunburst单model/Sync三映射及自定义4K消费、Seedance按条档价、合法0和per_request按Task一次保持。1目标strict前后0诊断，依赖诊断排除；JSX/旧静态fixture未受影响不重复跑旧ComfyUI组。
- 限制：VM运行实际Page表单和纯mapping/payload，React/state/effects/API为替身，API Key/Secret均固定mock，未保存真实配置。AST只8个明确纯函数，_calculate_image_billing唯一局部import移除后绑定同源码真实纯calculator，其余函数体不改，deny_import阻止app加载；无app/config/.env/PG/媒体/供方或安全专项。样本为实际mock POST的计价/映射字段投影，不是schema/HTTP/SQL或真实账单/上游有效SKU验收。未跑视频/GPU/付费/生产/全套/同步/补算/提交部署/委派复核。
- 保全/交接：1216基线/58旧档1918封存SHA保持，CSV只R67，其余97行字节保持；普通1 DONE/55 IN_PROGRESS/17 TODO，路由PILOT_SPECIFIED56/NEEDS_CARD7/NEEDS_DESIGN10/FROZEN_SCOPE25，仍97未解决。handoff留F58/F57/F56，移出F55全文在original/docs/handoff.md。下一普通R68先定ruleId/profileId归属，不擅自取消后端既有明确迁移能力；25冻结停止。2.0兼容为规范配置草稿和来源优先级，不增加第二套价格真值，不改工作流/执行/正式持久化。


## repair-pilot-059 · F59 / R68

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，R68未关闭。
- 目标：普通模型切换不复用旧ruleId迁移规则，保存前核原归属。

- 原子归属：PricingRuleEditor将draft和{ruleId,providerProfileId}身份合并，明确点规则时捕获原pair，reset同时清身份。setPricingRuleDraft只更新草稿而保身份；换不同Chat profile在一个updater清旧身份/完整旧价目并建该profile默认新增稿，同profile返回current保编辑。左侧模型与计费下拉统一走此入口，非Chat左侧模型清旧编辑并由原默认选择选有效Chat；默认updater仅空时填，不覆盖后来选择。返回A不复活101，必须明确选规则；UI在Chat模型label内说明切换开始新增、原规则不迁移。
- 保存：先核profile仍在可选Chat列表；更新再核现props同ruleId仍存在、所属profile等于编辑原profile且draft provider也相等，缺失/变化提示重选并保稿，不自动POST/迁移。明确更新仍PATCH原id，新增POST当前profile，metric/单位/单价/币种/启用与toPricingRulePayload合同保持；后端既有明确迁移能力保留，不合并/删除/回算真实规则或账单。
- 范围：9既有（ModelsPage+8文档）、1新增定向脚本。Page只rule draft/identity、profile选择/默认填、save前guard及小段产品行为说明。R67规范mapping/预设/价格/校验/profile payload全文保持；R69配置/规则save完成、删除/启停/预览/并发busy逻辑保持。后端/schema/API方法/计价/正式配置/依赖/旧测试不改，不用本卡关闭R69。
- 验证：原2红/521.2375ms分别保留“更新规则”及A价9到B；修后2/513.4813ms。最终新20/1336.4524ms通过，覆盖左侧/下拉切换、同A编辑、B有/无规则、返回A再明确编辑、取消/新建B、完整metric/单位/币种/启用重置、有效0价/币种更新、规则删除/迁移的props冲突、profile消失/非Chat、非法选择、无Chat、队列B/A原子选择、仅浏览无写入。Map逐字段模拟原API赋值，核请求method/id/profile与101/201原行保全；不是SQL事务。受影响R67精确2通过（原profile编辑往返、图像预设转Chat），完整时间/输出留run-f58-exact-2.json。共22 passed，0fail/skip/cancel、exit0/stderr空；1目标strict前后0诊断，依赖排除，不是全项目类型通过。
- 限制：实际Page/JSX事件/原payload函数通过VM，复用R67仅driver定义，不注册旧全组；React/state/effects/API和隔离Map为替身，无真实规则/配置/费用/HTTP/SQL/PG。前端props归属核对不是服务端CAS，不解决核对后其他管理员并发迁移；后端明确迁移能力未删。旧异步完成清后来稿属R69，未在本卡证明或修复。无真实供方/GPU/付费/同步/生成/视频/媒体/安全专项/全套/生产/委派/复核/提交部署。
- 保全/交接：1217基线/59旧档1963封存SHA保持，CSV只R68，其余97行字节保持；普通1 DONE/56 IN_PROGRESS/16 TODO，路由PILOT_SPECIFIED57/NEEDS_CARD7/NEEDS_DESIGN9/FROZEN_SCOPE25，仍97未解决。handoff留F59/F58/F57，移出F56全文在original/docs/handoff.md。下一普通R69另定异步实体/草稿/预览归属卡，25冻结停止。2.0兼容为规则与所属实体身份，不改工作流/执行/价格来源/正式持久化。


## repair-pilot-060 · F60 / R69

- 状态：IN_PROGRESS / review=PENDING，本地实施2026-10-24，R69未关闭。
- 目标：异步模型/规则/预览/探测批导入完成只影响原会话，不损坏新草稿。

- 操作/编辑归属：新增useModelAdminState保存commit激活账号scope，profile/rule每次打开/取消/新建独立editor，字段revision和enabled单独版本捕获ABA。保存/删除只结束原未改editor，后来同稿或B稿保留；启停只合并原editor且enabled未改，保其他字段。既有实体按id锁、新建按editor锁，重复写复用原Promise，不同实体可并行，finally只释放原token。旧失败不占新上下文，已成功但刷新失败提示刷新而不建议重发写入。
- 预览/探测：预览捕获profile/revision/参数owner，改模型/草稿/参数立即清旧结果，旧成功/error不串用新页面。发现请求捕获URL/key和输入对象，待定时换输入失效旧观察；结果每轮独立batch并保source凭证，已完成后改下轮输入不混入旧批次。批导入捕获batch、选择/分配快照及version，旧A成功/失败不写B结果/选择/同ID标记，后来同批选择/分配也不被清空。保原items构造和created/skipped匹配，R70/R71未修；结果显示source URL、不输出凭证。
- 父页面/范围：全局error经functional updater再核scope/intent，ModelsRoute返回refresh Promise并按读取sequence拒旧数据/error，queued updater再核；账号/卸载拒旧本地观察。11既有（Page、router仅ModelsRoute+useRef导入、R67测试driver兼容、8文档），新增Hook和本卡测试。R67预设/价格/规范mapping/验证/profile payload、R68原ruleId/profileId核对保持，旧测试正文不改。后台/schema/API字段/端点/计价/正式存储/其他路由/依赖保持。
- 验证：原3红/578.4031ms退出1，修后3/589.4956ms；扩展35中34通过，1因按钮fixture少“当前”未进入业务断言，校正后最终新40/2235.0329ms通过。受影响R68精确7/842.7478ms，pattern中另一旧名未匹配，补实际下拉节点1/462.75ms；R67精确2/593.8916ms，共50 passed，0 fail/cancel/skip、子进程exit0/stderr空。原始错误日志保留，不以外层wrapper退出0代替child结果。3目标strict前后同router3项TS2503/JSX，新0，Page/Hook0；依赖排除，不是全项目类型通过。
- 限制：运行实际Page/Hook/局部ModelsRoute，经VM及可控React/state/layout/effects/API、固定mock凭证/本地存储替身；非真实浏览器/HTTP/SQL/服务端取消或CAS验收。账号资料刷新/放弃render不废弃当前观察；不撤回已受理写入、不补持久化幂等或结果恢复账本。预览沿原已保存profile接口，不等于未存草稿实发；真实API/供方/导入/启停/预览/费用/媒体/GPU/付费/生产/全套/安全专项/委派/复核/提交部署均未运行。
- 保全/交接：1218基线，11既有目标/2新增，其余1207字节保持；60旧档2003封存SHA保持，CSV只R69、其他97行保持。普通1 DONE/57 IN_PROGRESS/15 TODO，PILOT_SPECIFIED58/NEEDS_CARD7/NEEDS_DESIGN8/FROZEN_SCOPE25，97未解决。handoff留F60/F59/F58，移出F57全文在original/docs/handoff.md。下一普通R70先写局部卡，R71仍TODO，25冻结STOPPED；本卡仅实施自验、review=PENDING、不关单。


## repair-pilot-061 · F61 / R70

- 状态：IN_PROGRESS / review=PENDING，2026-10-24本地实施，R70未关闭。
- 目标：规范化provider标识返回准确更新原模型行，冲突不误报已导入。

- 返回/身份：ProviderBulkImportOut保created/skipped provider_name数组及旧构造兼容，新增默认空items，逐项model_id/provider_name/status(created/already_same/conflict)。既有名称命中仍跳过，只规范化base_url及model_name都匹配才already_same，含义仅同来源/原模型身份；原价格/凭证/启用等配置不覆盖，不声称参数完全相同。其他来源/原模型或旧URL无效为conflict。R71原命名算法/全局唯一name查询未改，仍会跳过碰撞，仅明确报告而不误标成功。
- 前端：结构化结果须精确匹配本次提交raw model_id+provider_name且唯一，只有created/already_same标already_exists；未提交/未知/重复矛盾pair不猜身份。旧协议无/空items只映射本批唯一provider_name的created，skipped和规范化碰撞保持未确认。原选择版本未变才移除确认项，未确认项保选中；后来同批输入及其他batch继续受R69保护。冲突/未确认说明与原结果并列，不改UI结构或API请求字段。
- 范围/验证：12既有（Page/api结果类型/后台schema/providers bulk函数+8文档）、1新增前端定向脚本，证据内AST测试。原2红/543.935ms退出1，修后2/557.872ms；最终新16/1359.9304ms、R69导入/发现精确7/868.534ms、后台真实函数/输出schema隔离8/0.001s，共31 passed，fail/skip/cancel0、child exit0。前端/类型stderr空；后台unittest正常进度/OK在stderr，不宣称stderr空。实际后台输出5份无凭证投影喂给真实Page组合用例；含Org/Qwen、ms_前缀、same identity、跨source conflict、同批规范化collision。
- 类型/保全：2目标strict仅Page/api，api原3项TS2339 ImportMeta.env前后保持（插行偏移忽略），新增0、Page0，依赖排除，不是全项目类型通过。1220基线/12既有/1新增，其余1208字节保持；61旧档2053封存文件及manifest SHA保持，CSV仅R70，97其他行保持。R69 Hook/router/旧测试和R67/R68合同/原payload、后台新Profile字段/权限调用/加密入口/事务保持；source-scope核精确替换及边界。
- 限制/交接：VM/伪React/API和AST隔离真实函数+真实Pydantic schema，normalize/权限/加密/查询为替身、仅内存列表，不加载app/config/.env，不连接SQL/PG/供方/服务，不代表HTTP响应或事务并发验收。R71全局name去重/同源多配置碰撞仍有漏项，不自动重命名/迁移/清真实记录。普通1 DONE/58 IN_PROGRESS/14 TODO，路由PILOT_SPECIFIED59/NEEDS_CARD6/NEEDS_DESIGN8/FROZEN_SCOPE25，总97未解决；handoff留F61/F60/F59，移出F58在original/docs/handoff.md。下一普通R71先设计，不委派/独立复核/提交推送部署/GPU/付费/视频/安全专项/全套，25冻结STOPPED。R70待独立复核不关单。


## repair-pilot-062 · F62 / R71

- 状态：IN_PROGRESS / review=PENDING，2026-10-24本地实施，R71未关闭。
- 目标：渠道/raw model身份保真，默认名无slug漏项，历史配置保全与唯一竞争明确处理。

- 身份/命名：身份为现行normalize_provider_base_url输出+raw model_id，保原大小写/path，不猜渠道别名。导入先按raw model候选核规范化source并按id稳定选历史同身份，复用原provider_name；不覆盖key/secret/价格/启用，不改id/引用，不合并旧重复。新item.name_mode默认explicit保旧客户端，当前页面自动identity；服务端model_+最多28 ASCII slug+完整SHA256(JSON数组source/raw)总长<=99，完整身份参与摘要，避免截断/规范化丢失。请求hint仍回声pair，新增resolved/suggested provider标识，旧数组保实际标识。
- 冲突/竞争：自动摘要名也查占用者来源/模型，真正同身份already_same；其他身份conflict、有空闲稳定候选才建议，支持用户手填2..100 ASCII替代名。批量设能力保手填名，清空回自动，原选择版本继续保护；未新建文案不再把冲突统称已存在。逐项begin_nested+flush处理实际唯一冲突，同身份winner复用、其他身份报告，找不到同名winner的其他IntegrityError抛出；外层commit保持，不丢后续项，不自动重发或随机改名。
- 范围：12既有（Page命名/结果提示与一项输入、api批导入类型、schema输入输出、providers仅bulk及4个helper/stdlib imports、8文档）、1新增前端脚本。R67/R68合同及R69保存/删除/启停/预览/发现/Hook/父router保持，其他后台routes（含discover）AST不变；原Profile字段仅本卡provider_name来源改变，权限/加密/策略入口和外层commit保持。models.py全局唯一约束/正式存储/migrations/依赖/旧测试不改。
- 验证：原SQLite2红/0.054s、child1，两碰撞都只有1行；修后2/0.017s。最终后台16/0.090s、前端11/1424.3731ms、R70精确6/802.7747ms、R69精确3/664.6221ms，共36 passed，0fail/skip/cancel、child0/stderr空。真实ProviderProfile列AST去关系+真实bulk/helpers/schema/URL normalize，SQLite :memory:实际select/autoflush/savepoint/unique/commit，验证两碰撞各2行、重复/历史名字/原字段引用、长名/Unicode/大小写/URL边界、显式冲突建议、受控竞态实际SQL唯一失败和其他完整性异常。8份后台身份结果投影喂实际Page组合，非完整HTTP配置往返。
- 类型/保全：2目标strict仅Page/api，前后同api3项TS2339 ImportMeta.env（插行偏移忽略），新增0、Page0，依赖排除。1221基线、12既有/1新增，其余1209字节保持；62旧档2099封存文件/manifest SHA保持，CSV仅R71、其他97行保持，HEAD/分支/空index/EOL保持，diff --check0。handoff留F62/F61/F60，移出F59在original/docs/handoff.md；普通1 DONE/59 IN_PROGRESS/13 TODO，路由PILOT_SPECIFIED60/NEEDS_CARD6/NEEDS_DESIGN7/FROZEN_SCOPE25，仍97未解决。
- 限制/下一步：AST不加载app/config/.env/原库或服务；权限/加密/策略替身，真实URL normalize和SQLAlchemy/SQLite只内存，不是PG/ASGI/生产/真实线程并发验收。受控winner在savepoint前插入，证明实际唯一失败的恢复分支；不声称已证明真实PG并发时序。默认同身份确定名受现有唯一约束约束，跨不同手填名字并发不新增身份唯一约束，历史重复不清理，URL别名不猜。当前前后端需成套更新以启用自动命名，旧后端仍按hint；无部署。下一普通R72账号草稿归属，25冻结STOPPED；R71仅实施自验、review=PENDING，不关单，无委派/独立复核/真实发现导入/供方/费用/媒体/GPU/付费/全套/安全专项/提交部署。


## repair-pilot-063 · F63 / R73

- 状态：IN_PROGRESS / review=PENDING，2026-10-24起卡/25收口，R73未关闭。
- 目标：设置刷新与旧保存不覆盖后续未存字段，已确认写入与刷新失败分开。

- 字段/来源：新增useSettingsDraft局部Hook，在layout commit激活账号scope；每个叶字段独立remote基线、dirty、输入version与conflict，显式同值/ABA也推进version。新对象props只合并未编辑字段，dirty保持；同字段远端变化提示冲突，可显式加载服务器配置。三个模式提示词、开关/模型及各limit独立，Bigjpg地址/Key/启用独立；同账号资料更新/放弃render不废弃观察。敏感Key仅当前内存草稿与必要提交快照，remote始终空Key，无新增持久化/日志。
- 提交/部分结果：同步登记operation与不可变payload，重复handler复用，finally只释放原token；成功只确认本次写字段且版本未变才清dirty/回填，后续输入保留。全部恢复默认只确认limits，其他草稿和后来limit保留；局部恢复只是字段编辑。Bigjpg有效新建id保本页PATCH目标，即使刷新失败不再POST；缺id的已知成功阻止盲目重发，先加载服务器确认。profile id变更且dirty/待定阻止跨对象写Key。已保存但刷新失败明确提示，不自动重放；显式加载使用已确认回执，避免退回保存前旧值。
- 父读取/范围：SettingsRoute账号/权限scope与sequence确保最新完整读取优先，queued updater再核，失败保已加载数据并显示refreshError，初始/手动Promise拒绝被处理；账号/卸载拒旧观察。12既有（Prompt/Bigjpg面板、SettingsPage必要错误显示/捕获、router仅SettingsRoute/imports、8文档），新增Hook+定向test。ChatAgent触发源不改，原payload对象/API方法/提示词与limits默认/解析/价格/权限/后端/存储/其他routes/冻结源码/依赖/旧测试保持。
- 验证：初始6含4红2对照/543.9049ms，child1；修后6/608.7264ms，扩展26/1164.5701ms。父路由补例中一次fixture对空参数调用text返回空，实际route错误prop断言已通过；修正DOM错误节点断言后34/1193.5667ms，再补已确认回执显式加载2，最终36/1331.1613ms，fail/skip/cancel0、child0/stderr空。覆盖Chat-only/手动/同引用/同值对象、字段级clean更新/dirty冲突、所有模式/开关模型、ABA/各恢复、保存/刷新失败/去重、Bigjpg创建回执/缺id/profile变化、账号/卸载/放弃render，以及实际SettingsRoute乱序/queued updater/错误/权限读取规则。5目标strict前后同router3项TS2503 JSX，新0；初检漏useMemo导入新增1项，已补必要import，最终0新增，依赖排除非全项目通过。
- 保全/纠错：1222基线、12既有/2新增，其余1210字节保持；63旧档2149封存文件及manifest SHA保持，CSV仅R73、其余97行保持，R72冻结行及UsersPage SHA不动。F62“下一R72”误指已在本卡纠正：本轮起始只读后核CSV停止，无R72代码修改/测试/新卡，不继续展开冻结证据。普通1 DONE/60 IN_PROGRESS/12 TODO，路由PILOT_SPECIFIED61/NEEDS_CARD6/NEEDS_DESIGN6/FROZEN_SCOPE25，97未解决。handoff保F63/F62/F61，移出F60在original/docs/handoff.md；下一普通R74以当前CSV非冻结TODO为准，不机械按编号递增。
- 限制：VM执行实际SettingsPage/三子面板/Hook及局部SettingsRoute，React/state/layout/effects/API/storage为可控替身，无真实React浏览器/HTTP/SQL/服务/费用/供方或CAS验收。tab切换卸载仍原行为，不加敏感草稿持久化；停止本地观察不撤回已受理写入，无跨刷新/多标签持久幂等。原Chat开关合同不改，API价目/权限/服务端存储不改；无真实润色/超分/生成/媒体/视频/GPU/付费/安全专项/全套/生产/委派/独立复核/提交部署。R73仅实施自验，review=PENDING，不关单，25冻结STOPPED。


## repair-pilot-064 · F64 / R74

- 状态：IN_PROGRESS / review=PENDING，2026-10-25本地实施，R74未关闭。
- 目标：助手管理旧完成不清新稿，文件内容只回对应Skill/路径。

- 编辑/操作：新增useAgentEditSessions账号scope和useAgentEditor，layout commit激活，打开/取消/新建独立editor对象，显式同值/ABA推进revision。捕获原目标/不可变payload/版本，成功仅清原未改会话，否则保新稿并提示原提交已完成；Override删除仅结束当前仍原会话和版本的原id。锁按release/override id、Skill key或新增editor对象，安装维持单操作锁；不同实体可并行，finally只释放原token。错误回写及其queued updater核账号和全局用户意图，旧操作不占兄弟面板反馈。
- 预览/读取：每次文件选择有skillKey/path/owner，新选先清旧正文，旧成功/error/loading及同路径ABA、收起/换Skill/账号/卸载只回原owner；来源路径可见。策略defaults和Override本地列表有read ticket，列表setter调用前和updater应用时均校验，卸载后不调用setter。缺失已编辑策略保稿提示，不自动清成新增；默认tools只填未明确编辑的默认选择，清空不被无关props回填。父AgentsRoute返回Promise，按账号/读取sequence接受最新完整读，旧data/error updater拒绝，初始异常被处理。已写成功但刷新失败明确说明，不自动重放。
- 范围/冻结：11既有（AgentOpsPage、OverridePanel、router仅AgentsRoute、8文档）、新增Hook+定向Node脚本；证据内真实React静态页/build/runner。原release/default/meta helpers、API字段/方法/目标及启停/删除确认合同保持；后端/权限/价目/安装器/存储/依赖/旧测试/其他route不改。R75原install source+key+overwrite payload、needs_selection候选写入分支和候选JSX保持，不做候选来源绑定/失效或专项；观测子面板用原raw error callback且实现不改，R76另卡。
- 验证：原12为6红6控制/734.3155ms、child1；修后12/771.5276ms，扩展30/1412.9662ms、38/1656.0928ms。补Override待定GET卸载精确1红，确认仍有2次setter调用，补调用前guard后最终VM39/1716.6529ms通过。原12真实React/ReactDOM在既有缓存Chromium149.0.7827.55的file页复测12通过，页面错误0、非file请求0；最终runner6.3765481s，source/HTML SHA与最终业务一致。共51执行含重叠12，不冒称51独立场景；最终child0、fail/skip/cancel0/stderr空。4目标strict前后router同3项TS2503 JSX，新0，依赖排除。
- 环境/保全：Edge/Chrome直接dump-dom未给DOM，Edge记录VBS模块错误，未当React通过；未变更OS安全设置，核无本卡遗留进程后改既有Playwright缓存浏览器，无下载/项目服务。CSP connect-src none，所有API/Auth/观测子面板替身，拦截非file请求，后台联网/GPU禁用，浏览器finally关闭，临时profile仅本卡所有且路径校验后清理。1224基线、11既有/2新增，其余1213字节保持；64旧档2196封存文件/manifest SHA保持，CSV仅R74、其他97行含R75冻结行保持，HEAD/分支/空index/EOL保持，diff --check0。
- 状态/限制：普通1 DONE/61 IN_PROGRESS/11 TODO，路由PILOT_SPECIFIED62/NEEDS_CARD6/NEEDS_DESIGN5/FROZEN_SCOPE25，97未解决。handoff留F64/F63/F62，移出F61在original/docs/handoff.md；下一非冻结TODO为R76，R75继续冻结。VM父route/列表/扩展时序不冒称真实React全场景；真实DOM仅原12，API与数据仍mock，不是HTTP/SQL/权限/安装器/包内容/供方或发布验收。停止本地观察不撤回已受理写入，不新增跨刷新/多标签持久幂等或自动重试未知结果；元数据仍原新建合同，不自动把后续输入改为更新已建记录。无真实安装/克隆/下载/脚本/策略发布/服务/费用/媒体/GPU/付费/视频/安全专项/全套/生产/委派/独立复核/提交推送部署。R74仅实施自验、review=PENDING不关单，25冻结STOPPED。


## repair-pilot-065 · F65 / R76

- 状态：IN_PROGRESS / review=PENDING，2026-10-25本地实施，R76未关闭。
- 目标：观测会话与消息/trace来源一致，旧读不冒充新会话。

- 身份/数据：复用F64账号scope/read ticket且不改Hook，选中建立独立view，含conversationId、当时title/user、成对messages/traces、loading/error。每次查看含同id重选都产生新view/代次，先清旧数组并显示本次loading；成功只应用当前view+ticket+账号，消息/trace同一Promise.all成对接受，失败保本次空详情，不将A标B；旧fail/finally不清新内容/loading。
- 列表/错误：初始conversations/overview traces与已选详情分开，初始迟到/重放不覆盖详情；effect仅账号scope，不因error callback引用重发。错误迁为观测本地/本次view，不写主策略编辑反馈；选择推进共享用户意图。标题/用户显示选择时来源，账号/卸载拒旧观察，资料更新及放弃render不误作换账号。Main只把原raw error callback接线改为已有owner，其他R74/冻结R75行为不变。
- 范围/验证：10既有（观测Panel、Main一处owner接线、8文档）、1新增Node定向脚本，证据内真实React静态页。原4为3红1控制/594.7763ms、child1，修后4/586.2457ms；第一次代码替换边界误取effect cleanup return导致语法失败4例，收紧为组件JSX return后消除并保日志。扩展VM18/1241.2489ms、真实React/ReactDOM6在既有Chromium149.0.7827.55 file页复测通过，runner0.9042176s；全部最终child0、fail/skip/cancel0/stderr空，page errors/非file请求0。真实6与VM重叠，共24执行非24独立新例。
- 覆盖/类型：逆序/等待/失败/串行、A/B/A和同id重选、消息/trace单独失败与部分未暴露、旧错误/finally、标题/用户/GET参数、overview隔离/初始effect重放、callback引用不重查、初始失败与其他反馈、账号/旧初始晚到、资料/放弃render/卸载。2目标strict仅Panel/Main，前后0诊断，新0，依赖排除；不是全项目类型或后端授权验收。真实React6覆盖原4、ABA、成对加载，其他扩展为VM；API/Auth/Override替身，Main/观测/原scope Hook真实。
- 保全/限制：1226基线、10既有/1新增，其余1216字节保持；65旧档2259封存文件及manifest SHA保持，CSV仅R76、其余97行含25冻结行不动，HEAD/分支/空index/EOL保持，diff --check0。原GET methods/params/limits及日期/列表和消息trace渲染保持，Main其余字节、Hook/router/后端/API权限/依赖/旧测试不动；真实React source/HTML SHA匹配最终代码。handoff留F65/F64/F63，移出F62在original/docs/handoff.md。普通1 DONE/62 IN_PROGRESS/10 TODO，路由PILOT_SPECIFIED63/NEEDS_CARD5/NEEDS_DESIGN5/FROZEN_SCOPE25，仍97未解决；下一非冻结TODO为R77。
- 边界：CSP拒连接、非file拦截、后台联网/GPU禁用，浏览器finally关闭，无下载/项目服务。没有真实设计师内容/观测API/HTTP/SQL/审计或权限测试，不新增内容持久化，也不修服务端数据；停止旧本地观察不取消服务端读。初始列表错误仍需页面重新加载/挂载重试，未扩展新刷新功能。无真实安装/发布/包/服务/费用/媒体/视频/GPU/付费/安全专项/全套/生产/委派/独立复核/提交推送部署。R76仅实施自验、review=PENDING不关单，25冻结STOPPED。


## repair-pilot-066 · F66 / R77

- 状态：IN_PROGRESS / review=PENDING，2026-10-25本地实施，R77未关闭。
- 目标：三统计入口只接受当前查询，数据来源与日期/CSV一致。

- 查询/来源：新增局部useWindowQuery，layout commit激活账号scope；每次显式窗口/日期操作建立新query，即使同值/ABA也失效旧回调。读取绑定query+sequence，Promise.all完整接受数据、params和updatedAt；旧成功/error/finally不清当前data/error/loading。失败保留最后成功数据并说明真实来源，初次失败可重试。账号/卸载拒旧观察，同账号资料更新不重查；StrictMode effect重放不重复初始GET。
- 看板/显示：Generation建议标题跟随数据窗口；Chat告警仍独立近1小时open/20查询，不冒充days筛选。Dashboard选择/日期输入保持当前意图，统计日期、分组自定义/跟随标签与CSV使用成功snapshot来源；等待/失败期间可见旧结果但不换成新窗口标签。自定义分组日期独立于看板days，显式跟随恢复原日期helper；GET方法/limits、统计/聚类/计费/告警算法及R82已有日期实现不改。
- 操作/限制：补录1000、重算与告警仅mock；pending按操作key同步登记，重复触发复用Promise，不重放mutation。完成读取执行时当前params而非旧days闭包；消息/error须原query及action代次，busy仅释放原token；换账号/卸载不触发旧操作后续读取。动作已成功但读取失败由当前查询错误提示，保成功来源。无服务端取消/幂等/未知受理治理，不声称真实维护或告警效果验收。
- 测试：首次测试入口相对路径多一级导致构建失败，修正fixture后原10实际DOM场景为7红3控制，另隔离检查因原Dashboard未捕获reject而红，合计11中8红3绿/1198.8514ms，child1，日志保留。修后原10+隔离11/1178.7237ms通过，扩展54实际React/DOM场景+1隔离=55/1493.625ms全部通过，child0、fail/skip/cancel0、stderr空。覆盖三页逆序/旧失败/finally、串行、ABA/同值、commit前意图失效、整批部分成功/每一成员失败、重试/同窗并发刷新、账号/资料/StrictMode/卸载，看板自选日期和CSV待定/失败来源，补录/重算/评估迟到/旧失败/去重/账号卸载、建议标题和近1小时告警合同。
- 环境/类型：本机已有React/ReactDOM19及缓存Chromium149.0.7827.55静态file页；实际两Page+DashboardPage+AST完整DashboardRoute/date helper+新Hook，API/Auth/AppShell替身。CSP connect-src none、非file拦截、后台联网/GPU禁用，浏览器finally关闭；无下载/项目server。54场景全实际DOM，另1检查非file请求/页面错误/未捕获Promise均0；不是HTTP/SQL/权限/服务统计计算验收。5目标strict前后同5旧诊断（Dashboard原UserGroupSummary索引/隐式any2、router原JSX3），新增0，不借本卡修复旧类型或声称全项目通过。
- 保全/状态：1227基线、12既有/2新增，其余1215字节保持；66旧档2311封存文件及manifest SHA保持，CSV仅R77、其他97行含25冻结行不动；HEAD/原分支/空index/EOL保持，diff --check0。router除DashboardRoute/必要import外字节保持，Dashboard纯展示/费用helper、API/date/guide/后端/依赖/旧测试不动。handoff留F66/F65/F64，移出F63在original/docs/handoff.md。普通1 DONE/63 IN_PROGRESS/9 TODO，路由PILOT_SPECIFIED64/NEEDS_CARD4/NEEDS_DESIGN5/FROZEN_SCOPE25，97仍未解决；下一非冻结TODO R78，须先定三页有界实施卡，不自动展开冻结。
- 边界：无真实私有数据/统计服务/补录重算/告警评估/CSV下载/生产/费用/媒体/视频/GPU/付费/安全专项/全套/委派/独立复核/提交推送部署。R77仅实施自验，review=PENDING不关单；25冻结STOPPED。用户对R18的CNY/上海自然月确认已在F25/F26实现，本卡不重复旧检查或改额度。


## repair-pilot-067 · F67 / R78a 公告

- 状态：R78整体IN_PROGRESS / review=PENDING，仅公告本地实施，模板/工具未完成。
- 目标：公告旧完成/刷新不覆盖新编辑会话。

- 编辑/远端：新增局部useContentEditor，账号layout commit激活scope；选择/新建含同id重选换独立editor。每字段输入推进版本/dirty，同值/ABA也计版本；同内容新引用及无关新增不清稿，刷新只合并未编辑字段，同字段远端变化提示并保本地稿，可显式加载服务器版本。原条目缺失仍保草稿和原id并阻止写入，不退成POST；初始GET晚到不覆盖用户已经输入的新稿。旧render的字段/提交handler拒跨新editor。
- 完成/冲突：捕获原id、编辑器、提交值/字段版本及远端baseline；成功仅确认本会话未改字段，期间输入保留；请求等待时的服务器新值也不被旧receipt覆盖。删除仅清原未改editor；期间同A输入保留并标已删除，跨B/新建/ABA不清稿。新建有效id保PATCH目标，坏id/错归属回执标待确认并阻止盲目重写；已保存/删除但列表刷新失败明确区分，不自动重放写入，不新增服务端CAS/幂等或未知受理重试机制。
- 操作/父读取：同实体save/delete同步互斥，pending复用，A与B独立，finally只释放原token；忙标签分保存/删除，错误仅原会话和用户意图，局部不覆盖B。新建回执由临时editor转有效id时仍按原editor/新id查找pending锁，等待列表刷新期间不漏锁或并发重写。父AnnouncementsRoute复用原F66 useWindowQuery（Hook未改）提供latest GET/账号/卸载保护及读取错误，Page保本地操作反馈。稳定删除切换新建后的操作成功/刷新失败通知仍有明确归属，新用户输入后不占新稿。
- 范围：10既有（AnnouncementsPage、router仅AnnouncementsRoute、8文档），新增useContentEditor和定向Node脚本，证据内实际React静态页。保原公告时间转换/24小时默认窗/status、校验/确认文案及POST/PATCH/DELETE参数和权限；模板/工具/上传/其他routes/后端/依赖/旧测试不改。R78只是公告子步，模板R78b/工具R78c仍待实施，R79另卡，冻结停止。
- 验证：原公告5实际DOM场景为3红2控制、另隔离1绿，合6中3红3绿/1095.1875ms，child1；修后原5+隔离6/1103.3074ms通过，扩展32场景+隔离33/1250.4479ms通过，补稳定删除刷新失败及busy标签后34/1244.8125ms通过；再补新建回执身份转换的pending锁，最终34实际DOM+1隔离35/1323.186ms通过。最终child0、fail/skip/cancel0、stderr空；页面错误/非file请求/未捕获Promise0。3目标strict前后同3个旧router JSX TS2503、新0，final runner9.0853528s；不是全项目类型或HTTP/SQL/真实公告验收。
- 覆盖/环境：保存/删除跨B和稳定A、clone保稿，同A后续输入/ABA/重选/新建、字段合并/冲突恢复/远端更新与删除/旧receipt、初始晚到、已建id和刷新失败、坏回执、当前/旧错误、实体锁/忙状态、手动刷新/验证/取消、StrictMode/资料/账号/卸载、父GET逆序与失败。实际Page/新Hook/完整AST AnnouncementsRoute与F66 Hook配本机已有React/ReactDOM19及缓存Chromium149.0.7827.55，API/Auth/AppShell/confirm替身，静态file/CSP禁连接/非file拦截/后台网络GPU禁用，finally关闭浏览器；无下载或项目server。
- 保全/状态：1229基线、10既有/2新增，其余1219字节保持；67旧档2360封存文件及manifest SHA保持。CSV仅R78、其他97行含25冻结行不动，HEAD/原分支/空index/EOL保持，diff --check0。handoff留F67/F66/F65，移出F64在original/docs/handoff.md。普通1 DONE/64 IN_PROGRESS/8 TODO，路由PILOT_SPECIFIED65/NEEDS_CARD3/NEEDS_DESIGN5/FROZEN_SCOPE25，97仍未解决；下一实施R78b，共享模板及工具尚未完成，首个未起卡TODO R79不越序启动。
- 边界：无真实公告发布/删除/列表服务、生产/私有数据、费用/媒体/视频/GPU/付费/安全专项/全套/委派/独立复核/提交推送部署。R78实施部分自验review=PENDING，整体不关单，25冻结STOPPED。R18 CNY/上海自然月合同沿用F25/F26，不重做。


## repair-pilot-068 · F68 / R78b 共享模板

- 状态：R78整体IN_PROGRESS / review=PENDING，公告/模板本地实施，工具未完成。

- 模板/会话：复用F67 useContentEditor（仅参数化内容名称，缺省公告不变）；选择/新建/同id重选建立独立editor，普通字段显式setField含同值/ABA版本。旧保存/删除与error/finally只归原entity/editor/版本，不清B或期间同A新输入；save/delete同实体互斥，A/B独立，创建临时身份转有效id仍保pending锁。已成功但刷新失败明确提示，不自动重放写入。
- 远端/回执：同内容列表clone、无关新增不清稿，未编辑字段跟随服务器；冲突保稿并显式加载服务器版本，等待期间的服务器变化不被旧receipt覆盖。原条目缺失保稿/id且阻止误POST；初始列表晚到不覆盖已输入的新稿。有效创建receipt保后续PATCH身份，坏id/错归属待确认阻止盲写；原GET/POST/PATCH/DELETE方法、payload全部字段trim/默认/校验/确认合同保持。
- 父读取/上传边界：PromptTemplatesRoute复用F66 useWindowQuery，latest GET及账号/卸载拒旧回写，查询错误和上传原反馈分通道；共享Hook无新逻辑，原公告缺省行为有定向回归。模板分类/搜索/展开/媒体筛选/统计与展示helper、上传/FileReader/API/busy函数体保持；仅必要setDraft适配将原upload/clear回写接入字段模型，普通表单改显式setField。该接线可拒绝旧editor字段写，但同字段版本/清空/新选择、工件恢复与upload错误/busy仍未做R79专项，不称R79已修。
- 测试：原模板6场景3红3控制，另隔离1绿，合7中3红4绿/1173.6819ms、child1；修后7/1204.6314ms passed。扩展首次40中39通过，唯一失败是派生fixture把label-1误写成title-1，实际已选label-1；修正预期后最终模板39实际DOM场景+1隔离40/1460.563ms passed。内容名称参数影响公告，在本卡复制原F67实际DOM回归而不运行旧封存写入脚本，公告34实际场景+1隔离35/1268.317ms passed。最终共75执行，child0、fail/skip/cancel0、stderr空；两页组页面错误/非file请求/未捕获Promise0。
- 覆盖/类型：模板原6、同A后续输入/ABA/重选、新建/缺失/远端字段冲突与恢复/旧receipt、创建id及刷新失败/坏回执/身份转换pending锁、实体互斥/当前旧错误、初始GET/父GET逆序失败/账号卸载、StrictMode/资料、10文本字段dirty、trim默认、必填、搜索隐藏仍保原目标、热门/媒体元数据合同。仅离线元数据枚举无真实视频。3目标strict只Page/Hook/router，与原3旧JSX比较新增0，不称全项目通过；API/后端/权限/真实HTTP/SQL/模板发布未验收。
- 范围/保全：11既有（PromptTemplatesPage、router仅PromptTemplatesRoute、useContentEditor仅名称参数、8文档），新增一个Node测试；1231基线其余1220字节保持。68旧档2410封存文件及manifest SHA保持，CSV仅R78、其他97行含25冻结行不动，HEAD/原分支/空index/EOL保持，diff --check0。API/公告Page/工具/旧测试/后端/依赖/存储/消费者不改；两个真实React构建source/HTML SHA与最终代码一致。handoff留F68/F67/F66，移出F65在original/docs/handoff.md。
- 状态/边界：普通1 DONE/64 IN_PROGRESS/8 TODO，路由PILOT_SPECIFIED65/NEEDS_CARD3/NEEDS_DESIGN5/FROZEN_SCOPE25，总97未解决。R78公告+模板仅本地实施自验，工具R78c未实施，整体review=PENDING不关单；下一R78c，首个未起卡TODO R79不提前执行。静态file页CSP禁联网/非file拦截/后台网络GPU禁用、finally关闭已有缓存浏览器，无项目server/下载/真实模板服务或发布删除上传/私有数据/生产/费用/媒体/视频GPU付费/安全专项/全套/委派/独立复核/提交推送部署，25冻结STOPPED。


## repair-pilot-069 · F69 / R78c 工具

- 状态：R78三页本地实施自验齐备，整体IN_PROGRESS / review=PENDING，不关单。

- 编辑/完成：工具复用F67/F68 useContentEditor（传内容名称工具，Hook未改）；按账号、显式选择/新建/同id重选editor、字段版本及remote baseline隔离。旧保存/删除/error/finally不影响B/新建/ABA/同A后续输入；save/delete同实体互斥、A/B独立，创建临时editor转有效id仍保原pending锁。有效新建id保PATCH，坏id/错归属待确认不盲写；成功只确认原未改字段，已完成但列表刷新失败明确区分，不自动重放变更。
- 远端/父读：同内容clone/无关新增不清dirty，未编辑字段合并服务器值；同字段冲突保稿可显式加载服务器版本，等待期间的远端新值不被旧receipt覆盖。原条目缺失保id/稿且阻止误POST，删除期间同A新输入保留并标缺失，初始列表晚到不替换已输入新稿。AiToolsAdminRoute复用F66 useWindowQuery（Hook未改）提供latest GET/账号/卸载保护，查询错误与原上传反馈分通道。
- 范围/原合同：10既有（AiToolsAdminPage、router仅AiToolsAdminRoute、8文档），新增一个Node定向脚本。八字段payload/trim/Number||0、名称必填、http/https前缀、删除确认、默认https://与旗标/排序、分类/时间/列表展示保持。两Hook、公告/模板/导航消费页、API/后端/权限/存储/依赖/旧测试不改。封面upload/FileReader/API/busy函数体保持，仅必要setDraft适配接字段模型，普通输入显式setField；不处理R79同字段token/清空/重选/恢复/error/busy，不称上传专项通过。
- 验证：原工具5实际DOM场景3红2控制，另隔离1绿，合6中3红3绿/1080.5943ms、child1；修后原5+隔离6/1094.5914ms通过，最终37实际React/DOM+1隔离38/1293.473ms passed。最终child0、fail/skip/cancel0、stderr空，页面错误/非file请求/未捕获Promise0。覆盖原5、同A后续输入/ABA/重选、新建/缺失/远端冲突恢复与旧receipt、初始GET/父GET逆序失败、已建id/坏回执/刷新失败/身份转换锁、实体互斥/错误/忙状态、账号卸载/StrictMode/资料、标量/旗标/排序/trim及原名称URL校验。原URL仅前缀合同，不扩展安全专项。
- 环境/类型：实际Page/完整AST AiToolsAdminRoute/两个真实Hook，本机已有React/ReactDOM19及缓存Chromium149.0.7827.55静态file页，API/Auth/AppShell/confirm替身；CSP禁连接、非file拦截、后台网络/GPU禁用，finally关闭浏览器，无下载/项目server。2目标strict仅Page/router，前后同3旧router JSX TS2503、新0，不是全项目类型或HTTP/SQL/权限/真实工具发布删除验收。
- 保全/状态：1232基线、10既有/1新增，其余1222字节保持；69旧档2468封存文件及manifest SHA保持，CSV仅R78、其他97行含25冻结行不动；HEAD/原分支/空index/EOL保持、diff --check0。handoff留F69/F68/F67，移出F66在original/docs/handoff.md。普通1 DONE/64 IN_PROGRESS/8 TODO，路由PILOT_SPECIFIED65/NEEDS_CARD3/NEEDS_DESIGN5/FROZEN_SCOPE25，97仍未解决。R78公告F67/模板F68/工具F69三页本地实施自验齐备，整体review=PENDING不关单；下一普通R79先定卡，25冻结STOPPED。
- 边界：无真实工具/公告/模板服务或发布删除上传、索引/存储操作、生产/私有数据、费用/媒体/视频/GPU/付费、安全专项/全套、委派/独立复核、提交推送部署。停止本地观察不撤回已受理写入，未新增服务器CAS/持久幂等/未知受理自动重试。


## repair-pilot-070 · F70 / R79 三字段图片上传归属

- 状态：IN_PROGRESS / review=PENDING，本地实施自验，不关单。

- 归属/字段：新增useContentUploads；ContentEditor只追加isCurrentEditor/captureField，原R78算法不改。每次文件选择捕获账号、实体id、独立editor、字段值/version及remote baseline，并立即替代该字段旧job；同文件名也新token。清空即使初始空也推进字段版本，可清空待定/失败字段；切B/新建/同id重选/账号/卸载/服务器该字段变化拒旧自动回写。无关输入和同内容刷新不取消本字段。
- 读取/反馈：FileReader完成后核ticket/token再发uploadReferenceImage，失效读不启动服务端上传；已发出请求不承诺撤回。有效非空storage_path才应用，success/error/busy/finally按原field job，不用父全局error或单一uploading布尔。模板两字段并发，当前字段可重新选择；保存按钮及真实submit handler均拒当前有效待定上传，作废旧请求不挡新稿。文件input在await前清空，drop同管线，拖拽状态绑定editor且异步完成不清新拖拽。
- 迟到/恢复：同账号本页内存保留成功未应用工件的原id、名称、字段、文件名、路径；不存File/data URL或跨账号持久化。仅原非空id条目或原null-id editor可恢复，确认替换后再核来源和新字段ticket，换B/另一个新建稿不可应用。恢复本身推进字段版本，使后来待定job自动失效并保其成功来源；缺失原条目不能恢复，离开原新建稿只能保来源记录，不猜null-id等于新建B。无自动媒体删除/回收或服务端写入。
- 原场景/挑战：当前R78必要setter已局部挡跨B，原6控制全通过，未回退源码或伪造原6红例。初始15实际场景中6控制通过、9新增挑战红（清空复活/旧A失败解除B busy/逆序文件覆盖），另隔离1绿，合16中7绿9红/1145.3956ms、child1。修后16/1155.728ms通过。扩展70中69通过，1例揭示失败且空字段无清空入口；增加clearable/hasSelection后70/1541.2974ms通过，再补慢读清空/远端删除/恢复替代待定/原新稿恢复，最终80实际DOM+1隔离81/1654.4902ms通过。
- 回归/类型：ContentEditor追加API及两Page/父route接线影响R78，在本卡复制原F67/F68/F69 entries字节不动、使用实际当前代码/mock父route，公告34+隔离1=35/1328.3028ms，模板39+隔离1=40/1575.197ms，工具37+隔离1=38/1360.7154ms。共194最终执行（新上传81+受影响旧回归113，非194全新场景），child0、fail/skip/cancel0、stderr空，四组页面错误/非file请求/未捕获Promise0。5目标strict前后同3旧router JSX TS2503，新0，final runner9.2925879s；非全项目类型/HTTP/SQL/权限/媒体解码或真实上传验收。
- 范围/保全：12既有（两Page、ContentEditor追加API、router只模板/工具route上传反馈移除、8文档），新增useContentUploads及Node定向脚本。1233基线其余1221字节保持，70旧档2519封存文件和manifest SHA保持，CSV仅R79/其余97行含25冻结行保持；HEAD/原分支/空index/EOL保持、diff --check0。原CRUD handlers只加当前upload submit guard，payload/trim/默认/校验/确认、分类/搜索/统计、API/文件限额/query Hook/公告Page/消费者/后端/依赖/旧测试不改；四组真实Reactsource/HTML SHA与最终代码一致。handoff留F70/F69/F68，移出F67在original/docs/handoff.md。
- 环境/限制：本机已有React/ReactDOM19、esbuild/缓存Chromium149.0.7827.55静态file，合成File/FileReader给固定data URL，所有API/Auth/AppShell/tabs/confirm替身，CSP禁connect和图片读取，非file请求拦截、后台网络/GPU禁用、finally关闭浏览器，无下载/项目server。保服务端上传请求合同及媒体保留策略，不新增CAS/持久幂等/跨页恢复/未知受理自动重试；关闭本页丢弃内存恢复记录，不撤回服务端已受理上传。无真实上传/发布删除/服务/存储索引操作/生产私有数据/媒体视频/GPU付费/安全专项/全套/委派/独立复核/提交推送部署。
- 状态：普通1 DONE/65 IN_PROGRESS/7 TODO，路由PILOT_SPECIFIED66/NEEDS_CARD2/NEEDS_DESIGN5/FROZEN_SCOPE25，总98、97未解决。R79仅本地实施自验、review=PENDING不关单；R78仍待复核不关单。下一普通R80先写有界查询卡，25冻结STOPPED。


## repair-pilot-071 · F71 / R80 使用日志查询归属

- 状态：IN_PROGRESS / review=PENDING，本地实施自验，不关单。

- 查询/账号：UsageLogsPage复用原useWindowQuery（Hook未改），每次应用/重置/页大小/页码/刷新建立完整params及新revision，含同值/ABA。数据/total/费用/page/更新时间/error/loading只归当前完整结果，旧成功/错误/finally不清新数据或busy。账号id/name/guest变更按key重建本页草稿与query，旧读拒绝；同账号资料更新和StrictMode保持当前读取，不重复初始GET。
- 来源/草稿：最后成功data+source保留，记录/费用/页码/每页大小/日期及有效筛选标签一致；等待时另示当前查询，失败说明保留来源，不让A记录费用贴B标签。草稿不自动查询或改已加载来源。刷新仅更新草稿及已应用endAt，保其他未应用字段；原默认本地7天/时间转换/trim/缺省/汇总开关/分币格式/权限合同保持。单条记录渲染和过滤控件字节保持。
- 分页/clamp：实际显示和页段用响应page/page_size；选择控件仍所选pageSize。响应clamp只接受为数据，不setPage或触发effect第二次GET；后续显式refresh/导航从本轮接受page出发，旧clamp不能重启旧查询。分页只有当前成功结果可用，等待/失败保旧数据时不让旧页按钮换新筛选页；本页revision ref也拒同commit内旧Next覆盖新筛选page1。显式同参数查询产生新代次，未commit的连续刷新意图可合并，已启动同条件请求最新优先。
- 验证：原4实际DOM场景3红1控制，另隔离1绿，合5中3红2绿/1019.0132ms、child1；修后5/987.377ms通过。扩展32中31通过，1例错误假定同commit两次刷新一定发2个GET；实际合并为1个新GET，修正fixture为已启动的同条件Query重叠，并补合并控制，不改业务绕过断言。最终32实际DOM+1隔离33/1223.1196ms passed，child0、fail/skip/cancel0、stderr空，页面错误/非file请求/未捕获Promise0。
- 覆盖/类型：原4、ABA/同值、草稿未应用/失败来源/重试、分组/模型/Provider/日期/能力/记录类型/状态/任务汇总、trim/空值API映射、页大小/前后页/重置、当前及旧clamp/实际响应页大小/同commit分页、重叠及合并刷新/endAt与草稿、更新时间、分币/空结果、账号/资料/StrictMode/卸载。单目标Page strict修后与原均0诊断，runner1.1081784s，随后无业务源变化；不是全项目类型/HTTP/SQL/真实账过滤验收。
- 范围/保全：9既有（UsageLogsPage及8文档），新增一个Node脚本；1235基线其余1226字节保持，71旧档2590封存文件及manifest SHA保持，CSV仅R80、其他97行含25冻结行不动；HEAD/原分支/空index/EOL保持、diff --check0。API/query Hook/router/Auth/日期helper/其他Page/后端账本/依赖/旧测试不改，原pure helper/过滤控件/记录渲染/API对象映射字节保持。handoff留F71/F70/F69，移出F68在original/docs/handoff.md。
- 环境/限制：实际Page/原query Hook，已有React/ReactDOM19/esbuild/缓存Chromium149.0.7827.55静态file，合成时钟/usageLogs/Auth替身；CSP禁联网/图片、非file拦截、后台网络GPU禁用、finally关闭浏览器，无下载/项目server。不运行真实业务账/数据库/服务/导出/费用变更/媒体视频/GPU付费/生产私有数据/冻结安全专项/全套/委派/独立复核/提交推送部署。默认日期算法和账本/后端过滤未扩展或重做。
- 状态：普通1 DONE/66 IN_PROGRESS/6 TODO，路由PILOT_SPECIFIED67/NEEDS_CARD1/NEEDS_DESIGN5/FROZEN_SCOPE25，总98、97未解决。R80仅本地实施自验、review=PENDING不关单；下一普通R81先保护原反馈UI/CSS并写有界卡，25冻结STOPPED。


## repair-pilot-072 · F72 / R81 管理回复版本保全

- 状态：IN_PROGRESS / review=PENDING，本地实施自验，不关单。

- 回复/草稿：FeedbackOpsPage复用原useContentEditor（Hook未改），按账号/反馈id/editor及字段版本捕获status/body，成功只清原未改文本，期间新B与ABA保留；后续沟通状态独立保留。请求仍只含原status和trim后的admin_reply，不额外持久化或记录回复内容。上一条失败明确归原发送，当前输入保留且不冒称已发送/失败；有效回执才确认，错id提示身份待确认并阻止盲目重发。原缺失反馈保稿不自动降为首条B，显式切换才换目标；点击已经选中反馈保原未发送稿，不扩大成重置行为。
- 互斥/改进：保持列表busy禁切换、文本和状态仍可编辑；同步manualOperation锁防同commit双提交/改进插入/列表切换绕过，finally仅原operation释放。改进状态独立API，自己的version/dirty/remote baseline确认，保存改进不调用清回复逻辑；期间新选择及服务器变化保留，未改字段跟随新远端，回执错id不确认。切栏目隐藏/恢复或清空重写不重放回复，账号key重建Page，旧账户/卸载成功失败不写新view或refresh。
- 刷新/部分成功：AdminFeedbackRoute复用原useWindowQuery（未改），latest/account/unmount保护列表，query错误明确标人工反馈刷新失败，onRefresh保Promise。Page手动刷新拒绝被处理，子面板回调仅在父接线加拒绝处理并memo保引用稳定，不让手工输入重建兄弟回调，不改Skill/凭证模块。回复已成功但读失败保已发送提示和当前新稿，不自动重发，后置读待定时实际submit仍互斥；直接回调reject也有操作已完成但列表刷新失败提示。CSS/布局/时间/消息附件渲染/权限及沟通合同保持。
- 原内容/范围：10既有（FeedbackOpsPage、router仅AdminFeedbackRoute、8文档），新增一个Node脚本；原未提交Page和CSS先完整快照，代码按original精确替换，不回退HEAD。CSS只读SHA cea0362eb5a193497801286982fdea314acf15ea09752c359f40f4513b668715逐字节保持；两共享Hook、API/后端、SkillFeedbackPanel/FeedbackCredentials/R61用户反馈页/依赖/旧测试不改。原ReplyDraft/默认状态、消息时间/附件渲染、计数/过滤/排序/原UI结构保留，只改必要状态/事件接线和局部结果提示。
- 验证：原3实际DOM场景1红2控制，另隔离1绿，合4中1红3绿/1097.0209ms、child1；修后4/1114.7737ms通过，扩展30/1435.6446ms通过；补改进错id与后置读待定互斥后31/1480.4116ms通过；补点击已选行保原稿控制后32/1475.9032ms通过；再保兄弟子面板回调引用并补控制，最终32实际DOM+1隔离33/1558.0372ms passed。最终child0、fail/skip/cancel0、stderr空，页面错误/非file请求/未捕获Promise0。2目标strict前后同3旧router JSX TS2503、新0，final runner9.3913146s；非全项目类型或真实通知/服务端消息合同验收。
- 覆盖/环境：原3、同A版本/ABA、新沟通及改进状态、同反馈clone/消息更新、已选行保持、改进单独保存/新选择/远端冲突/错回执、双发及跨操作互斥/同commit选行、栏目/取消输入、失败及直接/父读部分成功、人工及子面板刷新、反馈缺失/空输入、资料/StrictMode/账号/卸载、父GET逆序/初始失败重试。实际Page及原CSS、完整AdminFeedbackRoute AST、原content/query Hook，API/Auth/AppShell/Skill/凭证替身；改进labels由实际Skill常量提取，非真实Skill/凭证功能验收。已有React/ReactDOM19/esbuild/缓存Chromium149.0.7827.55静态file、CSP禁连接/图片、非file拦截、后台网络GPU禁用、finally关闭浏览器，无项目server/下载。
- 保全/状态：1236基线、10既有/1新增，其余1226字节保持；72旧档2639封存文件及manifest SHA保持，CSV仅R81/其他97行含25冻结行不动，HEAD/原分支/空index/EOL保持、diff --check0。handoff留F72/F71/F70，移出F69在original/docs/handoff.md。普通1 DONE/67 IN_PROGRESS/5 TODO，路由PILOT_SPECIFIED68/NEEDS_CARD0/NEEDS_DESIGN5/FROZEN_SCOPE25，总98、97未解决。R81仅本地实施自验review=PENDING不关单，R61等其他R项不改；下一普通待设计R86（其余R87/R88/R89/R96），先核边界定卡，不展开冻结。
- 限制：所有reply/improvement/adminFeedback为mock，未向真实用户发消息/通知，未读取真实反馈/凭证/生产私有数据，未改后端通知/权限/消息存储/状态合同。没有CAS/持久幂等/跨页草稿或自动重试未知受理机制；停止本地观察不撤回已受理操作。无真实服务/部署/提交推送、媒体视频/GPU付费、安全专项/全套/委派/独立复核；25冻结STOPPED。


## F73 / repair-pilot-073 / R86a · Agent后置记忆事务隔离

- 实施：每次harness在模型前产生call_id（本次关联，非跨HTTP幂等），reply对象及完整已知usage/token/cache/tool/proposal保持。独立memory Session绑定同Engine，即使调用者绑定Connection也不复用其事务；只回滚自己的记忆，不重试模型/工具/未知commit。caller原脏/已flush事务、已受理工具均保全。
- 撤销：记忆前后用实际DB标量查会话和原属主，拒绝identity map旧对象；user_id=None跳过记忆但仍核会话。删除/属主变化revoked，检查不可用unverified；路由在内容preview audit/消息/常规ledger之前停止SSE并提示先核历史，不回建会话，不尝试finalize可能缓存/删除的遥测ORM。原ready回复/记账路径保持。
- 验证：原4中flush FK/commit UNIQUE两项真实SQLite红、健康/模型前错误两控制绿；修后4绿。扩展首轮19通过、3路由fixture因Windows默认事件循环socket被V00拒绝；改仅timer/task事件循环，不放开socket guard，22通过。补isolated实际重载顺序与harness故障后接原Agent路由，最终23 passed in1.93s、child0、stderr空，无skip/fail。包含删除前/中/后、属主/userNone、ack丢失、caller未提交/flush写锁/Connection、accepted工具不重跑、两次明确新turn身份、DB核实故障、ready/撤销/无法确认路由。模型/policy/tools与记忆writer为替身，writer写实际ORM memory表，真实FK/unique/commit/rollback；路由实际嵌套generator AST，消息/账本/遥测副作用替身，不是完整ASGI/真实PG/实际计价验收。
- 保全：1237基线、11既有/1新增，其余1226保持；73旧档2696封存文件及manifest保持。CSV仅R86，其他97行含25冻结逐字节不变；HEAD/原分支/空index/EOL保持，diff --check0。harness isolated函数AST保持，router只有Agent撤销guard；普通Chat AST、原memory策略、账本、模型迁移/工具实现/计价与所有前端不改。runner仅23精确nodeid增加，隔离guard逐字节保持。
- 状态/后续：R86从NEEDS_DESIGN转PILOT_SPECIFIED/IN_PROGRESS，review=PENDING，R86a仅局部改善。普通1 DONE/68 IN_PROGRESS/4 TODO，路由PILOT_SPECIFIED69/NEEDS_DESIGN4/FROZEN_SCOPE25；总98、97未解决，未自行关任何R项。handoff只留F73/F72/F71，F70在original/handoff。下一F74继续同R86：稳定持久call/用量审计先于后置副作用，删除和取消仍保合法已知消耗且不能保内容/回建会话；再普通Chat压缩摘要保全与失败Session恢复。R87/R88/R89/R96仍待设计，25冻结停止。
- 限制：本次call_id仅内存/后续普通内容audit关联，没有持久完成journal或跨请求幂等；删除/unverified/流中断仍可能未入账，下一步必须修。reply与已知用量只保在HarnessAgentResult；本卡不是删除后持久用量审计或DB故障恢复完成证明。检查后并发删除仍有窗口/FK拒绝，默认READ COMMITTED/SQLite行为非PG并发验收；记忆既有SET NULL/detach合同保持。普通Chat摘要/记忆失败和取消不纳本步完成声明。无模型调用/真实业务DB/网络/startup/索引维护/媒体视频/GPU付费/全套/安全专项/委派/独立复核/提交推送部署。


## F74 / repair-pilot-074 / R86b · 完成凭据与已知用量

- 持久边界：复用AuditLog整数PK为receipt，模型前独立提交admitted与调用价格规则快照，失败不启动模型/工具。完成后独立提交真实ChatMessage+receipt数字用量/状态，再独立账本settle，最后原F73记忆。正文只在原会话，receipt/ledger不含输入/回复/工具内容/任意usage_payload；删除后无内容副本、无会话FK，不重建原会话。已有meta新增call_id并经原parser兼容验证，防整数message id复用错配。保user_id=None原会话属主fallback快照，删除后消耗仍归原属主，不发明新授权或记忆规则。
- 账本/恢复：新source chat_agent_calls/receipt_id用既有唯一约束及行锁，重复完成/补账不新增消息、不重复计费，实际新模型调用新receipt。记账失败保已存reply与数字用量pending，settle仅按receipt恢复、无需模型/消息/工具；按admission规则快照采用原input/output/cache与round6/round4计价，不按后来价格重算。原chat_messages默认计账合同保持，普通Chat/compaction不改。未报计数的成功明确unknown无零账，失败/取消前未完成亦usage_known=false。
- 路由/取消：ready读取已保存消息，核receipt/call_id/会话和隐藏meta，不写第二消息/旧来源账或带正文preview的第二audit。删除/失效停止SSE，已完成凭据后异常不再补第二错误消息。loop关闭的thinking通知忽略，不阻断to_thread后台完成；实际取消等待者测试仍落原回复和120已知tokens、模型一次。
- 验证：首轮17新fixture默认GBK读UTF8失败，原23通过；仅补显式UTF8后40通过。补真实路由/取消/commit唯一故障/价格恢复后47通过；补未知用量/调用者脏状态后49通过；再加并发补账与真实模块import+原meta parser，先51 passed in5.53s；补userNone属主fallback/删除保全后51 passed in5.86s；再保typed已知正计数不被辅助payload零/坏值覆盖，最终28新+23旧51 passed in5.62s，child0、stderr空、无fail/skip。配对原F73 harness控制证明只回内存但message/ledger均0，当前记忆失败后各1。真实SQLite/FK/unique/commit/ack丢失/价格规则/消息/账本，模型/policy/tools/memory读取/写入边界仍替身；实际新模块导入使用SDK替身，Agent实际generator AST，非完整ASGI或PG并发验收。
- 范围/保全：1238基线、13既有/2新增，其余1225保持；74旧档2737封存文件及manifest保持。CSV仅R86/其余97含25冻结字节不动；HEAD/原分支/空index/EOL保持、diff --check0。业务三既有harness/Agent路由/ledger opt-in参数；runner只新增28精确nodeid；旧F73测试只增加receipt边界替身和可注入route DB，原23方法不改。新增completion service/test；八文档同步。原memory函数与isolated入口、普通Chat/所有其他router和ledger AST保持。
- 状态/后续：R86仍IN_PROGRESS/review=PENDING，卡F73;F74；普通1 DONE/68 IN_PROGRESS/4 TODO，路由PILOT_SPECIFIED69/NEEDS_DESIGN4/FROZEN_SCOPE25，总98、97未解决，唯一DONE仍R98。handoff留F74/F73/F72，F71在original。下一F75继续同R86普通Chat compaction：摘要与真实用量先保全，失败Session恢复后安全fallback，重复实际调用身份/删除/故障/恢复；还需明确pending receipts的运维接入，不自动跑维护。
- 限制：持续DB不可用或进程在远端完成但本地未接收结果的间隙崩溃，不能保证receipt已持久完成；返回unverified保内存已知reply/usage、不填零、停止交付/记忆。receipt-only settle是可测试服务函数，未引入自动补账job/CLI/UI，未知usage不能自行推算。用户取消等待不等于取消已受理调用或删除会话；检查后并发删除仍有窗口，PG row-lock/全进程故障非SQLite证明。新凭据不是跨HTTP幂等。普通Chat压缩恢复仍未实施，R86不关；无真实模型/业务DB/网络/startup/PG/私有数据/维护/视频/GPU付费/全套/冻结安全/委派/独立复核/提交推送部署。


## F75 / repair-pilot-075 / R86c · 普通Chat压缩完成保全

- 完成/审计：新增compaction completion服务，admission前独立AuditLog整数receipt/UUID与价格规则快照；admitted不冒称真实上游已调用。模型完成先在独立事务保存原Conversation摘要+固定身份/数字用量metadata，再独立ledger。摘要只在原会话、无正文审计/副本，删除/属主变化撤销但合法已知消耗仍留。base summary/until比较防旧结果覆盖并发新摘要；空摘要仍记已知消耗，未报/None/坏计数/仅未支持字段明确unknown无零账，明确报告0才是已知0。
- 计账/恢复：writer新增可选receipt/snapshot/recorded_at，默认旧chat_context_compactions/until行为保持；新chat_compaction_calls/receipt_id唯一源，同until再次实际调用各计一次。重复settle不重复收费、补账沿admission规则价格与原round6/4算法，删会话/改价后亦可仅按凭据补账。ledger flush/commit失败不回滚已存摘要，数字用量独立pending；未知commit只读核实，摘要一次失败可仅重试同一本地完成结果，不重跑模型；持续失败保数字并停止交付，不假称摘要已落盘。
- pack/会话：await前拷贝会话context/消息/Provider必要字段；Session错误始终先rollback，再用快照裁剪和仅缓存id的静态日志，防is_active仍True的失败事务未恢复。已知结果不因失败Session或ledger丢失。统计独立事务/summary base保护，失败仅在确认会话仍有效后best-effort；同步context字段set_committed_value，不commit调用者title等脏状态。删除/无法核实/统计期新summary冲突的专用409，普通Chat停止SSE，不误当附件失败、不补内容/旧遥测、不启动最终回复模型。Agent分支保持。
- 验证：首批21新+原R12 10共31 passed in4.50s。补未报/None/坏值/显式0、模型前已删、is_active=True statement失败等扩展35 passed in5.22s；再补未支持uncached-only不造零账及健康summary时caller title保全，35 passed in5.00s；再规范None/坏值/无穷值不覆盖其他已知计数，最终25新+原10共35 passed in5.14s，child0、stderr空、无skip/fail，1条pythonjsonlogger既有弃用warning。原pack+真实compaction UNIQUE/flush故障配对：PendingRollbackError、DB摘要空/ledger0；新pack同故障摘要保存、known120 pending、补账142.5，模型一次。真实SQLite ORM/约束/commit/ack与实际pack/new service/计价/ledger；模型mock，普通流实际generator AST+副作用替身，不是完整ASGI/PG并发或真实模型验收。
- 覆盖：健康/真实唯一flush/ledger commit/summary commit一次与持续故障/ack丢失、模型完成前失败/取消、空摘要、unknown与已知0、同until真实两调用、删除前/期间/补账前、并发新摘要优先/统计冲突、caller failed/inactive及active flag仍True、静态日志/快照、stats commit失败、调用者有效脏title、完整DB不可用、普通流专用停止/删除不回建；原R12正常/部分错误/取消/附件分类/ledger失败等10场景保持。
- 保全/状态：1240基线12既有/2新增，其余1228字节保持，75旧档2783封存文件及manifest保持；CSV仅R86，其他97含25冻结不动。HEAD/原分支/空index/EOL保持、diff --check0。源精确快照重放；chat_context仅pack与必要imports，原摘要prompt/max_tokens/预算/拆分/算法AST保持；router仅普通generator专用异常识别，Agent AST保持；ledger仅compaction opt-in writer，其余含F74 writer不动；runner仅新增25精确nodeid。handoff留F75/F74/F73，F72在original。
- 后续/限制：普通1 DONE/68 IN_PROGRESS/4 TODO，路由PILOT_SPECIFIED69/NEEDS_DESIGN4/FROZEN_SCOPE25，总98、97未解决、唯一DONE仍R98。R86整体仍IN_PROGRESS/review=PENDING，卡F73;F74;F75，普通回复memory后置事务和pending receipt可用运维接入仍需核实收口；下一继续同R86，不自动进入R87。持续DB不可用/远端完成瞬间进程崩溃不宣称原子保证，检查后删除仍有并发窗口，PG真实锁另验。pending settle目前服务函数非自动job/CLI/UI；stats失败可保旧统计但摘要/数字用量不丢。正常caller脏字段保留，异常/cancel回滚失败事务，不保其未提交业务写。无真实服务/模型/业务DB/生产私有数据/PG/维护/视频/GPU付费/全套/冻结安全/委派/独立复核/提交推送部署。


## F76 / repair-pilot-076 / R86d · 普通回复完成与记忆隔离

- 完成/记忆：新增ordinary completion服务，模型前独立AuditLog调用凭据/价格规则/属主snapshot，admitted不冒称已调用上游；完成/错误/中断先独立保存活会话原文消息和仅数字/固定metadata，再按chat_reply_calls/receipt_id独立ledger，最后独立memory。正文只原会话，audit/ledger无输入/回复/任意raw usage；普通消息保持原文无Agent meta。legacy前置附件失败保原消息/零次调用合同，helper亦先commit ledger再尝试memory。
- 费用/幂等：SSE仅接受可规范的六类非负计数，未报/None/坏/无穷unknown不写零ledger，明确0才已知0。累计已知计数按非减合并，不被后续缺失/0/坏事件抹除；不推算未报费用。重复完成保原结果与金额；ledger失败数字pending独立保全，补账沿调用价格规则、不随改价/删会话重算，不重发模型/消息。未知commit先核实，有限重试本地结果。memory领取先独立状态claim；PG行锁、SQLite receipt no-op writer lock防旧JSON回写/并发重复；commit未知不盲重试，failed/started不自动重放memory。
- 撤销/流：pack后最终admission再查会话/属主，原每个收到chunk交付前独立检查。删除/无法确认后清回复缓存、停止输出，继续收已受理stream的用量收尾，只保metadata/合法消耗，不存正文/记忆、不回建会话。reply的原message_id与精确创建时间绑定，整数id复用不可当旧结果。取消/AnyIO shield/aclose沿R12保存partial/error，未知费用仍unknown。删除或存储无法确认不finalize缓存已删遥测、不补第二消息；原attempted防重复保持。普通流Telemetry核心/Agent/pack不改。
- 验证：受影响R12 10先通过in2.41s；首批15新+10+F75停止2共27 passed in5.60s；补memory期间删除、memory/ledger ack丢失、caller title、完成DB不可用、message整数ID复用后最终21新+原10+F75 2共33 passed in6.93s，child0、stderr空、fail/skip0，1条pythonjsonlogger既有弃用warning。配对原helper实际memory FK flush导致ledger回滚/消息已存，新同故障reply/known10/费用13保全且memory独立失败，不报model失败。真实临时SQLite/ORM/唯一FK/commit/ack/并发、实际新service/billing/ledger和普通流generator AST；stream/memory边界替身，不是完整ASGI/真实服务或PG并发验收。
- 覆盖：normal/partial/error/task+AnyIO cancel/aclose/前置附件合同、原memory FK/commit错误、重复/并发完成memory claim、删除在pack后/流中/memory中、不确定liveness、unknown/明确0/分段计数/坏payload、账本pending/改价删会话补账、completion/memory/ledger ack、持续message写失败/DB不可用、admission失败、service保caller未提交title、plain history/整数id复用。重复完成不覆盖原实际消耗，取消不冒称撤回上游；未report不能推算。
- 保全：1242基线12既有/2新增，其余1230字节保持；76旧档2824封存文件及manifest保持。CSV只R86/其他97含25冻结不动；HEAD/原分支/空index/EOL保持、diff --check0。router只普通helper/generate，Agent/pack/tracker AST保持；ledger仅来源允许集合增加chat_reply_calls，F74/F75计价实现不改；R12 10场景保持，9个test方法AST不改，ledger故障注入转新作用边界，其余调整为fixture/凭据/unknown断言；runner只新增21精确节点。handoff留F76/F75/F74，F73在original。
- 后续/限制：R86仍IN_PROGRESS/review=PENDING，卡F73;F74;F75;F76；普通1 DONE/68 IN_PROGRESS/4 TODO、路由PILOT_SPECIFIED69/NEEDS_DESIGN4/FROZEN_SCOPE25，总98、97未解决、唯一DONE仍R98。Agent/压缩/普通回复都已本地实施，下一只收口pending receipt可用运维补账入口（目前settle为服务函数，未引入job/CLI/UI），不以另开对话/独立复核阻断后续普通修复。持续DB不可用/远端完成尚未接收时进程崩溃不承诺原子；检查后仍有竞态窗口，SQLite writer lock非真实PG证明。receipt非跨HTTP幂等；未知memory commit不自动重放。停止流路径不触碰可能已删telemetry，真实上游遥测口径R88仍独立待设计，不借本卡改历史指标。无真实服务/模型/业务DB/私有数据/PG/维护/视频/GPU付费/全套/冻结安全/委派/独立复核/提交推送部署。


## F77 / repair-pilot-077 / R86e · 凭据补账可用入口

- 工具/入口：新增scripts/recover_chat_usage.py，默认preview只读，必须1至50个不同正receipt ID，无all/隐式扫描；apply需显式--apply和预览digest。参数/help在DB import/factory之前处理；本卡只测试main注入临时Session，没有执行真实配置CLI。预览仅固定receipt/归属/Provider数字ID、kind/status/金额/币种/原因码，DB URL/正文/任意metadata/异常不输出；币种逐项保留、无FX/金额跨币合计。
- 恢复/指纹：统一三服务settle到metadata-only recovery模块，保原writer注入边界/调用价格规则/round6/4，去重复私有计价helper；不导入Agent SDK、不读Conversation/ChatMessage/用户/实时Provider/记忆、不调用模型工具。digest绑定DB目标及不可变收费身份/价格/用量/完成时间，允许删除正文/改变memory状态和相同补账重复执行，拒绝用量/价格/主体/类型期间变化；锁内逐项再次核指纹。
- 匹配/事务：completed+usage_known才可补账，未知/未完成不造零。既有ledger必须call_id/源/金额/币种/计数/主体/provider/model/workflow/记录类型/计费单位/项目/输出数/完成时间一致；同receipt下跨类型同call_id账亦冲突，不覆盖或加第二账。writer完成需实际flush并读回匹配，ack丢失只读确认，不以整数source存在冒称成功。PG行锁/SQLite receipt writer lock串行，Agent/compaction原receipt helper补同SQLite锁防旧JSON回写；模型/内容/memory算法不改。
- 执行/退出：全批先预检，missing/unknown/冲突不写任何目标；之后按凭据独立事务，不假称跨receipt原子。重复/并发同意图一账，失败重试不重复成功项；期间变化/数据库失败明确unconfirmed与部分成功。0全可确认或预览可执行，2参数/未知/冲突/陈旧且预检无写，1运行未确认/部分失败；不输出原异常/连接字符串，不自动重放memory或推算未知费用。
- 验证：受影响84首轮69过/15压缩未入账，定位workflow键应沿原chat.context_compact而非误写的chat.context.compact；纠正后84 passed in13.09s。补21新工具场景后105 passed in14.59s。新增记账月份冲突1红证实漏匹配recorded_at，补时间/记录合同后106 passed in14.31s；新增跨类型同call冲突1红证实会误作新pending，补三固定source下同receipt/call_id拦截。最终23新+原84共107 passed in15.00s；之后仅预览增加归属/Provider数字ID供核对，受影响新23再23 passed in1.94s，原84未受影响不重复；child0、stderr空、fail/skip0，1条pythonjsonlogger既有弃用warning。原旧Agent settle配对证实wrong call_id仅因source整数存在被接受，新入口拒绝；核心三路径真实Writer/SQLite回归保持。
- 覆盖：三kind只读预览/CLI apply与重复、unknown/admitted/failed/缺失/不相关行、陈旧用量/价格/主体/目标DB、删除正文与memory变动、身份/金额/计数/月度时间/类型冲突、跨kind同call、不写账writer、并发apply、ack丢失、部分失败重试/锁内再检、已知0/未定价/外币、坏metadata/无穷价格、非法参数/help DB前拒绝/错误脱敏、SDK及正文表禁止。新测试库只有AuditLog/UsageLedger两表，证明恢复不依赖任何正文表。受影响Agent28+compaction25+普通回复21+原R12 10共84；不是全套/真实模型/完整ASGI或PG并发证明。
- 保全/状态：1244基线12既有/3新增，其余1232字节保持；77旧档2864封存文件及manifest保持。CSV仅R86、其他97含25冻结不动；HEAD/原分支/空index/EOL保持、diff --check0。源精确替换重放，三服务除settle/删除私有计价重复helper/两个SQLite锁及必要imports外函数AST不变；router/ledger/harness/旧测试/前端不改；runner只新增23精确nodeid。handoff留F77/F76/F75，F74在original。普通1 DONE/68 IN_PROGRESS/4 TODO；PILOT_SPECIFIED69/NEEDS_DESIGN4/FROZEN_SCOPE25；总98、97未解决，唯一DONE仍R98。
- 收口/后续：R86 F73;F74;F75;F76;F77本地实施自验齐备，整体仍IN_PROGRESS/review=PENDING，未独立验收/关单。补账工具可用但未对真实DB执行，无自动job/HTTP写入口/跨HTTP幂等；未知用量/持续DB故障/远端完成接收前进程崩溃不承诺恢复猜测，真实PG/部署另验。下一普通待设计R87先核业务commit与索引副作用边界，再定卡本地修复；R88/R89/R96仍待设计、25冻结停止。无真实模型/服务/业务DB/私有数据/维护CLI/PG/视频/GPU付费/全套/安全专项/委派/独立复核/切分支/提交推送部署。


## F78 / repair-pilot-078 / R87a · 业务与索引意图原子提交

- 卡片：F78 / repair-pilot-078 / R87a，IN_PROGRESS / review=PENDING。用户普通本地修bug授权延续，先实施不以独立复核阻断。R87从NEEDS_DESIGN转有界两步：a业务/持久意图原子与异步派发，b全量新generation安全切换/读取核验。R87a完成不代表R87整体实现完毕或验收；唯一DONE仍R98。
- 事务：SearchIndexDomain单调revision/预建domain锁行，SearchIndexIntent按domain+实体主键合并latest意图且保applied_revision；只存身份/版本/动作/状态，不复制正文。六CRUD获取domain锁后才flush业务，业务/意图/原审计同commit；缺迁移在业务commit前失败，不自动建表或写seed。delete保tombstone，后台重读主库并核shared scope，旧upsert后新删除仍按版本收敛。
- 响应/派发：原字段/权限/媒体/DTO流程保持，只替换postcommit索引hook为BackgroundTasks，跨后台只传Engine/domain，不捕获请求Session或ORM。响应成功后独立Session处理，索引/调度异常不改变已成功结果；无BackgroundTasks直接调用仍保durable pending。SDK client仅新增timeout=3；安装0.34.1的TaskInfo.task_uid/Task.uid/index_uid/status和UID0按本地原始源码核对，未连接真实Meili。
- 异步/恢复：每域最多一个在途任务，提交前持久uncertain/token/实体版本/索引target，HTTP在DB锁外，业务仍可继续入队；未知提交/缺UID/保存receipt失败不盲重发。已知UID先查询状态，enqueued/processing/未知状态不记成功；succeeded且身份匹配才ack，failed/canceled留pending。重试读取最新实体，旧token/旧generation回执不覆盖新状态；静态错误码，无异常正文持久化。无daemon/启动同步/真实维护任务。
- 迁移：e51fa962c846承接d40e9f82b735，只建search_index_domains/intents并预建inspiration/templates锁行；SQLite显式实际事务覆盖DDL/seed/head。unused状态可安全downgrade，存在意图/revision/active/receipt则拒绝丢恢复状态。旧R32功能测试默认固定原NEW revision，唯一head图测试显式head并核单head/祖先；原纠正迁移/11个其他test方法不改。PG仅离线SQL编译，未连接真实PG。
- 验证：首轮32过/4失败：SDK原生任务样例需小数秒、SQLite种子失败DDL残留、旧R32两场景把新表误计入原revision比较。修实际DDL事务与上述测试边界后36 passed in14.68s。扩充后43过/1失败为故障注入未命中Alembic内联版本SQL；规范SQL匹配后最终44 passed、1 warning、3 subtests in16.29s，child0/stderr空/fail及skip0。1 warning为原pythonjsonlogger弃用。不是全套/真实业务库/真实索引或PG并发证明。
- 覆盖：原postcommit索引失败配对复现重复新增，新响应201先于后台失败；六CRUD签名/共享权限审计替身、实际临时SQLite原子commit/rollback/缺迁移、async失败/processing/unknown/UID0/错误身份/旧回执/lookup恢复、提交未知/receipt及ack持久失败、单域并发与HTTP期间业务提交、最新更新/删除与private模板不外发、SDK原生Task对象/有限timeout、迁移重复/三点失败回滚/保全/拒绝危险回退/PG离线SQL。32新+旧R32 12精确nodeid均通过V00隔离入口；ASGI仅最小本地无socket app，auth/media/网络为替身。
- 保全：1247基线只改14既有白名单，其余1233字节保持，新增service/migration/test三文件；78旧档2909封存文件及manifest SHA保持。CSV仅R87，其他97含25冻结字节不变。HEAD/原分支/空index/EOL保持、diff --check0；源精确快照重放与AST核对，runner仅增加32精确nodeid，隔离guard不改。handoff留F78/F77/F76，移出的F75在original。普通1 DONE/69 IN_PROGRESS/3 TODO；PILOT_SPECIFIED70/NEEDS_DESIGN3/FROZEN_SCOPE25，总98/97未解决。
- 限制/下一卡：R87仍部分实现，既有full sync/read尚未修；active_index/ready初始未就绪，不能把增量ack当全量完成。未知提交会阻止后续增量，下一F79/R87b必需：新随机generation构建全量并逐task终态确认后，按domain revision/active CAS激活；不先清旧索引，零集合法，并发变更拒绝旧快照激活；旧未知任务只作用旧generation。读取使用active pointer、回主库核指纹/删除/私有状态，pending/uncertain/notready时SQL回退。R88/R89/R96仍TODO待设计，冻结25继续停止；不以独立复核/另开对话阻断下一本地修复。
- 无真实索引/服务/业务DB/私有数据/PG/维护CLI/模型/视频/GPU付费/全套/冻结安全专项，无委派/独立复核/切分支/提交推送部署。新增迁移尚未在真实环境运行，实施未独立验收，任何R项均未额外关闭。


## F79 / repair-pilot-079 / R87b · 全量新代确认与主库校验

- 卡片：F79 / repair-pilot-079 / R87b，IN_PROGRESS / review=PENDING。承接F78补全全量同步与读取恢复，本地实施齐备不冒称独立通过。用户“先修bug”授权继续，不以独立复核或另开对话阻断下一普通修复，任何R项均未额外关闭。
- 全量：新增search_index_generation_service，独立Session/domain锁下读取已提交完整集合、revision/旧active/target后放锁；不flush/commit/rollback调用者Session。显式create随机qmdh_<domain>_<uuid>索引(primaryKey=id)，逐一确认create/原两项配置/500条分批写入的异步任务，再核真实SDK stats.number_of_documents等于快照数量。每任务5000ms等待窗口/100ms间隔、原HTTP3秒timeout；UID0合法，wrong UID/index、非成功/未知/失败/取消/timeout/count不符均不激活。
- 激活：domain锁内核快照revision、旧active/active_target及当前服务target，单事务切active/ready、ack该域最新intent并清旧receipt；并发业务变化或另一个同步抢先切换明确source_changed，不覆盖更新的快照。激活commit前失败保旧pointer/intent，commit ack丢失用独立Session读回核实，不重建索引/重发业务。缺锁行/snapshot失败在外部创建前拒绝，未知提交的新代可重新构建恢复。
- 保全：空集合新建空index并确认后可合法切换；全量/部分集合自然排除旧ID，不先清空当前可用索引，不删除旧代或失败未激活代。旧在途/不确定任务只能写其原index，旧回执token校验不能抢占新代。失败遗留索引需另获授权维护清理，本卡无自动GC/后台job/真实同步。两个domain各自原子；后域失败不回滚已确认的前域，不报告整次成功。
- 读取：只使用DB active pointer；ready=false、uncertain、receipt未完、intent pending、服务target变化或缺迁移状态时不请求旧配置索引，改用原SQL查询。HTTP后短domain锁内复核revision/pointer/待同步状态，再按id回主库、核当前document fingerprint及shared可见性。已删/私有/陈旧/重复/坏结果回SQL；远端title/snippet/category/tags不作为返回事实，仅保有限rank score，输出取主库。SQL本身失败继续抛错，不造空成功；空query/非法domain/limit与原合同保持。
- 接线：原sync两wrapper改新generation，配置字段原样，仅将配置async receipt交给终态确认。SDK初始化异常/无client明确静态client_unavailable；sync endpoint保原auth/disabled guard与成功schema，source_changed映射409，其他未确认503，不返回成功零。service只改_meili_hits/search_domain及私有state helper，原SQL投影/筛选/排序、SDK timeout、health/engine函数AST保持；status仍展示配置基名，不冒称该字段为当前generation。
- 验证：首批27新+F78 32共59节点，58过/1失败为私有模板fixture缺必填label，补齐。扩展32新后63过/1失败证实client factory异常未经静态映射，修两wrapper后最终64 passed、1 warning、41 subtests in10.52s，child0/stderr空/fail与skip0。原sync配对确认update仍留999999残留，原read返回该ghost；新未ready读走SQL排除，完整新代仅当前集合。原生SDK TaskInfo/Task/IndexStats直接数据对象、无SDK HTTP。
- 覆盖：零/部分/全量/501分批、共享排私有、各异步阶段失败/非终态/错UID目标/count/timeout/submit、配置期间变更、双同步CAS、业务更新期间构建、持久unknown恢复与旧写晚到/旧ACK、激活rollback/ack丢失、调用者dirty/new/inactive保留；主库投影、陈旧/删除/private/重复/坏结果、rank非有限、HTTP期间业务变更已ack及pointer更换、SQL回退/缺迁移/错误不造空/边界、router auth/400/409/503、SDK原生receipt与stats。32个F78精确节点保持，原migration/R32未改不重复运行。
- 保全：1250基线仅改12既有白名单，其余1238字节保持；新增generation service/test两个文件。79旧档2953封存文件及manifest SHA保持，CSV仅R87，其他97含25冻结字节不变。源精确快照重放/AST核对，V00仅新增32精确nodeid，隔离guard原样；HEAD/原分支/空index/EOL保持、diff --check0。handoff最新F79/F78/F77，移出F76在original。普通1 DONE/69 IN_PROGRESS/3 TODO，PILOT_SPECIFIED70/NEEDS_DESIGN3/FROZEN_SCOPE25，总98/97未解决，唯一DONE仍R98。
- 限制/后续：R87 F78;F79本地实施与离线自验齐备，整体仍IN_PROGRESS/review=PENDING；真实Meili任务/PG锁及真实部署未验。F78迁移尚未在实际环境运行，新代首次启用依赖该两表/预建锁行及现有管理员sync入口，不自动启动；未ready时SQL可用。无跨服务原子承诺/自动代回收，原SQL匹配排序保持（不等同Meili模糊相关性）。下一R88仅核真实模型call/turn采集与聚合合同后定卡，R89/R96仍待设计，25冻结保持停止。
- 未运行旧bootstrap/live测试或全套，无真实服务/索引/模型/业务库/生产私有数据/PG/维护CLI/迁移同步/视频/GPU付费/冻结安全专项；无委派/独立复核/切分支/提交推送部署。


## F80 / repair-pilot-080 / R88a · 实际模型调用观测

- 卡片：F80 / repair-pilot-080 / R88a，IN_PROGRESS / review=PENDING。R88从NEEDS_DESIGN定有界两步：a真实模型适配器请求采集与Agent/Tracker透传，b聚合/展示/API/告警已知与未知口径。a自验通过不等于R88全修，b仍必需，不标ACCEPTED/DONE；唯一DONE仍R98。
- 真实边界：安装pydantic-ai0.4.3的非流式run_sync经Model.request await；可选WrapperModel仅在该边界begin/end，不围整个harness计模型耗时。每次逻辑适配器尝试独立call_id/sequence，根metadata绑定turn_id及原harness/receipt call_id作为run_id；工具往返/SDK重试导致多次request各计，不推定SDK内部HTTP重试数、上游受理或实际费用。保原Provider/ModelSettings/工具/allowlist/usage/receipt合同。
- 指标：逐调用开始/结束/成功/error/cancelled及request duration；多次duration求和，不包含中间工具/后续memory/本地交付。非流式SDK只提供完整ModelResponse，first_response_ms单列，不宣称TTFT；ttft_ms明确null/basis=unavailable_non_streaming。collector只存随机身份/固定状态/数字时间，不复制prompt/回复/工具参数/异常正文/凭据；最多保256个身份，超过明确identities_truncated且总计数保留。
- 线程/取消：每turn独立RLock collector；实际worker function finally结束才complete，支持原harness异常/模型前失败/多调用。观察到request则called=true，只有worker完成且0次才false，worker尚未完成且0次为unknown。Tracker finalize关闭并深拷贝快照；取消中的活动请求为censored/duration_complete=false，后续worker与回调不会改已存快照或数据库，不能把晚到调用编成已知0。观察者不调用/改Session。
- 接线/保全：run_studio_agent仅加可选observer与Model构建后wrapper；两harness仅透传及绑定既有call_id；generate_agent只启用observer和to_thread使用observer.run，原SSE/错误/删除/记账/取消流程不改。Tracker仅新增observe_agent/可选字段及finalize版本1 observation；原普通markers/遥测函数AST不变。schema不改，旧bool/int兼容列仍用False/0占位，版本metadata明确null/known/censored；下一b必须修消费者，不能本卡宣称旧Agent假0与误报已经根治。
- 验证：首次完整19新+F73 23+F74 28共70 passed in8.62s，child0/stderr空、fail/skip0。41 warning为既有pythonjsonlogger1及本地SDK/OpenTelemetry40条弃用，未过滤。真实SDK Agent.run_sync/WrapperModel/FunctionModel及一个纯本地整数工具，无Provider/HTTP/LLM；实际studio函数AST亦用本地SDK模型验证可选wrapper，普通无observer保持。临时SQLite实际Tracker/finalize和原R86 receipt/memory/ledger回归，非完整ASGI/真实模型或告警验收。
- 覆盖：实际SDK成功/两次tool往返/模型异常/取消；模型前已知0、模型后失败保调用、duration排除工具memory、取消前无调用unknown与在途censored/迟到冻结/深复制、重复结束/257次身份截断；实际Tracker版本metadata/非流式TTFTnull/普通markers不改/error不抹调用；harness两层透传与call_id、实际studio源接入/默认None、真实route AST worker桥接。F73/F74 51原场景保全，旧F73只以真实Tracker替换object桩，所有test断言AST保持。
- 保全：1252基线仅改14既有白名单，其余1238字节保持；新增observer service/test两文件。80旧档2995封存文件及manifest SHA保持，CSV仅R88，其他97含25冻结字节不变。源精确快照重放/AST核对，V00仅增加19精确nodeid，隔离guard不变；HEAD/原分支/空index/EOL保持、diff --check0。handoff留F80/F79/F78，移出F77在original。普通1 DONE/70 IN_PROGRESS/2 TODO，PILOT_SPECIFIED71/NEEDS_DESIGN2/FROZEN_SCOPE25，总98/97未解决。
- 后续：下一F81/R88b按版本观测统一dashboard/alert聚合及API/必要显示，区分旧Agent unknown、新已观测false/true、取消未完成、普通已有标记；用known样本及min10同合同计算调用率，未知TTFT/无样本不填零。回归10成功Agent不误报、混合新旧/普通/前后失败/取消及阈值，不运行实际evaluate调度/改历史数据。R89/R96仍TODO待设计，25冻结继续停止；不因独立复核/另开对话阻断下一普通修复。
- 无真实模型/服务/HTTP/业务DB/私有数据/历史遥测写回/真实告警评估或记录/调度/GPU付费/视频/全套/安全专项；无委派/独立复核/切分支/提交推送部署，原未提交内容保护。


## F81 / repair-pilot-081 / R88b · 已知调用率与未知延迟

- 卡片：F81 / repair-pilot-081 / R88b，IN_PROGRESS / review=PENDING。承接F80补齐读口径/聚合/API/显示/低调用率规则；R88 F80;F81本地实施与自验齐备，仍未独立验收，不标ACCEPTED/DONE，不关闭任何R项。用户普通修bug授权继续，不以复核/另开对话阻断后续。
- 共享事实：新增chat_telemetry_observation_service，只读解读单一version1/turn_id/run_id/模式/计数/捕获状态/身份序列与成功首响应一致性；坏/重复/未来版本、跨turn事件均unknown，不跌回旧bool假0，list/dict状态不抛TypeError。旧Agent无可靠upstream.start标记为unknown，不能从agent_success或旧False/0推断；旧普通按既有bool/首token证据读取，旧Agent有明确start+True才known，旧多调用次数和非流式TTFT仍未知。无历史回填/JSON或原列修改。
- 聚合：dashboard与alert使用同一known/called/unknown计数和调用率called/known；无known为null，成功/中断/附件/窗口总分母保持。model_call_count_total只汇总complete有计数的观测；censored的次数为已观测下界，不当完整总数。TTFT只有可证实普通流样本，非流式Agent始终null；完整ModelResponse first_response单列均值/P95/样本数。可测0ms保0，无样本null，不伪造零延迟。
- 规则：低调用率只用known>=原min（默认10），不以未知轮数凑数；按未舍入called/known比较原阈值（默认.9），9/10等于阈值不触发，8/10触发，89999/100000不能被显示舍入漏掉。未知/样本不足is_evaluable=false；evaluate循环只新增持久查询前continue，保留已有low-call告警，不自动宣布恢复。其他规则默认可评估、阈值/行为与全部持久化AST原样；本卡没有执行evaluate函数或调度。
- API/UI：只改overview/row两响应schema及对应TS类型；列表三态called、观测状态、可空次数/完整性/run身份/模型duration/first_response/TTFT，overview增加覆盖与两类延迟样本。页面仅格式/覆盖说明/首完整响应KPI/明细三态及次数tooltip；unknown显示未知或—，已知0显示0.0%/否，实测0ms保留，Pack原0占位保持。原查询/窗口/刷新/action/告警按钮流程不改，无新网络操作。
- 验证：首轮20过/2失败来自schema测试误经routers barrel导入已被fixture替身隔离的工具模块，以及测试读取中文源漏encoding；改为真实两schema AST/UTF8后22 passed/20 subtests in3.08s。追加坏状态/成功缺首响应反例，2精确节点得到3 subfail+1失败（pytest显示4 failed/1 passed）；补类型和一致性守卫后最终22 passed/16 warnings/23 subtests in2.88s，child0/stderr空/fail与skip0。16 warning为pythonjsonlogger1及本地SDK/OpenTelemetry15条弃用，未过滤。
- 界面/类型：实际React server render目标页面、query/api替身5场景全部通过，无网络/action调用；未知/已知0/partial次数/first_response与TTFT分列/实测0/非有限值均覆盖。strict首查发现新model_run_id生成拼成stringing，已改精确类型映射；原3 ImportMeta.env诊断来自目标程序未载入Vite ambient。仅给目标检查加已安装vite/client.d.ts显式root并包含global诊断，前后目标api.ts/Page均0，不改项目tsconfig或掩称全项目通过。runtime页面/后端4文件在仅TS拼写纠正前后SHA相同，不重复未受影响测试。
- 核心覆盖：10轮实际本地SDK FunctionModel+Tracker Agent成功rate1不critical；旧10成功默认False的原compute配对rate0，新unknown/null；9 known+10 unknown不凑min、10已知0才触发、混合普通/Agent新旧、前模型false/后模型错保true/取消unknown与partial、精确阈值/无样本、普通实测0/非流式完整响应0、坏事件/身份/未来版本、API null和只读保全/时间窗口与其他指标。原analytics2/compute1及F80采集3保持；不收集旧evaluate/list-alert测试，不执行任何告警写入。skip guard持久行为仅源码AST保全验证，非动态evaluate验收。
- 保全：1254基线仅改14既有白名单，其余1240字节保持；新增共享reader/backend测试/frontend测试三文件。81旧档3037封存文件及manifest保持，CSV仅R88，其他97含25冻结字节不变。精确快照重放/AST核对，runner仅增加19精确nodeid（16新+3旧统计，另3采集已获准）；隔离guard不改。HEAD/原分支/空index/EOL保持、diff --check0；handoff留F81/F80/F79，移出F78在original。普通1 DONE/70 IN_PROGRESS/2 TODO，PILOT_SPECIFIED71/NEEDS_DESIGN2/FROZEN_SCOPE25，总98/97未解决，唯一DONE仍R98。
- 后续/限制：R88两卡本地实施齐备但待独立review；本地SDK非真实上游，rate表示适配器调用尝试，不证明供方已受理/费用。旧unknown不自动补True/False或恢复历史告警，真实evaluate/调度与部署另验；API/schema是AST验证、页面是SSR和替身，非完整ASGI/浏览器交互。下一普通R89仅核打包暂存所有权并定有界卡，不运行实际bundle维护；R96待设计，25冻结继续STOPPED。
- 无真实模型/HTTP/服务/业务DB/私有数据/告警评估/告警写入或历史回填/调度/PG/维护CLI/媒体视频/GPU付费/全套/冻结安全专项，无委派/独立复核/切分支/提交推送部署。


## F82 / repair-pilot-082 / R89 · 暂存归属与成品保全

- 卡片：F82 / repair-pilot-082 / R89，IN_PROGRESS / review=PENDING。从NEEDS_DESIGN转有界本地实现，仍未独立验收、不标ACCEPTED/DONE；唯一DONE仍R98。用户普通本地修bug授权继续，不以复核/另开对话阻断下一普通修复。
- 所有权：新增stdlib-only BundleWorkspace，规范输出路径后在同父目录exclusive-create短哈希命名锁，内含版本/token/PID/创建时间/目标信息；已有锁文件/目录不删、不抢、不调用媒体。mkdtemp随机根持有创建identity，payload与bundle.zip分开，避免包把自身纳入。复制/manifest/ZIP/发布前复核根与锁，目标只在本次payload；旧固定stem__bundle及他任务目录完全不使用。
- 成品：先完整关闭私有ZIP，核输出stat版本与取得锁后的快照一致，再同父卷os.replace替换。首张/中途/copy/manifest/zip open/write/close/replace失败保原ZIP；不协作写者期间更新输出明确冲突，保其新文件。相同规范输出并发互斥，另一构建在媒体/分配前失败；不同输出使用独立随机根，不共用暂存。没有全局内存锁/生产目录扫描。
- 清理/恢复：每次递归前核绝对分配路径、父目录、prefix、目录类型/identity；锁需type/identity/token字节一致。只删本次核验资源，归属改变拒绝清理和发布，不扫描/猜测旧目录。正常清理失败以cleanup_warnings/retained_paths报告，成功ZIP仍成功；失败构建保原异常并附静态note，不被清理错替代。进程崩溃/锁身份无法确认/锁清理失败可能保留锁，后续明确冲突，不自动删除需人工核实；保留路径不是自动删除授权。
- 接线：inspiration_refresh仅build函数、BuildSeedBundleResult两默认独立list字段及imports；CLI仅build分支JSON加两清理状态字段，不执行CLI、不改其他维护分支/解析。原seed名单/URL选择/prepare参数/manifest内容/计数与ZIP成员算法AST保持，原媒体准备/缓存、refresh/import/正式存储实现不改。
- 验证：首轮22节点20过/2失败，Mock.side_effect属性恢复错误及Windows已有锁目录返回PermissionError。修fixture恢复与已有锁冲突映射后22 passed/5 subtests in1.12s。补无既有锁的PermissionError反例发现lstat新错掩盖原错，修为保原异常；最终22新+原build1共23 passed/5 subtests in1.44s，child0/stderr空、warning/fail/skip0。新反例初次Windows中文异常输出非UTF8导致wrapper stdout=null，child1已终止；本档run.py仅加PYTHONIOENCODING=utf-8控制输出编码后同一精确节点红复现完整，未改V00或pytest参数，原日志保留。
- 覆盖：原真实build快照配对：成功/首媒体故障均删临时用户笔记，新实现保留；完整ZIP/manifest/placeholder/空集；首/中媒体、copy、manifest、ZIP三点、replace错误与重试；输出期间变化；同输出/不同输出线程并发；目录清理错不失已发布成果、主错误保全；锁清理错/既有锁文件与目录保全；根/锁identity改变拒绝处理；allocation与metadata失败、权限原错；payload外目标拒绝；CLI新增字段仅AST字典求值。23精确节点经V00，旧14 seed的placeholder计数回归通过，其他refresh/import测试不跑。
- 文件边界：新夹具专用r89-offline TemporaryDirectory，递归删除拦截器核绝对路径在该root，根收尾亦核系统temp父目录/原分配名；真实ZIP只有tiny合成字节。media_root/prepare/URL选择均替身，旧build1使用其自有临时media/输出夹具。无真实下载/媒体准备/维护/import/既有运维目录访问。原缺陷只在合成notes中复现，没有删除用户资料。
- 保全：1257基线仅改11既有白名单，其余1246字节保持；新增workspace service/test两文件。82旧档3089封存文件及manifest SHA保持，CSV仅R89，其他97含25冻结字节不变。源精确快照重放/AST：非build/DTO、seed选择、媒体参数/manifest条目/计数、ZIP成员循环、CLI parser/其他分支保持；runner仅23精确nodeid，隔离guard不改。HEAD/原分支/空index/EOL保持、diff --check0；handoff最新F82/F81/F80，移出F79在original。
- 状态/限制：普通1 DONE/71 IN_PROGRESS/1 TODO，PILOT_SPECIFIED72/NEEDS_DESIGN1/FROZEN_SCOPE25，总98/97未解决。R89本地实施自验齐备但review=PENDING，不关单；下一普通R96先定卡，25冻结继续停止。线程并发与实际Windows文件操作不是跨进程/网络文件系统/断电fsync验收；非协作外部写者在stat检查后的竞态不承诺原子CAS，真实源媒体缓存仍原合同，不是媒体存储事务。未检查真实锁或自动恢复残留。
- 无真实服务/下载/媒体/模型/业务库/私有数据/维护CLI/import/PG/视频/GPU付费/全套/冻结安全专项；无委派/独立复核/切分支/提交推送部署。原未提交内容保护，总修bug目标继续。


## F83 / repair-pilot-083 / R96 · 单位声明优先与标定来源

- 卡片：F83 / repair-pilot-083 / R96，IN_PROGRESS / review=PENDING。普通本地实现自验齐备但未独立验收，不标ACCEPTED/DONE，唯一DONE仍R98。用户普通修bug授权延续，本卡没有解冻25项或新增委派授权。
- 优先级：新增cad/unit_scale，用户已确认两点标定 > 可换算有效$INSUNITS > 缺失/无法换算的估算。原米/厘米/毫米/英寸保精确常数；其他支持单位只用安装ezdxf conversion_factor，不猜额外常数。参考跨度3–80米及真实decimeter门洞hint只产冲突与标定提示，不改显式米/厘米/毫米/英寸比例。缺失/unsupported依旧保span和door估算，source明确且requires_calibration=true，不删全部兼容规则。
- 来源：drawing_initial及floor独立保存version1 unit_info（header code/declared scale/current scale/span/hint/conflicts/需标定/note）；floor.scale_note兼容既有显示。manual仅当前floor切user_calibration、clear需标定并保initial_source/initial_scale/note和原声明；legacy无来源不读旧文案猜单位。重复相同标定幂等、其他floor及root初始信息不覆盖，原undo/geometry/area/polygon计算AST保持；无自动reparse或历史面积回填。
- 显示：api.ts仅CadUnitInfo及spaces/floor可选字段；CadPreparationPanel只在已有校准区显示需标定说明，正常/legacy无字段/已确认标定不添旧警告。原草稿/校准输入/提交/路由/异步行为与样式文件不改，依旧由用户保存已知长度确认，没有新的隐式比例切换。
- 证据：从original加载真实旧build/layout链路，同物理100×80米的米/厘米旧面积约80㎡、毫米控制8000㎡；新三者均约8000㎡。新内存DXF/实际raster/最终polygon/usable链路，毫米/厘米/米20×16坐标与可用面积、mpp和家具px等价；英寸1000单位旧cutoff不再破比例。真实门洞hint可出现但声明米不变，unknown仍可door估算；3/80上下、支持foot/dm/km、unknown/损坏header及非法span均覆盖。
- 验证：首轮15新+R97 7+R37标定2共24精确节点，21 passed/3 failed、82 subtests in50.71s；失败是测试误把usable当gross、2×1.6米房间触发原外沿浅槽排除、manual像素面积与gross混用。只改3测试方法，不改实现；按跨单位usable等价、小图2.8×2与像素面积公式纠正后3节点中2过/1多边形壁线容差过严（20米边界的已测polygon宽19.866米，属原壁线栅格差），再用实际mpp对应8px壁线容差后剩1过。最后3受影响测试均已通过，首轮未受影响21及82子断言不重复，原24节点累计通过；追加隔离驱动1节点执行6个原毫米service方法全部通过，加入inner testsRun=1/skip与expectedFailure皆空检查后再次1 passed/6 subtests in12.22s，合计25节点；不是伪称整批最终重跑全绿。
- 数值合同：闭合轮廓gross可约8000㎡，manual依据原mask像素计数可为7922.41㎡，两者不强制相等；测试同时核精确counts×(known_length/pixels)^2及1.5%栅格差，unit ratio/undo恢复仍核对。usable扣墙/通道后20×16例约285㎡，核单位等价而不改布局算法。家具0.9m可有round tie的1px差，不以固定40px假断言替换实际mpp换算。
- 前端/范围：实际React SSR提示3 passed，无API/草稿/action调用或floor修改；api.ts/Panel两个目标strict、显式已安装Vite ambient及global诊断前后均0，child0。后端每次精确V00 nodeid，所有新图纸/图片/几何在内存，新标定read_binary_asset为内存替身，R37两例沿其专用临时媒体夹具；未运行真实CAD文件/转换器/存储/模型/GPU或旧完整CAD/ASGI套件。
- 保全：1259基线只改14既有白名单，其余1245字节保持；新增unit_scale/backend测试/frontend测试三文件。83旧档3132封存文件及manifest SHA保持；CSV仅R96，其他97含25冻结字节不变。源精确重放/AST：除单位wrapper/决策与metadata外算法保持、每floor栅格/面积/多边形逻辑不改，preparation只来源字段、Panel只一条提示；仅3原测试方法比首轮变化，并新增1个毫米夹具驱动；test_cad_extract仅六处构造补显式毫米，原断言/其他含ASGI代码全保留。runner只增16 nodeid，9受影响本来已获准，隔离guard不变。HEAD/原分支/空index/EOL保持、diff --check0；handoff留F83/F82/F81，移出F80在original。
- 总目标边界：普通1 DONE/72 IN_PROGRESS/0 TODO；PILOT_SPECIFIED73/NEEDS_DESIGN0/FROZEN_SCOPE25，总98/97未解决。当前实现状态和测试不证明全部bug已关闭，72项仍待独立验收，25仍冻结。已向用户请求下一解冻R编号或独立验收范围；等待答复，不把普通TODO0当完成，也不擅自展开全项目复核/重跑已过检查/委派/解冻。
- 限制：仅针对新解析和用户明确保存的标定，已有工件/面积/布局不自动刷新；手工已标定的legacy source记录unknown初始，不猜metadata。保现有栅格浅槽排除/墙线/usable/标定像素算法，不能以本卡宣称所有CAD尺度/家具/转换分支均验收。真实图纸/转换/生产数据/完整ASGI/浏览器交互、独立review另验。
- 无真实服务/模型/业务库/私有图纸/文件转换/批量重算/正式媒体写入/维护/GPU付费/视频/全套/冻结安全专项；无委派/独立复核/切分支/提交推送部署。
