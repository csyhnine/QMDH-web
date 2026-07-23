import type { Provider } from "../../api";
import { createContext, useContext } from "react";

import type { GenerateNodeData, NoteNodeData } from "./canvasTypes";

export type UpstreamDeliverables = { images: string[]; videos: string[] };

export type CanvasMediaPreview = {
  url: string;
  compareUrl?: string | null;
  title?: string;
};

export type CanvasNodeActions = {
  providers: Provider[];
  disabled?: boolean;
  patchNode: (nodeId: string, patch: Partial<GenerateNodeData>) => void;
  patchNoteNode: (nodeId: string, patch: Partial<NoteNodeData>) => void;
  generateNode: (nodeId: string, data: GenerateNodeData) => void | Promise<void>;
  syncNodeTask: (nodeId: string, data: GenerateNodeData) => void | Promise<void>;
  uploadNodeImage: (nodeId: string, file: File) => Promise<void>;
  saveAnnotation: (nodeId: string) => Promise<void>;
  getUpstreamDeliverables: (nodeId: string) => UpstreamDeliverables;
  previewMedia: (url: string, compareUrl?: string | null) => void;
};


const CanvasNodeActionsContext = createContext<CanvasNodeActions | null>(null);

export function CanvasNodeActionsProvider({
  value,
  children,
}: {
  value: CanvasNodeActions;
  children: React.ReactNode;
}) {
  return <CanvasNodeActionsContext.Provider value={value}>{children}</CanvasNodeActionsContext.Provider>;
}

export function useCanvasNodeActions(): CanvasNodeActions {
  const value = useContext(CanvasNodeActionsContext);
  if (!value) {
    return {
      providers: [],
      disabled: true,
      patchNode: () => undefined,
      patchNoteNode: () => undefined,
      generateNode: () => undefined,
      syncNodeTask: () => undefined,
      uploadNodeImage: async () => undefined,
      saveAnnotation: async () => undefined,
      getUpstreamDeliverables: () => ({ images: [], videos: [] }),
      previewMedia: () => undefined,
    };
  }
  return value;
}
