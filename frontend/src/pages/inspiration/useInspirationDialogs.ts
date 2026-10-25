import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, type InspirationPost } from "../../api";
import { validateReferenceImageSize } from "../../utils/uploads";

type CreateState = "pending" | "unknown" | "rejected" | "accepted";
type CreateOperation = { state: CreateState; promise: Promise<void>; createdId: number | null };
function isDefiniteCreateRejection(error: unknown): boolean {
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
  return typeof status === "number" && [400, 401, 403, 404, 405, 413, 415, 422].includes(status);
}

type Draft = {
  open: boolean; postId: number | null; title: string; url: string; source_url: string;
  selectedImage: string; image_path: string; category: string; tags: string;
  images: string[]; manualMode: boolean; loading: boolean; uploadingFile: boolean;
  saving: boolean; error: string; uploadError: string; notice: string;
  createState: "idle" | CreateState; createdId: number | null;
};
type Field = "title" | "url" | "source_url" | "selectedImage" | "image_path" | "category" | "tags";
function freshSession(category = "建筑", post?: InspirationPost) {
  const draft: Draft = {
    open: false, postId: post?.id ?? null, title: post?.title ?? "", url: "",
    source_url: post?.source_url ?? "", selectedImage: "", image_path: post?.image_path ?? "",
    category, tags: "", images: [], manualMode: false, loading: false, uploadingFile: false,
    saving: false, error: "", uploadError: "", notice: "", createState: "idle", createdId: null,
  };
  return { draft, version: 0, imageVersion: 0, urlVersion: 0, titleVersion: 0, intentId: 0, create: null as CreateOperation | null,
    upload: null as object | null, extraction: null as object | null, save: null as object | null };
}
type Session = ReturnType<typeof freshSession>;
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

/** Dialog identities and versions are local observation state, never API fields. */
export function useInspirationDialogs(scopeKey: string, onRefresh: () => Promise<void>) {
  const [, redraw] = useState(0);
  const scope = useMemo(() => ({ active: false, import: freshSession(), edit: null as Session | null, imports: [] as Session[], nextImportId: 1 }), [scopeKey]);
  const currentScope = useRef(scope), refresh = useRef(onRefresh);
  const importSession = scope.import, editSession = scope.edit;
  const isCurrent = () => scope.active && currentScope.current === scope;
  const owns = (session: Session) => isCurrent() && session.draft.open && (scope.import === session || scope.edit === session);
  function publish() { if (isCurrent()) redraw((value) => isCurrent() ? value + 1 : value); }
  useLayoutEffect(() => {
    currentScope.current.active = false;
    currentScope.current = scope; scope.active = true;
    return () => { scope.active = false; };
  }, [scope]);
  useLayoutEffect(() => { refresh.current = onRefresh; }, [onRefresh]);
  function newImport(category: string) {
    if (!isCurrent()) return;
    scope.import.draft = { ...scope.import.draft, open: false };
    scope.import = freshSession(category); scope.import.intentId = scope.nextImportId++;
    scope.import.draft.open = true; publish();
  }
  function openImport(category: string) {
    if (!isCurrent()) return;
    if (!scope.import.create) { newImport(category); return; }
    scope.import.draft = { ...scope.import.draft, open: true }; publish();
  }
  function resumeImport(id: number) {
    if (!isCurrent()) return;
    const session = scope.imports.find((item) => item.intentId === id);
    if (!session) return;
    scope.import.draft = { ...scope.import.draft, open: false };
    scope.import = session; session.draft = { ...session.draft, open: true }; publish();
  }
  async function checkImportResult() {
    if (!isCurrent()) return;
    try { await refresh.current(); }
    catch { if (owns(importSession)) { importSession.draft = { ...importSession.draft, notice: "列表刷新失败，导入结果仍待核对。" }; publish(); } }
  }
  function openEdit(post: InspirationPost) {
    if (!isCurrent()) return;
    scope.edit = freshSession(post.category, post); scope.edit.draft.open = true; publish();
  }
  function close(session: Session | null) {
    if (!session || !owns(session)) return;
    if (scope.import === session) {
      if (session.create) session.draft = { ...session.draft, open: false };
      else scope.import = freshSession();
    }
    else scope.edit = null;
    publish();
  }
  function change(session: Session | null, field: Field, value: string) {
    if (!session || !owns(session)) return;
    session.draft = { ...session.draft, [field]: value, error: "", notice: "" };
    session.version += 1;
    if (field === "title") session.titleVersion += 1;
    if (field === "url" || field === "source_url") {
      session.urlVersion += 1; session.imageVersion += 1;
      session.extraction = null; session.upload = null;
      session.draft = { ...session.draft, loading: false, uploadingFile: false, images: [], uploadError: "" };
    }
    if (field === "image_path" || field === "selectedImage") {
      session.imageVersion += 1; session.upload = null;
      session.draft = { ...session.draft, uploadingFile: false, uploadError: "" };
    }
    publish();
  }
  async function upload(session: Session | null, file: File) {
    if (!session || !owns(session)) return;
    const operation = {}, version = ++session.imageVersion;
    const current = () => owns(session) && session.upload === operation && session.imageVersion === version;
    session.upload = operation; session.version += 1;
    session.draft = { ...session.draft, uploadingFile: true, uploadError: "", notice: "" }; publish();
    try {
      const sizeError = validateReferenceImageSize(file);
      if (sizeError) throw new Error(sizeError);
      if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
      const dataUrl = await readFileAsDataUrl(file);
      if (!current()) return;
      const uploaded = await api.uploadReferenceImage({ file_name: file.name, data_url: dataUrl });
      if (!current()) return;
      if (!uploaded.storage_path?.trim()) throw new Error("上传未返回图片地址，请重新选择图片");
      session.draft = scope.import === session
        ? { ...session.draft, selectedImage: uploaded.storage_path, manualMode: true }
        : { ...session.draft, image_path: uploaded.storage_path };
      session.version += 1;
    } catch (err) {
      if (current()) {
        session.draft = { ...session.draft, uploadError: err instanceof Error ? err.message : "上传图片失败" };
      }
    } finally {
      if (current()) {
        session.upload = null; session.draft = { ...session.draft, uploadingFile: false }; publish();
      }
    }
  }
  async function extract() {
    const session = importSession;
    if (!owns(session) || !session.draft.url.trim()) return;
    const operation = {}, urlVersion = session.urlVersion, imageVersion = ++session.imageVersion;
    const titleVersion = session.titleVersion, url = session.draft.url.trim();
    const current = () => owns(session) && session.extraction === operation && session.urlVersion === urlVersion;
    session.extraction = operation; session.upload = null; session.version += 1;
    session.draft = { ...session.draft, loading: true, uploadingFile: false, images: [], error: "", uploadError: "", notice: "" }; publish();
    try {
      const result = await api.extractImages(url);
      if (!current()) return;
      session.draft = {
        ...session.draft, images: result.images,
        title: session.titleVersion === titleVersion ? result.title || session.draft.title : session.draft.title,
        selectedImage: session.imageVersion === imageVersion ? result.images[0] || "" : session.draft.selectedImage,
      };
      session.version += 1;
    } catch (err) {
      if (current()) session.draft = {
        ...session.draft, error: err instanceof Error ? err.message : "提取失败", manualMode: true,
      };
    } finally {
      if (current()) { session.extraction = null; session.draft = { ...session.draft, loading: false }; publish(); }
    }
  }
  function save(session: Session | null, importing: boolean): Promise<void> {
    if (!session || !owns(session)) return Promise.resolve();
    if (importing && session.create && session.create.state !== "rejected") return session.create.promise;
    if (session.upload || session.extraction) {
      session.draft = { ...session.draft, error: session.upload ? "封面仍在上传，请完成或重新选择图片后保存。" : "文章仍在提取，请完成或修改链接后保存。" };
      publish(); return Promise.resolve();
    }
    const draft = { ...session.draft }, version = session.version, operation = {};
    if (importing && (!draft.title.trim() || !draft.selectedImage.trim())) {
      session.draft = { ...session.draft, error: "请填写标题并选择封面图片" }; publish(); return Promise.resolve();
    }
    if (!importing && draft.postId === null) return Promise.resolve();
    const create: CreateOperation | null = importing ? { state: "pending", promise: Promise.resolve(), createdId: null } : null;
    if (create) {
      session.create = create;
      if (!scope.imports.includes(session)) scope.imports.push(session);
    }
    session.save = operation;
    session.draft = { ...session.draft, saving: true, error: "", notice: "", ...(create ? { createState: create.state } : {}) }; publish();
    const current = () => owns(session) && session.save === operation;
    const reflectCreate = () => {
      if (create && isCurrent() && session.create === create) session.draft = {
        ...session.draft, createState: create.state, createdId: create.createdId,
        saving: create.state === "pending" || create.state === "unknown",
      };
    };
    const promise = (async () => {
      let saved = false;
      try {
        if (importing) {
          let sourceName = "";
          try { sourceName = new URL(draft.url).hostname.replace(/^www\./, ""); } catch { /* A source link is optional. */ }
          const receipt = await api.createInspiration({ title: draft.title.trim(), image_path: draft.selectedImage.trim(), category: draft.category,
            source_type: "external", source_name: sourceName, source_url: draft.url.trim(), tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean) });
          if (!receipt || !Number.isSafeInteger(receipt.id) || receipt.id <= 0) throw new Error("导入响应缺少有效记录编号，结果待确认");
          if (create) { create.state = "accepted"; create.createdId = receipt.id; reflectCreate(); }
        } else {
          await api.updateInspiration(draft.postId!, { title: draft.title, image_path: draft.image_path, source_url: draft.source_url });
        }
        saved = true;
        if (current()) {
          if (session.version === version) close(session);
          else session.draft = { ...session.draft, notice: "原稿已保存，当前修改尚未保存。" };
        }
      } catch (err) {
        if (create) { create.state = isDefiniteCreateRejection(err) ? "rejected" : "unknown"; reflectCreate(); }
        if (isCurrent() && session.save === operation && session.version === version) session.draft = {
          ...session.draft, error: err instanceof Error ? err.message : importing ? "导入灵感失败" : "更新灵感失败",
        };
      } finally {
        if (isCurrent() && session.save === operation) {
          session.save = null;
          session.draft = { ...session.draft, saving: create?.state === "unknown" }; reflectCreate(); publish();
        }
      }
      if (saved && isCurrent()) {
        try { await refresh.current(); }
        catch {
          if (owns(session)) { session.draft = { ...session.draft, notice: "原稿已保存，但列表刷新失败，请刷新列表查看。" }; publish(); }
        }
      }
    })();
    if (create) create.promise = promise;
    return promise;
  }
  return {
    importDialog: importSession.draft, editDialog: editSession?.draft ?? null,
    recoverableImports: scope.imports.filter((session) => session !== importSession).map((session) => ({
      id: session.intentId, title: session.draft.title, state: session.create!.state,
    })),
    newImport, resumeImport, checkImportResult,
    openImport, openEdit, closeImport: () => close(importSession), closeEdit: () => close(editSession),
    setImportField: (field: Field, value: string) => change(importSession, field, value),
    setEditField: (field: Field, value: string) => change(editSession, field, value),
    uploadImport: (file: File) => upload(importSession, file), uploadEdit: (file: File) => upload(editSession, file),
    extract, saveImport: () => save(importSession, true), saveEdit: () => save(editSession, false),
  };
}
