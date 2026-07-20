import ReactMarkdown from "react-markdown";

type ChatMessageContentProps = {
  text: string;
  streaming?: boolean;
  role: "user" | "assistant" | "system";
  emptyStreamingText?: string;
};

export default function ChatMessageContent({
  text,
  streaming,
  role,
  emptyStreamingText = "...",
}: ChatMessageContentProps) {
  if (!text) {
    return streaming ? <div className="chat-msg-content chat-msg-thinking">{emptyStreamingText}</div> : null;
  }

  if (role === "user" || streaming) {
    return <div className="chat-msg-content">{text}</div>;
  }

  return (
    <div className="chat-msg-content chat-msg-markdown">
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}
