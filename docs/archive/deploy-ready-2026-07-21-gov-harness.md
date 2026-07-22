# Deploy ready: gov-001 (+ later harness/memory/B2)

Date: 2026-07-21

## Already on `origin/main`

- Merge: **`736b800`** — agent-gov-001 (`l3m4n5o6p7q8` / `agent_policy_overrides`)
- Production previously ~`3ff220b` / alembic `k2l3m4n5o6p7` (verify on server)

## Feature branch (not yet merged)

- Branch: **`feat/agent-codex-harness-001`**
- Adds: harness + memory (`m4n5o6p7q8r9`) + B2 HITL propose/confirm (+ video) + Skill UX + memory drawer
- Local verify: pytest agent suites **10 passed**; `npm run build` OK

## Production gov deploy (Slice 1) — run on server when SSH available

```bash
cd /www/wwwroot/qmdh-web
# backup .env / db / media first (see docs/server-operations.md)
sudo -u admin git -C /www/wwwroot/qmdh-web fetch origin
sudo -u admin git -C /www/wwwroot/qmdh-web pull origin main
docker compose run --rm backend alembic upgrade head
docker compose run --rm backend alembic current   # expect at least l3m4n5o6p7q8
docker compose up -d --build
curl -s http://127.0.0.1:8080/api/v1/health
```

## Note

Local agent machine has **no SSH key** to `120.79.227.11` (`Permission denied`). Slice 1 cannot be executed from this workstation; ops must run the block above.

After merging `feat/agent-codex-harness-001`, upgrade again to **`m4n5o6p7q8r9`**.
