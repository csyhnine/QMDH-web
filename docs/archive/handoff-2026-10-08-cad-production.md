# CAD 生产交接（从最新 handoff 归档）

以下是 2026-10-10 质量检查交接时归档的 CAD 时点事实，不是重新连接生产后的测量。

### [2026-10-08] CAD 图纸提取上生产 — **DONE（已部署）**

- **代码：** GitHub `main` `65c47a0`（功能提交 `872dc3f`）。按用户冷启动补充，生产 git 最新为文档合并 `fe3adb5`，运行中的 backend / worker / frontend 仍由包含功能的 `1783bec` 重建。服务器原有 merge 历史不能快进，pull 必须 `sudo -u admin`。
- **迁移：** 上线前 `y0z1a2b3c4d5`，升级后 **`z1a2b3c4d5e6`（head）**。shapely **2.2.0** 在新镜像里。
- **健康：** `https://cityusbdisk.cn/api/v1/health` 为 healthy（database、redis）。`/studio/cad` 返回 **200**，前端包内有 `CadExtractPage`。
- **DWG：** 生产未配置 `QMDH_CAD_DWG_CONVERTER_CMD`，也没有 Linux 版 ODA。维持生产只收 DXF；用户提供官方 Linux 安装包前，不自行下载/安装。Linux 转换器需放入镜像，以带 `{input}` / `{output_dir}` 的命令或包装脚本接入，再重建 backend/worker；Windows exe 不能搬到生产或入库。
- **数据：** 上线时 CAD 表为空；按用户冷启动补充，现已上传 `五期云锦居委会办公室0922-x.dwg`，记录 `ce_0abae8a9402f` 为 `needs_conversion`，不会自动重转。本地 `ce_94778ce26c6e` 不会上去，不要在生产重跑这条，也不要解析 `ce_d2955df6f9b9` 或改旧图 `ce_b121e1b892de`。不要改布置算法。本轮未连接生产复核。
- **磁盘：** 同日按 9 月 21 日约定，删除 30 天前的 `generated/` 图片和视频 **6974** 个（约 12.7GB）。灵感库仍引用的 1 条留下。媒体卷约 **13.7GB**，根分区约 **60%**、可用约 **19GB**。
- **详档：** `docs/archive/handoff-2026-10-08-cad-geometry-fitout-wip.md`
- Safe to hand off: **Yes**
