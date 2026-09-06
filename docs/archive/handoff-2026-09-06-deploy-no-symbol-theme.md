# 部署清单：2026-09-06（不含符号主题链）

**分支：** `release/2026-09-06-no-symbol`（基于 `origin/main` @ `cbe9062`）  
**排除：** 符号主题 5 节点链、豆包检索、符号 WIP（2 节点资料整理）、migration `v3w4`~`y6z7`

---

## 本分支包含

| Commit | 内容 |
|--------|------|
| `9a5e475` | 画布生成节点进度条 |
| `2555f4c` | 润色 500 修复（跳过无效参考图） |
| `4890018` | Grok i2i 参考图 inline data URL |
| `218ba30` | Studio perf：nginx `/media` 直出、tasks/assets 分页、轮询优化、lazy-load |

**`origin/main` 已有（无需重复）：** 视频下载扩展名、生成分析 tracking 窗口裁剪。

---

## 生产 deploy 步骤

```bash
cd /www/wwwroot/qmdh-web

git fetch origin
git checkout release/2026-09-06-no-symbol
git pull origin release/2026-09-06-no-symbol

docker compose build frontend backend worker
docker compose up -d frontend backend worker

curl -sS -o /dev/null -w '%{time_total}\n' 'https://cityusbdisk.cn/api/v1/health?detail=full'
curl -sS -o /dev/null -w '%{time_total}\n' 'https://cityusbdisk.cn/media/<已知图片路径>'
```

**本分支无新 Alembic migration。**

### 热补 reconcile

| 项 | 生产现状 | deploy 后 |
|----|----------|-----------|
| Grok inline data URL | docker cp 热补 | 镜像固化 |
| 润色 500 | docker cp 热补 | 镜像固化；勿再覆盖 `prompt_polish_*` |

---

## 验收清单

- [ ] Studio 首屏：`/tasks?limit=120` 非全量 MB 级
- [ ] running 时轮询为小 payload（~40 条）
- [ ] `/media/...` 单图 curl 时间下降
- [ ] Grok 多参考图 smoke
- [ ] 润色无效参考图不 500
- [ ] 画布 Generate 节点进度条

---

## 仍留本地、不上线

- `main` 符号主题链 commit
- stash：符号 2 节点资料整理 WIP
- migration `z7a8b9c0d1e2`

**纪律：** 未经用户同意禁止 push/deploy。
