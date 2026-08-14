# 生产部署记录 — 2026-08-14 Seedance 入库 + Grok asset 隔离

Date: **2026-08-14**  
Git tip：**`e005414`**（含此前同波次 `5b33724`…`834e60f`）  
Alembic：无新迁移（仍 `r9s0t1u2v3w4`）  
Production HEAD：`e005414f3a0e67a92f1c5cea98290278128141ad`

## 动作

1. `sudo -u admin git -C /www/wwwroot/qmdh-web pull --ff-only origin main`
2. Backend/worker：docker cp `haodeya_grok_video.py` + `docker compose restart backend worker`
3. Frontend：`docker compose build --no-cache frontend && docker compose up -d frontend`
4. Health：`https://cityusbdisk.cn/api/v1/health` → healthy

## 注意

- 脏 `frontend/src/styles.css` 挡 pull 时先 checkout 掉
- 普通 `build frontend` 可能整层 CACHED；改 Studio JS 后务必 `--no-cache`
- 详档：`docs/archive/handoff-2026-08-14-seedance-avatar-grok-asset.md`
