import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef } from "react";

import { api } from "../../api";
import { templateSaveWasRejected, type TemplateSaveSnapshot } from "./customStudioTemplateSaveSession";
import {
  deleteCustomTemplateById,
  saveCustomTemplateDraft,
} from "./customStudioTemplateActions";
import {
  customTemplateErrorFeedback,
  shouldClearCustomTemplateEdit,
} from "./customStudioTemplateState";
import {
  removeCustomTemplate,
  upsertCustomTemplate,
} from "./customStudioTemplateUtils";
import type {
  CustomPromptTemplate,
  TemplateFeedback,
} from "./studioTypes";

type UseCustomStudioTemplateMutationsOptions = {
  clearTemplateEditState: () => void;
  completeTemplateSave: (snapshot: TemplateSaveSnapshot, templateId: number, feedback: TemplateFeedback) => boolean;
  templateEditGeneration: number;
  captureTemplateSave: (generation: number) => TemplateSaveSnapshot | null;
  matchesTemplateSave: (snapshot: TemplateSaveSnapshot) => boolean;
  onClearError: () => void;
  onError: (message: string) => void;
  setCustomTemplates: Dispatch<SetStateAction<CustomPromptTemplate[]>>;
  setTemplateFeedback: Dispatch<SetStateAction<TemplateFeedback | null>>;
  workspaceName: string;
};

export function useCustomStudioTemplateMutations({
  clearTemplateEditState,
  completeTemplateSave,
  templateEditGeneration, captureTemplateSave, matchesTemplateSave,
  onClearError,
  onError,
  setCustomTemplates,
  setTemplateFeedback,
  workspaceName,
}: UseCustomStudioTemplateMutationsOptions) {
  const mounted = useRef(true);
  const operations = useRef(new Map<number, { uncertain: boolean }>());
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; operations.current.clear(); }; }, []);
  useEffect(() => { for (const [generation, operation] of operations.current) if (generation !== templateEditGeneration && operation.uncertain) operations.current.delete(generation); }, [templateEditGeneration]);
  const current = (snapshot: TemplateSaveSnapshot) => mounted.current && matchesTemplateSave(snapshot);
  const deleteCustomTemplate = useCallback(async (templateId: number) => {
    const snapshot = captureTemplateSave(templateEditGeneration);
    if (!snapshot || !mounted.current) return;
    try {
      const deletedTemplateId = await deleteCustomTemplateById(templateId, api.deletePromptTemplate);
      if (!mounted.current) return;
      setCustomTemplates((items) => mounted.current ? removeCustomTemplate(items, deletedTemplateId) : items);
      if (!current(snapshot)) return;
      if (snapshot.targetId !== deletedTemplateId && operations.current.has(snapshot.generation)) return;
      if (shouldClearCustomTemplateEdit(snapshot.targetId, deletedTemplateId)) {
        clearTemplateEditState();
      }
      setTemplateFeedback({ type: "success", message: "提示词已删除。" });
      onClearError();
    } catch (error) {
      if (!current(snapshot) || operations.current.has(snapshot.generation)) return;
      const feedback = customTemplateErrorFeedback(error, "删除提示词失败");
      setTemplateFeedback(feedback);
      onError(feedback.message);
    }
  }, [clearTemplateEditState, onClearError, onError, setCustomTemplates, setTemplateFeedback, captureTemplateSave, matchesTemplateSave, templateEditGeneration]);

  const saveCustomTemplate = useCallback(async () => {
    const snapshot = captureTemplateSave(templateEditGeneration);
    if (!snapshot || !mounted.current || operations.current.has(snapshot.generation)) return;
    const operation = { uncertain: false };
    operations.current.set(snapshot.generation, operation);
    setTemplateFeedback({ type: "info", saveState: "pending", message: "正在保存本次提交；可以继续编辑，重复保存已暂停。" });
    let dispatched = false;
    try {
      const result = await saveCustomTemplateDraft({
        apiClient: {
          createPromptTemplate: payload => { dispatched = true; return api.createPromptTemplate(payload); },
          updatePromptTemplate: (id, payload) => { dispatched = true; return api.updatePromptTemplate(id, payload); },
        },
        editingTemplateId: snapshot.targetId, labelInput: snapshot.label, studioForm: snapshot.form,
        titleInput: snapshot.title, workspaceName,
      });
      if (!mounted.current) return;
      if (result.status === "invalid") {
        if (current(snapshot)) { setTemplateFeedback(result.feedback); onError(result.errorMessage); }
        return;
      }
      const saved = result.template;
      if (!saved || !Number.isSafeInteger(saved.id) || saved.id <= 0 || (snapshot.targetId !== null && saved.id !== snapshot.targetId) ||
        (saved.media_type ?? "image") !== (snapshot.form.creationMode === "video" ? "video" : "image") ||
        typeof saved.label !== "string" || typeof saved.title !== "string" || typeof saved.prompt !== "string") throw new Error("保存返回身份或内容不完整，结果尚未确认。");
      setCustomTemplates(items => mounted.current ? upsertCustomTemplate(items, result.template) : items);
      if (current(snapshot) && completeTemplateSave(snapshot, result.template.id, result.feedback)) onClearError();
    } catch (error) {
      operation.uncertain = dispatched && !templateSaveWasRejected(error);
      if (!current(snapshot)) return;
      const feedback: TemplateFeedback = operation.uncertain
        ? { type: "error", saveState: "uncertain", message: "保存结果尚未确认，请先核对“我的提示词”，不要直接重复保存。放弃只结束本地编辑，不代表撤回保存请求。" }
        : customTemplateErrorFeedback(error, "保存提示词失败");
      setTemplateFeedback(feedback); onError(feedback.message);
    } finally {
      if (operations.current.get(snapshot.generation) === operation && (!operation.uncertain || !matchesTemplateSave(snapshot))) operations.current.delete(snapshot.generation);
    }
  }, [captureTemplateSave, matchesTemplateSave, templateEditGeneration, completeTemplateSave, onClearError, onError, setCustomTemplates, setTemplateFeedback, workspaceName]);
  return { deleteCustomTemplate, saveCustomTemplate };
}
