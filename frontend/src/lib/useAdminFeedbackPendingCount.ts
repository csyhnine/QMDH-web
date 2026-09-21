import { useEffect, useState } from "react";

import { api } from "../api";

export function useAdminFeedbackPendingCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const result = await api.adminFeedbackPendingCount();
        if (!cancelled) {
          setCount(result.count);
        }
      } catch {
        // Nav indicator should not block admin pages on transient API errors.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return count;
}
