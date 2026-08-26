# Handoff — 画布复制 / 全局与所选批量运行（2026-07-21）

Date: **2026-07-21**  
Branch: **`main`**  
状态：**本地实现完成，交接时以 `git status` 为准（可能尚未 push / 未部署）**

---

## 一句话

无限画布补齐：**节点复制粘贴**、**全部运行**、**运行所选（含编组）**；此前已上生产的还有任务轮询续跑与中文输入打断修复。

---

## 生产 vs 本地（交接必读）

| 环境 | 大致 HEAD（以实机为准） | 含什么 |
| --- | --- | --- |
| **生产**（上次热更前端） | **`cb85fc6`** | 画布默认开；模型下拉不混 LLM；节点生成后离页可续跑；IME/Backspace 输入修复 |
| **本机未提交 / 未部署** | working tree | **复制/粘贴/Ctrl+D** + **全部运行** + **运行所选** |

核对命令：

```bash
git rev-parse --short HEAD
git status -sb
# 生产
sudo -u admin git -C /www/wwwroot/qmdh-web rev-parse --short HEAD
```

---

## 已上生产的相关修复（本轮对话前半）

| Commit | 内容 |
| --- | --- |
| `9c7bfac` | 画布模型选择：按 capability 区分，文生图下拉不含聊天 LLM |
| `f6268a4` | 离开画布页后轮询中断 → 回页自动 resume；`getTask` + result 取图；保存 flush/去重 |
| `cb85fc6` | 节点打字易断：本地草稿 + IME composition；Delete 才删节点；keydown 不冒泡 |

根因摘要：

1. **卡「生成中」**：`/studio/canvas` 卸载杀掉 poll；保存 timer 被清；回页不续跑。
2. **打字中断**：每键 `patchNode` 打断中文输入；`Backspace` 曾绑 React Flow 删节点。

---

## 本机 WIP：复制 + 批量运行（交接重点）

### 行为

| 能力 | 入口 | 行为 |
| --- | --- | --- |
| 复制 | 工具栏「复制」、**Ctrl+D** | 原地偏移复制；含编组子节点与内部边；清 `taskId` / 进行中状态 |
| 剪贴板 | **Ctrl+C / Ctrl+V** | 内部 clipboard（非系统剪贴板）；输入框内不抢快捷键 |
| 全部运行 | 工具栏蓝按钮 | 全图 runnable 节点拓扑串行；跳过已有 `assetUrls` 的 completed |
| 运行所选 | 工具栏次级按钮 + 右侧空选面板 | 选中范围（**选中 group 会 expand 子节点**）拓扑串行 |

**Runnable 节点**：`text2img` / `img2img` / `video` / `upscale`  
**跳过**：`upload` / `annotate` / `note` / `group` 本身  
失败即停；模板编辑模式不跑任务。

### 关键文件

| 文件 | 作用 |
| --- | --- |
| `frontend/src/features/canvas/canvasGraphUtils.ts` | `duplicateCanvasSelection` / `snapshotCanvasSelection` / `pasteCanvasSnapshot` / `listRunnableNodeIdsInTopoOrder` / `listRunnableNodeIdsForSelection` / `expandSelectionWithGroupChildren` |
| `frontend/src/features/canvas/CanvasWorkspace.tsx` | 快捷键、工具栏、`runWorkflow('all'\|'selection')` |
| `frontend/src/features/canvas/CanvasNodeInspector.tsx` | 多选/编组时空态「运行所选」 |
| `frontend/src/features/canvas/CanvasDraftField.tsx` | IME 安全输入（已在 `cb85fc6`） |
| `frontend/src/features/canvas/useCanvasNodeGenerate.ts` | poll / resume（已在 `f6268a4`） |
| `frontend/src/api.ts` | `getTask`（已在 `f6268a4`） |

### 未做 / 风险

- 未强制「全部重跑」（已有结果默认跳过）
- annotate 链在中间时，run-all 跳过 annotate，下游可能缺图
- 内部 Ctrl+C 不写入系统剪贴板（跨应用粘贴不可用）
- 全局运行中会 `disabled` 节点操作；长任务会长时间锁 UI
- **本包未部署**前，生产没有复制/批量运行

---

## 建议下一会话动作（按优先级）

1. **核对** `git status`：若 WIP 仍在，先 **commit**（用户同意后）再决定是否 **push + 仅 rebuild frontend**。
2. 部署前端后冒烟：
   - 选中编组 →「运行所选」只跑组内
   - Ctrl+C/V、Ctrl+D
   - 全部运行 + 离开画布再回来续跑（回归）
   - 中文提示词输入不中断（回归）
3. 产品可选：已有结果是否「强制重跑」开关；annotate 是否纳入批量。
4. Agent 大包仍在 `wip/agent-multi-chat-2026-07` @ `4b0a5b3`，勿整包上生产。

---

## 硬约束

- 未经用户明确同意：**禁止 push / 禁止生产部署**
- 勿提交：`storage/`、`.env`、`backend/app.db`、`frontend/dist/`、`assets/` 本地截图
- SSH 部署 historically：root + paramiko；**勿把密码写进仓库**

---

## Safe to hand off

**Yes**（代码意图清晰；若 working tree 脏，接手后先 commit 或 stash，再部署）
