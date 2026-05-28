---
name: qmdh-image-edit
description: Trigger QMDH image editing as a managed business action from OpenClaw.
---

# QMDH Image Edit

Use this skill when a workflow needs formal QMDH image editing and the final result should land in QMDH history and assets.

## Inputs

- `title`
- `project_id`
- `requested_provider`
- `payload`
- optional `classification`

## Behavior

Send a `POST` request to:

`$QMDH_BASE_URL/api/v1/agent/image-edit`

Then poll the returned job through:

`GET $QMDH_BASE_URL/api/v1/agent/jobs/{id}`
