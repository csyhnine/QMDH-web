import StudioComposerSubmitActions from "./StudioComposerSubmitActions";
import StudioComposerToolbarMenus from "./StudioComposerToolbarMenus";
import type { StudioComposerToolbarProps } from "./studioComposerToolbarTypes";

export default function StudioComposerToolbar(props: StudioComposerToolbarProps) {
  const {
    availableProviderCount,
    composerToolbarRef,
    hasActiveProject,
    submitting,
    submissionProgress,
    uploadingReference,
  } = props;

  return (
    <div className="composer-toolbar" ref={composerToolbarRef}>
      <div
        className={
          props.studioForm.creationMode === "video"
            ? "composer-toolbar-menus is-video"
            : "composer-toolbar-menus is-image"
        }
      >
        <StudioComposerToolbarMenus {...props} />
      </div>
      <StudioComposerSubmitActions
        availableProviderCount={availableProviderCount}
        creationMode={props.studioForm.creationMode}
        hasActiveProject={hasActiveProject}
        submitting={submitting}
        submissionProgress={submissionProgress}
        uploadingReference={uploadingReference}
      />
    </div>
  );
}
