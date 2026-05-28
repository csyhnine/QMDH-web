---
name: qmdh-save-research-summary
description: Save an OpenClaw research note into a QMDH project as a managed research record.
---

# QMDH Save Research Summary

Use this skill when an OpenClaw browser/research flow produces a summary that should be retained inside QMDH for the project.

## Inputs

- `project_id`
- `title`
- optional `summary`
- optional `content`
- optional `source_url`
- optional `source_name`
- optional `tags`

## Behavior

Send a `POST` request to:

`$QMDH_BASE_URL/api/v1/agent/projects/{project_id}/research-notes`

The response returns a completed QMDH job and the created research note id.
