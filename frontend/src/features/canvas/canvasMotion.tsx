import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
export class CanvasMotionStore {
  private marks = new Map<string, string>();
  private seen = new Set<string>();
  private listeners = new Set<() => void>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  active = true;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  get = (id: string) => this.marks.get(id) || "";
  clear = () => { for (const timer of this.timers.values()) clearTimeout(timer); this.timers.clear(); this.marks.clear(); this.notify(); };
  private notify() { for (const listener of this.listeners) listener(); }
  finish = (id: string) => { if (!this.marks.has(id) && !this.timers.has(id)) return; this.marks.delete(id); clearTimeout(this.timers.get(id)); this.timers.delete(id); this.notify(); };
  emit(ids: string[], kind: "created" | "completed", taskId?: number) {
    if (!this.active) return;
    for (const id of ids.slice(0, 128)) {
      const key = JSON.stringify([id, kind, taskId]);
      if (this.seen.has(key) || this.seen.size >= 2048) continue;
      this.seen.add(key);
      if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) continue;
      this.marks.set(id, kind); clearTimeout(this.timers.get(id));
      this.timers.set(id, setTimeout(() => this.finish(id), kind === "created" ? 240 : 300));
    }
    this.notify();
  }
}
export const CanvasMotionContext = createContext<CanvasMotionStore | null>(null);
const noop = () => () => {};
export function useCanvasMotion(id: string) {
  const store = useContext(CanvasMotionContext);
  const mark = useSyncExternalStore(store?.subscribe || noop, () => store?.get(id) || "", () => "");
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => { if (preference.matches) store?.finish(id); };
    preference.addEventListener("change", changed);
    return () => preference.removeEventListener("change", changed);
  }, [store, id]);
  return mark ? ` canvas-motion-${mark}` : "";
}
