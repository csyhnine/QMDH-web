---
name: qmdh-save-project-asset
description: Save an OpenClaw-generated artifact into a QMDH project as a managed asset.
---

# QMDH Save Project Asset

Use this skill when OpenClaw creates a screenshot, local export, cropped image, or other artifact that should become a managed QMDH project asset.

## Inputs

- `project_id`
- `name`
- `asset_type`
- either `data_url` or `storage_path`
- optional `prompt_text`
- optional `tags`
- optional `source_task_id`

## Behavior

Send a `POST` request to:

`$QMDH_BASE_URL/api/v1/agent/projects/{project_id}/artifacts`

The response returns a completed QMDH job and the created asset id.
