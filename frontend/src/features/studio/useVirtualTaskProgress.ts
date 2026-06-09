import { useEffect, useState } from "react";

import type { Task } from "../../api";
import { inferVirtualTaskPercent } from "./studioUtils";

export function useVirtualTaskProgress(task: Task, enabled: boolean): number {
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timer = window.setInterval(() => setNowTick(Date.now()), 900);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return enabled ? inferVirtualTaskPercent(task, nowTick) : 0;
}
