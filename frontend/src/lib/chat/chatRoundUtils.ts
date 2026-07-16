import type { UIMessage } from "ai";

import { getUiMessageAttachments, getUiMessageText } from "./qmdhChatMessageUtils";

export type ChatRound = {
  id: string;
  preview: string;
};

const PREVIEW_MAX_LENGTH = 18;

function truncatePreview(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) {
    return "（附件）";
  }
  if (line.length <= PREVIEW_MAX_LENGTH) {
    return line;
  }
  return `${line.slice(0, PREVIEW_MAX_LENGTH)}...`;
}

export function extractChatRounds(messages: UIMessage[]): ChatRound[] {
  const rounds: ChatRound[] = [];

  messages.forEach((message, index) => {
    if (message.role !== "user") {
      return;
    }

    const text = getUiMessageText(message).trim();
    const hasAttachments = getUiMessageAttachments(message).length > 0;
    const preview = text ? truncatePreview(text) : hasAttachments ? "（附件）" : "（空消息）";

    rounds.push({
      id: message.id || `user-${index}`,
      preview,
    });
  });

  return rounds;
}

export function chatRoundElementId(roundId: string): string {
  return `chat-round-${roundId}`;
}
