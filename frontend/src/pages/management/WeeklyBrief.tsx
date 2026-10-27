import { useEffect, useRef, useState } from "react";
import { addDays, type PlanningProject } from "./planning";
import { summarizeWeek } from "./pillarPlanning";
import usePlanningAutoSave from "./usePlanningAutoSave";
export default function WeeklyBrief({
  project,
  week,
  disabled,
  autoSave,
  onPersist,
  onDirty,
  onBusy,
}: {
  project: PlanningProject;
  week: string;
  disabled: boolean;
  autoSave: boolean;
  onPersist: (p: PlanningProject) => Promise<PlanningProject>;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
}) {
  const initial = () =>
    project.weekly_briefs?.find((b) => b.week_start === week) || { week_start: week, previous: "", following: "" };
  const [draft, setDraft] = useState(initial),
    [baseline, setBaseline] = useState(JSON.stringify(initial())),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const base = useRef(project),
    lock = useRef(false),
    alive = useRef(true);
  const dirty = JSON.stringify(draft) !== baseline;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty) {
      const b = initial();
      setDraft(b);
      setBaseline(JSON.stringify(b));
      base.current = project;
    }
  }, [project, week]);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  function change(kind: "previous" | "following", value: string) {
    if (!dirty) base.current = structuredClone(project);
    setDraft({ ...draft, [kind]: value });
    setError("");
  }
  async function save() {
    if (lock.current || disabled || !dirty) return;
    lock.current = true;
    setBusy(true);
    try {
      const p = base.current;
      const saved = await onPersist({
        ...p,
        weekly_briefs: [...(p.weekly_briefs || []).filter((b) => b.week_start !== week), draft],
      });
      if (alive.current) {
        setBaseline(JSON.stringify(draft));
        base.current = saved;
        setError("");
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "保存失败，文字已保留");
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  usePlanningAutoSave(dirty ? JSON.stringify(draft) : null, autoSave, disabled || busy || Boolean(error), save);
  return (
    <div className="mp-week-writing">
      {(
        [
          ["previous", "上周推进"],
          ["following", "下周安排"],
        ] as const
      ).map(([kind, label]) => (
        <article key={kind}>
          <h3>
            {label} · {kind === "previous" ? addDays(week, -7) : addDays(week, 7)}
          </h3>
          <textarea
            aria-label={label + "手写内容"}
            placeholder={kind === "previous" ? "手写上周实际推进了什么" : "手写下周准备做什么"}
            maxLength={4000}
            disabled={disabled || busy}
            value={draft[kind]}
            onChange={(e) => change(kind, e.target.value)}
          />
          <button
            disabled={disabled || busy}
            onClick={() => {
              const text = summarizeWeek(project, week, kind);
              if (!text) {
                setError(kind === "previous" ? "上周没有实际推进记录，请直接手写。" : "下周没有排期，请直接手写。");
                return;
              }
              if (draft[kind] && !window.confirm("用已有记录整理的内容替换当前文字？")) return;
              change(kind, text);
            }}
          >
            从{kind === "previous" ? "推进记录" : "排期"}整理
          </button>
        </article>
      ))}
      <footer>
        {error && (
          <span role="alert" className="mp-error">
            {error}
          </span>
        )}
        <span>{busy ? "正在保存…" : dirty ? (autoSave ? "等待自动保存" : "有未保存文字") : "已保存"}</span>
        {dirty && (
          <button disabled={disabled || busy} onClick={() => void save()}>
            保存周工作文字
          </button>
        )}
      </footer>
    </div>
  );
}
