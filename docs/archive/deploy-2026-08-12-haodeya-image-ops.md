# 生产部署记录 — 2026-08-12 Haodeya 图像对接 / Admin 运营面

Date: **2026-08-12**  
Production: `https://cityusbdisk.cn`  
Git tip：**`c6e8dba`**  
Alembic：无变更

## 一句话

按上游手册拆开 VIP 异步 / DeepKey 同步像素 size / Seedream 字面量与比例像素；Admin 分辨率开关、请求体预览、出图 KPI、Strategies 预设一并上线。

## 执行

1. `git push` → `origin/main` @ `c6e8dba`
2. 服务器 `sudo -u admin git pull --ff-only origin main`
3. `docker compose` 全量 rebuild 因 Docker Hub 拉层卡住；改为：
   - 已建成的 `frontend` 镜像 `up -d`
   - 热补丁 Python 文件进 `backend` + 3×`worker` 后 `restart`

## 验收

| 检查 | 结果 |
|------|------|
| Git HEAD | `c6e8dba7` |
| `/api/v1/health` | healthy（db + redis） |
| 容器内策略 | `count→sync True`；`vip→async True`；Seedream 16:9→`2560x1440` |
| frontend | 已 Recreate（新镜像） |

## 后续

- 网络恢复后补一次 `docker compose build backend worker`，把热补丁固化进镜像
- root 密码曾用于部署，建议改密钥登录并轮换
- Seedance 2 ToAPI 仍未接（本波未含）
