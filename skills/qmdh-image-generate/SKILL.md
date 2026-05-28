---
name: qmdh-image-generate
description: Trigger QMDH image generation as a managed business action from OpenClaw.
---

# QMDH Image Generate

Use this skill when a workflow needs a formal QMDH image-generation task instead of a local or community image tool.

## Inputs

- `title`
- `project_id`
- `requested_provider`
- `payload`
- optional `classification`

## Behavior

Send a `POST` request to:

`$QMDH_BASE_URL/api/v1/agent/image-generate`

Use the standard QMDH agent headers from [skills/README.md](/E:/projects/QMDH-web/skills/README.md).

## Expected result

The response returns a QMDH agent job with:

- `id`
- `task_id`
- `status`
- `request_id`

If the job is accepted, poll:

`GET $QMDH_BASE_URL/api/v1/agent/jobs/{id}`

until `status` becomes `completed` or `failed`.
