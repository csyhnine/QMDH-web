import { createContext } from "react";
import type { RevealScope } from "./studioResultReveals";
export const StudioResultRevealContext = createContext<RevealScope | null>(null);
