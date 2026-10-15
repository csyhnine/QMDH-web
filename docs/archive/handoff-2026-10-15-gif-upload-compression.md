# 2026-10-15 新上传 GIF 自动压缩

## 状态与边界

用户明确要求以后上传的 GIF 自动压缩，随后要求继续。本地实现和验证已完成；未提交、push 或部署。当前仍在 feature/video-prompt-templates（HEAD f1e2122）工作，上一轮视频模板与反馈文档未提交改动完整保留。没有将这些改动混入提交，也未改生产数据。

## 当前目标模式（用户后续澄清，覆盖最初单次参数压缩描述）

- 压缩主要目标是 GIF 低于 500KB。新增 QMDH_GIF_TARGET_BYTES=500000（十进制字节，比 500KiB 更严格），0 关闭目标模式恢复单次参数压缩；未超目标时直接保留原件，不启动编码器。
- 超目标时在同一个 20 秒总预算内，从配置的初始参数出发，依次尝试降低调色板、帧率，再按当前体积/目标比例估算等比缩小尺寸；每轮都从原件编码，避免重复有损转码。达标立即停止，始终保留已验证且最小的版本。
- 允许自动降帧/缩图可分别用 QMDH_GIF_ALLOW_FRAME_REDUCTION / QMDH_GIF_ALLOW_RESIZE 关闭；质量下限 QMDH_GIF_MIN_COLORS=32、QMDH_GIF_MIN_FPS=6、QMDH_GIF_MIN_EDGE=240 可调。初始配置已低于下限时不强行放大/升帧/加色，不剪裁动画时长。
- QMDH_GIF_MAX_EDGE=0 / QMDH_GIF_MAX_FPS=0 表示第一档从原尺寸/帧时序开始；目标模式若允许自适应，后续可以降低。要始终保持原尺寸/帧时序，另关闭对应 allow 开关，或把 target_bytes 设为 0。
- 无法达标、预算用尽或后续尝试失败时，返回已验证的最小版本；没有有效压缩版则返回原件。通用图片和聊天上传响应增加可选 compression 对象：original_bytes、output_bytes、target_bytes、target_met、compressed。目标关闭时 target_bytes/target_met=null；非 GIF 无 compression。这个字段是接口回执，当前界面尚无独立达标提示；Agent 工件仍返回原有资产形态。
- 最终验证：后端统一检查 141 passed、1 skipped、16 subtests passed，其中 GIF 专项 16 项；前端统一检查 19 passed、23 项既有类型错误/0 新增、Vite 构建通过。已有真实 FFmpeg 用大于 500000 字节的合成动画验证实际压到目标内，另覆盖原尺寸/帧率锁定下无法达标、达标原件跳过编码及后续超时仍保留有效结果。

## 行为

- 新增 gif_compression 服务，按 GIF87a/GIF89a 文件头识别真实 GIF。尺寸、帧率与颜色数可配置，960/12fps 仅是建议。默认第一档从原尺寸和原帧时序开始，颜色默认 128，目标模式可继续自适应；维持动画循环与透明属性。
- 经 `write_uploaded_asset` 统一接入通用参考图/后台展示图上传、聊天附件上传、Agent 内联工件上传。通用图片上传新增 GIF 格式支持，响应路径与聊天 MIME 使用实际存储结果。
- 先保存上传原件，再生成同目录 `.compressed.gif`；仅在体积更小、全帧可读、动画未退化为单帧、时长误差受限且循环/透明属性符合要求时返回压缩版路径。原件路径可由 `.compressed.gif` 去掉 `.compressed` 得到。
- 不回溯处理历史媒体；不把模型生成结果、CAD 写入或第三方灵感图下载纳入上传压缩。
- 未找到 FFmpeg、超时、并发名额已满、输入超预算、输出未变小/属性异常时，仍返回原件。派生文件本地写失败亦回退原件；原件本身存储失败沿用上传错误。
- 沿用 local-first/OSS 异步镜像。原件和压缩件均保留，因此主要减少展示/传输字节，不承诺总存储占用下降。未来清理流程必须考虑两者关联，不能把原件直接当可删垃圾。

## 执行约束与配置

- 两个编码名额/API 进程，无等待队列；同步上传内尽力执行，非持久后台作业。扫描和两次 FFmpeg 调用共享 20 秒软预算，每次 subprocess 按剩余时间强制超时；Pillow 单帧解码期间不能硬中断。
- 输入最多 20MiB、单帧最多 800 万像素、累计最多 2.5 亿解码像素、1200 帧/120 秒；含低于 20ms 帧延时的歧义 GIF 保留原件。输入超出压缩预算不绕过原上传接口的体积限制。
- FFmpeg 固定参数数组，无 shell；使用随机临时目录、单线程滤镜、文件大小上限；不读上传中嵌入的远程地址，不记录用户文件名/内容/子进程 stderr。临时文件随处理结束清理。
- `QMDH_GIF_COMPRESSION_ENABLED` 默认 true，可关闭；`QMDH_FFMPEG_BINARY` 默认 ffmpeg，可指定已安装二进制路径。`QMDH_GIF_MAX_EDGE=0` 第一档保留尺寸（正整数限制最长边，范围 0..8192）；`QMDH_GIF_MAX_FPS=0` 第一档保留帧时序（正数限制帧率，范围 0..50）；`QMDH_GIF_MAX_COLORS=128` 可在 4..256 调整。当前通过服务器环境变量配置，尚无后台设置 UI；本地/生产配置模板已补。修改后重建容器环境（无需重新构建镜像），现有容器单纯 restart 不会重新载入 Compose env_file。没有修改任何生产 .env 或加密 key。
- Dockerfile 通过 Debian apt 安装 FFmpeg，CI 同步安装用于真实编码验证。前轮只读服务器查询确认当前运行后端尚无 FFmpeg；必须重建镜像/发布后生效，本轮没有在宿主机临时安装。
- 无新增 Python 包、数据库表或迁移。本工作区上一轮视频模板仍有独立迁移 e6f7g8h9i0j1，整包发布不可忽略它。

## 验证

- 后端统一检查：133 passed、1 skipped、16 subtests passed（当时包含 8 项 GIF 测试）。随后增加 Agent 上传覆盖并收紧逐帧预算，早期 GIF 专项 9 项，配置化后 12 项；目标模式进一步增加自适应达标和失败保留结果等测试。最终全量结果见本轮完成记录。
- 三项真实本机 FFmpeg 测试覆盖无限循环/有限循环/不循环、透明背景、动画、时长、超过 960 边长的等比缩放，并断言输出确实更小。其余专项覆盖超时、禁用、未安装、并发繁忙、无效/超大 GIF、非 GIF、预算、原件保留、派生写失败，以及三个上传入口。
- 额外聊天/Office 附件与媒体存储回归：17 passed、6 subtests passed。旧聊天测试先在 setUp 加密、后装测试 key，使用隔离进程中的固定测试夹具 key 提前 patch 才能运行；未改业务 key/测试断言，也未读取项目 .env。
- Windows 已安装 FFmpeg 的真实运行通过；Docker 镜像构建、GitHub CI、Linux FFmpeg 与生产 HTTP 上传尚未实际验证。
- 参考官方滤镜文档：https://ffmpeg.org/ffmpeg-filters.html#palettegen 与 https://ffmpeg.org/ffmpeg-filters.html#paletteuse。

## 下一步

按既有发布流程处理明确文件集，保留原 styles.css/比较文档/_tmp_*。重建后端镜像后检查容器 ffmpeg、执行一次合成 GIF 上传确认路径/体积/动画及原件，再处理未完成的视频模板发布。CAD/key/卷/18010 红线继续有效。

Safe to hand off: Yes。功能本地完成，尚未上线。
