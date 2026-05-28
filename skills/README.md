# QMDH OpenClaw Skills

This directory contains the first-party QMDH skills intended to be installed into an OpenClaw runtime.

## Required environment variables

- `QMDH_BASE_URL`
- `QMDH_AGENT_TOKEN`
- `QMDH_AGENT_KEY`
- optional: `QMDH_EXECUTION_ID`
- optional: `QMDH_PROJECT_ID`

## Common headers

Every skill should send:

- `X-QMDH-Agent-Token: $QMDH_AGENT_TOKEN`
- `X-QMDH-Agent-Key: $QMDH_AGENT_KEY`
- `X-QMDH-Execution-Id: $QMDH_EXECUTION_ID`
- `X-Request-ID: <runtime generated id>`

## Current first-party skills

- `qmdh-image-generate`
- `qmdh-image-edit`
- `qmdh-save-inspiration`
- `qmdh-save-project-asset`
- `qmdh-save-research-summary`

These skills are thin wrappers over the QMDH agent API and are designed to keep business writes inside QMDH instead of direct community-skill writes.
