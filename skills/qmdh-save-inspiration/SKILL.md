---
name: qmdh-save-inspiration
description: Save inspiration discovered by OpenClaw into the QMDH inspiration library.
---

# QMDH Save Inspiration

Use this skill when browser research or curation finds an image/reference that should become a managed QMDH inspiration post.

## Inputs

- `title`
- `image_path`
- optional `project_id`
- optional `description`
- optional `category`
- optional `tags`
- optional `source_name`
- optional `source_url`
- optional `prompt_text`
- optional `model_name`

## Behavior

Send a `POST` request to:

`$QMDH_BASE_URL/api/v1/agent/inspiration/import`

The job completes immediately when QMDH stores the inspiration post.
