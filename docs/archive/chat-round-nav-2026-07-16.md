# Chat 对话轮次导航（2026-07-16）

Last updated: **2026-07-16**  
状态：**本地已实现，未 commit / 未部署**  
页面：`/studio/chat`

---

## 一句话

多轮对话时，消息区右侧中部常驻「竖线 + 横刻度」；鼠标移到刻度上才展开对话摘要列表，点击可跳转；**仅 1 轮用户消息时不显示**。

---

## 行为（产品确认）

1. 单轮对话：右侧**不显示**任何导航
2. 多轮对话：默认**只显示横刻度**（无数字计数）
3. 鼠标移到横刻度区域：展开左侧摘要卡片（用户提问前缀）
4. 点击刻度或摘要：平滑滚到对应轮次；滚动时高亮当前轮次

视觉参考：通义千问右侧「一小块」竖轨 + 横刻度（非贴滚动条的全高条）。

---

## 文件

| 文件 | 职责 |
| --- | --- |
| `frontend/src/pages/chat/ChatConversationNav.tsx` | 悬浮导航组件 |
| `frontend/src/lib/chat/chatRoundUtils.ts` | 按用户消息提取轮次 / 摘要 |
| `frontend/src/pages/chat/ChatPage.tsx` | 用户消息锚点 id、接入导航 |
| `frontend/src/styles.css` | `.chat-round-nav-*` 样式 |

---

## 与 Agent 模式的关系

本次只改 **当前 `main` 上的纯 Chat UI**。  
`agent_mode` **仍不在** `main` / 生产；代码在 `wip/agent-multi-chat-2026-07` @ `4b0a5b3`。  
见 `docs/archive/handoff-2026-07-16-agent-wip-status.md`。
