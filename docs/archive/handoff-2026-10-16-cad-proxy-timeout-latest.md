### [2026-10-16] CAD 布置按钮超时 — 已修复外层代理

- 浏览器缓存补救：用户刷新仍失败；日志证实 Chrome 继续请求 /extracts/?limit=20，返回 307 到 HTTP。前次 301 已被缓存。现在使用 rewrite ... break 内部去尾斜杠，查询参数保持，不向浏览器再跳转；六个列表/详情路由均直接 401、健康 200。只读脚本加入带尾斜杠/limit=20 覆盖。当前可连接浏览器无现有标签/登录态，不能宣称登录 UI 验收。
- 后续纠错：初版 location 尾斜杠让列表 /extracts 被 301 加斜杠，后端又 307 跳 HTTP 去斜杠，引发混合内容/循环跳转。已去掉 location 尾斜杠，列表含查询/详情均直接 401，健康 200；scripts/check-cad-proxy.sh 固定覆盖这些只读路径。旧版只查详情与健康，验收覆盖不足。
- ce_1e513e72a64e 两次 fitout 在后台耗时 74214/74956ms 并返回 200，但宝塔 60s 返回 504；正式库已存 floor 1 的三套方案/默认 104 家具。没有重跑/修改正式 CAD 数据。
- 新增 ops/nginx/cad-extracts.conf；安装到宝塔 extension/120.79.227.11/qmdh-cad-extracts.conf，仅 /api/v1/cad/extracts 前缀等待 300s，与内层一致。nginx -t/-T、平滑 reload、公开 CAD 未登录 401/健康 200 通过；未再次调用耗时写接口。
- 方案代码仍为沿墙/主家具/网格，生成成功后出现切换，按通过状态与 loss 选默认；刷新可读取已保存结果。
- 配置备份 /www/backup/qmdh-cad-timeout-20261016 与 E:/backups/QMDH-web/cad-timeout-20261016；回退移出新增 extension conf 后 nginx -t/reload。不改镜像/env/数据库/媒体/18010，原未提交样式等保护。
- 分支 codex/cad-proxy-timeout；Safe to hand off: Yes。
