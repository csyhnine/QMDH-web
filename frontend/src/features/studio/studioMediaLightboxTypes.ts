import type { Asset, Task } from "../../api";
import type { GalleryPreviewState, ShareConfirmState } from "./studioTypes";

export type StudioMediaLightboxesProps = {
  galleryPreview: GalleryPreviewState | null;
  shareConfirmState: ShareConfirmState | null;
  onCloseGalleryPreview: () => void;
  onApplyPreviewToComposer: (task: Task, asset: Asset) => void;
  onCloseShareConfirm: () => void;
  onConfirmShare: () => void;
};

export type StudioGalleryPreviewLightboxProps = {
  galleryPreview: GalleryPreviewState;
  previewUrl: string;
  onClose: () => void;
  onApplyToComposer: (task: Task, asset: Asset) => void;
};

export type StudioShareConfirmLightboxProps = {
  shareConfirmState: ShareConfirmState;
  onClose: () => void;
  onConfirm: () => void;
};
