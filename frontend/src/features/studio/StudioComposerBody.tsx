import { composerReferenceZoneLabel } from "./studioComposerDockUtils";
import StudioComposerModeSwitch from "./StudioComposerModeSwitch";
import StudioPromptTextarea from "./StudioPromptTextarea";
import StudioReferenceDropzone from "./StudioReferenceDropzone";
import type { StudioComposerBodyProps } from "./studioComposerExpandedContentTypes";

export default function StudioComposerBody({
  promptTextareaRef,
  referenceHint,
  maxReferenceCount,
  referenceUploads,
  studioForm,
  onModeChange,
  onOpenReferencePicker,
  onPromptChange,
  onPromptSubmitShortcut,
  onReferenceDrop,
  onRemoveReferenceUpload,
  onReplaceReferenceUpload,
  enableSeedanceAvatar,
  onRegisterSeedancePrivateAvatar,
  onStartSeedanceRealAvatar,
  onCompleteSeedanceRealAvatar,
}: StudioComposerBodyProps) {
  return (
    <div className="composer-body">
      <div className="reference-column">
        <StudioComposerModeSwitch creationMode={studioForm.creationMode} onModeChange={onModeChange} />
        <div
          className={[
            "reference-zone",
            studioForm.creationMode === "edit" ? "is-edit-mode" : "is-generate-mode",
          ].join(" ")}
        >
          <span className="reference-zone-label">{composerReferenceZoneLabel(studioForm.creationMode)}</span>
          <StudioReferenceDropzone
            creationMode={studioForm.creationMode}
            referenceUploads={referenceUploads}
          maxReferenceCount={maxReferenceCount}
          enableSeedanceAvatar={enableSeedanceAvatar}
          onOpenReferencePicker={onOpenReferencePicker}
          onReferenceDrop={onReferenceDrop}
          onRemoveReferenceUpload={onRemoveReferenceUpload}
          onReplaceReferenceUpload={onReplaceReferenceUpload}
          onRegisterSeedancePrivateAvatar={onRegisterSeedancePrivateAvatar}
          onStartSeedanceRealAvatar={onStartSeedanceRealAvatar}
          onCompleteSeedanceRealAvatar={onCompleteSeedanceRealAvatar}
        />
        </div>
      </div>

      <StudioPromptTextarea
        promptTextareaRef={promptTextareaRef}
        referenceHint={referenceHint}
        studioForm={studioForm}
        onPromptChange={onPromptChange}
        onPromptSubmitShortcut={onPromptSubmitShortcut}
      />
    </div>
  );
}
