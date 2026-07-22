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
    if (!streaming || !emptyStreamingText) {
      return null;
    }
    return <div className="chat-msg-content chat-msg-thinking">{emptyStreamingText}</div>;
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
