import { useEffect, useRef, useState } from "react";

import type { Task } from "../../api";
import { inferVirtualTaskPercent } from "./studioUtils";

export function useVirtualTaskProgress(task: Task, enabled: boolean): number {
  const [nowTick, setNowTick] = useState(() => Date.now());
  const progress = useRef({ id: task.id, value: 0 });
  const stage = task.result?.["queued_stage"];
  const paused = stage === "recovering" || stage === "review";

  useEffect(() => {
    if (!enabled || paused) {
      return;
    }

    const timer = window.setInterval(() => setNowTick(Date.now()), 900);
    return () => window.clearInterval(timer);
  }, [enabled, paused]);

  if (progress.current.id !== task.id) progress.current = { id: task.id, value: 0 };
  const inferred = inferVirtualTaskPercent(task, nowTick);
  if (task.status === "completed") progress.current.value = 100;
  else if (enabled && (!paused || progress.current.value === 0)) {
    progress.current.value = Math.max(progress.current.value, Number.isFinite(inferred) ? Math.min(95, inferred) : 0);
  }
  return progress.current.value;
}
