import { useEffect, useState } from "react";

import { api } from "../api";

export function usePromptPolishEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .platformSettings()
      .then((settings) => {
        if (!cancelled) {
          setEnabled(Boolean(settings.prompt_polish_enabled));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEnabled(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}
