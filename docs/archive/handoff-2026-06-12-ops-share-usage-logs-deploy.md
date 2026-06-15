# Archive: Ops Role + Inspiration Share + Usage Logs Layout (2026-06-12)

## Milestone Summary

Production rollout for three related admin/studio improvements on `https://cityusbdisk.cn`.

| Commit | Scope | Production |
|--------|-------|------------|
| `b1fce44` | 运维 `ops` 独立角色；后台模块权限拆分 | ✅ deployed |
| `30cbd1c` | 灵感库分享扩展（无原图 / 视频）+ 使用日志表格对齐 | ✅ deployed |

## 1. Ops Role (`b1fce44`)

### Behavior

| Role | Studio | Backoffice |
|------|--------|------------|
| designer | full | none |
| ops | full | inspiration / feedback / templates |
| admin | full | all modules |

- Ops sees 🔒 on admin-only modules (dashboard, usage logs, models, agents, users, settings)
- Ops default backoffice home: `/admin/inspiration`
- Account page can create/filter **运维** users

### Key paths

- `backend/app/core/auth.py`
- `frontend/src/features/access/roleAccess.ts`
- `frontend/src/router.tsx` (`AdminModuleRoute` / `AdminOnlyRoute`)
- `frontend/src/components/shared/AppShell.tsx`

## 2. Inspiration Share Expansion (`30cbd1c`)

### Before

- Share required a reference/source image for before/after compare
- Video assets: share button disabled

### After

- **No source image**: image results can share as single-media inspiration posts
- **Video**: video assets can share; inspiration post uses `media_type=video`
- Compare UI when reference exists; single image/video preview when not
- DB: `inspiration_posts.media_type` (`image` | `video`)

### Key paths

- `backend/app/routers/assets.py` — removed source-image requirement on share
- `backend/migrations/versions/5e6f7a8b9c0d_add_inspiration_media_type.py`
- `backend/tests/test_asset_share.py`
- `frontend/src/pages/inspiration/inspirationMediaUtils.tsx`
- `frontend/src/features/studio/StudioShareConfirmLightbox.tsx`

### Schema note

```sql
ALTER TABLE inspiration_posts ADD COLUMN media_type VARCHAR(20) NOT NULL DEFAULT 'image';
```

Also applied via `bootstrap.ensure_schema()` for older DBs.

## 3. Usage Logs Table Layout (`30cbd1c`)

### Fix

- Fixed column misalignment on `/admin/usage-logs`
- Replaced mixed `fr` grid with fixed column widths + single flexible detail column
- Cell stacking via flex; numeric columns right-aligned
- Removed misleading `非流` sub-label on non-chat latency cells

### Key paths

- `frontend/src/pages/admin/UsageLogsPage.tsx`
- `frontend/src/styles.css` (`.usage-logs-table` rules)

## Deploy Record

### Method

Server `git pull` still fails (GitHub deploy key). Used **git bundle** via `tmp/deploy_prod.py`.

### Production verification (`30cbd1c`)

```
Server HEAD: 30cbd1c1
curl http://127.0.0.1:8080/api/v1/health  → healthy
curl https://cityusbdisk.cn/api/v1/health   → healthy
docker compose ps                           → backend/frontend/worker up
```

Full deploy transcript: `docs/archive/deploy-2026-06-12-30cbd1c.log`

### Git sync (dev machine)

Direct push failed (443 reset). Success via proxy:

```powershell
git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push origin main
```

Result: `b1fce44..30cbd1c  main -> main`

## Smoke Checklist

- [ ] Login as `ops`: locked modules show 🔒; can open inspiration / feedback / templates
- [ ] Share text-only image result (no reference upload) → inspiration single-image card
- [ ] Share video result → inspiration video card / player
- [ ] `/admin/usage-logs`: header columns align with row data

## Follow-up

- Fix server GitHub deploy key to restore normal `git pull`
- Existing DB users with legacy `ops` treated as admin before `b1fce44` need role set to `ops` in Users page if intended
