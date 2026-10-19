import StudioComposerSubmitActions from "./StudioComposerSubmitActions";
import StudioComposerToolbarMenus from "./StudioComposerToolbarMenus";
import type { StudioComposerToolbarProps } from "./studioComposerToolbarTypes";

export default function StudioComposerToolbar(props: StudioComposerToolbarProps) {
  const {
    availableProviderCount,
    composerToolbarRef,
    hasActiveProject,
    referenceUploads,
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
        requiresTwoImages={props.selectedProvider?.adapter_kind === "comfyui" && props.studioForm.creationMode === "edit"}
        availableProviderCount={availableProviderCount}
        creationMode={props.studioForm.creationMode}
        hasActiveProject={hasActiveProject}
        prompt={props.studioForm.prompt}
        referenceUploadCount={referenceUploads.length}
        submitting={submitting}
        submissionProgress={submissionProgress}
        uploadingReference={uploadingReference}
        promptPolishEnabled={props.promptPolishEnabled}
        polishingPrompt={props.polishingPrompt}
        onPolishPrompt={props.onPolishPrompt}
      />
    </div>
  );
}
