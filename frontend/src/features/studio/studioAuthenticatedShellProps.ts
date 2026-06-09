import type { AuthUser } from "../../api";
import {
  canManageUsers,
  canUseOpsViews,
} from "./studioAccessUtils";
import type { StudioDesignerViewProps } from "./studioDesignerViewTypes";
import type { StudioGlobalRailProps } from "./studioGlobalRailTypes";
import type { StudioMediaLightboxesProps } from "./studioMediaLightboxTypes";
import type { GenerateStudioController } from "./useGenerateStudioController";

export type StudioAuthenticatedShellProps = {
  currentUser: AuthUser;
  studio: GenerateStudioController;
};

export type StudioAuthenticatedShellLayoutProps = {
  designerProps: StudioDesignerViewProps;
  lightboxProps: StudioMediaLightboxesProps;
  railProps: StudioGlobalRailProps;
};

export function buildStudioAuthenticatedShellProps({
  currentUser,
  studio,
}: StudioAuthenticatedShellProps): StudioAuthenticatedShellLayoutProps {
  const { state, studioAuth } = studio;
  const userCanManageUsers = canManageUsers(currentUser);
  const userCanUseOpsViews = canUseOpsViews(currentUser);

  return {
    railProps: {
      activeView: "studio",
      currentUser,
      health: state.health,
      lastSyncedAt: studio.studioData.lastSyncedAt,
      canManageUsers: userCanManageUsers,
      canUseOpsViews: userCanUseOpsViews,
      isAdminView: false,
      onLogout: studioAuth.logout,
    },
    designerProps: {
      activeComposerMenu: studio.activeComposerMenu,
      activeViewIsStudio: true,
      canUseOpsViews: userCanUseOpsViews,
      derivedState: studio.derivedState,
      fileInputRef: studio.fileInputRef,
      filters: studio.filters,
      galleryActions: studio.galleryActions,
      historyFeedback: studio.historyFeedback,
      isStudioDockLayout: studio.isStudioDockLayout,
      referenceUpload: studio.referenceUpload,
      setActiveComposerMenu: studio.setActiveComposerMenu,
      setComposerFocused: studio.setComposerFocused,
      setFilters: studio.setFilters,
      setGalleryPreview: studio.setGalleryPreview,
      setStudioForm: studio.setStudioForm,
      state,
      studioForm: studio.studioForm,
      studioProjects: studio.studioProjects,
      studioTemplates: studio.studioTemplates,
      studioView: studio.studioView,
      submitting: studio.submitting,
      submissionProgress: studio.submissionProgress,
      taskActions: studio.taskActions,
    },
    lightboxProps: {
      galleryPreview: studio.galleryPreview,
      shareConfirmState: studio.galleryActions.shareConfirmState,
      onCloseGalleryPreview: () => studio.setGalleryPreview(null),
      onApplyPreviewToComposer: (task, asset) => {
        studio.taskActions.applyTaskToComposer(task, asset);
        studio.setGalleryPreview(null);
      },
      onCloseShareConfirm: studio.galleryActions.closeShareConfirm,
      onConfirmShare: () => void studio.galleryActions.confirmShare(),
    },
  };
}
