import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from "react";

import type { PromptTemplateRecord } from "../../api";
import { copyTemplateForm, templateDraftVersion, type TemplateSaveSnapshot } from "./customStudioTemplateSaveSession";
import type {
  ComposerMenuKey,
  CustomPromptTemplate,
  StudioFormState,
  TemplateFeedback,
} from "./studioTypes";
import {
  applyTemplateToForm,
  toTemplateFormValue,
} from "./studioUtils";

type UseCustomStudioTemplateEditorStateOptions = {
  setActiveComposerMenu: Dispatch<SetStateAction<ComposerMenuKey>>;
  setStudioForm: Dispatch<SetStateAction<StudioFormState>>;
  studioForm: StudioFormState;
};

export function useCustomStudioTemplateEditorState({
  setActiveComposerMenu,
  setStudioForm,
  studioForm,
}: UseCustomStudioTemplateEditorStateOptions) {
  const [templateFeedback, setTemplateFeedback] = useState<TemplateFeedback | null>(null);
  const [templateDraftLabel, setLabelState] = useState("");
  const [templateDraftTitle, setTitleState] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [templateEditGeneration, setTemplateEditGeneration] = useState(0);
  const session = useRef({ generation: 0, targetId: null as number | null, label: "", title: "",
    form: studioForm, snapshot: null as StudioFormState | null, media: studioForm.creationMode === "video" ? "video" : "image" });
  session.current.form = studioForm;
  const acknowledged = useRef<{ generation: number; targetId: number; version: string } | null>(null);
  const currentVersion = templateDraftVersion(templateDraftLabel, templateDraftTitle, studioForm);
  useEffect(() => {
    const ack = acknowledged.current, current = session.current;
    if (templateFeedback?.type === "success" && ack?.generation === current.generation && ack.targetId === current.targetId && ack.version === currentVersion) current.snapshot = null;
  }, [templateFeedback, currentVersion, editingTemplateId]);
  const clearFeedback = useCallback(() => {
    setTemplateFeedback(current => current?.saveState ? current : null);
  }, []);
  const setTemplateDraftLabel = useCallback((next: SetStateAction<string>) => {
    session.current.label = typeof next === "function" ? next(session.current.label) : next;
    setLabelState(session.current.label);
  }, []);
  const setTemplateDraftTitle = useCallback((next: SetStateAction<string>) => {
    session.current.title = typeof next === "function" ? next(session.current.title) : next;
    setTitleState(session.current.title);
  }, []);
  const clearTemplateEditState = useCallback(() => {
    const current = session.current;
    current.generation += 1; setTemplateEditGeneration(current.generation); current.targetId = null; current.snapshot = null;
    current.media = current.form.creationMode === "video" ? "video" : "image";
    setEditingTemplateId(null); setTemplateFeedback(null);
    setTemplateDraftLabel(""); setTemplateDraftTitle("");
  }, [setTemplateDraftLabel, setTemplateDraftTitle]);
  const syncTemplateDraftWithCurrentForm = useCallback((activeTemplate: PromptTemplateRecord | null) => {
    const current = session.current;
    // Opening the menu again must not replace an existing editor or unlock its pending draft.
    if (current.targetId !== null || current.label || current.title) return;
    current.generation += 1; setTemplateEditGeneration(current.generation);
    setTemplateDraftLabel(activeTemplate?.label ?? ""); setTemplateDraftTitle(current.form.title);
  }, [setTemplateDraftLabel, setTemplateDraftTitle]);
  const editCustomTemplate = useCallback((template: CustomPromptTemplate) => {
    const current = session.current;
    current.generation += 1; setTemplateEditGeneration(current.generation); current.targetId = template.id; current.snapshot = copyTemplateForm(current.form);
    current.media = current.form.creationMode === "video" ? "video" : "image";
    current.form = applyTemplateToForm(toTemplateFormValue(template), current.form);
    setEditingTemplateId(template.id); setTemplateDraftLabel(template.label); setTemplateDraftTitle(template.title); setTemplateFeedback(null);
    setStudioForm(form => applyTemplateToForm(toTemplateFormValue(template), form)); setActiveComposerMenu("template");
  }, [setActiveComposerMenu, setStudioForm, setTemplateDraftLabel, setTemplateDraftTitle]);
  const cancelTemplateEdit = useCallback(() => {
    const snapshot = session.current.snapshot;
    if (snapshot) { session.current.form = copyTemplateForm(snapshot); setStudioForm(copyTemplateForm(snapshot)); }
    clearTemplateEditState();
  }, [clearTemplateEditState, setStudioForm]);
  const captureTemplateSave = useCallback((generation: number): TemplateSaveSnapshot | null => {
    const current = session.current;
    if (generation !== current.generation || current.media !== (current.form.creationMode === "video" ? "video" : "image")) return null;
    return { generation, targetId: current.targetId, label: current.label, title: current.title,
      form: copyTemplateForm(current.form), version: templateDraftVersion(current.label, current.title, current.form) };
  }, []);
  const matchesTemplateSave = useCallback((saved: TemplateSaveSnapshot): boolean => {
    const current = session.current;
    return current.generation === saved.generation && current.targetId === saved.targetId && current.media === (current.form.creationMode === "video" ? "video" : "image");
  }, []);
  const completeTemplateSave = useCallback((saved: TemplateSaveSnapshot, templateId: number, feedback: TemplateFeedback): boolean => {
    if (!matchesTemplateSave(saved)) return false;
    const current = session.current;
    const unchanged = templateDraftVersion(current.label, current.title, current.form) === saved.version;
    // A create binds its acknowledged id even when the user continued typing: the next save is PATCH.
    current.targetId = templateId; setEditingTemplateId(templateId);
    acknowledged.current = { generation: saved.generation, targetId: templateId, version: saved.version };
    setTemplateFeedback(unchanged ? feedback : { type: "info", message: "本次提交已保存；当前仍有未保存改动，请再次保存。" });
    return true;
  }, [matchesTemplateSave]);
  const ack = acknowledged.current;
  const displayedFeedback: TemplateFeedback | null = templateFeedback?.type === "success" && ack?.generation === session.current.generation && ack.targetId === session.current.targetId && ack.version !== currentVersion
    ? { type: "info", message: "本次提交已保存；当前仍有未保存改动，请再次保存。" } : templateFeedback;
  return {
    cancelTemplateEdit, clearFeedback, clearTemplateEditState, completeTemplateSave,
    editingTemplateId, editCustomTemplate, setTemplateDraftLabel, setTemplateDraftTitle, setTemplateFeedback,
    syncTemplateDraftWithCurrentForm, templateDraftLabel, templateDraftTitle, templateFeedback: displayedFeedback,
    templateEditGeneration, captureTemplateSave, matchesTemplateSave,
  };
}
