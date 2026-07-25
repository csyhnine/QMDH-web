# Deploy 2026-07-25 — Studio gallery download + wan aspect-aware size

- Git: `4edaaec` (`feat(studio): gallery download and wan aspect-aware size`)
- Also shipped: `afa563d` (compare/lightbox download)
- Production path: `/www/wwwroot/qmdh-web`
- Pull: `sudo -u admin git -C /www/wwwroot/qmdh-web pull --ff-only origin main`
- Rebuild: `docker compose up -d --build frontend backend worker`
- Alembic: unchanged
- Health: `http://127.0.0.1:8080/api/v1/health` → 200; `https://cityusbdisk.cn/api/v1/health` → 200
- Notes:
  - History cards: 下载 next to 置入 / 放大
  - wan: concrete aspect → WxH size; 智能 / 遵循原图 → literal 1K/2K/4K; edit caps 4K→2K
