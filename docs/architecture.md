2026-10-26本地Qwen按输入数路由：reference_input_counts描述已核模板集合，任务接收原子保存变体SHA/输入数；worker/恢复固定同一合同。v1.1双图只扩读图节点和图片连接，运行时检查其余参数/绑定不变；未上线，见[接线记录](qwen-reference-routing-2026-10-26.md)。

2026-10-26本地人员排期：PeoplePlanner复用原PeopleSchedule时间轴与项目版本保存，staffPlanning只应用明确人员/分工/日期变更；跨项目负荷用未被筛选的年度项目，调整在内存预览并逐项目确认保存。无API/迁移/权限变更，尚未发布；见[工作台记录](people-planning-2026-10-26.md)。

2026-10-26发布完成：源码e6add45已推送，草稿PR #5未合并；backend健康/3worker运行/frontend新包生效，生产迁移e51、源码/静态包/公网核验通过。23文件私有配对备份SHA一致，24媒体归档恢复链中2个基础包依赖本机。当前第三Compose和有效发布目录必须保留，详见[执行记录](release-execution-2026-10-26.md)。72待验收、25冻结及R98唯一DONE保持。

2026-10-24当前执行：F53 / R62已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f53-r62-2026-10-24/evidence.md)。截图上传按epoch/稳定slot同步预留4项容量，每个成功项合并当前列表并按选择顺序排列，不复活移除项、不覆盖并发结果。部分成功立即保留，失败释放未完成预留并保留本地上传提示；重置/卸载拒绝旧观察，preview从创建起有暂定owner到commit。新24+R61受影响精确9共33 passed，2目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、50进行中、22 TODO，冻结25未解决，总未解决97；R62不关单，无委派/独立复核/真实上传发送/服务/提交部署。实际Page/helper配VM/伪React/API/FileReader/URL，非真实浏览器/HTTP/媒体验收。下一普通R63先定灵感查询归属卡，冻结停止。

2026-10-25当前执行：F83 / R96已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f83-r96-2026-10-25/evidence.md)。用户已知长度标定优先，其次有效声明单位；3/80米跨度与门洞线索只提示冲突，不再覆盖已声明比例。缺失/无法换算仍保旧估算但明确来源/需标定，floor/root保存单位元数据，旧图仅在用户显式标定后改当前floor并保initial来源。100×80米及同物理厘米/毫米均约8000㎡，真实polygon/usable/家具换算/legacy标定与undo链路已验。后端25精确节点累计通过：首轮21过、修正3测试预期后对应3过，追加1隔离驱动执行6个原毫米用例也通过；前端3 passed、2目标strict前后0诊断。1259基线/83旧档保持；普通1已验收、72进行中、0 TODO，冻结25 STOPPED、总未解决97。未关闭任何R项，当前不等于全部bug完成；下一需用户指定解冻项或独立验收范围，不自行复核全项目/委派/解冻/提交部署。

2026-10-25当前执行：F82 / R89已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f82-r89-2026-10-25/evidence.md)。bundle独占随机暂存/payload和私有ZIP，同输出exclusive-create锁冲突先于媒体准备；完成ZIP关闭且输出未改变才原子replace。复制/manifest/ZIP/发布前核归属，仅清本次核验目录/锁，原固定__bundle和他任务目录不碰。清理失败单独返回warning/保留路径，不把已发布成功改失败、不覆盖原错误；失去归属/既有锁不自动删。22新+原build1共23 passed/5 subtests、child0，无warning/fail/skip；全部专用临时文件/ZIP与媒体替身。1257基线/82旧档保持，普通1已验收、71进行中、1 TODO，25冻结STOPPED、总未解决97。无真实维护/下载/媒体/业务库/委派/独立复核/提交部署，不关R89，下一R96先核入口并定有界卡。

2026-10-25当前执行：F81 / R88b已本地实施，R88两部分本地实现齐备但整体IN_PROGRESS / review=PENDING；[证据](archive/f81-r88b-2026-10-25/evidence.md)。共享reader按版本/身份/状态解读观测，旧未标记Agent与坏/未来事件为unknown，调用率以known轮次为分母并显示覆盖数。低调用率仅known>=min10且精确计数比小于阈值才触发；样本不足不触发也不自动恢复旧告警。非流式TTFT/null与完整first_response分列，API/TS/界面保三态、未知不作否/0。后端16新+6受影响共22 passed/23 subtests，界面5 passed，2目标strict含Vite ambient前后0诊断；均child0。1254基线/81旧档保持，普通1已验收、70进行中、2 TODO，25冻结STOPPED，总未解决97。未运行evaluate/调度/写告警或历史回填、真实模型/服务，无委派/独立复核/提交部署；R88不关单，下一R89先定有界本地修复卡。

2026-10-25当前执行：F80 / R88a已本地实施，R88整体仍IN_PROGRESS / review=PENDING；[证据](archive/f80-r88a-2026-10-25/evidence.md)。实际非流式Model.request边界记录逐次run/call/turn身份、尝试状态和耗时，Agent线程桥接到Tracker版本化metadata；多工具往返分别计数，不把thinking或本地回复分片当首token。完整响应时间单列first_response_ms，TTFT明确null；取消时快照censored，尚未观测调用为unknown，晚到worker不能改已存快照。19新+F73/F74受影响51共70 passed、41条第三方弃用warning、child0。1252基线/80旧档保持；普通1已验收、70进行中、2 TODO，25冻结STOPPED，总未解决97。R88a只补采集，下一F81/R88b必须统一新旧覆盖/聚合/API/告警口径；不关R88，无真实模型/HTTP/业务库/告警评估/委派/独立复核/提交部署。

2026-10-25当前执行：F79 / R87b已本地实施，R87两部分本地实现齐备但整体IN_PROGRESS / review=PENDING；[证据](archive/f79-r87b-2026-10-25/evidence.md)。全量同步新建随机generation，创建/配置/分批写入逐task核UID/目标/成功终态并核文档数量，再按业务revision及旧active锁内CAS切换并ack意图；失败/未知/并发变化保旧索引。零集可切空新代，旧不确定任务晚到只影响旧代。读取只用DB active并回主库核指纹/存在性/shared可见性，以主库字段返回；未就绪/pending/异常/陈旧走原SQL。32新+F78受影响32共64 passed、41 subtests、1既有弃用warning、child0。1250基线/79旧档保持，普通1已验收、69进行中、3 TODO，25冻结STOPPED，总未解决97。无真实Meili/PG/业务库/迁移同步/委派/独立复核/提交部署；R87不关单，下一普通R88先核真实调用遥测边界并定有界卡。

2026-10-25当前执行：F78 / R87a已本地实施，R87整体仍IN_PROGRESS / review=PENDING；[证据](archive/f78-r87a-2026-10-25/evidence.md)。六个灵感/共享模板CRUD同事务保存业务与持久索引意图，响应后使用独立Session派发；索引异常不再把已提交成功伪成失败。每域单在途凭据，异步终态确认才记应用版本，未知提交不盲重发；重试从主库读取最新状态。新增迁移只建两表/两个锁行，SQLite DDL/seed/版本失败完整回滚。32新+R32受影响12共44 passed、3 subtests、1既有弃用warning，child0。1247基线/78旧档保持；普通1已验收、69进行中、3 TODO，25冻结STOPPED，总未解决97。R87a仅部分修复，下一F79/R87b完成新generation全量同步/CAS切换、读取主库核验及pending SQL回退；未知提交恢复依赖该后续卡，不关R87，无委派/独立复核/真实索引或服务/提交部署。

2026-10-25当前执行：F77 / R86e已本地实施，R86各本地修复路径及补账入口齐备但整体IN_PROGRESS / review=PENDING；[证据](archive/f77-r86e-2026-10-25/evidence.md)。新增明确receipt ID的默认只读预览/指纹核对apply工具，统一三路径metadata-only settle，不导入SDK/读取正文/重放模型记忆。未知/冲突/陈旧预览不写；重复与并发只留一账，部分失败非零退出。新增完整身份/金额/计数/时间/类型核对，拒绝跨类型同一调用重复账。23新+三路径受影响84共107 passed、1既有弃用warning、child0。1244基线/77旧档保持，普通1已验收、68进行中、4 TODO，25冻结STOPPED、总未解决97。未执行真实维护CLI/业务库操作，无委派/独立复核/提交部署；R86不关单，下一R87先核索引副作用边界并定有界卡，不以复核阻断普通修复。

2026-10-25当前执行：F76 / R86d已本地实施，R86整体IN_PROGRESS / review=PENDING；[证据](archive/f76-r86d-2026-10-25/evidence.md)。普通回复模型前留独立凭据，回复/数字用量先独立提交和计账，再memory；记忆失败不回滚已知消耗。未报用量unknown不填0，累计已知计数不被空/坏/零事件覆盖。每chunk交付前核会话，删除/无法确认后停止输出并只保合法用量收尾，不回建内容；重复完成只写一消息/账/记忆。21新+原R12 10+F75停止2共33 passed、1既有弃用warning、child0。1242基线/76旧档保持，普通1已验收、68进行中、4 TODO，25冻结STOPPED、总未解决97。下一继续R86 pending凭据可用运维补账入口，不关单，无委派/独立复核/真实服务/提交部署。

2026-10-25当前执行：F75 / R86c已本地实施，R86整体IN_PROGRESS / review=PENDING；[证据](archive/f75-r86c-2026-10-25/evidence.md)。普通Chat压缩每次调用独立凭据，先提交原会话摘要与无正文数字用量，再独立计账；同until多次真实调用分别记账，空摘要也保已知消耗。失败Session先rollback再裁剪/静态日志，输入快照避过期ORM；摘要提交故障仅重试本地结果，删除/无法核实停止后续回复，不重建内容。25新+原R12受影响10共35 passed、1第三方弃用warning、child0。1240基线/75旧档保持，普通1已验收、68进行中、4 TODO，冻结25 STOPPED、总未解决97。下一继续R86普通回复memory事务及pending凭据运维接入，不关单、无委派/独立复核/真实服务/提交部署。

2026-10-25当前执行：F74 / R86b已本地实施，R86整体IN_PROGRESS / review=PENDING；[证据](archive/f74-r86b-2026-10-25/evidence.md)。Agent模型前提交调用凭据，完成后先保存原会话回复和无正文的数字用量，再独立记账/写记忆；删除后保合法消耗，不重建内容。按receipt唯一源去重，账本失败可仅按凭据补账并沿调用价格快照；成功但未报用量明确unknown，不伪造零账。路由复用消息/账本且核call_id，取消等待不阻断后台完成；28新+23受影响回归51 passed。原未提交/74旧档保持，普通1已验收、68进行中、4 TODO，冻结25 STOPPED、总未解决97。下一F75继续R86普通Chat压缩摘要与失败Session恢复；无委派/独立复核/真实服务/提交部署，不关任何R项。

2026-10-25当前执行：F73 / R86a已本地实施，R86整体IN_PROGRESS / review=PENDING；[证据](archive/f73-r86a-2026-10-25/evidence.md)。Agent完成后记忆改用独立Session，不commit/rollback调用者或已接受工具；flush/commit失败仍保原reply和已知token/cache。模型前产生本次call_id；独立DB标量检查会话，删除/属主不匹配撤销，无法核实停止输出，路由不写回复预览/消息/旧遥测。23精确离线回归通过，原2真实约束红复现保留；原未提交及73旧档保持。普通1已验收、68进行中、4 TODO，冻结25 STOPPED、总未解决97。R86仍欠独立持久call/用量审计、取消/删除及重复记账、普通Chat压缩摘要与失败Session恢复；下一F74先接持久审计边界，不以本卡吞异常冒称全修，无委派/复核/真实服务/提交部署。

2026-10-25当前执行：F72 / R81已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f72-r81-2026-10-25/evidence.md)。管理回复捕获反馈/editor与字段版本，原提交成功仅清未改文本，期间B/ABA及新沟通状态保留；改进状态独立版本/baseline确认，不清回复框。reply/improvement同步互斥并保持列表busy禁切换，旧账号/error/finally不占新操作；已发送与刷新失败分开，父列表latest读取且草稿保全。32实际React/DOM场景+1隔离33 passed，2目标strict前后同3旧router JSX、新0；原反馈UI快照及CSS SHA保全。普通1已验收、67进行中、5 TODO，冻结25未解决，总未解决97；R81不关单，无委派/独立复核/真实消息通知或服务/提交部署。NEEDS_CARD已无剩余，下一普通待设计R86先核后置事务边界并定卡，R86/R87/R88/R89/R96仍NEEDS_DESIGN，25冻结停止。

2026-10-25当前执行：F71 / R80已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f71-r80-2026-10-25/evidence.md)。使用日志复用未改查询Hook，完整筛选/page/pageSize/revision绑定记录/费用/更新时间/error/loading；旧成功/失败/finally不占当前，失败保带来源的最后成功结果。显示实际筛选/页码/页大小，草稿与查询意图分离；响应页码clamp不写effect依赖，后续显式操作以接受页为准，旧clamp不重启请求。32实际React/DOM场景+1隔离33 passed，单目标strict前后0诊断；普通1已验收、66进行中、6 TODO，冻结25未解决，总未解决97。R80不关单，无委派/独立复核/真实业务账或服务/提交部署；原日期/过滤/费用/API/后端保持，下一普通R81先保护原反馈UI改动并定卡。

2026-10-25当前执行：F70 / R79已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f70-r79-2026-10-25/evidence.md)。模板原图/最终图及工具封面按账号、实体/editor、字段版本/远端baseline与上传token隔离；清空/重选使旧成功/error/busy失效，慢读失效不发上传。双字段可并发/重新选择，实际submit也拒当前有效待定上传；迟到成功工件保原来源，仅确认后恢复至原条目/原新建稿，不自动写B。上传80实际React/DOM场景+1隔离81 passed，受影响R78三页110场景+3隔离113 passed，共194执行；5目标strict前后同3旧router JSX、新0。普通1已验收、65进行中、7 TODO，冻结25未解决，总未解决97；R79不关单，无委派/独立复核/真实上传或服务/提交部署。原CRUD/文件限额/API/后端保持，ContentEditor只追加字段ticket API，两父route移除旧upload全局反馈；下一普通R80先定查询归属卡。

2026-10-25当前执行：F69 / R78c工具已本地实施，R78三页本地实施自验齐备但整体IN_PROGRESS / review=PENDING；[证据](archive/f69-r78c-2026-10-25/evidence.md)。工具复用原编辑会话/字段版本/远端baseline与父查询代次，旧保存/删除/刷新不覆盖B、新建或期间同A输入；冲突保稿可恢复，缺失原id阻止误POST，创建回执保PATCH身份。实际React/DOM37场景+1隔离38 passed，2目标strict前后同3旧router JSX、新0；复用两Hook未改，公告/模板和旧封存保持。普通1已验收、64进行中、8 TODO，冻结25未解决，总未解决97；R78不关单，无委派/独立复核/真实工具服务/提交部署。原八字段payload/trim/数值/校验/默认/确认与封面上传函数体保持，必要setter接线不代替R79；下一普通R79先定有界上传归属卡。

2026-10-25当前执行：F68 / R78b共享模板已本地实施，R78整体IN_PROGRESS / review=PENDING，工具R78c仍待实施；[证据](archive/f68-r78b-2026-10-25/evidence.md)。模板复用编辑会话/字段版本和远端baseline，旧保存/删除不切回A或清B，列表clone/无关新增不重置dirty；缺失原id阻止误POST，冲突可显式恢复，创建回执保PATCH身份。父PromptTemplatesRoute复用F66读取归属；共享Hook仅加内容名称参数，公告缺省保持。实际React模板39场景+1隔离40 passed，受影响公告34场景+1隔离35 passed，共75执行；3目标strict前后同3旧router JSX、新0。普通1已验收、64进行中、8 TODO，冻结25未解决，总未解决97；R78不关单，无委派/独立复核/真实模板服务/提交部署。原payload/过滤/分类/显示及上传函数体保持，必要setDraft接线不代替R79上传归属修复；下一R78c工具，不越序启动R79。

2026-10-25当前执行：F67 / R78a公告部分已本地实施，R78整体IN_PROGRESS / review=PENDING，模板/工具未实施；[证据](archive/f67-r78a-2026-10-25/evidence.md)。公告编辑按账号/独立会话/字段版本保护，旧保存/删除不清B或后续同A输入；列表仅合并未编辑字段，冲突保稿并可显式加载服务器版本，缺失原条目保原id且阻止误POST。有效新建回执保id，刷新失败后后续仍PATCH；操作按实体互斥，错误/忙状态归原操作。父AnnouncementsRoute复用F66查询Hook拒旧GET。实际React/DOM34场景+1隔离共35 passed；3目标strict前后同3项旧router JSX诊断、新增0。普通1已验收、64进行中、8 TODO，冻结25未解决，总未解决97；R78不关单，无委派/独立复核/真实公告服务/提交部署。原公告时间/默认窗/校验/确认/payload保持，模板/工具/上传及其他routes未改；下一实施R78b共享模板，不跳到R79。

2026-10-25当前执行：F66 / R77已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f66-r77-2026-10-25/evidence.md)。生成/Chat统计及Dashboard读取绑定账号、查询对象及请求代次；成对/整批接受数据、来源参数和时间，旧成功/error/finally不写当前。保留最后成功结果并显示真实数据窗口；看板日期/分组跟随文案及CSV读取已展示数据来源，选择及日期输入保当前意图。维护/告警完成刷新当时当前窗口，原操作pending去重、错误/busy局部，不重放写入。真实React/DOM54场景+1隔离检查共55 passed，非file请求/页面错误/未捕获Promise均0；5目标strict前后同5项旧诊断、新增0。普通1已验收、63进行中、9 TODO，冻结25未解决，总未解决97；R77不关单，无委派/独立复核/真实统计维护或服务/提交部署。原GET参数/统计/费用/告警/业务日期算法及其他routes保持，下一普通R78。

2026-10-25当前执行：F65 / R76已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f65-r76-2026-10-25/evidence.md)。Chat观测选中会话、当时标题/用户及messages/traces/loading/error绑定独立view和read代次；切换/同id重选即清旧详情，成对接受本次结果，旧成功/error/finally不写新view。初始overview与详情分离，不随error callback引用重查；错误在观测面板/本次详情本地显示，Main仅传已有账号owner，保其他编辑反馈。VM18及真实React/DOM6复测通过（6与VM重叠，共24执行），page errors/非file请求0；2目标strict前后0诊断，child0无skip/stderr空。普通1已验收、62进行中、10 TODO，冻结25未解决，总未解决97；R76不关单，无委派/独立复核/真实会话服务/提交部署。原只读GET参数/limits/权限合同保持，R74/冻结R75其他行为不改；下一普通R77。

2026-10-25当前执行：F64 / R74已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f64-r74-2026-10-25/evidence.md)。策略/元数据/安装输入/Override分别绑定编辑会话和版本，原未改稿才清理，同稿新输入或B稿保留；busy按实体，finally仅释放原token。文件预览绑定Skill+路径+owner，换文件/展开/收起拒旧正文与error/loading；父AgentsRoute和Override列表按读取代次拒旧回写，错误updater再核用户意图。最终VM39通过，原12场景真实React19/ReactDOM+本机缓存Chromium复测12通过（重叠场景，共51执行），页面错误/非本地请求0；4目标strict前后同3项旧router JSX诊断、新增0。普通1已验收、61进行中、11 TODO，冻结25未解决，总未解决97；R74不关单，无委派/独立复核/真实安装发布或服务/提交部署。R75冻结，原候选分支/来源选择/请求合同保持，无专项执行；观测子面板原逻辑保留，下一普通R76。

2026-10-25当前执行：F63 / R73已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f63-r73-2026-10-24/evidence.md)。润色/Bigjpg草稿按字段dirty、输入版本和远端基线合并，刷新只更新未编辑字段，同字段冲突保稿并可显式加载服务器配置。旧保存只确认原版本，期间新Key/地址/提示词/长度保留；已保存但刷新失败明确提示，Bigjpg有效新建回执保目标id供后续PATCH，缺id不盲目再POST。父SettingsRoute按账号及读取代次拒旧回写/旧错误，手动初始刷新失败有提示且Promise被处理。新36定向passed，5目标strict前后同3项旧router JSX诊断、新增0，child0无skip/stderr空。普通1已验收、60进行中、12 TODO，冻结25未解决，总未解决97；R73不关单，无委派/独立复核/真实润色超分/配置服务/提交部署。2026-10-24起卡、10-25收口；R72经CSV确认冻结，纠正上一交接误指并停止，无实施/测试，下一普通R74。VM/伪React/API非真实浏览器/HTTP/服务端CAS，冻结停止。

2026-10-24当前执行：F62 / R71已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f62-r71-2026-10-24/evidence.md)。默认批导入由后端按规范化渠道URL+原模型ID生成稳定且有界的标识，同源不同原ID/跨源同SKU不再因slug碰撞漏项；先复用同身份历史名字，保原配置和引用。支持可选手填导入标识，冲突显示建议，显式名字不重命名已有配置；逐项savepoint/flush后唯一竞争核实际winner，保后续项。16隔离SQL+11新前端+受影响R70/R69精确9共36 passed，2目标strict前后同3项既有api ImportMeta诊断、新增0，child exit0无skip/stderr空。普通1已验收、59进行中、13 TODO，冻结25未解决，总未解决97；R71不关单，无委派/独立复核/真实配置导入服务/提交部署。AST/实际ORM列/SQLite内存及VM不是PG/ASGI或真实线程并发验收；默认确定名受原唯一约束仲裁，不新增跨任意显式名字的身份唯一约束。下一普通R72，冻结停止。

2026-10-24当前执行：F61 / R70已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f61-r70-2026-10-24/evidence.md)。批导入保留created/skipped旧数组，新增原model_id/provider_name逐项created/already_same/conflict；已存在同规范来源和原模型身份才确认，不覆盖原配置。页面按本次提交pair回写，确认项移出未导入，冲突/未确认保留选择并说明；旧响应仅安全映射唯一created，skipped不猜身份。新16前端+8隔离后台+受影响R69精确7共31 passed，2目标strict前后同3项既有api ImportMeta诊断、新增0，child exit0。普通1已验收、58进行中、14 TODO，冻结25未解决，总未解决97；R70不关单，无委派/独立复核/真实导入服务/提交部署。VM/AST/伪React/API/内存列表非HTTP/SQL/生产验收；R71命名碰撞和跨渠道全局去重仍未修，下一普通R71先设计，冻结停止。

2026-10-24当前执行：F60 / R69已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f60-r69-2026-10-24/evidence.md)。模型/规则操作捕获实体、编辑会话和输入版本，只清理原未改稿；启停只合并原编辑器未改enabled，预览随模型/草稿/参数失效。忙状态按实体隔离，探测/批导入按批次、凭证快照和选择版本隔离；旧批次不清新选择或标记新同ID模型。父ModelsRoute刷新最新读取优先，反馈在updater再核当前意图。新40+受影响R67/R68精确10共50离线passed，3目标strict前后同3项既有router JSX诊断、新增0，exit0无skip/stderr空。普通1已验收、57进行中、15 TODO，冻结25未解决，总未解决97；R69不关单，无委派/独立复核/真实模型维护服务/提交部署。VM/伪React/API非真实浏览器或服务端取消/CAS证明，R70导入返回ID匹配及R71命名保持待修；下一普通R70，冻结停止。

2026-10-24当前执行：F59 / R68已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f59-r68-2026-10-24/evidence.md)。计费规则draft与原ruleId/profileId身份放同一原子编辑state，换不同Chat模型回该模型新增稿，同模型保当前编辑。保存核当前Chat模型和规则原归属，缺失/归属变化拒绝，不把浏览模型解释为迁移；明确更新仍PATCH原规则，新增仍POST。新20+受影响R67精确2共22离线passed，1目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、56进行中、16 TODO，冻结25未解决，总未解决97；R68不关单，无委派/独立复核/真实规则或服务/提交部署。VM/伪React/API/Map非SQL或服务端CAS，后端迁移能力保持；R69异步完成串位下一卡，冻结停止。

2026-10-24当前执行：F58 / R67已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f58-r67-2026-10-24/evidence.md)。预设与已有profile共用受管理字段读取，档价/支持档位/上游模型及四SKU进入规范草稿后按原字段重建，扩展JSON保留。新预设重置模型专属价格/映射，只保当前凭证/启用；手填值为保存真值，合法零价保持，非有限负价/非对象JSON本地拒绝。新23前端+8真实纯计价/映射AST共31通过，1目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、55进行中、17 TODO，冻结25未解决，总未解决97；R67不关单，无委派/独立复核/真实服务配置/报价同步/提交部署。VM/伪React/API及纯AST非HTTP/SQL/真实账单，原preset数值未改；下一普通R68另定规则归属卡，冻结停止。

2026-10-24当前执行：F57 / R66已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f57-r66-2026-10-24/evidence.md)。GIF显示由账号scope/选择token隔离深链与参数补读，历史/本地/复制明确选择优先，preview和download共用当前结果。本地补读绑定原工件，不转成持久history覆盖；显示代次独立于批次执行，浏览历史不取消已受理批次。新26+原GIF页面精确3共29离线passed，2目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、54进行中、18 TODO，冻结25未解决，总未解决97；R66不关单，无委派/独立复核/真实GIF或服务/提交部署。VM/伪React/API/恢复下载边界，非DOM/HTTP/压缩质量验收；下一普通R67先定模型预设合同，冻结停止。

2026-10-24当前执行：F56 / R65已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f56-r65-2026-10-24/evidence.md)。导入POST前同步登记意图与Promise，重复确认复用；取消重开恢复原操作，未知受理保持锁定，仅明确拒绝可重试。有效正整数receipt才确认成功，已成功意图不重复POST；显式新建允许相同内容独立条目，旧意图有本页恢复入口，列表核对不解锁。新21+R64受影响精确11共32离线passed，2目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、53进行中、19 TODO，冻结25未解决，总未解决97；R65不关单，无委派/独立复核/真实服务/提交部署。VM/伪React/API/隔离Map，非HTTP/SQL/服务器幂等验收；仅本页账号内存，重载/多标签无幂等保证。下一普通R66另卡，冻结停止。

2026-10-24当前执行：F55 / R64已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f55-r64-2026-10-24/evidence.md)。灵感导入/编辑按账号scope、每次打开会话、URL/标题/封面版本和operation合并有效字段，取消/重开/换post/换图拒绝旧观察。保存捕获目标与字段快照，旧成功不关闭B；同会话新输入保稿并提示原稿已保存，当前提取/上传在handler和按钮阻止保存。新30+受影响R63精确2共32 passed，2目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、52进行中、20 TODO，冻结25未解决，总未解决97；R64不关单，无委派/独立复核/真实服务/提交部署。实际Page/Hook/父route配VM/伪React/API/FileReader/URL，非DOM/HTTP/媒体验收；R65同步互斥/未知受理下一卡，冻结停止。

2026-10-24当前执行：F54 / R63已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f54-r63-2026-10-24/evidence.md)。灵感列表初始/分类/刷新/mutation后读取统一页面账号scope与请求代次，旧响应不覆盖当前分类/posts/loading/error；变更完成刷新当前分类。分类切换即时清旧分类结果，保搜索/来源/选中ID；批量完成仅清未改原选择，保后来选择及ABA。新31定向离线passed，3目标strict前后同3项既有JSX TS2503、新增0，exit0无skip/stderr空。普通1已验收、51进行中、21 TODO，冻结25未解决，总未解决97；R63不关单，无委派/独立复核/真实读写服务/提交部署。实际Page/两个父route/新Hook配VM/伪React/API，非DOM/Router/HTTP验收；R64弹窗请求归属下一卡，冻结停止。

2026-10-24当前执行：F52 / R61已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f52-r61-2026-10-24/evidence.md)。主反馈/线程发送捕获独立草稿版本与operation，原稿未变才清空，新正文/标题/附件及ABA保留；同线程去重、不同线程各守busy。发送错误及其父路由刷新error updater再次核当前意图，旧响应不清新反馈；已commit截图仅无当前草稿/列表owner才释放。新26定向passed，3目标strict前后同3项既有JSX TS2503、新增0，exit0无skip/stderr空。普通1已验收、49进行中、23 TODO，冻结25未解决，总未解决97；R61不关单，无委派/独立复核/真实发送上传/服务/提交部署。实际Page/局部父路由回调配VM/伪React/API/FileReader/URL，非浏览器/真实通知验收。R62上传旧列表合并/容量/部分结果仍待下一卡，冻结停止。

2026-10-24当前执行：F51 / R60已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f51-r60-2026-10-24/evidence.md)。创建/改名按编辑model与版本关闭原草稿，删除在functional updater核当前选择并从最新有效列表回退，不清后来B编辑或抢C选择。成功变更先更新项目集合，专用只读刷新及原full/config读取按ticket防旧列表复原；旧error/finally/卸载/账号切换不写新会话，同账号资料刷新保留当前会话。新操作22+刷新/接线15共37 passed，5目标strict前后同1项既有TS2353、新增0，子进程exit0无skip/stderr空。普通1已验收、48进行中、24 TODO，冻结25未解决，总未解决97；R60不关单，无委派/独立复核/真实服务/提交部署。真实Hook/局部JSX与控制器接线配VM/伪React/API/effects，非完整浏览器/HTTP验收。下一普通R61先定反馈输入归属卡，冻结停止。

2026-10-24当前执行：F50 / R59已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f50-r59-2026-10-24/evidence.md)。引用展示/历史重建/受理完成metadata去固定4截断，HappyHorse r2v可完整展示、逐项移除、复制/再生成9图；原provider/SKU执行限制保持，Grok/普通图像校验按真实数量拒绝超限。旧任务从已保存payload只读投影引用，不改原行，缺失档位仅补保存video_sku且已记录执行SKU优先；已知残缺阻止直接复制/再生成并提示手动重选。前端新16+R58精确1+后台纯AST精确8共25 passed/4 subtests passed，6目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、47进行中、25 TODO，冻结25未解决，总未解决97；R59不关单，无委派/独立复核/真实服务/提交部署。VM/JSX/API及AST纯函数边界替身，非真实视频/浏览器/HTTP/PG验收。下一普通R60先定个人项目异步归属卡，冻结停止。

2026-10-24当前执行：F49 / R58已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f49-r58-2026-10-24/evidence.md)。提交显式携带form/上传项/上传状态快照，历史再生成使用nextForm+nextUploads，不借当前B的图或上传busy，不修改B。视频校验与payload共用本次provider/引用解析；普通提交provider同步与成功清polished在updater核原form，保护排队换稿。22定向离线passed，6目标strict前3项既有诊断/后0项，新增0，子进程exit0无skip/stderr空。普通1已验收、46进行中、26 TODO，冻结25未解决，总未解决97；R58不关单，无委派/独立复核/真实服务/提交部署。实际Actions→Submission→纯构造配VM/伪React/API，非真实视频/DOM/HTTP验收。R59数量和历史保全仍待另卡定边界，25冻结停止。

2026-10-24当前执行：F48 / R54已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f48-r54-2026-10-24/evidence.md)。润色绑定账号/草稿谱系/节点和已提交视图、输入对象及prompt/mode/引用快照，旧成功/失败/finally不回写后来草稿；Studio与Canvas在functional updater内二次核对，prompt/flag原子应用，正常编辑保该稿历史，换稿隔离。新23+受影响原F45精确4/F46精确2共29 passed，13目标strict前后同1项既有TS2353、新增0，exit0无skip/stderr空。普通1已验收、45进行中、27 TODO，冻结25未解决，总未解决97；R54不关单，无委派/独立复核/真实服务/提交部署。实际Hook/局部消费者配伪React/effects/API/JSX/storage，非真实DOM/Router/HTTP或视频验收。下一普通R58仅先定离线表单/引用合同，冻结项停止。

2026-10-24当前执行：F47 / R52已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f47-r52-2026-10-24/evidence.md)。发布打开即固定账号/项目/viewKey/标题与深拷贝图，draft/busy/列表/请求归会话，关闭保留，明确结束才新意图；unknown只读核对不解锁，旧成功/错误/close/navigation不改新会话。复制捕获选择token，选择/新建/删当前/发布使旧copy失效，createProject内层也守激活/列表，已创建项目保留不抢选择。新25+原F08精确3共28 passed，3目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、44进行中、28 TODO，冻结25未解决，总未解决97；R52不关单，无委派/独立复核/真实服务/提交部署。实际Dialog/局部Workspace/Project Hook配伪effects/API/JSX模型，非真实DOM/Router/HTTP或后台幂等验收；会话仅本页内存。下一普通R54另卡，R53冻结停止。

2026-10-24当前执行：F46 / R51已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f46-r51-2026-10-24/evidence.md)。节点级同步run Promise贯通单节点/批量，活跃taskId只附着等终态，下游只在上游有交付物后提交；新意图以journal operation id作submission_key，未知/缺ID保原记录不自动补发，两个重新生成入口显式传意图。批量状态归scope/token，旧continuation/finally不提交新图或清新busy。新22+受影响F45精确3共25 passed，6目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、43进行中、29 TODO，冻结25未解决，总未解决97；R51不关单，无委派/独立复核/真实服务/提交部署。实际Hook/局部批量回调与按钮/图输入helper配伪effects/API/storage，非React DOM/HTTP/后台幂等竞争验收；下一R52另卡。

2026-10-24当前执行：F45 / R50已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f45-r50-2026-10-24/evidence.md)。画布异步操作按账号/实体/提交视图及节点/taskId/执行代次归属，旧poll/sync/上传/标注/拖放不写新图；观察各自取消sleep/后续读取，同任务多scope独立、回A恢复原task，不取消服务器任务。迟到路径/taskId留原画布局部恢复记录，明确恢复且输入版本匹配才应用；项目补只读loaded owner/viewKey，保存请求正文保持。新34+受影响原F43精确1/F08精确4共39 passed，4目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、42进行中、30 TODO，冻结25未解决，总未解决97；R50不关单，无委派/独立复核/真实服务/提交部署。实际Hook/局部回调配伪effects/API/storage/导出，不是真实React DOM/HTTP/浏览器持久性验收；下一R51另卡。

2026-10-24当前执行：F44 / R49已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f44-r49-2026-10-24/evidence.md)。复用F43保存队列，补同模板跨账号写入隔离：锁按templateId，原网络unknown即使Promise清理也暂停该模板后继自动写，只读核对后明确确认才解锁；本地草稿仍按账号隔离，其他模板独立。原两个并行/unknown红复现，新10+受影响F43精确6共16 passed，2目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、41进行中、31 TODO，冻结25未解决，总未解决97；R49不关单，无独立复核/委派/真实服务/提交部署。仅同JS模块Hook/替身API的发送与模拟提交序列证据，非浏览器/跨标签/真实PG/CAS验收；下一普通R50另卡。

2026-10-24当前执行：F43 / R47+R48已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f43-r47-r48-2026-10-24/evidence.md)。模板画布排队即未同步，按账号/模板/草稿ID即时本地备份；两个返回先flush等最新版本确认，失败可保留草稿离开或明确放弃。恢复/冲突/unknown先只读核对、不自动重发；图/标题写串行，旧rename不整图覆盖新视图。视图激活在layout提交阶段，未提交render不废弃当前编辑。新35+原F08实际workspace重试1共36 passed，4目标strict仅3既有JSX/0新增，exit0无skip/stderr空。普通1已验收、40进行中、32 TODO，冻结25未解决，总未解决97；不关R47/R48，无委派/复核/真实服务/提交部署。Hook/局部JSX模型非真实React Router/浏览器/存储验收，无服务端CAS/跨标签写入保证；R49另卡复用队列证据，不自关单。

2026-10-24当前执行：F42 / D-R46已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f42-r46-2026-10-24/evidence.md)。参考上传按稳定item/batch/epoch合并当前数据源，在途槽计容量、按接收顺序落列表与表单；clear/replace使旧批次失效，旧finally不清新busy/tracker。标注与人像回调核对身份/内容/取消，busy按批次与item计数，blob只撤销无人持有部分；不发明换项目清参考图规则。36离线定向passed/10844.0859ms，9目标strict前后0诊断，exit0无skip/stderr空。普通1已验收、38进行中、34 TODO，冻结25未解决，总未解决97；不关R46，无委派/复核/真实服务/提交部署。普通/标注/虚拟与真人路径分别内存替身验证，非真实React DOM/浏览器/认证验收；原API/头像adapter/绘图/路径与上传协议保持，下一普通R47尚未实施。

2026-10-24当前执行：F41 / R44+R45已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f41-r44-r45-2026-10-24/evidence.md)。模板保存按编辑代次/目标id/草稿版本归属，迟到A不重绑B或清取消快照；当前提交与续写分开确认，render后核对排队输入。按草稿同步ref互斥，保存中按钮禁用，创建接回id后只PATCH；明确拒绝保稿可手动重试，unknown禁止直接重存、显式放弃只结束本地编辑。新27+原静态媒体参数2共29 passed，10目标strict前后0诊断，最终exit0无skip/stderr空。普通1已验收、37进行中、35 TODO，冻结25未解决，总未解决97；不关R44/R45，无委派/复核/真实服务/提交部署。实际Hook/TSX事件驱动非React DOM/浏览器；无服务端幂等/CAS/跨刷新恢复，原API/payload/媒体/存储保持，下一普通R46尚未实施。

2026-10-24当前执行：F40 / R42已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f40-r42-2026-10-24/evidence.md)。Chat历史/错误/模型/导航按账号、会话代次和请求序号归属，history在目标SDK render后应用，发送revision使旧读失效；transport元数据按scope及client message id过滤，旧提案决定不写新视图。列表独立序号不隐式清当前SDK，旧create/delete只改明确id列表不抢选择；删除序号按目标独立。新29+受影响F39原30共59 passed，两个目标strict前后0诊断，最终均exit0无skip/stderr空。普通1已验收、35进行中、37 TODO，冻结25未解决，总未解决97；不关R42，无委派/复核/真实服务/提交部署。实际SDK Chat+TSX/Hook驱动非真实React useChat/DOM；后台记录/SDK/附件与F39恢复核心保持，下一普通R44尚未实施。

2026-10-21 F10 / D03 / R19（本地，review=PENDING）：OpenAI图像适配器（含Strategy图像委托）绑定generation_progress v1，每个响应/落图及下一POST前检查点由execute_task同事务写Task/Asset/聚合ProviderCall/UsageLedger；失败partial_outcome保留已知成果，未知费用进入billing_note/usage_payload/error_summary。已完成步骤不重发，模型变化/不明步骤先停，原定价快照及per_request每Task一次保持。F09资产函数/原定价函数/ComfyUI/视频/Chat计价不改。17定向节点/11子场景通过；[证据](archive/f10-r19-2026-10-21/evidence.md)。不等于R20供方GET恢复、真实PG竞争/供方账/跨进程验收或永久原子媒体事务。

2026-10-24当前执行：F39 / R41+R43已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f39-r41-r43-2026-10-23/evidence.md)。Chat发送按锁定SDK真实error/finish标记及HTTP接收状态结算，明确拒绝恢复原文/附件，网络未知只读核对或明确放弃，不自动重发；已接收后的部分回复/持久附件保留。预览按发送快照/当前composer转移所有权，旧清理不动新稿，卸载后每次metadata通知实时守挂载。最终30 passed /18602.2429ms，五前端目标strict前后0诊断，均exit0无skip/stderr空。普通1已验收、34进行中、38 TODO，冻结25未解决，总未解决97；不关R41/R43，无委派/复核/真实服务/提交部署。真实SDK Chat+Hook驱动非真实React useChat/DOM；后端只两个响应头静态AST核对，无后台运行/幂等/离页持久化。R42通用history/meta竞态仍TODO。

2026-10-23当前执行：F38 / R40已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f38-r40-2026-10-23/evidence.md)。多边形不再提交前清空，捕获当前名称/房间/模式/顶点和序号，同tick互斥，成功确认原草稿才清；明确400/404/409/413/422拒绝可修正重试。无status/408/5xx/坏响应保草稿标未知，锁定重发，只读刷新供人工核对或明确放弃，不以一次GET猜未受理。新25+受影响R38原4共29 passed，Page/API定向strict 3既有/0新增，均exit0无skip/stderr空。普通1已验收、32进行中、40 TODO，冻结25未解决，总未解决97；不关R40，无委派/复核/真实服务/提交部署。无后端幂等ID/离页持久化/真实浏览器验收；明确放弃仅清本地，不撤回或确认原请求。R39/计算原字节保持。

2026-10-23当前执行：F37 / R39已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f37-r39-2026-10-23/evidence.md)。房间/整图意见保存期间继续编辑，提交快照/序号只确认返回版本，后续或未被返回包含的输入保留dirty；外部notes变化留本地并要求明确采用或确认替换。即时请求互斥、身份/序号/mounted保护迟到响应，apply不清新意见，旧ack只消费一次。新22 passed /631.9897ms，Page目标严格类型诊断0，exit0无skip/stderr空。普通1已验收、31进行中、41 TODO，冻结25未解决，总未解决97；不关R39，无委派/复核/真实服务/提交部署。实际TSX/Hook事件驱动非浏览器DOM，未增加意见离页持久化或整记录客户端revision；R38/R40原字节保持。

2026-10-23当前执行：F36 / R38已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f36-r38-2026-10-23/evidence.md)。CAD准备条件按账号/图纸/楼层及相关内容版本保草稿，同内容新floor不重置；相关变化留输入并提示冲突，明确重核或放弃。保存/建议迟到不改新视图，同标签页切换/离页可恢复，刷新关闭提示后确认离开视为放弃，退出/换会话清内存cache。新22+原3共25定向测试通过，四业务目标严格类型诊断0，均exit0无skip。普通1已验收、30进行中、42 TODO，冻结25未解决，总未解决97；不关R38，无委派/复核/真实服务/提交部署。Hook/TSX事件驱动非浏览器DOM验收，草稿不写磁盘/跨标签页/崩溃恢复，R39/R40未改。

2026-10-23当前执行：F35 / R37已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f35-r37-2026-10-23/evidence.md)。CAD detail/list在no_autoflush内仅响应副本补兼容线字段，不flush/commit/回写；显式墙线优先、缺线False条件创建。意见/校准/布置统一源JSON比较提交，初始陈旧ORM和计算期竞争均409，原计算/F34媒体保全保持。新18+受影响原20共38 passed /81 subtests in13.32s，exit0无skip，5第三方弃用warning。普通1已验收、29进行中、43 TODO，冻结25未解决，总未解决97；不关R37，无委派/复核/真实CAD或服务/提交部署。响应为读取时快照；PG/ASGI/真实OSS未验，不提供前端旧表单version合同，R35历史物理保留限制继续。

2026-10-23当前执行：F34 / R35已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f34-r35-2026-10-23/evidence.md)。CAD edit/undo/program-apply先内存校验/绘制，再写UUID独立mask/preview/line及撤销副本，提交源JSON比较保护后才切引用；旧图/撤销源失败或ack丢失均保留。新18+原2共20 passed /47 subtests in10.84s，exit0无skip，5个第三方弃用warning；覆盖全部文件stage/flush/commit故障、重试/40项batch/CAS/假OSS/成功undo与派生路径。普通1已验收、28进行中、44 TODO，冻结25未解决，总未解决97；不关R35，无委派/复核/真实CAD或服务/提交部署。已发布历史不自动物理删除，仅确认commit后回收本请求从未发布草稿；ASGI/PG与全局历史回收未验，R37 GET未改。

2026-10-23当前执行：F33 / R34已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f33-r34-2026-10-23/evidence.md)。价格配置同步统一显式合同版本/端点/逐Profile+Rule指纹候选，image/chat/精确video和停用都受同一边界；其他渠道/未知合同/重规则歧义原样跳过，custom规则只按明确id停用。CNY自定义4K保留，外币特殊档需明确报价，合法SKU按实际家族/质量档。新16+原3联合19 passed /20 subtests in1.30s，exit0无skip，含删除/改渠道/重复/三处整批回滚/CLI AST。普通1已验收、27进行中、45 TODO，冻结25未解决，总未解决97；不关R34，无委派/复核/真实同步/核价/服务/提交部署。静态价表/实际Grok计价不改，PG与完整CLI未验。

2026-10-23当前执行：F32 / R33已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f32-r33-2026-10-23/evidence.md)。媒体False写入同步核对Local/OSS，条件创建保留旧对象，remote-only取旧bytes补local、local-only按实际旧bytes镜像，冲突报告path/SHA并保两端；本地完整临时文件+独占hardlink发布。默认True异步/重试及F20create原字节保持。新18+受影响原6联合24 passed /14 subtests in2.20s，exit0无skip，含20本地/4条件写者、SDK实际headers转发、失败/丢响应/短写清理、bin/SVG/公开URL竞争。普通1已验收、26进行中、46 TODO，冻结25未解决，总未解决97；不关R33，无委派/复核/真实OSS/服务/提交部署。非版本化条件能力要求保持，不宣称跨系统原子或真实云端验收。

2026-10-23当前执行：F31 / R32已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f31-r32-2026-10-23/evidence.md)。新单head d40e9f82b735承接c39，只纠正SQLite三表五个字面now()默认为CURRENT_TIMESTAMP；历史迁移/bootstrap/ORM/业务服务不改。真实Alembic禁create_all，正常三类省略时间写入成功；有数据旧head/扩展列/CHECK/索引/触发器/FK保全，复制/DDL/版本失败全回滚。13 passed /3 subtests in11.14s，exit0无skip；重复upgrade不变，PG仅无DDL分支非真实PG。普通1已验收、25进行中、47 TODO，冻结25未解决，总未解决97；不关R32，无委派/复核/真实DB/维护/提交部署。未知入向FK/view/自定义默认预判拒绝，SQLite降级拒绝恢复坏默认。

2026-10-23当前执行：F30 / R31已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f30-r31-2026-10-23/evidence.md)。模板outcome_totals只累计该模板/统计窗口内Intent自身事件，复用原事件计数规则；不再逐意图叠加整Session缓存，同会话混模板/无模板/窗口外事件不串入，无session也保留所属事件。新10+原2共12 passed in1.57s，exit0无skip，重复合法事件/窗口边界/缺session/缓存999/只读/原评分权重和阈值均覆盖。普通1已验收、24进行中、48 TODO，冻结25未解决，总未解决97；不关R31，无委派/复核/真实维护/服务/提交部署。仅只读模板聚合三行调整，PG/ASGI/真实历史统计未验。

2026-10-23当前执行：F29 / R29已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f29-r29-2026-10-23/evidence.md)。在线/历史补入/重算共用同user/ref内UTC时间+意图id排序、相邻0至30分钟含边界聚类，迟到可桥接，A/B/A不切断；复用既有Session ID，先迁移引用再删空组。20 passed /8 subtests in2.78s，exit0无skip，含6种顺序、全成员/分数/outcome、实际FK失败/指标/删除/补入回滚与SQLite无提前commit。普通1已验收、23进行中、49 TODO，冻结25未解决，总未解决97；不关R29，无委派/复核/真实维护/服务/提交部署。PG并发/ASGI与外部保存旧会话id未验，合并/拆分淘汰id不提供永久alias。

2026-10-23当前执行：F28 / R28已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f28-r28-2026-10-23/evidence.md)。历史回填明确1K/2K/4K/未知，以一致的执行计价/有效规格优先，原请求仅参考；缺4K价格保留原账，仅明确目录4K或逐任务确认的历史补充报价可计价，不回退低档。新16+受影响F27原18联合34 passed /37 subtests in5.48s，exit0无skip；确认报价/零价、16组快照冲突、重复/指纹和三处整批回滚覆盖。普通1已验收、22进行中、50 TODO，冻结25未解决，总未解决97；不关R28，无委派/复核/真实维护/服务/提交部署。真实合同/PG/完整CLI未验，R29尚未实施。

2026-10-23当前执行：F27 / R27已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f27-r27-2026-10-23/evidence.md)。历史费用回填只认精确目录型号/SKU、单条历史调用及明确供方/端点/期间合同，apply须逐任务费用图指纹；当前可变profile不作历史证明，USD/冲突快照/归档或账目歧义保留原账。新16+适配原2共18 passed /14 subtests passed in2.71s，exit0无skip；临时SQLite全费用图同步、重复/失效计划、apply/flush/commit整批回滚与CLI小helper覆盖。普通1已验收、21进行中、51 TODO，冻结25未解决，总未解决97；不关R27，无委派/复核/真实服务/提交部署。4K/未知规格仅预览，R28未实施；真实历史合同、PG锁与完整CLI启动未验。

2026-10-23当前执行：F26 / R18-B已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f26-r18b-2026-10-23/evidence.md)。执行端按CNY/上海自然月/无换算分币读账，非CNY月用量返回不可比较；有限hard_block以明确403要求管理员核定，不混币相加或伪称耗尽。CNY >=原阈值、soft_warn/无限额早返、suspended优先保持。13精确节点最终13 passed /10 subtests in1.93s，首轮13与后补4节点亦通过，exit0无skip；真实临时SQLite账与实际Task/Chat/confirmed入口均零新增工作/队列。普通1已验收、20进行中、52 TODO，冻结25未解决，总未解决97；F25/F26均本地待独立验收，不关R18，无委派/复核/真实服务/提交部署。真实PG/ASGI/并发预算预留未验。

2026-10-23当前执行：F25 / R18-A已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f25-r18a-2026-10-23/evidence.md)。按用户确认的CNY/上海自然月/无换算合同，模型按自身账分币，混币标量null并保留cost_by_currency；provider/总额/均次/每日同样不跨币相加。月额度独立于看板天数/项目/渠道，非CNY账的额度使用/余额不可比较，界面不把null当0。后端14 passed /3 subtests、前端8 passed、7类型/5金额消费者定向strict类型检查0诊断，均exit0无skip。普通1已验收、20进行中、52 TODO，冻结25未解决，总未解决97；不关R18，无委派/复核/真实服务/提交部署。hard_block执行面尚未修改/验收，R18-B仍待实施；真实PG/浏览器/完整类型检查未验。

2026-10-23当前执行：F24 / R17已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f24-r17-2026-10-23/evidence.md)。旧记忆清理先保护所有显式来源/暂停条目的原文原类型；未知来源/时期只预览，apply要求带历史说明与完整行指纹的明确旧自动数据计划。原删除/提炼/压缩规则在批准范围内保持，乐观条件拒绝竞争变化，DB提交成功后才同步索引。新12+适配原1共13 passed /10 subtests passed in1.19s，exit0无skip。普通1已验收、19进行中、53 TODO，冻结25未解决，总未解决97；不关R17，无委派/复核/真实清理/索引服务/提交部署。legacy_evidence是操作者确认而非自动历史证明，真实PG/索引交付与历史恢复未验。

2026-10-23当前执行：F23 / R12已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f23-r12-2026-10-23/evidence.md)。普通Chat异常/取消/提前关闭保留已收正文并附明确失败提示，error事件优先于正文、失败残篇不写长期记忆；已知usage/费用保留，持久化只尝试一次、telemetry只终结一次。新10节点10 passed in2.45s，exit0无skip；真实临时SQLite历史/账/telemetry与实际asyncio/AnyIO取消作用域。普通1已验收、18进行中、54 TODO，冻结25未解决，总未解决97；不关R12，无委派/复核/真实服务/提交部署。ASGI浏览器断线/真实PG及数据库故障后的账修补未验，原两次commit合同保持。

2026-10-23当前执行（F22于10-22开工）：F22 / R10已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f22-r10-2026-10-22/evidence.md)。反馈PATCH按字段是否出现合并最终状态与文本，最终replied/resolved必须分别保留非空回复/复测；验证先于变更/审计，省略状态也校验，不再用新值or旧值放行清空。新8节点8 passed /17 subtests passed，exit0无skip，拒绝时完整记录/审计不变，合法回退和修复历史无效终态可正常进行。普通1已验收、17进行中、55 TODO，冻结25未解决，总未解决97；不关R10，无委派/复核/真实服务/提交部署。PG行锁/ASGI未验，安全专项未恢复。

2026-10-22当前执行：F21 / R11已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f21-r11-2026-10-22/evidence.md)。模型已有Conversation引用先409并提示停用，检查后新引用仅在真实parent DELETE外键错误时rollback转409；其他约束/SQL/DB错误回滚后原样抛出。模型/聊天/消息/价格保全，无引用204、审计/原pricing cascade/settings SET NULL合同保持。新10节点10 passed /10 subtests passed，exit0无skip，所有SQLite外键开启，两个真实独立Session引用竞争通过。普通1已验收、16进行中、56 TODO，冻结25未解决，总未解决97；不关R11，无委派/复核/真实PG/服务/提交部署。同步函数/纯PG码分类不等于ASGI或真实PG已验。

2026-10-22当前执行：F20 / D09 / R13已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f20-r13-2026-10-22/evidence.md)。Agent工件追加UUID身份并使用专用不覆盖创建，5次碰撞重选/耗尽409，旧bytes与Asset/Job关系保全；Local xb原子、OSS条件确认后再新建local，远端已有但cache缺失不污染旧链接。新14节点14 passed /31 subtests passed，exit0无skip，含4并发实际SQLite/文件与20同路径竞争。普通1已验收、15进行中、57 TODO，冻结25未解决，总未解决97；不关R13，无委派/复核/真实OSS/服务/提交部署。版本化/能力不明OSS明确失败，普通上传默认异步mirror不变；真实OSS/跨存储原子未验。

2026-10-22当前执行：F19 / D08 / R25已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f19-r25-2026-10-22/evidence.md)。Comfy人工close保留failed/done，展开部分batch_outputs并复用R23资产补缺，checkpoint/媒体/无关附件保全；Task/Dispatch/Asset/Ledger/intent/session/audit同SQL事务，保留已知费用币种且未知单独标记，不造ProviderCall。新12节点12 passed /12 subtests passed，exit0无skip，含五处DB故障回滚与重复关闭409。普通1已验收、14进行中、58 TODO，冻结25未解决，总未解决97；不关R25，无委派/复核/真实服务/GPU/提交部署。Windows ASGI事件循环被V00阻止，仅注册同步endpoint直接执行，未宣称ASGI/真实PG/Redis原子验收。

2026-10-22当前执行：F18 / D07 / R26已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f18-r26-2026-10-22/evidence.md)。Comfy已有prompt先核对原history/view，丢响应按原client_id只读匹配，不再为取回重读源图或prepare新图；首次/下一张新提交仍原参考校验/尺寸准备/上传，submitting前保存execution_context。新10节点10 passed /2 subtests passed，exit0无skip；旧无新上下文的合法checkpoint可只读取回，未知匹配保owner不重POST，失效lease不保存。普通1已验收、13进行中、59 TODO，冻结25未解决，总未解决97；不关R26，无委派/复核/真实GPU/服务/提交部署。

2026-10-22当前执行：F17 / D06 / R24已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f17-r24-2026-10-22/evidence.md)。请求计划复制payload并统一requested/effective档位、实际SKU/size；Wan受限4K→2K、count edits→1K及既有Seedream/Grok转换与supported clamp沿同一计划计价和展示。Task/ProviderCall/Ledger保存有效档位和原请求，per_request每Task一次保持；旧缺快照/计划变化停止追加请求，已有产物及费用保全，不重算历史。联合新12+F10原10+F14原30共52 passed /17 subtests passed，exit0无skip。普通1已验收、12进行中、60 TODO，冻结25未解决，总未解决97；不关R24，无委派/复核/真实服务/提交部署。

2026-10-22当前执行：F16 / D05 / R21已本地实施，IN_PROGRESS / review=PENDING；[证据](archive/f16-r21-2026-10-22/evidence.md)。生成图片URL/base64、共享视频URL/bytes、Grok content及Bigjpg落盘前验证实际格式与MIME，错误页/空/截断/错配拒绝，后缀取验证字节；通用MIME允许有效媒体。原缺陷2节点2 failed；最终14 passed /31 subtests passed、exit0无skip。R20恢复保留原ID/已有资产/usage/已知费用，不重提交。普通1已验收、11进行中、61 TODO，冻结25未解决，总未解决97；不关R21，无委派/复核/真实服务/提交部署。视频仅容器/轨道/样本结构验证，不代表完整解码播放；旧7文件仅成功fixture换有效素材，原受限视频测试未跑。

2026-10-22 F15：复用TaskDispatch unique(user_id,submission_key)及request_hash，无新模型/迁移。submission_idempotency规范化JSON和作用域键，真实savepoint内创建Task/AgentJob/Audit/Dispatch、同外层commit；冲突回滚候选查赢家，只有新建者调度。SQLite显式BEGIN IMMEDIATE避免legacy顶层SAVEPOINT RELEASE提前提交；PG按账号/作用域键先事务锁再查重，避免输家quota检查先于查回已接受结果；仍需以后真实竞争验收。Agent键含client+操作，Chat键为账号proposal；自动工具同注册namespace/SDK tool_call_id稳定，独立新注册不按prompt合并。原策略/输入/新Task quota保持，明确重放不再做新建quota或重复外层precheck。原worker/执行/存储/模型不变。[证据](archive/f15-r06-2026-10-22/evidence.md)。

2026-10-22 F14：外部Haodeya/Toapis/ModelScope异步图像沿F10 image generation_progress version1，kind=async_images保存供方/实际模型/查询身份、每步受理与URL引用；每次轮询新地址/usage先commit，逐图保存，不存base64字节。复用原image聚合Call/资产/ledger和default review，预检查保全扩此kind；已提交步骤不重POST，未提交批量步骤按原数量执行，旧缺查询身份进度待核对。同步图像主体、发送下载/价格/资产/五专用适配器/dispatch/ledger不改。R20全部计划入口本地实施仍PENDING，不代表真实供方/PG/跨进程已验。[证据](archive/f14-r20f-2026-10-22/evidence.md)。

2026-10-22 F13：Grok/Bigjpg复用AsyncTaskProgress及既有资产/ledger事务，支持URL-only受理、content_task_id和单产物取回；原SKU/tier计价/放大源身份与metadata保存，image.upscale接入原async事务。Task已有持久async上下文但本地预检查无partial时，执行器保全原ID/产物/金额/聚合Call并待核对；明确上游failed终态保持。默认review不自动重试，外部异步图像仍未接入，R20整项未完成。正式存储/HTTP/原定价/dispatch/其他适配器与旧测试不变。[证据](archive/f13-r20de-2026-10-22/evidence.md)。

2026-10-22 F12：Ark/Jimeng复用AsyncTaskProgress，原Task/Asset/聚合Call/Ledger共用F11检查点事务，不改execute_task/dispatch。helper构造器仅新增可选query_context身份；Jimeng按原POST GetResult+原req_key查询，非密钥action/version/region/service发生变化时拒绝恢复；Ark记录原body实际model，原模型请求行为不变。两入口共享未知review/原价/逐产物保全，不新增流程引擎/迁移/API。Grok/Bigjpg/外部异步图像仍待接入，R20未关。[证据](archive/f12-r20bc-2026-10-21/evidence.md)。

2026-10-21 F11：DashScope使用纯AsyncTaskProgress保存generation_progress version1 / kind=async_task、受理ID/接口身份hash/原价/URL/usage/逐产物路径；execute_task同事务更新Task/Asset/聚合Call/Ledger。默认lane仅recovery_required时转review，且run_claim有效lease才收尾；原claim/过期恢复/Comfy不变。恢复同ID只查询/下载，原price/model身份保持，未知提交不盲POST。其余异步供方尚未接入，R20整项未完成，F09/F10及正式媒体/计价/ledger原字节保持。[本地证据](archive/f11-r20a-2026-10-21/evidence.md)。

2026-10-21 F09 / R23（本地，review=PENDING）：_materialize_assets按当前task/project/type及实际输出路径逐项复用（最早id）或补建，输出保序去重；附件/旧重复行保留但不混入本次返回集合，原execute_task消费者自然得到对应asset_ids/paths。仅该函数业务变化，费用/执行流程/模型/迁移/R15冻结不改；7节点/6子场景离线通过，PG并发仍未证明。[证据](archive/f09-r23-2026-10-21/evidence.md)。R19计价合同已由用户确认保持每逻辑Task一次、未知费用明确标记，待下一卡实现。

2026-10-21 F08 / R09（本地，review=PENDING）：useCanvasProject待保存项携带projectId/revision/saveId、图快照及来源服务器图；视图切换/新建/删除前串行drain，失败保持来源并可重试。canvasProjectDrafts按现有用户id/项目在sessionStorage备份，唯一saveId清理和模块保存序列跨Hook挂载，恢复若基础图已变需用户选择。Workspace仅身份参数/重试UI/库失败捕获/删除选择消费者，删除后选下一项移入Hook同一代次；R50/模板编辑/图算法/API/后端/权限不改。25定向离线测试，类型0新增；[证据](archive/f08-r09-2026-10-21/evidence.md)。不保证关闭标签页/禁用storage时恢复，不新增跨标签/服务端版本系统。

2026-10-21 F07 / R05（本地，review=PENDING）：Agent _create_image_task及Chat submit_confirmed_chat_agent_task在原commit前复用add_dispatch，Task/AgentJob/原审计/Dispatch同事务。Redis queued、按provider选lane；enqueue仅唤醒，失败只记异常类不改已接受状态。sync/后台按主入口done避免worker再领，执行分支不变；不自动补历史任务/R06幂等或非Redis恢复。6节点/26子场景通过，真实PG并发/供方未验证；[证据](archive/f07-r05-2026-10-21/evidence.md)。

2026-10-21 F06（本地，review=PENDING）：上海业务日期统一在businessDateWindow.ts显式Asia/Shanghai投影，再用UTC日历减days-1，含当日。DashboardRoute初始/切天数/恢复跟随各取一次now，存dashboardDateRange；跟随分组用同一range，DashboardPage只读prop作统计标签，CSV仍用groupSummaryRange，自定义范围不随看板天数改变。原refresh/effect请求与导出逻辑保持，不修R77、不加午夜刷新。12定向离线测试、类型0新增；[证据](archive/f06-2026-10-21/evidence.md)。

2026-10-19 studio-progress-001（仅本地，未提交/推送/部署）：生成任务统一复用StudioTaskProgress百分比组件，ComfyUI及其他渠道用现有时间预估算法，标明预估；运行值0～95，只有后端completed显示100（含结果图库上方）。保留排队数量/恢复提示，下载checkpoint显示正在保存结果；恢复/核对期间暂停计时，同一已挂载任务卡进度不回退、切任务重置，失败不显示完成条。尚未接入ComfyUI采样实时步数，不是实测完成比例；重载页面重新按当前时间估算，不跨页面持久保存。无后台/API/权限/任务调度/模型/依赖变化。

2026-10-21 V00（仅本地，DONE / review=ACCEPTED）：新增backend/scripts/check_review_subset.py作为普通功能定向离线入口，原9个精确测试nodeid已独立复核；app前合成SQLite/临时媒体配置、禁dotenv/自动插件/项目conftest、拒绝网络和app.main/seed入口。原check.py/CI/业务边界保持；用户随后追加授权V00必要局部修正及F01，可逐节点扩入本次获准的普通测试。见[独立复核](archive/v00-2026-10-21/independent-review.md)及[实施历史](archive/v00-2026-10-21/evidence.md)。

2026-10-21 F01（仅本地，DONE / review=ACCEPTED，独立复核者f01_independent_review）：只修视频测试fixture，通过unittest.enterContext将实际settings.media_root绑定本例TemporaryDirectory、storage_backend固定local，cleanup覆盖正常/测试体异常/setUp异常。6场景原HTTP/等待替身及业务断言保留，新增隔离回归核对真实临时文件/零镜像/配置恢复；runner只追加本卡9个精确节点。正式config/存储/adapter实现、CI/依赖/类型基线不变，R98测试fixture问题本地解决；真实视频/真实服务等未验证。见[独立复核](archive/f01-2026-10-21/independent-review.md)及[实施时点证据](archive/f01-2026-10-21/evidence.md)。

2026-10-21 F02（仅本地实现，IN_PROGRESS / review=PENDING）：space_layout._segments_of新增14行标准二维直线POLYLINE分支，按真实ezdxf WCS顶点和closed标志提取连续/闭合边；排除3D/bulge/曲线与样条拟合，不改LINE/LWPOLYLINE/CIRCLE或R96单位/分区算法。7个精确回归7 passed / 15 subtests passed，真实polygon/usable附加无替身；runner仅扩7个节点。真实图纸/转换器/模型等未验证，R97待独立复核不关单，见[证据](archive/f02-2026-10-21/evidence.md)。

2026-10-21 F03（仅本地实现，IN_PROGRESS / review=PENDING）：Studio agent._resolve_provider默认/fallback按原SQL enabled条件和ID升序遍历，返回首个具chat.completions的配置；显式有效ID优先、不可用ID原fallback及原无候选异常保持。仅该函数5行替换/5行新增，调用模型/工具/额度/记账/密钥/授权逻辑不变。6个精确SQLite ORM回归6 passed / 13 subtests passed；F04接续扩展共享测试后原6节点仍通过。R85尚未独立验收不关闭，见[F03实施时点证据](archive/f03-2026-10-21/evidence.md)。

2026-10-21 F04（仅本地实现，IN_PROGRESS / review=PENDING）：prompt_polish_service.resolve_prompt_polish_provider默认分支按原enabled+ID顺序遍历首个聊天候选；显式无效ID仍原拒绝，不统一成助手fallback。仅该函数5行替换/5行新增，原空行/731个CRLF、请求/提示词/引用/usage/模型/额度/密钥/schema保持。共享测试新增6节点，与F03联合12 passed / 26 subtests passed；runner仅扩6节点。R85两入口均实现但未独立验收，不关闭，见[证据](archive/f04-2026-10-21/evidence.md)。

2026-10-21 F05（仅本地实现，IN_PROGRESS / review=PENDING）：useServerSearch的结果/engine/loading与domain/trimmed query绑定，effect active资格使cleanup后的成功/失败/finally失效；对外按当前查询投影，避免effect之前首帧旧命中。保留300ms去抖、API参数/limit、对外字段、[]零命中及null失败本地回退。12项Hook/真实消费者过滤表达式回归通过，类型23既有/0新增；两消费者/API/后端/依赖/类型基线字节保持，R55未关单。见[证据](archive/f05-2026-10-21/evidence.md)。


2026-10-19 management-interaction-004（仅本地，未提交/推送/部署）：管理页面按钮增加按压反馈、主按钮渐变阴影、输入聚焦、选人高亮、视图淡入/选中下划线、抽屉滑入/弹窗淡入及阶段添加动效；加载骨架与刷新/三种表单保存的忙碌文案/转圈，台账保存有成功提示。动画180～280ms，系统prefers-reduced-motion关闭动效并取消平滑定位。无新依赖/API/数据/权限/迁移变化，动效仅management.css。前端54项/管理专项9项通过、23既有TS/0新增、构建通过。Chrome1440/390合成慢API验证骨架、抽屉动画、按压transform、保存禁用与单次写入、选人高亮、减少动态效果、无溢出/页面异常；并重跑名称创建→安排工作→真实甘特、冲突输入和隐藏旧值保留。

2026-10-19 项目管理操作简化（仅本地未提交/部署）：ManagementProjectsPage渐进展示可选台账字段/阶段高级设置，名称单独创建后直达工作安排；原数据/API/单位权限/版本保护/金额null不变，无自动创建阶段或推断工期。样式限management.css，原全局styles保留。管理专项9项/前端54项/Chrome1440与390合成操作通过；不新增模型、依赖或迁移，不影响2.0任务与证据边界。

2026-10-19 反馈后台UI整理（仅本地未提交/部署）：FeedbackOpsPage按Skill/人工/接入设置分栏，SkillFeedbackPanel默认待核实、改进问题列表+详情和事件记录；FeedbackCredentials仅在admin接入栏目挂载。独立feedback-ops.css从页面懒加载，不触碰原全局styles改动；搜索/状态过滤仅已加载数据。原核实/改进/回复/凭证接口、权限和转义不变，切换处理栏目保持组件状态；未改业务数据或证据/审计模型。54前端检查与Chrome1440/390合成数据交互通过，生产仍下述镜像。

2026-10-19 Qwen v1.1切换（已按后续命令部署并修种子范围）：03e845d适配/模板已运行，Qwen文生图共享easy seed486、单图编辑LoadImage470/seed502，50步/GPU缓存/增强false/输出461；API reference_input_count=1驱动前端上传和提交校验，展示名含v1.1/单图。用户8264暴露随机seed超easy seed范围，qwen-v11-009已统一Qwen随机/显式/批量种子0..2^50含上界，Z/旧图保留0..2^53-1；失败任务不自动重跑。当前backendf8822343/worker3cc0ece1三副本/frontendd5dfe72b；Z/启用状态/600秒、Task/Asset/账/checkpoint保持，没有GPU实跑验收。服务器Git仍c70eac02未commit/push，运行来源及热修SHA以/opt/qmdh-frp/releases/qwen-v1.1-20261019/RELEASE.json为准。FRP/数据服务/配置保持，迁移仍b27；详情见qwen-v1.1-preparation.md。

2026-10-19 空库迁移补齐（仅本地，未提交/部署）：Alembic head c39d8e71a624接b27d0f85c932；修复d2348a1e3427聊天建表空迁移，历史默认值移除/FK替换使用batch兼容SQLite，env对URL百分号转义。新head仅补缺失canvas_projects与projects.owner_user_id及索引，新字段未知归属保持NULL，既有表/归属不覆盖；聊天/画布补齐迁移拒绝破坏性降级。SQLite与独立PG16临时库从零升级、模型表/列覆盖、旧记录保留专项8项通过；不依赖应用create_all/ensure_schema，二者仍保留供旧本地兼容。CI加入临时PG服务但未执行；本项未连接生产，后续v1.1切换也未发布此迁移，生产仍b27d0f85c932。

2026-10-19 ComfyUI生产闭环已发布（7a9874b，b27d0f85c932）：三个真实图片渠道（文生图id60/61、双图编辑62），1K/2K/4K/自定义、1～3张逐张执行。Task与task_dispatches同事务，Redis仅唤醒；PG串行领取/容量、90秒租约/15秒心跳，本机FIFO不占用其他渠道执行槽。用户范围幂等、原prompt/client_id恢复、服务器已下载SHA恢复；未知执行不盲重交，终态失败释放、管理员核对关闭有审计。reference_uploads记录归属，编辑仅两图平台素材。Task/Asset/ProviderCall/ledger继续沉淀工件，独立调度表为后续步骤扩展保留边界。

STCP/mTLS/token仍仅公网7443、Windows回环8188与backend/三worker的internal网络；frontend不可达。SYSTEM开机守护已接管并验证进程重拉/隧道/真实GPU，不含整机重启/长稳压测。最终backend fc3ac003、worker1fbaa318、frontend3c01a252，env/key、FRP/DB/cache/search与ODA/Nano Banana保持。九任务十一图/CI已通过，参数、恢复/备份/私有路径见[comfyui-frp.md](comfyui-frp.md)，旧阶段说明已归档。

2026-10-16 管理工作台改版（已部署，514a8cb/ce31075 / 生产前端运行合并 787d2370）：同一 /management/projects 下分管理总览/项目台账/项目计划/人员排期，复用全部现有公司授权、年度项目接口和版本检查，无迁移。台账列显隐/分组/排序、右侧详情与搜索勾选名册；总览按当前筛选范围计算节点、负荷和精确十进制已开票金额汇总。DHTMLX Gantt Community 10.0.3（MIT，精确锁版本与公开 license 文件）仅项目计划懒加载，独立实例销毁/重建；阶段日期转组件排他结束日，回存转包含结束日。拖动/拉伸/进度调整先暂存，展示前后变化，显式保存按项目版本顺序提交，成功项移出待办，失败/未尝试保留。任务树文本与负责人统一 HTML 转义，禁依赖编辑与自动排程；人员视图自建日历日负荷而不用 PRO 功能。仅管理工作台移动端 rail 局部适配，不改公共未提交 styles。

2026-10-16 公司项目管理（已部署，db376ec / 生产运行合并 3ba7989d）：/management/projects 独立于网站后台角色；两套侧栏按 auth/me.company_management 显示。/management/* 仅接受有效个人 Bearer 会话，实时查询 users.company_management/is_active/company_unit，以单位隔离所有读写；admin/ops 不自动授予财务访问。management_reports/staff/projects/revisions 独立于 Studio projects，JSON 文档由严格 Pydantic 模型验证，金额 Decimal 序列化为十进制字符串，未知 null 与 0 区分。台账/人员/项目版本原子比较避免覆盖，项目每次保存留快照，归档可恢复。甘特图按年度项目的阶段日历日、人员和每人分配比例生成，不推测工期或周末规则。迁移 a16c9e74b821 追加 User 三字段及四表，初始所有账号管理授权为 false；真实授权/名册属生产业务数据，不进入 seed。

2026-10-16 自动通路建议（已部署，23ccfa8 / 生产运行合并 f060300c）：只读 POST /cad/extracts/{id}/route-suggestions 复用尺度/功能验证，在深拷贝 JSON 上计算；circulation.py 用完整宽度保守侵蚀、连通分量与四邻域路径树避让墙线/核心筒，不在缺入口/不连通时假装已验证。前端建议先预览，采用保留 manual/旧来源未知通路，只替换 system；修改后转 manual。可改折点/宽度/起点/删除，保存才进入既有条件签名与三方案布置；无迁移、不自动写旧记录。建议不代替门洞/疏散验收，三套家具策略仍共用确认后的通路。

2026-10-16 CAD 布置前确认（已部署，cfdccca / 生产运行合并 5ac68b6e）：CadPreparationPanel + POST /cad/extracts/{id}/preparation 保存每平面 calibration/room_kinds/routes 至既有 payload_json。两点真实长度换算 square_meters_per_pixel 与 geometry.meters_per_unit，同步房间面积、polygon/usable 和撤销快照尺度；不改 DWG/DXF、mask 或线图。新 fitout 必须有与当前房间、几何、mask 匹配的签名，且旧方案可继续回看。确认后不自动拆分房间；layout_kind 显式取代中文模糊推断，empty 不布置/不罚密度。手动通路先从 placeable grid 排除、生成后全轮廓过滤；结果存 reserved_routes/mpp/条件签名用于展示。参考分排除通路的铺开/密度面积，不表示流线或法规验收。无迁移，自动连通验证/容量/目标型方案属于后续阶段。

# Architecture

2026-10-16 Linux DWG 转换（已部署，0346eee/b1532b1 / 生产运行合并 26095b9d）：官方 ODA 27.9 amd64 .deb 为 Git 外私有构建输入，可选包名/SHA256 build args；镜像安装 Xvfb/Qt 依赖，命令 python -m app.scripts.convert_dwg_oda --input {input} --output-dir {output_dir} 在私有虚拟显示转换。原 DWG→DXF→解析模型不变，命令分词后传参/不经 shell，超时终止进程组；不自动重转旧图。

2026-10-15 GIF 实际参数（已部署，1997c3f / 生产运行合并 cd60dab3）：鉴权 POST /assets/gif-inspect 仅测量不落盘/不登记；复用 5 秒/帧与像素预算及两名额，测量平均 fps/变帧率/每帧最多实际颜色/尺寸/帧数/时长/循环/透明。手动结果 metadata 写 compression JSON；旧记录详情 inspect_metadata=true 在所有权验证后按需读文件，不写回，无迁移。

2026-10-15 其他导航与 GIF 复用（已部署，f18b5d6 / 生产合并 ce56c34d）：生成页 StudioGlobalRailNav 与 AppShell 共用 OTHER_TOOLS_NAV（其他 /studio/other）；历史/当前结果可复制原始 GIF 和参数到压缩表单，手动提交后新增记录，不覆盖源记录；复用现有媒体读取/上传/历史 API，无后端/迁移。

2026-10-15 GIF 持久历史（已部署，9b89b53 / 生产运行合并 e6d98efa）：新增 gif_compression_records（账号 FK、原件/结果、参数/体积、时间），手动压缩提交记录后返回；GET /assets/gif-history（游标）与 /assets/gif-history/{id} 仅本人可读；/assets/library 聚合新增 gif 分类，回链 /studio/gif?record_id=，不造 Task/不改变原 Asset 权限。迁移 f7g8h9i0j1k2，旧未登记文件不猜测归属。

2026-10-15 GIF 推荐预设与批量（已部署，1fc9174 / 生产运行合并 0449ec4b）：自动上传/手动工具默认最长边 344、12.5fps、96 色，Lanczos 与 Bayer 抖动，500000 字节目标；批量 20 件/100MiB 总计，浏览器顺序请求原单文件接口，独立状态/结果/ZIP 下载，fflate 按需加载，无新服务/迁移。

2026-10-15 其他模块与手动 GIF 工具（已部署，52276de / 生产运行合并 6c09498e）：侧栏改为其他，/studio/other 默认转原 /studio/cad，/studio/gif 为手动压缩页；CAD 组件与查询参数不变。POST /assets/gif-compress 鉴权，接收单次参数，以不可变 GifOptions 复用压缩/存储，不修改全局自动上传配置，无迁移。

最新部署、备份与运行镜像事实：archive/handoff-2026-10-15-video-gif-release.md。

2026-10-15 新上传 GIF 自动压缩（a655596/55bd284 已部署）：assets/reference-upload、chat/attachments/upload 和 Agent 内联工件使用 write_uploaded_asset；保留原件，独立 gif_compression 服务按可配置尺寸/帧率/颜色数用 FFmpeg 生成经验证且更小的派生文件（默认以 500000 字节为目标，自适应降低且可锁定原尺寸/帧时序，上传 API 含达标回执），失败回退；同步有界处理，Dockerfile 内安装 FFmpeg。详见 archive/handoff-2026-10-15-gif-upload-compression.md，无本功能数据库迁移。

2026-10-15 视频提示词模板库（a655596 已部署，迁移 e6f7g8h9i0j1）：prompt_templates 新增 media_type（image/video，旧数据默认 image），迁移 e6f7g8h9i0j1。沿用现有公共/个人 CRUD 与权限；Studio 按创作类型筛选，视频套用保留运行参数和参考图。后台支持用途选择/筛选，无新执行链路。

2026-10-10 自助反馈会话（skill-feedback-003，514de69 已部署，镜像来自生产合并 7b310f9）：新增 public_grants 固定公开 skill_id 注册表（名称可重复、升级不需登记）与 public_quotas 原子全局/来源配额；credentials 支持匿名短期任务范围，不创建 User/AgentClient，不开放业务权限。正常事件、待核实证据和改进问题分层沿用；匿名会话不计作独立人。代理信任默认关闭，真实来源配置与发布限制见 skill-feedback.md。runs/issues 保存 ID，新问题按 ID/版本/问题代码聚合，历史名称归属保留。生产迁移 head d5e6f7g8h9i0；下段旧版 c4 描述为历史。发布/备份见 archive/handoff-2026-10-10-feedback-public-release.md。

2026-10-10 Skill 反馈：原版 08a2884 已部署，生产迁移 b3c4d5e6f7g8。安全改造 55216ab 已部署，运行镜像来自生产合并 30dfe26，生产 head c4d5e6f7g8h9：独立 skill_feedback_credentials 只接受采集，按用户/设备绑定名称与版本、有效期和数据库原子配额；ASGI 解析前限制请求体。外部问题事件先 pending，管理员/ops 核实后才聚合或重开 issues；正常事件只统计，原人工线程和沟通/改进双状态保留。原始内容以不可信文本处理，不自动调用工具或发布 skill。契约与限制见 docs/skill-feedback.md。

媒体运维只读工具（2026-10-10 已随 08a2884 部署，生产审计未执行）：`backend/app/services/media_audit.py` 与 `backend/app/scripts/audit_generated_media.py` 独立于应用启动，扫描默认 schema 文本/JSON 引用并盘点 `generated/`；没有删除入口。使用说明与覆盖限制见 `docs/media-audit.md`。

## 2026-10-08 Alignment Update

- This update overrides older historical references below when they conflict with current runtime behavior.
- 有效角色为 `admin`、`ops`、`designer`；只有 owner 归一为 admin。具体权限见 `backend/app/core/auth.py` 与 `frontend/src/features/access/roleAccess.ts`，ops 仅有部分后台模块权限。
- Admins can access backend management views such as `/admin/dashboard`, `/admin/models`, `/admin/users`, and `/admin/settings`.
- Admins can now manage shared studio prompt templates at `/admin/templates`.
- Studio 生成历史所有角色均按账号归属；有来源任务资产继承任务归属检查，无来源任务资产仍按项目权限处理。
- Prompt templates now have two scopes: `shared` templates are visible to all studio users, while `private` templates remain visible only to their owner.
- `/admin/projects` has been removed from the active frontend surface, and project-member management APIs/UI are no longer active product capabilities.
- Projects still exist in the data model, but they now act as personal or admin-managed task containers rather than shared-history collaboration spaces.

## 1. Purpose
本文档描述 QMDH-web 当前有效架构，用于帮助新 agent 快速理解：

- 系统入口在哪里
- 当前有哪些核心模块
- 模块边界是什么
- 当前任务主要影响哪里

本文档只写当前有效状态，不写长篇历史演化。

---

## 2. System Overview

QMDH-web 当前是一个前后端分离的 1.0 生产内测平台：

- `frontend/`：React + Vite + TypeScript，含图像/视频生成、画布、Chat、CAD 与后台页面
- `backend/`：FastAPI + SQLAlchemy 后端，提供账号、项目、工作流、任务、资产、dashboard 等接口
- `docs/projects/`：项目阶段状态和里程碑记录

生成主链路采用 Workflow + Task；普通 Chat 有会话/消息服务，CAD 有独立提取记录与几何处理。不能把所有能力都写成同一个任务执行服务。

MVP 1.0 当前还补充了一套单机服务器部署基线：

- `frontend` 容器：Nginx 托管静态文件、反代 `/api`、通过 alias 直出只读共享媒体卷 `/media`
- `backend` 容器：FastAPI API
- `worker` 容器：Redis 队列消费者
- `postgres` 容器：业务数据库
- `redis` 容器：异步任务队列

---

## 2.5 Version Direction

当前架构对版本方向的默认理解应保持一致：

- **1.0** 继续是稳定可用的设计生产平台
- **2.0** 是未来升级方向，面向研究型 / 协作型智能工作流
- 当前阶段不直接落地完整 Agent 平台，而是在现有 `workflow + task`、项目沉淀、媒体存储和审计能力上预留升级地基

## 3. Key Entry Points

- 仓库入口：
  - `README.md`
  - `qmdh-plan.md`
- 前端入口：
  - `frontend/src/main.tsx`
  - `frontend/src/App.tsx`
  - `frontend/src/router.tsx`
  - `frontend/src/api.ts`
- 后端入口：
  - `backend/app/main.py`
  - `backend/app/database.py`
  - `backend/app/core/config.py`
  - `backend/app/core/auth.py`
  - `backend/app/core/security.py`
- 账号与管理入口：
  - `backend/app/routers/auth.py`
  - `backend/app/routers/users.py`
  - `frontend/src/router.tsx` 中的 `/admin/users`、`/admin/dashboard`、`/admin/models`
- 部署入口：
  - `docker-compose.yml`
  - `DEPLOYMENT.md`
  - `backend/Dockerfile`
  - `frontend/Dockerfile`
  - `frontend/nginx.conf`
- 后端任务主链路：
  - `backend/app/routers/tasks.py`
  - `backend/app/services/task_executor.py`
  - `backend/app/services/model_registry.py`
- 模型配置入口：
  - `backend/app/routers/providers.py`
  - `backend/app/models.py` 中的 `ProviderProfile`
  - `frontend/src/pages/admin/ModelsPage.tsx`
- 项目状态入口：
  - `docs/projects/project-index.json`
  - `docs/projects/<project-code>/status.md`

---

## 4. Module Boundaries

### Module: Frontend Studio
- 路径：
  - `frontend/src/`
- 职责：
  - 展示图像生成工作台
  - 拉取项目、模型、工作流、任务、资产数据
  - 发起任务并展示最近任务与图库资产
- 依赖：
  - `backend/app/routers/*`
  - `frontend/src/api.ts`
- 不应负责：
  - 认证可信性
  - 真实模型适配
  - 资产落库规则
- 当前相关任务：
  - 生图工作台稳定化
  - 前端状态与任务反馈优化

### Module: API Surface
- Studio 刷新策略（`studio-perf-005`，本地未部署）：登录态运行/空闲查询为 4/12 秒；隐藏页面停止轮询、返回立即同步。health/项目/模型/工作流/模板按 5 分钟刷新，配置失败保留原值并低频重试；不暂停服务端任务。请求收尾与账号/组件生命周期隔离，配置刷新保留已加载历史。
- Studio 历史：`GET /tasks` 支持 `limit`、`before_id`（ID 降序游标）、`task_ids`、`status`；`GET /assets` 支持 `task_ids`，权限/收藏过滤先于 limit。Studio 每页 120 条，按任务取资产，轮询最近 40 条与全部运行任务并按 ID 补查终态，保留已加载历史。项目和状态筛选作用于已加载记录。2026-10-08 本地完成，尚未部署。
- 路径：
  - `backend/app/routers/`
  - `backend/app/core/auth.py`
- 职责：
  - 提供健康检查、登录、用户管理、项目、provider、workflow、task、asset、dashboard 接口
  - 通过数据库 session 认证派生可信用户和项目访问范围，短期保留旧 token 兼容
- 依赖：
  - `backend/app/schemas.py`
  - `backend/app/database.py`
  - 对应 service 模块
- 不应负责：
  - 大量业务逻辑堆积
  - 持久任务编排细节
- 当前相关任务：
  - 任务创建与状态查询稳定化
  - 账号、认证与权限补齐
  - provider profile 后台管理
  - 服务器部署联调

### Module: Deployment Baseline
- 路径：
  - `docker-compose.yml`
  - `DEPLOYMENT.md`
  - `backend/Dockerfile`
  - `frontend/Dockerfile`
  - `frontend/nginx.conf`
- 职责：
  - 提供 MVP 1.0 单机服务器部署基线
  - 统一前端静态托管、API 反向代理、数据库、队列和 worker 的启动方式
- 依赖：
  - `backend/app/main.py`
  - `backend/app/worker.py`
  - `backend/app/core/config.py`
  - `frontend` 构建产物
- 不应负责：
  - 替代正式云平台编排
  - 替代 HTTPS、监控、对象存储等生产级能力
- 当前相关任务：
  - 单机部署验证
  - 后续生产化演进

### Module: Task Execution Layer
- 路径：
  - `backend/app/services/task_executor.py`
  - `backend/app/worker.py`
- 职责：
  - 执行 task
  - 记录 provider 调用摘要、耗时和成本
  - 支持 `background / sync / redis` 三种执行模式
- 依赖：
  - `backend/app/services/model_registry.py`
  - `backend/app/services/media_storage.py`
  - `backend/app/models.py`
- 不应负责：
  - 前端展示逻辑
  - 复杂资产治理
- 当前相关任务：
  - 真实 provider 接入
  - 结果结构设计
  - Redis 模式一致性改进

### Module: Provider Adapter Layer
- 路径：
  - `backend/app/services/provider_adapters/`
- 职责：
  - 承载真实 provider 的协议适配、请求构造、异步轮询和结果下载
  - 通过 capability strategy 选择具体执行路径，例如 `dashscope_async_video`, `volcengine_ark_video_tasks`, `volcengine_cv_jimeng_video`
  - 把上游临时媒体 URL 转存到统一 media storage 后再返回任务结果
- 依赖：
  - `backend/app/services/model_registry.py`
  - `backend/app/services/provider_strategy.py`
  - `backend/app/services/media_storage.py`
- 不应负责：
  - 决定任务权限、项目可见性或用户账本口径
  - 为不同业务页面另起任务 API
- 当前相关任务：
  - DashScope Wan / HappyHorse 视频 provider 接入
  - Volcengine Ark / Seedance 视频 provider 接入
  - Volcengine Jimeng native 视频 provider 接入
  - 后续 provider 协议继续新增 adapter，不回填到 `task_executor.py`

### Module: Usage Ledger / 运营账本
- 路径：
  - `backend/app/services/usage_ledger.py`
  - `backend/app/routers/dashboard.py`
  - `backend/app/models.py` 中的 `UsageLedger`, `TaskArchive`, `ProviderCallArchive`
- 职责：
  - 在 task 终态、task 软删除、project 归档时，为 task / provider_call 写入稳定账本
  - 为运营看板、成本趋势、失败原因、账号用量提供不依赖 live task 可见性的统计读口径
  - 将归档快照与运营统计解耦，避免“删除后报表回退”
- 依赖：
  - `backend/app/services/task_executor.py`
  - `backend/app/routers/tasks.py`
  - `backend/app/routers/projects.py`
  - `backend/app/models.py`
- 不应负责：
  - 决定任务调度或 provider 调用流程
  - 充当完整财务结算系统
- 当前相关任务：
  - 归档项目的只读查看需求评估
  - 后续历史导出 / 对账口径扩展

### Module: Bootstrap / Seed Layer
- 路径：
  - `backend/app/services/bootstrap.py`
- 职责：
  - 启动时初始化 schema 和种子数据
- 依赖：
  - `backend/app/models.py`
- 不应负责：
  - 长期迁移治理
  - 生产级 schema 变更策略
- 当前相关任务：
  - 已有 Alembic；启动仍调用 Base.metadata.create_all 与兼容补列 ensure_schema。生产变更必须核对迁移，不可据启动成功认定 schema 已升级。

### Module: Project Status Docs
- 路径：
  - `docs/projects/`
- 职责：
  - 记录项目阶段状态、目标、风险和里程碑
- 依赖：
  - `backend/app/services/project_status.py`
- 不应负责：
  - 任务执行状态存储
  - 前端模块实现细节
- 当前相关任务：
  - 保持状态文档与真实项目进展同步

### Module: Inspiration / 灵感页
- 路径：
  - `backend/app/routers/inspiration.py`
  - `backend/app/models.py` 中的 `InspirationPost`
  - `frontend/src/pages/inspiration/InspirationPage.tsx`
- 职责：
  - 灵感内容 CRUD（外部参考导入 + 用户分享生成结果）
  - 分类标签、卡片网格、点赞计数
- 依赖：
  - `backend/app/routers/assets.py`（资产关联）
  - `backend/app/core/auth.py`（ops 权限校验）
- 不应负责：
  - 直接调用外部图片源
  - 复杂推荐算法
- 当前相关任务：
  - **搁置（2026-08-16）**：分享至灵感库收口、内容填充、seed bundle；保留现有页，仅 bugfix

### Module: Project Management / 项目管理
- 路径：
  - `backend/app/routers/projects.py`
  - `frontend/src/features/studio/StudioWorkspacePane.tsx`
  - `frontend/src/features/studio/useStudioProjects.ts`
- 职责：
  - 项目 CRUD（创建/重命名/删除）
  - 个人项目容器的选择和组织；不提供共享历史或项目成员编辑入口
  - 服务端按当前账号及兼容项目授权检查
- 依赖：
  - `backend/app/core/auth.py`（ops/admin 权限校验）
  - `backend/app/models.py` 中的 `Project`, `User`
- 不应负责：
  - 任务执行逻辑
  - 资产生命周期
- 当前相关任务：
  - 无（基础能力已完成）

### Module: Agent Governance Docs
- 路径：
  - `docs/protocol.md`
  - `docs/plan.md`
  - `docs/architecture.md`
  - `docs/decisions.md`
  - `docs/tasks.md`
  - `docs/handoff.md`
  - `docs/review.md`
- 职责：
  - 为多 agent 接手开发提供统一上下文
- 依赖：
  - 当前仓库事实
- 不应负责：
  - 替代代码事实本身
  - 替代 Git 历史
- 当前相关任务：
  - 初始化并持续维护

---

## 5. Data / Control Flow

### 主链路：图像生成任务
1. 前端通过 `frontend/src/router.tsx` 装配页面，并在 `frontend/src/pages/studio/GeneratePage.tsx` / `frontend/src/features/studio/GenerateStudioShell.tsx` 中读取项目、workflow、provider、task、asset 数据。
2. 前端在 `frontend/src/api.ts` 为 API 请求附带 `Authorization: Bearer <session token>`；旧 `X-QMDH-Auth` 仅作为兼容路径保留。
3. 用户在生图工作台填写业务字段，前端组装请求，但不再提交可信执行人字段。
4. `POST /api/v1/tasks` 进入 `backend/app/routers/tasks.py`。
5. 后端通过 `backend/app/core/auth.py` 校验数据库 session，派生当前用户、角色与可访问项目范围。
6. 后端校验 workflow、provider、project、项目访问权限和 capability 兼容性。
7. provider 校验来自静态模拟 provider、环境变量 provider 和数据库 `provider_profiles` 的合并结果；数据库同名配置优先。
8. 设计师页面使用的 `GET /api/v1/providers` 只返回真实 runtime provider，不返回静态模拟 provider。
9. 后端创建 `Task`、`AuditLog`，再根据执行模式触发：
   - `background`：FastAPI background task
   - `sync`：同步执行
   - `redis`：入队等待 worker
10. `task_executor.py` 根据 provider 选择真实适配器或模拟适配器，并在执行时读取数据库会话下的 provider profile。
11. 如果任务 payload 包含参考图，并且 provider profile 使用 `reference_mode=caption_prompt`，执行层会先调用视觉语言模型读取参考图，再把参考说明拼入真实文生图 prompt。
12. 如果 provider 是 FireRed 这类要求图片输入的图像编辑模型，执行层会在无参考图时自动补一张白底图作为 `image_url`，有参考图时直接转发参考图，从而兼容当前设计师文生图体验。
13. 若为图像任务，执行层会把真实返回图片或模拟预览落到 `media_root`，并将 `/media/...` 写入 `task.result.storage_path`。
14. 任务成功后，资产物化逻辑会把 `storage_path` 沉淀为 `Asset`，供图库和任务区复用。
15. 前端定时轮询 `GET /api/v1/tasks`，后端按当前用户可访问项目过滤任务列表。

### 辅助链路：模型与 Key 管理
1. 管理人员直接访问 `/admin/models`，设计师工作台不暴露该入口。
2. 管理视图调用 `GET /api/v1/providers/profiles` 读取数据库 provider profile。
3. 新增、编辑、删除通过 `POST /providers/profiles`、`PATCH /providers/profiles/{id}`、`DELETE /providers/profiles/{id}` 完成。
4. 后端保存真实 API key，但响应只返回 `has_api_key` 与 `masked_api_key`。
5. Provider profile 管理接口只允许 `admin / owner / ops` 角色访问。
6. `/api/v1/providers` 会合并静态 provider、环境变量 provider 与已启用的数据库 provider。
7. `/api/v1/providers/discover` + `/api/v1/providers/bulk-import` 支持从上游 `/v1/models` 显式探测并批量导入 provider profile；当前 runtime provider 以后台启用的 profile 为准，不再隐藏自动派生 ModelScope 变体。
8. 任务创建与执行都使用合并后的 provider 注册表，保证后台保存后可以真实参与生成。

### 辅助链路：账号与看板
1. 未登录用户访问前端时进入登录页，调用 `POST /api/v1/auth/login` 获取 session token。
2. `auth_sessions` 保存 token hash、过期时间和撤销时间，默认会话有效期 7 天。
3. `GET /api/v1/auth/me` 返回当前用户、角色、启停状态和项目授权。
4. `owner / admin` 可访问 `/admin/users`，通过 `/api/v1/users` 创建、编辑、停用账号和重置密码。
5. `owner / admin / ops` 可访问 `/admin/dashboard`，读取最近任务数、成功率、成本、用户/项目排行、provider/model 分布和失败原因。
6. `GET /api/v1/dashboard/stats` 现在以 `usage_ledgers` 为主读口径，在汇总指标之外返回 `daily_series` 与 `model_calls_by_day`（按 UTC 自然日、与查询参数 `days` 对齐），供运营看板绘制成本、失败次数与模型调用按日趋势。
7. `designer` 只使用设计师工作台，仍按 `project_codes` 过滤项目、任务、资产和模板。

### 辅助链路：项目状态
1. `GET /api/v1/projects` 调用 `project_status.py`
2. 后端从 `docs/projects/project-index.json` 和对应 `status.md`、`milestones.json` 读取状态
3. 状态摘要返回前端展示

### 辅助链路：图库资产
1. 前端读取 `GET /api/v1/assets`
2. 后端返回当前资产列表
3. 前端可调用 like/share 接口更新交互数据

### 部署链路：单机服务器
1. `frontend` 容器启动 Nginx，提供前端静态页面。
2. `/api` 与 `/media` 请求由 Nginx 代理到 `backend` 容器。
3. `backend` 连接 `postgres` 保存业务数据，连接 `redis` 投递任务。
4. `worker` 从 `redis` 消费任务并执行真实或模拟 provider。
5. 图像结果写入共享媒体卷，再通过 `/media` 暴露给前端。

---

## 6. Current Hot Spots

- 热点模块：`frontend/src/features/studio/GenerateStudioShell.tsx`
  - 原因：设计师工作台的大部分交互、状态与项目成员编辑仍集中在 4000+ 行单文件中
  - 风险：继续叠加功能会放大状态耦合、回归范围和接手成本

- 热点模块：`backend/app/services/task_executor.py`
  - 原因：图像/视频/文档执行能力都汇集在这里
  - 风险：现在已经同时承载模拟适配器、真实 provider 接入和参考图语义增强，若继续堆叠实现，容易把 provider 逻辑和任务逻辑缠在一起

- 热点模块：`backend/app/services/bootstrap.py`
  - 原因：启动时直接建表、补列、种子写入
  - 风险：继续演进会放大 schema 演进和并发启动问题

- 热点模块：`backend/app/routers/tasks.py`
  - 原因：任务创建牵涉用户、项目、provider、workflow、审计和执行模式
  - 风险：认证、权限和一致性问题集中暴露在这里

- 热点模块：`backend/app/routers/projects.py`
  - 原因：项目删除当前仍承担“清理项目下任务 / provider 调用 / 资产关系”的历史策略
  - 风险：项目归档现在同时承担 task 软删、archive snapshot 与 usage ledger 补账；若继续在这里叠加更多恢复 / 清理分支，容易让治理口径分叉

- 热点模块：`backend/app/core/auth.py` 与 `backend/app/routers/users.py`
  - 原因：数据库 session、旧 token fallback 和角色边界集中在这里
  - 风险：后续移除兼容认证或接入 SSO 时需要集中回归权限边界

- 热点模块：`docs/projects/` 与 `docs/*.md`
  - 原因：项目状态文档和协作文档同时开始建立
  - 风险：如果不明确维护边界，容易出现模板、事实、历史三者混杂

- 热点模块：`docker-compose.yml` 与部署文件
  - 原因：1.0 已采用单机 Compose 生产部署，数据库/媒体/配置需持续保全
  - 风险：若不持续同步代码与部署配置，极易出现“本地能跑、容器起不来”的漂移

---

## 6.5 1.0 -> 2.0 Compatibility Guardrails

后续 1.0 中大型需求默认应遵守以下架构约束：

- 不绕开现有 `Workflow + Task` 主轴另起一套平行业务执行链
- 不把复杂能力继续无限堆进单一 `Task.payload / result`
- 新增的状态、来源、产物、审计信息尽量结构化，而不是只写入自由 JSON
- 新增图片、快照、摘要、导出物尽量走统一存储接口，视为未来“工件存储”的组成部分
- 新增沉淀类能力优先挂到项目维度，而不是散落在独立页面状态中
- 新增耗时或异步能力必须继续补状态、失败原因、来源与操作者

这些约束的目的不是现在就引入 2.0 编排层，而是避免 1.0 后续迭代把未来工作流升级路径封死。

---

## 7. Architecture Change Rule

开发验证（2026-10-10 本地未提交）：`.github/workflows/check.yml` 两个只读检查 job；前端 `npm run check` 运行回归、已有类型错误基线对比、构建，后端 `backend/scripts/check.py` 运行明确的离线关键回归。不含部署；不是全类型/全后端/外部集成验收。范围与基线维护见 `docs/checks.md`。

若任务改变了以下任一内容，必须同步更新本文档：

- 关键入口文件
- 模块边界
- 主链路数据流
- 依赖关系
- 当前热点模块


2026-10-24 F44 / R49：模板网络写按共享templateId跨账号串行，owner仅隔离本地草稿。unknown Set在Promise清理后仍阻止同模块后继自动写，只有原inspect+用户明确confirm分支释放；普通拒绝不设屏障，别的模板独立。hook除import与确认调用外原字节保持，无服务端CAS/跨标签/刷新共享承诺。


2026-10-24 F45 / R50：CanvasAsyncScope按账号/实体/提交视图持有节点操作代次与观察Promise/controller；已发GET不撤回，scope/taskId/kind变化拒绝旧写。项目只读loaded owner/viewKey在activateProject记录，避免换账号旧对象或同IDreload误认来源；graph装图在layout，Project保存正文保持。媒体/已受理ID恢复journal仅元数据、账号隔离、明确且输入匹配才恢复，无自动重传/服务器取消。


2026-10-24 F46 / R51：scope/node run Promise同步登记再执行，创建互斥与实际观察等待分开，明确regenerate可替换观察但不穿透在途创建；旧finally仅删自己的run。原journal operation id作显式submission_key，unknown保原记录；只读图getter保证下游拿最新产物。批量另有scope/token收尾，不改后台或原poll/保存/发布合同。


2026-10-24 F47 / R52：发布模型捕获owner/project/viewKey/title/深拷贝graph并以session归属draft/phase/list/request。close保留、明确end才新意图，unknown只读核对不解锁。复制选择token贯通Workspace和Project.createProject可选guard/activated回调，旧请求不activate/刷新新账号；原Task/媒体/保存/批量保持，无新增后台幂等/持久存储。


2026-10-24 R54：润色以layout提交源、对象版本和请求序号隔离；纯WeakMap opaque谱系保持正常编辑历史。Studio/Canvas updater二次核对后文本/flag原子写，Project只读isCurrentView识别激活未render窗口；API/执行/正式存储合同不变。


2026-10-24 R58：操作输入显式携带form/完整ReferenceUploadItem/上传busy/是否更新composer。历史nextForm+nextUploads隔离B；本次provider解析统一校验/payload引用。普通provider同步和成功标记重置仅认原对象，历史不写草稿；不改执行/供方/SKU/数量/正式存储。


2026-10-24 R59：输入记录保全与执行限制分离；后台纯metadata helper供受理/完成及授权Task响应副本投影，完整引用不截4，不改DB行/不返回完整payload。前端全item展示和无损历史重建，各provider/SKU原校验按真实count；已知残缺阻止直接复制/再生成。


2026-10-24 R60：项目editor与request属于layout提交账号scope，原model/版本控制关闭，当前选择在functional updater核对。loader新增项目专用collection/read ticket与只读refresh，成功mutation先保留，旧full/config只在projects字段门禁；原任务/资产/分页/轮询其余逻辑保持。内存状态不写正式存储。


2026-10-24 R61：Page本地session按草稿对象/版本与线程session隔离发送，预览owner只管理已commit blob，新的输入或附件不因旧发送被清。父FeedbackRoute仅转交发送的error guard，error functional updater再核意图；列表本身和其他路由不改。R62上传旧快照合并/容量仍待处理。


2026-10-24 R62：本地上传slot/reservation+attachment epoch按当前集合合并，4总量覆盖在途，成功项即时落本地稿；preview创建即adopt并持暂定model owner到commit。失败上传组status独立于全局表单error，主稿reset使旧批次失效。仅UI内存模型，不改API/通知/正式存储。


2026-10-24 R63：页面useInspirationList统一账号scope/category/query generation与error intent，初始GET从两个父route移入页面，mutation后读取当前category；GET不清选择。只管理本地查询观察，不改API/执行/正式存储；R64弹窗归属未改。


2026-10-24 R64：独立dialog Hook用committed账号scope、open session、draft/URL/title/image版本和operation限制异步观察；字段按当前草稿合并，保存快照与close身份分离。R63查询owner不变，R65同步门禁/未知受理未改，不引入后台幂等或远端媒体清理。


2026-10-24 R65：本页create intent/共享Promise同步登记，pending/unknown/accepted锁一次POST，close/open恢复，显式新建允许独立操作；正整数receipt与明确HTTP拒绝区分受理，列表只读核对不解锁。无服务器操作键/持久化幂等，重载/多标签不保证。


2026-10-24 R66：GIF页面显示scope/selection工件观察与批次request执行分离，深链/补读只当前token写，local hydration依附原base，复制观察防晚参数/URL回写。原批次/参数/正式工件/存储合同不变。


2026-10-24 R67：preset/profile共享managed adapter读取，normalize preset明确默认/JSON/显式结构字段优先级，payload仍原结构字段重建，未知JSON扩展保留。合法0与原分辨率默认保持，无新价格来源/后端变更。


2026-10-24 R68：规则draft与原ruleId/profileId同原子editor，切模型新建默认稿、同模型保编辑；保存核props原归属，普通浏览不迁移规则。仅UI维护合同，不删后端明确迁移能力，R69异步回填另卡。


2026-10-24 R69：模型管理新增账号scope、独立profile/rule editor、preview owner及discovery batch；实体锁/版本保护本地回写，父ModelsRoute sequence与error guard。R67/R68合同保持，R70/R71另卡；本地guard不是服务端取消、幂等或CAS。


2026-10-24 R70 / F61：批导入逐项原模型/Provider身份与created/already_same/conflict、页面本次提交pair确认及安全旧协议映射已实施，31定向通过、2目标类型新增0。IN_PROGRESS/review=PENDING不关单；既有配置未覆盖，R69归属保持，R71命名/全局去重仍待设计，25冻结停止。


2026-10-24 R71 / F62：批导入统一服务器来源/raw模型身份及稳定有界摘要名，历史配置复用、手填替代名/冲突建议、逐项唯一竞争处理已实施，36定向通过，2目标类型新增0。IN_PROGRESS/review=PENDING不关单；原引用/凭证/唯一约束保留，SQLite/VM非PG/ASGI并发验收，下一普通R72，25冻结停止。


2026-10-25 R73 / F63：设置字段remote/dirty/version及冲突加载、旧保存版本确认/新Key保留、Bigjpg回执目标、父SettingsRoute最新读取/错误处理实施，36定向通过，5目标类型新增0。IN_PROGRESS/review=PENDING不关单；R72为冻结误指已停止且无修改/测试，下一普通R74，25冻结停止。


2026-10-25 R74 / F64：助手管理编辑器/操作token/版本、文件Skill+路径owner、Override与父route读取/error守卫已实施；VM39及原12真实React/DOM复测通过，4目标类型新增0。IN_PROGRESS/review=PENDING不关单，R75冻结行为保持、无真实安装发布，下一普通R76，25冻结停止。


2026-10-25 R76 / F65：Chat观测view绑定会话/用户/消息trace对、加载/error与read代次，初始overview分离、局部错误及Main owner接线已实施；VM18+真实React6复测通过，2目标类型新增0。IN_PROGRESS/review=PENDING不关单，权限/后端不改，下一普通R77，25冻结停止。


2026-10-25 R77 / F66：三统计入口query/sequence整批接受数据与来源；维护/评估刷新当前意图，CSV日期与显示来源一致。55离线实际React检查passed，5目标类型新增0、原5诊断保持。IN_PROGRESS/review=PENDING不关单，统计/API/业务日期算法不改，下一普通R78，25冻结停止。


2026-10-25 R78a / F67：仅公告本地实施；编辑会话/字段dirty与版本、远端冲突恢复、receipt/删除/身份保全及父GET归属已修，35实际React检查passed，3目标类型新增0。R78整体IN_PROGRESS/review=PENDING不关单，模板/工具未实施，下一R78b，25冻结停止。


2026-10-25 R78b / F68：共享模板编辑会话/字段版本与远端合并、父GET归属已修，共享Hook仅参数化名称，模板40+受影响公告35共75离线React检查passed，3目标类型新增0。R78整体IN_PROGRESS/review=PENDING，工具R78c待修，上传R79未实施，25冻结停止。


2026-10-25 R78c / F69：工具编辑会话/字段版本与远端合并、父GET归属已修，复用Hook不改，38离线React检查passed，2目标类型新增0。R78三页本地实施自验齐备，整体IN_PROGRESS/review=PENDING不关单；下一R79先定上传归属卡，25冻结停止。


2026-10-25 R79 / F70：三图片字段按editor/实体/version/baseline和job token隔离，旧完成不回新字段，迟到工件保原来源并确认恢复；81新上传检查+113受影响R78回归共194实际React执行passed，5目标类型新增0。IN_PROGRESS/review=PENDING不关单；下一R80，25冻结停止。


2026-10-25 R80 / F71：使用日志完整查询快照/代次/来源已修，旧结果/error/busy不占当前，clamp不重启query；33离线React检查passed，单目标类型前后0。IN_PROGRESS/review=PENDING不关单；下一R81，25冻结停止。


2026-10-25 R81 / F72：管理员回复按字段版本清理，改进状态独立保后续选择，互斥及父GET/部分成功已修；原UI/CSS保全，33离线React检查passed、2目标类型新增0。IN_PROGRESS/review=PENDING不关单；下一普通待设计R86，25冻结停止。


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
