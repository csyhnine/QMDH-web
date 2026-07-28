import { createContext, useContext, type ReactNode } from "react";

type CanvasEdgeInteraction = {
  disabled: boolean;
};

const CanvasEdgeInteractionContext = createContext<CanvasEdgeInteraction>({ disabled: false });

export function CanvasEdgeInteractionProvider({
  disabled,
  children,
}: {
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <CanvasEdgeInteractionContext.Provider value={{ disabled }}>
      {children}
    </CanvasEdgeInteractionContext.Provider>
  );
}

export function useCanvasEdgeInteraction(): CanvasEdgeInteraction {
  return useContext(CanvasEdgeInteractionContext);
}
