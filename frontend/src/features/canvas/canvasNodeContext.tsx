import type { Provider } from "../../api";
import { createContext, useContext } from "react";

import type { GenerateNodeData, NoteNodeData } from "./canvasTypes";
import type { PatchNodeOptions } from "./useCanvasNodeGenerate";

export type UpstreamDeliverables = { images: string[]; videos: string[] };

export type CanvasMediaPreview = {
  url: string;
  /** One or more original / reference images available for before/after compare. */
  compareUrls?: string[];
  title?: string;
};

export type CanvasNodeActions = {
  providers: Provider[];
  disabled?: boolean;
  promptPolishEnabled?: boolean | null;
  patchNode: (
    nodeId: string,
    patch: Partial<GenerateNodeData>,
    options?: PatchNodeOptions
  ) => void;
  patchNoteNode: (
    nodeId: string,
    patch: Partial<NoteNodeData>,
    options?: PatchNodeOptions
  ) => void;
  generateNode: (nodeId: string, data: GenerateNodeData) => void | Promise<void>;
  syncNodeTask: (nodeId: string, data: GenerateNodeData) => void | Promise<void>;
  uploadNodeImage: (nodeId: string, file: File) => Promise<void>;
  saveAnnotation: (nodeId: string) => Promise<void>;
  getUpstreamDeliverables: (nodeId: string) => UpstreamDeliverables;
  previewMedia: (url: string, compareUrls?: string | string[] | null) => void;
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
      promptPolishEnabled: false,
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
