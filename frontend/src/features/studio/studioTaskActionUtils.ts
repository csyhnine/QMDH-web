import type { Dispatch, SetStateAction } from "react";

import type { Asset, Provider, Task } from "../../api";
import type { ComposerMenuKey, ReferenceUploadItem, StudioFormState } from "./studioTypes";
import { buildStudioFormFromTask } from "./studioTaskFormUtils";

type MutableRef<T> = {
  current: T;
};

type BuildStudioFormFromTaskOptions = {
  asset?: Asset;
  buildUploadsFromPaths: (paths: string[]) => ReferenceUploadItem[];
  providers: Provider[];
  studioForm: StudioFormState;
  task: Task;
};

type ApplyTaskToComposerOptions = BuildStudioFormFromTaskOptions & {
  composerToolbarRef: MutableRef<HTMLDivElement | null>;
  replaceReferenceUploads: (uploads: ReferenceUploadItem[]) => void;
  setActiveComposerMenu: Dispatch<SetStateAction<ComposerMenuKey>>;
  setComposerCollapsed: Dispatch<SetStateAction<boolean>>;
  setStudioForm: Dispatch<SetStateAction<StudioFormState>>;
};

type RegenerateTaskFeedback = {
  message: string;
  tone: "success" | "error";
};

export { buildStudioFormFromTask, resolveStudioProviderForForm } from "./studioTaskFormUtils";

export function applyTaskToComposerState({
  asset,
  buildUploadsFromPaths,
  composerToolbarRef,
  providers,
  replaceReferenceUploads,
  setActiveComposerMenu,
  setComposerCollapsed,
  setStudioForm,
  studioForm,
  task,
}: ApplyTaskToComposerOptions): StudioFormState {
  const { nextForm, nextUploads } = buildStudioFormFromTask({
    asset,
    buildUploadsFromPaths,
    providers,
    studioForm,
    task,
  });
  setActiveComposerMenu(null);
  replaceReferenceUploads(nextUploads);
  setStudioForm(nextForm);
  window.requestAnimationFrame(() => {
    scrollComposerIntoView(composerToolbarRef, setComposerCollapsed);
  });
  return nextForm;
}

export function regenerateTaskFeedback(submitted: boolean): RegenerateTaskFeedback {
  return {
    tone: submitted ? "success" : "error",
    message: submitted ? "已带入创作区，并开始再次生成。" : "再次生成没有提交成功。",
  };
}

export function scrollComposerIntoView(
  composerToolbarRef: MutableRef<HTMLDivElement | null>,
  setComposerCollapsed: Dispatch<SetStateAction<boolean>>
) {
  setComposerCollapsed(false);
  const anchor = composerToolbarRef.current;
  try {
    if (anchor?.scrollIntoView) {
      anchor.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  } catch {
    try {
      window.scrollTo(0, document.body.scrollHeight);
    } catch {
      // Ignore scroll failures so regenerate can continue.
    }
  }
}
