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

- 2026-10-26发布执行接手：最新授权包括提交/推送/PR和验收通过后部署；候选隔离门槛已通过，生产仍b27且旧容器未变。见[执行记录](release-execution-2026-10-26.md)。本分支保留、不委派，待成套备份后生产切换。

# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

- 2026-10-25发布准备：见[本地就绪核对](release-readiness-2026-10-25.md)。离线前端构建exit0；51迁移静态单head e51fa962c846/无缺父；615源码配置哈希保持。已整理候选源快照与上线/回退步骤，尚未连接服务器、执行迁移或发布。建议下一步仅只读核对实际镜像/配置/迁移基线，保全线上Qwen/种子热修；普通72待验收、25冻结状态不变，不自关单。

- 2026-10-25服务器只读核对：见[实测结果与候选路线](server-readonly-report-2026-10-25.md)。backend健康/3 worker运行、Qwen种子热修和b27迁移基线已确认；57内容差异+19新增组成76文件本地覆盖输入，102仅换行文件排除。10容器启动时间保持；无上传/构建/重启/迁移/部署。下一阶段服务器隔离候选验收超出只读授权，待明确；本机Docker daemon当前不可用，72待验收/25冻结状态不变。

- 2026-10-25发布执行移交：用户最新请求另开新对话负责更新GitHub并部署服务器；具体授权、候选、资源边界与步骤见[发布交接](release-handoff-2026-10-25.md)。该发布请求覆盖此前不提交/推送/部署及只读限制，冻结25项、不委派、不切分支与数据保全继续有效。原对话交接后停止编辑共享工作区，由新对话完成候选隔离验收、必要GitHub更新和验证后的部署；当前尚未提交/推送/部署，72项review=PENDING不变。

## Latest Handoffs

### [2026-10-25] F83 / R96 单位比例 / 普通TODO0仍未关单

- 当前执行：F83 / R96已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f83-r96-2026-10-25/evidence.md)。用户已知长度标定优先，其次有效声明单位；3/80米跨度与门洞线索只提示冲突，不再覆盖已声明比例。缺失/无法换算仍保旧估算但明确来源/需标定，floor/root保存单位元数据，旧图仅在用户显式标定后改当前floor并保initial来源。100×80米及同物理厘米/毫米均约8000㎡，真实polygon/usable/家具换算/legacy标定与undo链路已验。后端25精确节点累计通过：首轮21过、修正3测试预期后对应3过，追加1隔离驱动执行6个原毫米用例也通过；前端3 passed、2目标strict前后0诊断。1259基线/83旧档保持；普通1已验收、72进行中、0 TODO，冻结25 STOPPED、总未解决97。未关闭任何R项，当前不等于全部bug完成；下一需用户指定解冻项或独立验收范围，不自行复核全项目/委派/解冻/提交部署。

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

### [2026-10-25] F82 / R89 打包归属 / 下一R96

- 当前执行：F82 / R89已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f82-r89-2026-10-25/evidence.md)。bundle独占随机暂存/payload和私有ZIP，同输出exclusive-create锁冲突先于媒体准备；完成ZIP关闭且输出未改变才原子replace。复制/manifest/ZIP/发布前核归属，仅清本次核验目录/锁，原固定__bundle和他任务目录不碰。清理失败单独返回warning/保留路径，不把已发布成功改失败、不覆盖原错误；失去归属/既有锁不自动删。22新+原build1共23 passed/5 subtests、child0，无warning/fail/skip；全部专用临时文件/ZIP与媒体替身。1257基线/82旧档保持，普通1已验收、71进行中、1 TODO，25冻结STOPPED、总未解决97。无真实维护/下载/媒体/业务库/委派/独立复核/提交部署，不关R89，下一R96先核入口并定有界卡。

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

### [2026-10-25] F81 / R88b 聚合与显示 / R88本地实施齐备

- 当前执行：F81 / R88b已本地实施，R88两部分本地实现齐备但整体IN_PROGRESS / review=PENDING；[证据](archive/f81-r88b-2026-10-25/evidence.md)。共享reader按版本/身份/状态解读观测，旧未标记Agent与坏/未来事件为unknown，调用率以known轮次为分母并显示覆盖数。低调用率仅known>=min10且精确计数比小于阈值才触发；样本不足不触发也不自动恢复旧告警。非流式TTFT/null与完整first_response分列，API/TS/界面保三态、未知不作否/0。后端16新+6受影响共22 passed/23 subtests，界面5 passed，2目标strict含Vite ambient前后0诊断；均child0。1254基线/81旧档保持，普通1已验收、70进行中、2 TODO，25冻结STOPPED，总未解决97。未运行evaluate/调度/写告警或历史回填、真实模型/服务，无委派/独立复核/提交部署；R88不关单，下一R89先定有界本地修复卡。

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

