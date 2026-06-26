import type { Provider } from "../../api";
import type { ResolutionOption } from "./studioComposerDockTypes";
import type { ComposerMenuKey, StudioFormState } from "./studioTypes";

export type StudioComposerDisplayMenuProps = {
  activeComposerMenu: ComposerMenuKey;
  aspectRatioOptions: readonly string[];
  resolutionOptions: ResolutionOption[];
  selectedProvider?: Provider;
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
  "aspectRatioOptions" | "resolutionOptions" | "selectedProvider" | "studioForm" | "onAspectRatioSelect" | "onResolutionSelect"
>;

export type StudioComposerOptionGroupOption = {
  id: string;
  label: string;
  disabled?: boolean;
  hint?: string;
};

export type StudioComposerOptionGroupProps = {
  activeId: string;
  gridClassName?: string;
  options: readonly StudioComposerOptionGroupOption[];
  title: string;
  onSelect: (id: string) => void;
};
