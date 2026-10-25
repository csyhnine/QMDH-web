import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { validateReferenceImageSize } from "../../utils/uploads";

type FieldTicket = { owner: object; sourceId: number | null; current: () => boolean; canRecover: () => boolean; apply: (path: string) => boolean };
type Options<K extends string> = { fields: readonly K[]; labels: Record<K, string>; sourceLabel: string;
  capture: (field: K) => FieldTicket; isCurrent: () => boolean; readError: string; uploadError: string };
type Upload<K extends string> = { field: K; ticket: FieldTicket; phase: "reading" | "uploading" | "done" | "failed" | "obsolete";
  error: string; fileName: string; sourceLabel: string };
type Artifact<K extends string> = { id: number; upload: Upload<K>; path: string; applied: boolean };

export function useContentUploads<K extends string>(options: Options<K>) {
  const { currentUser, isGuest } = useAuth();
  const [, redraw] = useState(0);
  const scope = useMemo(() => ({ active: false, jobs: new Map<object, Map<K, Upload<K>>>(), artifacts: [] as Artifact<K>[], sequence: 0 }), [currentUser?.id, currentUser?.name, isGuest]);
  const current = useRef(scope), latest = useRef(options);
  const isCurrent = () => scope.active && current.current === scope;
  function publish() { if (isCurrent()) redraw(value => isCurrent() ? value + 1 : value); }
  useLayoutEffect(() => {
    current.current.active = false; current.current = scope; scope.active = true;
    return () => { scope.active = false; };
  }, [scope]);
  useLayoutEffect(() => { latest.current = options; }, [options]);
  function visible(field: K) {
    if (!isCurrent() || !latest.current.isCurrent()) return undefined;
    const ticket = latest.current.capture(field), upload = scope.jobs.get(ticket.owner)?.get(field);
    return upload && ticket.current() && upload.ticket.current() ? upload : undefined;
  }
  function isBusy(field: K) { const upload = visible(field); return upload?.phase === "reading" || upload?.phase === "uploading"; }
  function hasSelection(field: K) { return Boolean(visible(field)); }
  function hasPending() { return latest.current.fields.some(isBusy); }
  async function start(field: K, file: File) {
    if (!isCurrent() || !options.isCurrent()) return;
    const ticket = options.capture(field); if (!ticket.current()) return;
    const jobs = scope.jobs.get(ticket.owner) ?? new Map<K, Upload<K>>(); scope.jobs.set(ticket.owner, jobs);
    const upload: Upload<K> = { field, ticket, phase: "reading", error: "", fileName: file.name, sourceLabel: options.sourceLabel };
    jobs.set(field, upload); // A replacement selection invalidates the earlier upload immediately.
    const allowed = () => isCurrent() && jobs.get(field) === upload && ticket.current();
    const sizeError = validateReferenceImageSize(file);
    if (sizeError) { upload.error = sizeError; upload.phase = "failed"; publish(); return; }
    publish();
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(options.readError));
        reader.readAsDataURL(file);
      });
      if (!allowed()) { upload.phase = "obsolete"; return; }
      upload.phase = "uploading"; publish();
      const uploaded = await api.uploadReferenceImage({ file_name: file.name, data_url: dataUrl });
      if (typeof uploaded.storage_path !== "string" || !uploaded.storage_path.trim()) throw new Error("上传结果缺少有效路径。");
      if (!isCurrent()) return;
      const applied = allowed() && ticket.apply(uploaded.storage_path);
      scope.artifacts.push({ id: ++scope.sequence, upload, path: uploaded.storage_path, applied });
      upload.phase = "done";
    } catch (error) {
      if (allowed()) { upload.error = error instanceof Error ? error.message : options.uploadError; upload.phase = "failed"; }
      else upload.phase = "obsolete";
    } finally { publish(); }
  }
  function clear(field: K) {
    if (!isCurrent() || !options.isCurrent()) return;
    const ticket = options.capture(field);
    if (ticket.apply("")) publish(); // Even clearing an empty field advances its version.
  }
  function recover(id: number) {
    const artifact = scope.artifacts.find(item => item.id === id);
    if (!isCurrent() || !artifact || artifact.applied || !artifact.upload.ticket.canRecover()) return;
    const { upload } = artifact;
    if (!confirm(`将「${upload.fileName}」恢复到「${upload.sourceLabel}」的${latest.current.labels[upload.field]}？当前该字段将被替换。`)) return;
    if (!isCurrent() || !upload.ticket.canRecover()) return;
    const ticket = latest.current.capture(upload.field);
    if (ticket.apply(artifact.path)) { artifact.applied = true; publish(); }
  }
  const errors = options.fields.flatMap(field => {
    const upload = visible(field); return upload?.error ? [{ field, message: `${options.labels[field]}：${upload.error}` }] : [];
  });
  const available = scope.artifacts.filter(item => !item.applied).map(item => ({ id: item.id,
    sourceLabel: item.upload.sourceLabel, sourceId: item.upload.ticket.sourceId, fileName: item.upload.fileName,
    fieldLabel: options.labels[item.upload.field], canRecover: () => isCurrent() && item.upload.ticket.canRecover() }));
  return { start, clear, recover, isBusy, hasSelection, hasPending, errors, available };
}
