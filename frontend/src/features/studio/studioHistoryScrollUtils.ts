import type { FeedFilterState } from "./studioHistoryPaneTypes";

const SCROLL_EPSILON_PX = 6;

export function scrollHistoryPaneToEdge(pane: HTMLElement, edge: "top" | "bottom"): void {
  pane.scrollTop = edge === "top" ? 0 : Math.max(0, pane.scrollHeight - pane.clientHeight);
}

export function scrollToLatestHistoryPosition(
  pane: HTMLElement,
  latestAnchor: HTMLElement | null,
  sort: FeedFilterState["sort"]
): void {
  if (sort === "latest") {
    scrollHistoryPaneToEdge(pane, "top");
    return;
  }

  if (latestAnchor) {
    latestAnchor.scrollIntoView({ block: "end", behavior: "auto" });
  }
  scrollHistoryPaneToEdge(pane, "bottom");
}

export function isHistoryScrolledToLatest(
  pane: HTMLElement,
  sort: FeedFilterState["sort"]
): boolean {
  const maxScrollTop = Math.max(0, pane.scrollHeight - pane.clientHeight);
  if (sort === "latest") {
    return pane.scrollTop <= SCROLL_EPSILON_PX;
  }
  return maxScrollTop - pane.scrollTop <= SCROLL_EPSILON_PX;
}
