# Infinite-canvas → QMDH MVP mapping

Reference clone (outside repo): `e:\projects\ref-infinite-canvas`

| Infinite-canvas | QMDH MVP |
|-----------------|----------|
| Multi canvas projects (local) | `CanvasProject` API (server) |
| Pan/zoom/minimap/grid/select/delete | `@xyflow/react` built-ins |
| Image / text / generate-config nodes | Single `generate` node (+ result image in same node) |
| `canvas-prompt-library` / prompts rail | 画布左侧改为 `CanvasProjectLibrary`（项目库 / 工作流），与生成页模板库不通用 |
| Node generate via browser OpenAI | `api.createTask` + poll assets |
| Undo/redo, plugins, agent, video | Out of scope |

Key refs inspected: `web/src/components/canvas/infinite-canvas.tsx`, `canvas-node.tsx`, `canvas-prompt-library.tsx`, `docs/content/docs/canvas/*`
