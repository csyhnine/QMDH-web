import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import { buildReferenceUploadsFromPaths, referenceUploadStoragePaths, releaseReferencePreview } from "./studioReferenceUtils";
import { ReferenceUploadSession } from "./studioReferenceUploadSession";
import type { ReferenceUploadItem, StudioFormState } from "./studioTypes";

type UseStudioReferenceUploadStateOptions = { setStudioForm: Dispatch<SetStateAction<StudioFormState>> };
export function useStudioReferenceUploadState({ setStudioForm }: UseStudioReferenceUploadStateOptions) {
  const [referenceUploads, setReferenceUploads] = useState<ReferenceUploadItem[]>([]);
  const source = useRef<ReferenceUploadSession | null>(null);
  if (!source.current) source.current = new ReferenceUploadSession(releaseReferencePreview);
  const session = source.current;
  function publish() {
    if (!session.active) return;
    setReferenceUploads(session.items);
    setStudioForm(current => session.active ? { ...current, referenceImages: referenceUploadStoragePaths(session.items) } : current);
  }
  function syncReferenceUploads(items: ReferenceUploadItem[]) { if (!session.active) return; session.reset(items); publish(); }
  function clearReferenceUploads() { syncReferenceUploads([]); }
  function removeReferenceUpload(index: number) {
    const id = referenceUploads[index]?.localId;
    if (id && session.remove(id)) publish();
  }
  function replaceReferenceUploadAt(index: number, item: ReferenceUploadItem) {
    const id = item.localId ?? referenceUploads[index]?.localId;
    if (id && session.update(id, item)) publish(); else session.discard([item]);
  }
  function replaceReferenceUploads(items: ReferenceUploadItem[]) { syncReferenceUploads(items); }
  function buildUploadsFromPaths(paths: string[]) { return buildReferenceUploadsFromPaths(paths); }
  useEffect(() => { session.active = true; return () => session.dispose(); }, [session]);
  return { buildUploadsFromPaths, clearReferenceUploads, referenceUploads, removeReferenceUpload, replaceReferenceUploadAt,
    replaceReferenceUploads, syncReferenceUploads, session, publish };
}
