import StudioComposerSubmitActions from "./StudioComposerSubmitActions";
import StudioComposerToolbarMenus from "./StudioComposerToolbarMenus";
import type { StudioComposerToolbarProps } from "./studioComposerToolbarTypes";

export default function StudioComposerToolbar(props: StudioComposerToolbarProps) {
  const {
    availableProviderCount,
    composerToolbarRef,
    hasActiveProject,
    selectedStyleLabel,
    serviceHealthy,
    submitting,
    submissionProgress,
    uploadingReference,
  } = props;

  return (
    <div className="composer-toolbar" ref={composerToolbarRef}>
      <StudioComposerToolbarMenus {...props} />
      <StudioComposerSubmitActions
        availableProviderCount={availableProviderCount}
        creationMode={props.studioForm.creationMode}
        hasActiveProject={hasActiveProject}
        selectedStyleLabel={selectedStyleLabel}
        serviceHealthy={serviceHealthy}
        submitting={submitting}
        submissionProgress={submissionProgress}
        uploadingReference={uploadingReference}
      />
    </div>
  );
}
