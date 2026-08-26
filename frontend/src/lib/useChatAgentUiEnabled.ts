import { useEffect, useState } from "react";

import { api } from "../api";
import { chatAgentModeDefaultFor, resolveChatAgentUiEnabled } from "./featureFlags";

export function useChatAgentUiEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .platformSettings()
      .then((settings) => {
        if (!cancelled) {
          setEnabled(resolveChatAgentUiEnabled(settings.chat_agent_ui_enabled));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEnabled(resolveChatAgentUiEnabled(false));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}

export function useChatAgentModeDefault(uiEnabled: boolean | null): boolean {
  return uiEnabled ? chatAgentModeDefaultFor(uiEnabled) : false;
}
