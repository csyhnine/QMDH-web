import StudioGalleryPreviewLightbox from "./StudioGalleryPreviewLightbox";
import StudioShareConfirmLightbox from "./StudioShareConfirmLightbox";
import type { StudioMediaLightboxesProps } from "./studioMediaLightboxTypes";
import { getRenderableUrl } from "./studioUtils";

export default function StudioMediaLightboxes({
  galleryPreview,
  shareConfirmState,
  onCloseGalleryPreview,
  onApplyPreviewToComposer,
  onCloseShareConfirm,
  onConfirmShare,
}: StudioMediaLightboxesProps) {
  const previewUrl = galleryPreview ? getRenderableUrl(galleryPreview.asset) : null;

  return (
    <>
      {galleryPreview && previewUrl ? (
        <StudioGalleryPreviewLightbox
          galleryPreview={galleryPreview}
          previewUrl={previewUrl}
          onClose={onCloseGalleryPreview}
          onApplyToComposer={onApplyPreviewToComposer}
        />
      ) : null}
      {shareConfirmState ? (
        <StudioShareConfirmLightbox
          shareConfirmState={shareConfirmState}
          onClose={onCloseShareConfirm}
          onConfirm={onConfirmShare}
        />
      ) : null}
    </>
  );
}
