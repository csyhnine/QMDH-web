import { useEffect, useRef, useState } from "react";

import type { HistoryActionFeedback, HistoryActionKey } from "./studioTypes";

type HistoryNotice = {
  tone: "success" | "error" | "info";
  message: string;
};

export type StudioHistoryFeedback = ReturnType<typeof useStudioHistoryFeedback>;

export function useStudioHistoryFeedback() {
  const [pendingActionByTaskId, setPendingActionByTaskId] = useState<Record<number, HistoryActionKey | null>>({});
  const [feedbackByTaskId, setFeedbackByTaskId] = useState<Record<number, HistoryActionFeedback | undefined>>({});
  const [notice, setNotice] = useState<HistoryNotice | null>(null);
  const feedbackTimersRef = useRef<Record<number, number>>({});
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      Object.values(feedbackTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  function setPendingAction(taskId: number, action: HistoryActionKey | null) {
    setPendingActionByTaskId((current) => ({
      ...current,
      [taskId]: action,
    }));
  }

  function clearFeedback(taskId: number) {
    if (feedbackTimersRef.current[taskId]) {
      window.clearTimeout(feedbackTimersRef.current[taskId]);
      delete feedbackTimersRef.current[taskId];
    }
    setFeedbackByTaskId((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }

  function pushFeedback(
    taskId: number,
    action: HistoryActionKey,
    tone: "success" | "error" | "info",
    message: string
  ) {
    if (feedbackTimersRef.current[taskId]) {
      window.clearTimeout(feedbackTimersRef.current[taskId]);
    }
    setFeedbackByTaskId((current) => ({
      ...current,
      [taskId]: {
        action,
        tone,
        message,
        stamp: Date.now(),
      },
    }));
    feedbackTimersRef.current[taskId] = window.setTimeout(() => {
      setFeedbackByTaskId((current) => {
        const next = { ...current };
        delete next[taskId];
        return next;
      });
      delete feedbackTimersRef.current[taskId];
    }, 2600);
  }

  function pushNotice(tone: HistoryNotice["tone"], message: string) {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    setNotice({ tone, message });
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 2600);
  }

  return {
    clearFeedback,
    feedbackByTaskId,
    notice,
    pendingActionByTaskId,
    pushFeedback,
    pushNotice,
    setPendingAction,
  };
}
