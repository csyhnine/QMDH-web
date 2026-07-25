# Deploy 2026-07-25 — Haodeya wan2.7 / HappyHorse / qwen3.8

- Git: `47890dc` (`feat(providers): route wan2.7 images and HappyHorse video off chat`)
- Production path: `/www/wwwroot/qmdh-web`
- Pull: `sudo -u admin git -C /www/wwwroot/qmdh-web pull --ff-only origin main`
- Rebuild: `docker compose up -d --build frontend backend worker`
- Alembic: unchanged (`o6p7q8r9s0t1`)
- Health: `http://127.0.0.1:8080/api/v1/health` → 200; `https://cityusbdisk.cn/api/v1/health` → 200
- Provider DB notes:
  - Chat enabled: `qwen3.8-max-preview` (other qwen tiers disabled)
  - Image: `wan2.7-image` / `wan2.7-image-pro` → `openai_images` + literal size
  - Video: six HappyHorse SKU profiles enabled
