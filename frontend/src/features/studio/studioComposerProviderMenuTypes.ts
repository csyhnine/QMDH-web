import type { Provider } from "../../api";
import type { ComposerMenuKey } from "./studioTypes";

export type ProviderGroup = {
  label: string;
  providers: Provider[];
};

export type StudioComposerProviderMenuProps = {
  activeComposerMenu: ComposerMenuKey;
  providerGroups: ProviderGroup[];
  selectedProviderModelName: string | null;
  requestedProvider: string;
  onProviderSelect: (providerName: string) => void;
  onToggleComposerMenu: (menu: Exclude<ComposerMenuKey, null>) => void;
};

export type StudioComposerProviderMenuTriggerProps = {
  open: boolean;
  selectedProviderModelName: string | null;
  onToggle: () => void;
};

export type StudioComposerProviderMenuPanelProps = {
  providerGroups: ProviderGroup[];
  requestedProvider: string;
  onProviderSelect: (providerName: string) => void;
};

export type StudioComposerProviderGroupProps = {
  group: ProviderGroup;
  requestedProvider: string;
  onProviderSelect: (providerName: string) => void;
};
