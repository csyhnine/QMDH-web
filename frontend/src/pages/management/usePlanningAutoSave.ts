import { useEffect, useRef } from "react";

/** Debounce a specific edit snapshot. Failed writes wait for an edit or explicit retry. */
export default function usePlanningAutoSave(revision: string | null, enabled: boolean, blocked: boolean, save: () => Promise<void>) {
  const latest = useRef(save);
  latest.current = save;
  const attempted = useRef<string | null>(null);
  useEffect(() => {
    if (!revision) attempted.current = null;
    if (!enabled || blocked || !revision || attempted.current === revision) return;
    const timer = window.setTimeout(() => {
      attempted.current = revision;
      void latest.current();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [revision, enabled, blocked]);
}
