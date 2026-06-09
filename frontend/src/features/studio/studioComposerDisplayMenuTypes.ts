import type { ResolutionOption } from "./studioComposerDockTypes";
import type { ComposerMenuKey, StudioFormState } from "./studioTypes";

export type StudioComposerDisplayMenuProps = {
  activeComposerMenu: ComposerMenuKey;
  aspectRatioOptions: readonly string[];
  resolutionOptions: ResolutionOption[];
  selectedResolutionLabel: string | null;
  studioForm: StudioFormState;
  onAspectRatioSelect: (ratio: string) => void;
  onResolutionSelect: (resolutionId: string) => void;
  onToggleComposerMenu: (menu: Exclude<ComposerMenuKey, null>) => void;
};

export type StudioComposerDisplayMenuTriggerProps = Pick<
  StudioComposerDisplayMenuProps,
  "activeComposerMenu" | "selectedResolutionLabel" | "studioForm" | "onToggleComposerMenu"
>;

export type StudioComposerDisplayMenuPanelProps = Pick<
  StudioComposerDisplayMenuProps,
  "aspectRatioOptions" | "resolutionOptions" | "studioForm" | "onAspectRatioSelect" | "onResolutionSelect"
>;

export type StudioComposerOptionGroupOption = {
  id: string;
  label: string;
};

export type StudioComposerOptionGroupProps = {
  activeId: string;
  gridClassName?: string;
  options: readonly StudioComposerOptionGroupOption[];
  title: string;
  onSelect: (id: string) => void;
};
