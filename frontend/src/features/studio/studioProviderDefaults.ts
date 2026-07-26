import type { Provider } from "../../api";
import { isHappyHorseProvider } from "./happyHorseVideoUtils";
import type { StudioFormState } from "./studioTypes";

/** Product default when no compatible provider is selected yet. */
export function pickPreferredStudioProvider(
  providers: Provider[],
  creationMode: StudioFormState["creationMode"]
): Provider | undefined {
  if (providers.length === 0) return undefined;
  if (creationMode === "video") {
    const happyHorse = providers.find((provider) => isHappyHorseProvider(provider));
    if (happyHorse) return happyHorse;
  }
  return providers[0];
}
