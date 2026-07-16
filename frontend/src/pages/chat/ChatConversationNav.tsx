import { useEffect, useState, type RefObject } from "react";

import { type ChatRound, chatRoundElementId } from "../../lib/chat/chatRoundUtils";

type ChatConversationNavProps = {
  rounds: ChatRound[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
};

export default function ChatConversationNav({ rounds, scrollContainerRef }: ChatConversationNavProps) {
  const [activeRoundId, setActiveRoundId] = useState<string | null>(rounds[0]?.id ?? null);
  const [railHovered, setRailHovered] = useState(false);

  useEffect(() => {
    setActiveRoundId(rounds[0]?.id ?? null);
  }, [rounds]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || rounds.length <= 1) {
      return;
    }

    const updateActiveRound = () => {
      const containerTop = container.getBoundingClientRect().top + 80;
      let nextActiveId = rounds[0]?.id ?? null;

      for (const round of rounds) {
        const element = document.getElementById(chatRoundElementId(round.id));
        if (!element) {
          continue;
        }
        if (element.getBoundingClientRect().top <= containerTop) {
          nextActiveId = round.id;
        }
      }

      setActiveRoundId(nextActiveId);
    };

    updateActiveRound();
    container.addEventListener("scroll", updateActiveRound, { passive: true });
    window.addEventListener("resize", updateActiveRound);

    return () => {
      container.removeEventListener("scroll", updateActiveRound);
      window.removeEventListener("resize", updateActiveRound);
    };
  }, [rounds, scrollContainerRef]);

  if (rounds.length <= 1) {
    return null;
  }

  function handleNavigate(roundId: string) {
    const element = document.getElementById(chatRoundElementId(roundId));
    if (!element) {
      return;
    }
    element.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveRoundId(roundId);
  }

  return (
    <div className="chat-round-nav-zone">
      <nav
        className={`chat-round-nav${railHovered ? " is-expanded" : ""}`}
        aria-label="对话轮次导航"
        onMouseEnter={() => setRailHovered(true)}
        onMouseLeave={() => setRailHovered(false)}
      >
        {railHovered ? (
          <ol className="chat-round-nav-list">
            {rounds.map((round) => (
              <li key={round.id}>
                <button
                  type="button"
                  className={`chat-round-nav-item${activeRoundId === round.id ? " is-active" : ""}`}
                  onClick={() => handleNavigate(round.id)}
                  title={round.preview}
                >
                  <span className="chat-round-nav-item-text">{round.preview}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : null}

        <div className="chat-round-nav-rail">
          <div className="chat-round-nav-ticks">
            {rounds.map((round) => (
              <button
                key={round.id}
                type="button"
                className={`chat-round-nav-tick${activeRoundId === round.id ? " is-active" : ""}`}
                aria-label={`跳转到：${round.preview}`}
                onClick={() => handleNavigate(round.id)}
              />
            ))}
          </div>
          <span className="chat-round-nav-rail-line" aria-hidden="true" />
        </div>
      </nav>
    </div>
  );
}
