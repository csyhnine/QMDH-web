# Code / Config / Data Governance

Last updated: `2026-05-15`

## Purpose

This document defines how QMDH-web should manage:

- source code
- environment configuration
- business data
- media files
- runtime cache / queue state
- seed / bootstrap content

The goal is to let the project continue evolving locally while the server keeps the latest code **and** preserves the latest business state.

## Core Rule

QMDH-web must always separate these three concerns:

1. **Code**: versioned in Git / GitHub
2. **Configuration**: environment-specific secrets and runtime settings
3. **Data**: live business records created by real usage

Code can be redeployed.
Configuration can be rotated carefully.
Live data must be preserved and migrated, not recreated casually.

## Source Of Truth By Category

## Implementation Matrix

This matrix maps the practical storage / source-of-truth rule now used by QMDH-web.

| Category | Examples | Current source of truth | Implementation status |
|---|---|---|---|
| Code | frontend / backend source, Dockerfiles, compose, scripts, migrations, docs | Git / GitHub | Implemented |
| Environment configuration | `.env`, domain, reverse proxy, `QMDH_ENCRYPTION_KEY`, API keys, DB / Redis URLs | server environment + secure backup | Implemented |
| Business database data | users, roles, provider profiles, chat history, tasks, project records, inspiration records, audit logs | live PostgreSQL on server | Implemented |
| Media / file data | generated images, uploaded references, managed inspiration images, future reports / exports | managed storage, currently `backend_media` volume | Implemented, OSS/CDN pending |
| Runtime cache / queue state | Redis queue, locks, temporary session / coordination state | live Redis | Implemented |
| Seed / bootstrap content | default workflows, bootstrap admin, dev accounts, roster recovery script, baseline inspiration seed | repo code + scripts | Implemented |

## Current Implementation Notes

- Project deletion has entered archive-style governance:
  - active project rows are now hidden through `projects.archived_at`
  - project archive soft-deletes still-visible tasks instead of hard-deleting them
  - live task / provider call rows are still preserved for 1.0 operational continuity
- Structured archive tables now exist as the next step beyond soft delete:
  - `task_archives`
  - `provider_call_archives`
- A dedicated accounting ledger now also exists:
  - `usage_ledgers`
  - task terminal states and provider calls are written into the ledger during execution, task soft delete, and project archive flows
- This means QMDH-web now has three layers of business-history preservation:
  1. live operational tables (`tasks`, `provider_calls`, `audit_logs`)
  2. `usage_ledgers` as the stable reporting / accounting read model for task and provider-call usage
  3. archive snapshots written when tasks are deleted or projects are archived
- Current dashboard / quota style operational statistics should read from the ledger layer instead of relying on live `tasks` / `provider_calls` surviving forever.

### 1. Code

Examples:

- frontend / backend source
- Dockerfiles
- `docker-compose.yml`
- migrations
- import / export scripts
- tests
- operational docs

Source of truth:

- Git repository
- GitHub `main`

Rules:

- local development produces the newest code
- server updates should always pull from GitHub
- code changes must never depend on copying local runtime data into Git

### 2. Environment Configuration

Examples:

- `.env`
- `QMDH_ENCRYPTION_KEY`
- API keys
- database connection strings
- domain / reverse proxy settings
- Baota server-specific settings

Source of truth:

- server environment / secure backup

Rules:

- never commit real production `.env` into Git
- back up `.env` before every production update
- keep `.env` backups paired with database backups
- never change `QMDH_ENCRYPTION_KEY` after provider keys are already stored unless a full re-encryption migration is planned

### 3. Business Database Data

Examples:

- users
- roles / project access
- provider profiles
- encrypted provider API keys
- chat conversations
- chat messages
- task records
- provider call records
- inspiration post records
- audit logs

Source of truth:

- live PostgreSQL on the server

Rules:

- business data is owned by the live database, not by local development
- local DB state must not overwrite server DB state
- all schema changes must be applied through Alembic migrations
- updates must preserve the existing database unless an intentional migration plan says otherwise

### 4. Media / File Data

Examples:

- generated images
- uploaded reference images
- managed inspiration images
- preview assets
- future exported reports / documents

Source of truth:

- live managed storage
- currently `backend_media` Docker volume
- future-compatible with OSS / CDN

Rules:

- media files are production data
- media must be backed up independently from PostgreSQL
- DB rows and media backups must stay logically aligned

### 5. Runtime Cache / Queue State

Examples:

- Redis queue
- locks
- temporary runtime coordination state

Source of truth:

- live Redis

Rules:

- Redis is important for runtime continuity
- Redis is not the primary source of business history
- losing Redis should not be treated the same as losing PostgreSQL or media

### 6. Seed / Bootstrap Content

Examples:

- bootstrap admin creation
- local dev accounts
- company roster recovery script
- default workflows
- platform baseline inspiration content

Source of truth:

- repository code + scripts

Rules:

- seed content is used to initialize or repair a baseline
- seed content is not a substitute for full live production history
- seed scripts must be idempotent when possible

## Local Vs Server Responsibilities

### Local development is responsible for

- new features
- bug fixes
- refactors
- migrations
- scripts
- tests
- docs
- seed / import / export tooling

### Server runtime is responsible for

- live user accounts
- live model keys and provider configs
- live chat / task history
- live inspiration library records
- live generated media

### Deployment is responsible for connecting both safely

A correct deployment should:

- bring the newest code to the server
- keep the existing production data
- run migrations for schema changes
- preserve secrets and encryption keys
- avoid recreating or wiping the live database

## Standard Update Model

When the product continues development, the expected flow is:

1. develop locally
2. test locally
3. commit and push code
4. back up server `.env`, PostgreSQL, and media
5. pull latest code on the server
6. run `alembic upgrade head`
7. rebuild / restart containers
8. verify health and smoke-test key workflows

This means:

- **latest code** comes from GitHub
- **latest data** stays on the server
- migrations bridge old server data to new code expectations

## Data Loss Red Flags

The following actions can destroy or invalidate production state:

- `docker compose down -v`
- deleting `postgres_data`
- deleting `backend_media`
- replacing `.env` with a different `QMDH_ENCRYPTION_KEY`
- pointing the app at a fresh empty DB without importing or migrating old data
- assuming local dev data should replace server data

## Governance By Specific Object

### User accounts

- structure and recovery tooling belong in the repo
- live users and login history belong to the server DB
- company roster recovery is a controlled bootstrap / repair action, not a full historic migration

### Model keys

- model management code belongs in the repo
- real keys belong to the live DB + `.env` encryption context
- DB backup and encryption key backup must stay paired

### Chat / task history

- schema and APIs belong in the repo
- real history belongs to the live DB
- never wipe history during ordinary releases

### Inspiration library

Split into two layers:

1. **platform baseline inspiration**
   - maintained in code / seed logic
   - used to initialize new environments

2. **live operational inspiration library**
   - maintained through the running product / admin workflows
   - stored in live DB + managed media storage

Rules:

- seed inspiration should be stable and platform-controlled
- imported inspiration should be localized into managed storage
- live inspiration content does not automatically sync back into the repo unless an explicit export / curation workflow is implemented

### Future 2.0 workflow / agent execution records

For future QMDH 2.0 preparation, the default data ownership should be:

- workflow / run / step status: business database
- research outputs / summaries / structured conclusions: business database
- downloaded reference images / snapshots / generated artifacts: managed media storage
- queue coordination / locks / temporary retries: Redis runtime state

Rule:

- do not design future workflow execution around Redis as the only source of truth
- long-lived execution history and reusable research outputs must eventually land in persistent storage

## What Must Be Documented For Future Agents

Every future agent should be able to answer:

- where code truth lives
- where live data lives
- where secrets live
- how to update without wiping data
- which commands are dangerous
- how to back up / restore
- how to recover baseline accounts
- how inspiration content is split between seed data and live data

Related docs:

- `docs/server-operations.md`
- `docs/deployment.md`
- `docs/continuity.md`
- `docs/handoff.md`

## Current Project Defaults

For QMDH-web as of `2026-05-15`:

- code truth: GitHub `main`
- live business DB: PostgreSQL
- live media storage: `backend_media` volume
- runtime queue / lock state: Redis
- baseline account recovery: `python -m app.cli seed_users`
- baseline inspiration library: repo seed + managed storage localization
- production updates must preserve volumes and `.env`, then run Alembic
