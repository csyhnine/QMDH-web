import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { managementRequest as request } from "../../api";
import { useAuth } from "../../context/AuthContext";
import {
  addDays,
  cell,
  ganttEntries,
  ledgerCsv,
  LEDGER_COLUMNS,
  newProject,
  overloadedDays,
  projectPayload,
  TEAM_ROLES,
  today,
  staffAffiliation,
  staffCounts,
  scheduledWeek,
  weekRange,
  type PlanningProject,
  type Report,
  type Staff,
  type Stage,
} from "./planning";
import PlanningDesk, { type WorkRequest } from "./PlanningDesk";
import { scheduleRange, moveSchedulePeriod, type SchedulePeriod } from "./scheduleCalendar";
import ProjectLedger from "./ProjectLedger";
import ProjectPlan from "./ProjectPlan";
import PeoplePlanner from "./PeoplePlanner";
import PlanningDate from "./PlanningDate";
import usePlanningAutoSave from "./usePlanningAutoSave";
import ManagementReporting, { downloadReportingWorkbook } from "./ManagementReporting";
import type { ReportingData } from "./reporting";
import { matchesStatus, type ProjectStatusFilter } from "./planning";
import "./management.css";

type UnitOption = { name: string; label: string; staff_count: number; account_count: number };
const unitName = (name = "") => ({ "城市更新一分院": "一分院", "城市更新二分院": "二分院", "四分院": "二分院", "城市更新四分院": "二分院", "城市更新三分院": "三分院" }[name] || name);

function PeopleSelect({
  value,
  staff,
  onChange,
}: {
  value: number[];
  staff: Staff[];
  onChange: (ids: number[]) => void;
}) {
  const [query, setQuery] = useState("");
  const available = staff.filter((s) => (s.is_active || value.includes(s.id)) && `${s.name} ${staffAffiliation(s)}`.includes(query));
  return (
    <details className="mp-people-picker">
      <summary>
        {value.length ? value.map((id) => staff.find((s) => s.id === id)?.name || `#${id}`).join("、") : "选择人员"}
        <span>⌄</span>
      </summary>
      <div>
        <input
          aria-label="搜索可选人员"
          placeholder="搜索姓名"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {available.map((s) => (
          <button
            type="button"
            role="checkbox"
            aria-checked={value.includes(s.id)}
            key={s.id}
            onClick={() => onChange(value.includes(s.id) ? value.filter((id) => id !== s.id) : [...value, s.id])}
          >
            <span>{value.includes(s.id) ? "☑" : "□"}</span>
            {s.name}
            <small className="mp-affiliation">{staffAffiliation(s)}</small>
            {s.is_active ? "" : "（已停用）"}
          </button>
        ))}
        {!available.length ? <p>未找到可选人员</p> : null}
      </div>
    </details>
  );
}

export default function ManagementProjectsPage() {
  const { currentUser } = useAuth();
  const [unit, setUnit] = useState(unitName(currentUser?.company_unit));
  const [units, setUnits] = useState<UnitOption[]>([]);
  const scopedPath = (path: string) => unit && unit !== unitName(currentUser?.company_unit)
    ? `${path}${path.includes("?") ? "&" : "?"}unit=${encodeURIComponent(unit)}` : path;
  const scopedRequest = <T,>(path: string, body?: unknown, method?: string) => request<T>(scopedPath(path), body, method);
  const actionLock = useRef(false);
  const editorForm = useRef<HTMLFormElement>(null);
  const [autoSave, setAutoSave] = useState(() => {
    try { return window.localStorage?.getItem(`qmdh:planning:auto:${currentUser?.name}`) !== "off"; } catch { return true; }
  });
  const [projectAutoFailed, setProjectAutoFailed] = useState(false);
  const [projectSaveStatus, setProjectSaveStatus] = useState("");
  const [composing, setComposing] = useState(false);
  const scopeKey = `${currentUser?.name}:${unit}`;
  const scopeNow = useRef(scopeKey);
  scopeNow.current = scopeKey;
  const [year, setYear] = useState(new Date().getFullYear());
  const [projects, setProjects] = useState<PlanningProject[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [affiliationFilter, setAffiliationFilter] = useState("all");
  const counts = staffCounts(staff);
  const [report, setReport] = useState<Report | null>(null);
  const [view, setView] = useState<"ledger" | "gantt" | "people" | "staff">("people");
  const [archive, setArchive] = useState(false);
  const [trash, setTrash] = useState(false);
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState(0);
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>("all");
  const [chartDirty, setPlanDirty] = useState(false);
  const [deskDirty, setDeskDirty] = useState(false);
  const planDirty = chartDirty || deskDirty;
  const [planSaving, setPlanSaving] = useState(false);
  const [start, setStart] = useState(today());
  const [days, setDays] = useState(30);
  const [peoplePeriod, setPeoplePeriod] = useState<SchedulePeriod>("week");
  const peopleRange = scheduleRange(start, peoplePeriod);
  const [workRequest, setWorkRequest] = useState<WorkRequest | null>(null);
  const [draft, setDraft] = useState<PlanningProject | null>(null);
  const nextWeek = weekRange(addDays(today(), 7)).start;
  const [conversionStart, setConversionStart] = useState(nextWeek), [conversionEnd, setConversionEnd] = useState(addDays(nextWeek, 4));
  const [draftBaseline, setDraftBaseline] = useState("");
  const [createdProject, setCreatedProject] = useState<PlanningProject | null>(null);
  const projectDirty = Boolean(draft && JSON.stringify(draft) !== draftBaseline);
  const [staffDraft, setStaffDraft] = useState<Staff | null>(null);
  const [reportDraft, setReportDraft] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setProjects([]);
    setStaff([]);
    setReport(null);
    Promise.all([
      scopedRequest<PlanningProject[]>(`/projects?year=${year}&archived=${archive}&deleted=${trash}`),
      scopedRequest<Staff[]>("/staff"),
      scopedRequest<Report>(`/reports/${year}`),
      request<{ units: UnitOption[] }>("/units"),
    ])
      .then(([p, s, r, categories]) => {
        if (!cancelled) {
          setProjects(p);
          setStaff(s);
          setReport(r);
          setUnits(categories.units || []);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, archive, trash, unit, currentUser?.name, refresh]);
  const filtered = useMemo(
    () =>
      projects.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) &&
          matchesStatus(p, statusFilter, today()) &&
          (!person ||
            [...Object.values(p.team).flat(), ...p.next_week_staff, ...p.stages.flatMap((s) => s.assignees)].includes(
              person,
            )),
      ),
    [projects, search, person, statusFilter],
  );
  useEffect(() => {
    if ((!planDirty && !projectDirty) || typeof document === "undefined") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const railGuard = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".global-rail button")) return;
      if (
        planSaving ||
        !window.confirm(projectDirty ? "项目内容尚未保存，确定离开？" : "排期调整尚未保存，确定离开并放弃调整？")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", railGuard, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", railGuard, true);
    };
  }, [planDirty, planSaving, projectDirty]);
  const safeChange = (action: () => void) => {
    if (planSaving) {
      setNotice("正在保存排期，请稍候。");
      return;
    }
    if (!planDirty || window.confirm("排期调整尚未保存，确定放弃这些调整？")) {
      setPlanDirty(false); setDeskDirty(false);
      action();
    }
  };
  const changeView = (next: typeof view) => {
    if (next !== view) safeChange(() => setView(next));
  };
  const editProject = (p: PlanningProject) => {
    setProjectAutoFailed(false);
    setProjectSaveStatus("");
    setError("");
    setDraft(structuredClone(p));
    setDraftBaseline(JSON.stringify(p));
    setCreatedProject(null);
  };
  const createProject = () => {
    if (archive) setArchive(false);
    if (trash) setTrash(false);
    editProject(newProject(Math.max(0, ...projects.map((p) => p.sequence)) + 1));
  };
  const showProjectSection = (id: string) => {
    const fieldset = document.getElementById(`mp-editor-${id}`);
    const disclosure = fieldset?.closest("details");
    if (disclosure) disclosure.open = true;
    fieldset?.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "start",
    });
  };
  async function persistSchedule(project: PlanningProject) {
    const saved = await scopedRequest<PlanningProject>(`/projects/${project.id}`, projectPayload(project));
    setProjects((current) => current.map((p) => (p.id === saved.id ? saved : p)));
    setNotice(`“${saved.name}”的排期已保存`);
    return saved;
  }
  useEffect(() => {
    if (!(draft || staffDraft || reportDraft) || typeof document === "undefined") return;
    const previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [Boolean(draft || staffDraft || reportDraft)]);
  const reload = () => setRefresh((v) => v + 1);
  const change = <K extends keyof PlanningProject>(key: K, value: PlanningProject[K]) => {
    setProjectSaveStatus(projectAutoFailed ? "修改尚未保存，请核对后手动重试。" : autoSave ? "有修改，等待自动保存…" : "有修改，尚未保存。");
    setDraft((p) => (p ? { ...p, [key]: value } : p));
  };
  const editStage = (index: number, patch: Partial<Stage>) => {
    if (draft)
      change(
        "stages",
        draft.stages.map((s, i) => (i === index ? { ...s, ...patch } : s)),
      );
  };
  const closeDraft = () => {
    if (!busy && (!projectDirty || window.confirm("项目内容尚未保存，关闭后将丢失修改。确定关闭？"))) setDraft(null);
  };
  async function saveProject(e?: FormEvent, automatic = false) {
    e?.preventDefault();
    if (!draft || busy || actionLock.current) return;
    if (!draft.name.trim()) {
      setError("请填写项目名称，其他资料可以稍后补充。");
      return;
    }
    setBusy(true);
    actionLock.current = true;
    setError("");
    setProjectSaveStatus("正在保存…");
    const submitted = draft, submittedScope = scopeKey;
    try {
      const saved = await scopedRequest<PlanningProject>(
        draft.id ? `/projects/${draft.id}` : `/projects?year=${year}`,
        projectPayload(draft),
        draft.id ? "PUT" : "POST",
      );
      if (scopeNow.current !== submittedScope) return;
      setProjectAutoFailed(false);
      setProjectSaveStatus("已保存");
      setProjects(current => (submitted.id ? current.map(p => p.id === saved.id ? saved : p) : [...current, saved]).filter(p => p.archived === archive));
      if (automatic) {
        setDraft(current => {
          if (!current || current.id !== submitted.id) return current;
          return JSON.stringify(projectPayload(current)) === JSON.stringify(projectPayload(submitted)) ? saved : { ...current, version: saved.version, updated_at: saved.updated_at, updated_by: saved.updated_by };
        });
        setDraftBaseline(JSON.stringify(saved));
      } else {
        setCreatedProject(draft.id ? null : saved);
        setDraft(null);
        setNotice(draft.id ? "项目已保存" : "项目已创建。可以继续安排工作，其他资料随时补充。");
        reload();
      }
    } catch (e) {
      if (scopeNow.current === submittedScope) {
        setError(e instanceof Error ? e.message : "保存失败");
        setProjectAutoFailed(true);
        setProjectSaveStatus("保存未完成，本地修改已保留。请核对后手动重试。");
      }
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  usePlanningAutoSave(draft?.id && projectDirty ? JSON.stringify(draft) : null, autoSave,
    busy || projectAutoFailed || composing, async () => {
      if (editorForm.current?.checkValidity()) await saveProject(undefined, true);
      else setProjectSaveStatus("请补全必填项或修正日期、金额后再保存。");
    });
  async function saveStaff(e: FormEvent) {
    e.preventDefault();
    if (!staffDraft || busy) return;
    setBusy(true);
    setError("");
    const { id, ...body } = staffDraft;
    try {
      await scopedRequest(id ? `/staff/${id}` : "/staff", body, id ? "PUT" : "POST");
      setStaffDraft(null);
      setNotice("人员已保存");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function saveReport(e: FormEvent) {
    e.preventDefault();
    if (!reportDraft || busy) return;
    setBusy(true);
    setError("");
    try {
      await scopedRequest(`/reports/${year}`, {
        compiler: reportDraft.compiler,
        data_as_of: reportDraft.data_as_of,
        version: reportDraft.version,
      });
      setReportDraft(null);
      setNotice("台账信息已保存");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function changeDeleted(project: PlanningProject, deleted: boolean) {
    if (!project.id || busy || planSaving || planDirty || actionLock.current) return;
    if (deleted && !window.confirm(`删除“${project.name}”？项目将移入回收站，可恢复，版本记录会保留。${projectDirty ? "本次未保存修改会丢失。" : ""}`)) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      await scopedRequest(`/projects/${project.id}${deleted ? "" : "/restore"}?version=${project.version}`, {}, deleted ? "DELETE" : "POST");
      setDraft(null);
      setCreatedProject(null);
      setNotice(deleted ? "项目已删除，可在回收站恢复。" : `项目已恢复${project.archived ? "到已归档列表" : "到当前项目列表"}。`);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  async function syncRoster() {
    if (busy || planSaving || planDirty || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await scopedRequest<{ added: number; matched: number; conflicts: string[] }>("/staff/sync", {}, "POST");
      setNotice(`已同步${unit}员工：新增 ${result.added} 人，关联已有 ${result.matched} 人。${result.conflicts.length ? ` ${result.conflicts.length} 位同名或跨院人员需人工核对：${result.conflicts.join("、")}` : ""}`);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "同步失败");
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([ledgerCsv(filtered, staff)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report?.unit || unit}-${year}年度项目台账.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function downloadExcel() {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError("");
    try {
      const data = await scopedRequest<ReportingData>(`/report-data?year=${year}`);
      const week = weekRange(year === new Date().getFullYear() ? today() : `${year}-01-01`).start;
      await downloadReportingWorkbook(data, week, 5);
    } catch (e) { setError(e instanceof Error ? e.message : "Excel 导出失败"); }
    finally { actionLock.current = false; setBusy(false); }
  }
  function convertWeeklyPlan() {
    if (!draft || !draft.next_week_work.trim() || !conversionStart || !conversionEnd || conversionEnd < conversionStart) return;
    const name = draft.next_week_work.trim();
    if (name.length > 250) { setError("请将工作标题缩短至250字以内，详细内容可放入阶段备注。"); return; }
    if (draft.stages.length >= 200) { setError("单个项目最多200个阶段，请先整理已有阶段。"); return; }
    if (draft.stages.some(s => s.name === name && s.start === conversionStart && s.end === conversionEnd)) {
      setError("相同工作和日期已经存在，请在阶段排期中调整。"); return;
    }
    setProjectAutoFailed(false); setProjectSaveStatus(""); setError("");
    setDraft({ ...draft, weekly_plan_mode: "schedule", stages: [...draft.stages, {
      id: crypto.randomUUID().replaceAll("-", ""), name, start: conversionStart, end: conversionEnd,
      assignees: [...draft.next_week_staff], allocation: 100, progress: 0, milestone: false, notes: "",
    }] });
  }
  const textField = (key: keyof PlanningProject, label: string, wide = false) => (
    <label key={key} className={wide ? "mp-wide" : ""}>
      <span>{label}</span>
      {wide ? (
        <textarea
          maxLength={4000}
          value={String(draft?.[key] ?? "")}
          onChange={(e) => change(key, e.target.value as never)}
        />
      ) : (
        <input
          autoFocus={key === "name"}
          maxLength={key === "contract" ? 500 : key === "grade" ? 100 : 250}
          value={String(draft?.[key] ?? "")}
          onChange={(e) => change(key, e.target.value as never)}
          required={key === "name"}
        />
      )}
    </label>
  );
  return (
    <section className="management-page">
      <div className="mp-workspace-header">
        <header className="mp-header">
          <div>
            <p className="mp-eyebrow">{report?.unit || currentUser?.company_unit} · 管理工作台</p>
            <h1>项目管理</h1>
            <p>掌握项目进展，安排团队下一步工作。</p>
            <small className="mp-unit-boundary">当前分院独立管理项目、人员和费用；原二、四分院同属新二分院。</small>
          </div>
          <div className="mp-header-actions">
            <label className="mp-inline" title="适用于已有项目资料、项目计划和人员排期；新项目首次仍需创建，人员名册与台账信息单独保存。"><input type="checkbox" checked={autoSave} onChange={e => {
              setAutoSave(e.target.checked);
              try { window.localStorage?.setItem(`qmdh:planning:auto:${currentUser?.name}`, e.target.checked ? "on" : "off"); } catch { /* Preference remains usable without storage. */ }
            }} />自动保存</label>
            <label className="mp-unit-picker">
              管理分院
              <select aria-label="管理分院" value={unit} disabled={loading || busy || planSaving}
                onChange={(e) => {
                  const next = e.target.value;
                  if (projectDirty && !window.confirm("项目内容尚未保存，确定切换分院并放弃修改？")) return;
                  safeChange(() => {
                    setUnit(next); setDraft(null); setStaffDraft(null); setReportDraft(null);
                    setPerson(0); setSearch(""); setCreatedProject(null); setNotice(""); setError("");
                  });
                }}>
                {(units.length ? units : [{ name: unit, label: unit, staff_count: staff.length, account_count: 0 }]).map((u) =>
                  <option key={u.name} value={u.name}>{u.label} · {u.staff_count} 人</option>)}
              </select>
            </label>
            <span>{currentUser?.company_position}</span>
            <button disabled={loading} onClick={() => changeView("staff")}>
              人员名册
            </button>
            <button
              disabled={loading}
              onClick={() => report && setReportDraft({ ...report, data_as_of: report.data_as_of || today() })}
            >
              台账信息
            </button>
          </div>
        </header>
        <nav className="mp-tabs" aria-label="项目管理视图">
          {(
            [
              ["people", "人员排期", "♧"],
              ["gantt", "项目计划", "▥"],
              ["ledger", "项目台账", "▤"],
            ] as const
          ).map(([v, l, icon]) => (
            <button
              key={v}
              aria-current={view === v ? "page" : undefined}
              className={view === v ? "selected" : ""}
              onClick={() => changeView(v)}
            >
              <span aria-hidden="true">{icon}</span>
              {l}
            </button>
          ))}
        </nav>
      </div>
      <p className="mp-view-purpose">
        {view === "ledger" ? "项目台账：维护项目资料、责任分工、合同与费用，按分类查询和导出。"
          : view === "gantt" ? "项目计划：以项目为主线，安排阶段、里程碑、起止日期与进度。"
          : view === "people" ? "人员排期：以本院人员为主线，查看跨项目占用，拖拽分配工作并处理冲突。"
          : "人员名册：维护本院可安排的员工，名册职务与网站登录权限分别管理。"}
      </p>
      {error && !(draft || staffDraft || reportDraft) ? (
        <p className="mp-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mp-notice">
          {notice}
          {createdProject && (
            <button
              onClick={() => {
                editProject(createdProject);
                setNotice("");
                window.setTimeout(() => showProjectSection("schedule"), 0);
              }}
            >
              安排工作 →
            </button>
          )}
          <button aria-label="关闭保存提示" onClick={() => setNotice("")}>
            ×
          </button>
        </p>
      ) : null}
      <div className="mp-toolbar">
        <label>
          年度
          <select
            value={year}
            disabled={busy}
            onChange={(e) =>
              safeChange(() => {
                setYear(Number(e.target.value));
                setStart(`${e.target.value}-01-01`);
                setCreatedProject(null);
                setNotice("");
              })
            }
          >
            {Array.from(
              new Set([
                2026,
                year,
                new Date().getFullYear(),
                ...Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i),
              ]),
            )
              .sort()
              .map((y) => (
                <option key={y}>{y}</option>
              ))}
          </select>
        </label>
        {view !== "staff" ? (
          <>
            <input
              aria-label="搜索项目"
              placeholder="搜索项目名称…"
              value={search}
              onChange={(e) => safeChange(() => setSearch(e.target.value))}
            />
            <details className="mp-simple-filters">
              <summary>更多筛选{person || statusFilter !== "all" || archive || trash ? " · 已启用" : ""}</summary>
              <div>
                <select
                  aria-label="按人员筛选"
                  value={person}
                  onChange={(e) => safeChange(() => setPerson(Number(e.target.value)))}
                >
                  <option value={0}>全部人员</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="项目状态筛选"
                  value={statusFilter}
                  onChange={(e) => safeChange(() => setStatusFilter(e.target.value as ProjectStatusFilter))}
                >
                  <option value="all">全部状态</option>
                  <option value="overdue">有延期事项</option>
                  <option value="this-week">本周待完成</option>
                  <option value="unscheduled">尚未排期</option>
                </select>
                <label className="mp-inline">
                  <input
                    type="checkbox"
                    checked={archive}
                    onChange={(e) => safeChange(() => { setArchive(e.target.checked); setTrash(false); })}
                  />
                  已归档
                </label>
                {person || statusFilter !== "all" || archive || trash ? (
                  <button
                    onClick={() =>
                      safeChange(() => {
                        setPerson(0);
                        setStatusFilter("all");
                        setArchive(false);
                        setTrash(false);
                      })
                    }
                  >
                    清除筛选
                  </button>
                ) : null}
              </div>
            </details>
            <span className="mp-toolbar-spacer" />
            {view === "ledger" && <><button disabled={loading || busy} aria-pressed={trash} onClick={() => safeChange(() => { setTrash(!trash); setArchive(false); })}>{trash ? "返回在管项目" : "回收站"}</button>
            <button disabled={loading || trash} onClick={download}>
              ↓ CSV 台账
            </button>
            <button disabled={loading || busy || trash} onClick={downloadExcel}>↓ Excel 一览表</button></>}
            <button className="mp-primary" disabled={loading || planDirty} onClick={createProject}>
              ＋ 新建项目
            </button>
          </>
        ) : (
          <>
            <strong>可安排 {counts.active} 人 · 内部 {counts.internal} · 外包 {counts.external}{counts.unknown ? ` · 待确认 ${counts.unknown}` : ""}</strong>
            <select aria-label="名册人员归属" value={affiliationFilter} onChange={e => setAffiliationFilter(e.target.value)}>
              <option value="all">全部人员（含停用）</option><option value="internal">QMDH 内部</option><option value="external">外包人员</option><option value="unknown">归属待确认</option>
            </select>
            <span className="mp-toolbar-spacer" />
            <button disabled={loading || busy} onClick={syncRoster}>从账号分组补齐人员</button>
            <button
              className="mp-primary"
              disabled={loading}
              onClick={() => setStaffDraft({ id: 0, name: "", position: "", employment_type: "unknown", employer: "", is_active: true, version: 0 })}
            >
              ＋ 添加人员
            </button>
          </>
        )}
        <button aria-busy={loading} disabled={loading || busy} onClick={() => safeChange(reload)}>
          {loading ? "正在加载…" : "刷新"}
        </button>
      </div>
      <div className="mp-view" key={view} aria-busy={loading}>
        {loading ? (
          <div className="mp-loading" role="status">
            <span className="mp-loading-label">
              <span className="mp-spinner" aria-hidden="true" />
              正在加载项目工作台…
            </span>
            <div className="mp-skeleton-grid" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} />
              ))}
            </div>
            <div className="mp-skeleton-lines" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : trash && view !== "staff" ? (
          <section className="mp-trash" aria-label="项目回收站">
            <h2>项目回收站 · {projects.length} 项</h2>
            <p>已删除项目不再占用人员排期；恢复后保留原分工、日期、费用和版本记录。</p>
            {projects.map((p) => <article key={p.id}><strong>{p.name}</strong><span>{p.archived ? "原为已归档项目" : "原为在管项目"}</span><button disabled={busy} onClick={() => changeDeleted(p, false)}>恢复项目</button></article>)}
            {!projects.length && <p>本院本年度没有已删除项目。</p>}
          </section>
        ) : view === "ledger" ? (
          <ProjectLedger projects={filtered} staff={staff} onEdit={editProject} />
        ) : view === "gantt" || view === "people" ? (
          <>
            <div className="mp-schedule-toolbar">
              <div>
                <h2>{view === "gantt" ? "项目阶段计划" : "团队人员排期"}</h2>
                <p>
                  {view === "gantt" ? "项目下展开设计阶段，调整日期与交付节奏" : "查看每位成员的安排，及时发现计划冲突"}
                </p>
              </div>
              <div>
                <button
                  disabled={planDirty}
                  onClick={() => setStart(view === "people" ? moveSchedulePeriod(start, peoplePeriod, -1) : addDays(start, -days))}
                >
                  ‹
                </button>
                <PlanningDate
                  label={view === "people" ? "排期所在日期" : "排期开始日期"}
                  required
                  disabled={planDirty}
                  value={start}
                  onChange={(date) => {
                    if (date) setStart(date);
                  }}
                />
                <button
                  disabled={planDirty}
                  onClick={() => setStart(view === "people" ? moveSchedulePeriod(start, peoplePeriod, 1) : addDays(start, days))}
                >
                  ›
                </button>
                <button disabled={planDirty} onClick={() => setStart(today())}>
                  今天
                </button>
                {view === "gantt" ? (
                  <select
                    aria-label="时间跨度"
                    disabled={planDirty}
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                  >
                    <option value={14}>两周</option>
                    <option value={30}>月计划</option>
                    <option value={90}>季度计划</option>
                  </select>
                ) : (
                  <select
                    aria-label="人员排期跨度"
                    disabled={planDirty || planSaving}
                    value={peoplePeriod}
                    onChange={(e) => setPeoplePeriod(e.target.value as SchedulePeriod)}
                  >
                    <option value="week">按周</option>
                    <option value="month">按月</option>
                    <option value="quarter">按季度</option>
                    <option value="year">按年</option>
                  </select>
                )}
              </div>
            </div>
            <PlanningDesk request={workRequest} onRequestHandled={() => setWorkRequest(null)} projects={filtered} staff={staff} disabled={planSaving || chartDirty || archive} onPersist={persistSchedule} onDirty={setDeskDirty} />
            {view === "gantt" ? (
              <ProjectPlan
                key={`${year}-${archive}-${search}-${person}-${statusFilter}-${refresh}`}
                projects={filtered}
                staff={staff}
                start={start}
                days={days}
                archived={archive}
                onEdit={editProject}
                onPersist={persistSchedule}
                onDirty={setPlanDirty}
                onBusy={setPlanSaving}
                autoSave={autoSave}
              />
            ) : (
              <PeoplePlanner
                key={`${year}-${archive}-${search}-${person}-${statusFilter}-${refresh}`}
                projects={filtered}
                workloadProjects={projects}
                staff={staff}
                personFilter={person}
                start={peopleRange.start}
                days={peopleRange.days}
                period={peoplePeriod}
                disabled={deskDirty}
                onOpen={setWorkRequest}
                archived={archive}
                onPersist={persistSchedule}
                onDirty={setPlanDirty}
                onBusy={setPlanSaving}
                autoSave={autoSave}
              />
            )}
            <p className="mp-help">
              未排期项目 {filtered.filter((p) => !p.stages.length).length} 个 · 跨年度阶段跟随所属项目年度查看。
            </p>
          </>
        ) : (
          <div className="mp-panel">
            <div className="mp-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>职务</th>
                    <th>人员归属 / 所属单位</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.filter(s => affiliationFilter === "all" || (s.employment_type || "unknown") === affiliationFilter).map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className="mp-avatar">{s.name.slice(-2)}</span> {s.name}
                      </td>
                      <td>{s.position || "—"}</td>
                      <td><span className={`mp-affiliation ${s.employment_type || "unknown"}`}>{staffAffiliation(s)}</span></td>
                      <td>
                        <span className={s.is_active ? "mp-badge" : "mp-badge muted"}>
                          {s.is_active ? "在用" : "停用"}
                        </span>
                      </td>
                      <td>
                        <button onClick={() => setStaffDraft({ ...s })}>编辑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mp-panel-note">
              所属分院用于安排工作，人员归属区分内部与外包；外包不计入内部人数。账号同步后归属待确认。添加人员不会开通网站账号或授予权限，停用人员保留历史安排。
            </p>
          </div>
        )}
        {!loading && view === "ledger" && !trash && <details className="mp-ledger-reports"><summary>年度经营统计与人员周报</summary><ManagementReporting key={`${unit}-${year}`} unit={unit} year={year} revision={projects} /></details>}
      </div>
      <div className="mp-report-meta">
        {year} 年度项目信息一览表 · 表格编制 {report?.compiler || "待填写"} · 数据更新 {report?.data_as_of || "待填写"}
      </div>
      {draft && !draft.id ? (
        <div className="mp-modal"><form className="mp-small-editor" role="dialog" aria-modal="true" aria-label="快速立项" onSubmit={saveProject}>
          <h2>新建项目</h2><p className="mp-help">先建档，再安排工作。只需项目名称，其余可稍后补充。</p>
          {error&&<p role="alert" className="mp-error">{error}</p>}<fieldset disabled={busy}>
          {textField("name","项目名称")}
          <label><span>项目统筹（选填）</span><PeopleSelect value={draft.team.coordinator} staff={staff} onChange={ids=>change("team",{...draft.team,coordinator:ids})}/></label>
          <label>目标交付日期（选填）<PlanningDate label="立项目标交付日期" value={draft.deadline||""} onChange={date=>change("deadline",date||null)}/></label>
          </fieldset><footer><button type="button" disabled={busy} onClick={closeDraft}>取消</button><button type="submit" className="mp-primary" disabled={busy}>创建项目</button></footer>
        </form></div>
      ) : draft ? (
        <div className="mp-modal mp-drawer-backdrop">
          <form
            ref={editorForm}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            className="mp-editor"
            onSubmit={saveProject}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                closeDraft();
              }
              if (e.key === "Tab") {
                const targets = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>(
                    "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary",
                  ),
                ).filter((n) => n.offsetParent !== null);
                const first = targets[0],
                  last = targets[targets.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-label="编辑项目"
          >
            <header>
              <div>
                <small>项目详情 · {year}</small>
                <h2>{draft.id ? draft.name : "新建项目"}</h2>
              </div>
              <button type="button" disabled={busy} onClick={closeDraft}>
                关闭
              </button>
            </header>
            {error ? (
              <p className="mp-error" role="alert">
                {error}
              </p>
            ) : null}
            <p>
              {draft.updated_at
                ? `最后修改 ${new Date(draft.updated_at).toLocaleString("zh-CN")}`
                : "仅项目名称必填，其他资料可以稍后补充。"}
            </p>
            <p className="mp-auto-status" role="status">{draft.id ? projectSaveStatus || (autoSave ? "内容有效后自动保存，停止输入约1秒触发。" : "自动保存已关闭，请点击保存修改。") : "新项目首次请点击创建项目。"}</p>
            <nav className="mp-editor-nav">
              {[
                ["basic", "基本信息"],
                ["team", "人员分工"],
                ["finance", "合同费用"],
                ["schedule", "阶段排期"],
              ].map(([id, label]) => (
                <button type="button" key={id} onClick={() => showProjectSection(id)}>
                  {label}
                </button>
              ))}
            </nav>
            <fieldset id="mp-editor-basic" disabled={busy}>
              <legend>基本信息</legend>
              <div className="mp-fields">
                {textField("name", "项目名称")}
                <div className="mp-field">
                  <span>项目负责人（选填）</span>
                  <PeopleSelect
                    value={draft.team.coordinator}
                    staff={staff}
                    onChange={(ids) => change("team", { ...draft.team, coordinator: ids })}
                  />
                  {!staff.some((s) => s.is_active) && (
                    <small className="mp-help">可以先保存项目，稍后在人员名册添加成员。</small>
                  )}
                </div>
                <label>
                  <span>完成时间节点</span>
                  <PlanningDate
                    label="完成时间节点"
                    value={draft.deadline || ""}
                    onChange={(date) => change("deadline", date || null)}
                  />
                </label>
                {textField("stage_work", "当前主要工作（选填）", true)}
              </div>
              <details className="mp-extra-info">
                <summary>更多项目信息 · 分类、紧急程度与备注</summary>
                <div className="mp-fields">
                  <label>
                    <span>序号</span>
                    <input
                      required
                      type="number"
                      min={1}
                      max={100000}
                      value={draft.sequence}
                      onChange={(e) => change("sequence", Number(e.target.value))}
                    />
                  </label>
                  {textField("grade", "项目等级")}
                  <label>
                    <span>紧急程度</span>
                    <select value={draft.urgency} onChange={(e) => change("urgency", e.target.value)}>
                      {["常规", "重要", "紧急", "特急"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  {textField("mode", "项目模式")}
                  {textField("source", "项目来源")}
                  {textField("project_type", "项目类型")}
                  {textField("phase", "项目阶段")}
                  <label><span>配合其他分院（选填）</span><select aria-label="配合其他分院" value={draft.collaboration_unit || ""} onChange={e => change("collaboration_unit", e.target.value)}><option value="">本院项目</option>{["一分院", "二分院", "三分院", "其他分院"].filter(name => name !== unit).map(name => <option key={name}>{name}</option>)}</select><small className="mp-help">只登记本院承担的配合工作，不共享其他分院的项目或人员数据。</small></label>
                  {textField("notes", "备注", true)}
                </div>
              </details>
            </fieldset>
            <details className="mp-editor-section">
              <summary>
                人员分工 <small>选填 · 设计、商务及参与人员</small>
              </summary>
              <fieldset id="mp-editor-team" disabled={busy}>
                <legend>项目组成员</legend>
                <p className="mp-help">点击选择，可搜索并勾选多人；人员在“人员名册”中维护。</p>
                <div className="mp-fields">
                  {TEAM_ROLES.filter(([k]) => k !== "coordinator").map(([k, l]) => (
                    <div className="mp-field" key={k}>
                      <span>{l}</span>
                      <PeopleSelect
                        value={draft.team[k]}
                        staff={staff}
                        onChange={(ids) => change("team", { ...draft.team, [k]: ids })}
                      />
                    </div>
                  ))}
                </div>
              </fieldset>
            </details>
            <details className="mp-editor-section">
              <summary>
                下周工作安排 <small>选填</small>
              </summary>
              <fieldset disabled={busy}>
                <legend>下周工作安排</legend>
                <label><span>周安排来源</span><select aria-label="周安排来源" value={draft.weekly_plan_mode || "manual"} onChange={e => change("weekly_plan_mode", e.target.value as "manual" | "schedule")}><option value="schedule">按阶段排期自动汇总</option><option value="manual">手工填写（保留原文字）</option></select></label>
                {draft.weekly_plan_mode === "schedule" ? <div className="mp-week-preview"><p>{nextWeek} — {addDays(nextWeek, 4)} · 调整甘特图日期和人员后自动更新。</p><strong>{scheduledWeek(draft, nextWeek, 5).work || "下周尚无阶段排期"}</strong><p>参与人员：{scheduledWeek(draft, nextWeek, 5).people.map(id => staff.find(s => s.id === id)?.name || `#${id}`).join("、") || "未安排"}</p><button type="button" onClick={() => showProjectSection("schedule")}>编辑阶段排期</button></div> : <>
                <div className="mp-fields">
                  {textField("next_week_work", "下周主要工作内容", true)}
                  <div className="mp-field">
                    <span>下周主要使用人员</span>
                    <PeopleSelect
                      value={draft.next_week_staff}
                      staff={staff}
                      onChange={(ids) => change("next_week_staff", ids)}
                    />
                  </div>
                </div>
                <div className="mp-fields"><PlanningDate label="转排期开始日期" value={conversionStart} onChange={setConversionStart} /><PlanningDate label="转排期结束日期" value={conversionEnd} min={conversionStart} onChange={setConversionEnd} /></div>
                <button type="button" disabled={!draft.next_week_work.trim() || !conversionStart || !conversionEnd || conversionEnd < conversionStart} onClick={convertWeeklyPlan}>将这段安排加入阶段排期</button><p className="mp-help">确认实际日期后生成一项工作，带入所选人员；保存后进入甘特图和周统计，原文字保留。</p>
                </>}
              </fieldset>
            </details>
            <details className="mp-editor-section">
              <summary>
                合同与费用 <small>选填 · 未知金额留空</small>
              </summary>
              <fieldset id="mp-editor-finance" disabled={busy}>
                <legend>合同与费用</legend>
                <p className="mp-help">金额单位均为万元，最多两位小数；未知可留空，0 表示已确认零金额。</p>
                <div className="mp-fields">
                  {(
                    [
                      ["investment", "工程投资"],
                      ["design_fee", "设计费用"],
                      ["paid", "设计回款"],
                      ["invoiced_pending", "请款中（已开发票）"],
                    ] as const
                  ).map(([k, l]) => (
                    <label key={k}>
                      <span>{l}（万）</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        max="999999999999.99"
                        value={draft[k] ?? ""}
                        onChange={(e) => change(k, e.target.value || null)}
                      />
                    </label>
                  ))}
                  {textField("contract", "合同签订情况 / 日期 / 编号")}
                  <label><span>签约状态（用于统计）</span><select aria-label="签约状态" value={draft.contract_status || "unknown"} onChange={e => change("contract_status", e.target.value as "signed" | "unsigned" | "unknown")}><option value="unknown">待确认</option><option value="signed">已签订</option><option value="unsigned">未签订</option></select></label>
                </div>
              </fieldset>
            </details>
            <fieldset id="mp-editor-schedule" disabled={busy}>
              <legend>工作安排（可稍后填写）</legend>
              <p className="mp-help">把工作拆成阶段，填写起止日期并选择人员，保存后会显示在项目计划和人员排期中。</p>
              {!draft.stages.length && (
                <div className="mp-schedule-empty">
                  <strong>暂时没有工作安排</strong>
                  <p>可以先保存项目。有明确计划时，再添加阶段和日期。</p>
                </div>
              )}
              {draft.stages.map((s, i) => (
                <section className="mp-stage" key={s.id}>
                  <div className="mp-fields">
                    <label>
                      <span>阶段工作</span>
                      <input
                        required
                        maxLength={250}
                        value={s.name}
                        onChange={(e) => editStage(i, { name: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>开始日期</span>
                      <PlanningDate
                        required
                        label={`阶段${i + 1}开始日期`}
                        value={s.start}
                        onChange={(date) =>
                          editStage(i, { start: date, ...(s.milestone ? { end: date } : {}) })
                        }
                      />
                    </label>
                    <label>
                      <span>完成日期</span>
                      <PlanningDate
                        required
                        label={`阶段${i + 1}完成日期`}
                        min={s.start}
                        disabled={s.milestone}
                        value={s.end}
                        onChange={(date) => editStage(i, { end: date })}
                      />
                    </label>
                    <label>
                      <span>进度（%）</span>
                      <input
                        required
                        type="number"
                        min={0}
                        max={100}
                        value={s.progress}
                        onChange={(e) => editStage(i, { progress: Number(e.target.value) })}
                      />
                    </label>
                    <div className="mp-field">
                      <span>安排人员</span>
                      <PeopleSelect
                        value={s.assignees}
                        staff={staff}
                        onChange={(ids) => editStage(i, { assignees: ids })}
                      />
                    </div>
                  </div>
                  <details className="mp-stage-options">
                    <summary>更多设置 · 投入比例、里程碑与说明</summary>
                    <p className="mp-help">默认每人投入100%。同一天兼顾多个项目时，可按实际安排调整比例。</p>
                    <div className="mp-fields">
                      <label>
                        <span>每人分配（%）</span>
                        <input
                          required
                          type="number"
                          min={1}
                          max={100}
                          value={s.allocation}
                          onChange={(e) => editStage(i, { allocation: Number(e.target.value) })}
                        />
                      </label>
                      <label className="mp-inline">
                        <input
                          type="checkbox"
                          checked={s.milestone}
                          onChange={(e) =>
                            editStage(i, { milestone: e.target.checked, ...(e.target.checked ? { end: s.start } : {}) })
                          }
                        />
                        里程碑
                      </label>
                      <label>
                        <span>排期说明</span>
                        <input
                          maxLength={2000}
                          value={s.notes}
                          onChange={(e) => editStage(i, { notes: e.target.value })}
                        />
                      </label>
                    </div>
                  </details>
                  <button
                    type="button"
                    onClick={() =>
                      change(
                        "stages",
                        draft.stages.filter((_, index) => index !== i),
                      )
                    }
                  >
                    移除此阶段
                  </button>
                </section>
              ))}
              <button
                type="button"
                onClick={() =>
                  change("stages", [
                    ...draft.stages,
                    {
                      id: crypto.randomUUID(),
                      name: "",
                      start: today(),
                      end: addDays(today(), 6),
                      assignees: [],
                      progress: 0,
                      allocation: 100,
                      milestone: false,
                      notes: "",
                    },
                  ])
                }
              >
                ＋ 添加阶段
              </button>
            </fieldset>
            <footer>
              {draft.id && <button type="button" className="mp-danger" disabled={busy || planDirty || planSaving} onClick={() => changeDeleted(draft, true)}>删除项目</button>}
              {draft.id && (
                <label className="mp-inline">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={draft.archived}
                    onChange={(e) => change("archived", e.target.checked)}
                  />
                  归档项目（可从已归档列表恢复）
                </label>
              )}
              <button className="mp-primary" aria-busy={busy} disabled={busy} type="submit">
                {busy ? "正在保存…" : draft.id ? "保存修改" : "创建项目"}
              </button>
            </footer>
            <p className="mp-help">每次保存保留版本记录；移除阶段只影响新版本。</p>
          </form>
        </div>
      ) : null}
      {staffDraft ? (
        <div className="mp-modal">
          <form className="mp-small-editor" onSubmit={saveStaff} role="dialog" aria-modal="true" aria-label="编辑人员">
            <h2>人员信息</h2>
            <p className="mp-help">只填姓名即可添加，职务可以稍后补充；添加人员不会开通网站账号。</p>
            {error ? (
              <p role="alert" className="mp-error">
                {error}
              </p>
            ) : null}
            <fieldset disabled={busy}>
              <label>
                姓名
                <input
                  required
                  maxLength={150}
                  value={staffDraft.name}
                  onChange={(e) => setStaffDraft({ ...staffDraft, name: e.target.value })}
                />
              </label>
              <label>
                职务
                <input
                  maxLength={120}
                  value={staffDraft.position}
                  onChange={(e) => setStaffDraft({ ...staffDraft, position: e.target.value })}
                />
              </label>
              <label>
                人员归属
                <select aria-label="人员归属" value={staffDraft.employment_type || "unknown"} onChange={e => setStaffDraft({ ...staffDraft, employment_type: e.target.value as Staff["employment_type"] })}>
                  <option value="unknown">待确认</option><option value="internal">QMDH 内部</option><option value="external">外包人员</option>
                </select>
              </label>
              <label>
                所属单位
                <input maxLength={150} placeholder={staffDraft.employment_type === "internal" ? "QMDH" : "例如：外包公司名称"} value={staffDraft.employer || ""} onChange={e => setStaffDraft({ ...staffDraft, employer: e.target.value })} />
              </label>
              <label className="mp-inline">
                <input
                  type="checkbox"
                  checked={staffDraft.is_active}
                  onChange={(e) => setStaffDraft({ ...staffDraft, is_active: e.target.checked })}
                />
                可安排工作
              </label>
            </fieldset>
            <footer>
              <button type="button" disabled={busy} onClick={() => setStaffDraft(null)}>
                取消
              </button>
              <button className="mp-primary" aria-busy={busy} disabled={busy}>
                {busy ? "正在保存…" : "保存人员"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
      {reportDraft ? (
        <div className="mp-modal">
          <form
            className="mp-small-editor"
            onSubmit={saveReport}
            role="dialog"
            aria-modal="true"
            aria-label="编辑台账信息"
          >
            <h2>台账信息</h2>
            {error ? (
              <p role="alert" className="mp-error">
                {error}
              </p>
            ) : null}
            <fieldset disabled={busy}>
              <label>
                表格编制
                <input
                  maxLength={150}
                  value={reportDraft.compiler}
                  onChange={(e) => setReportDraft({ ...reportDraft, compiler: e.target.value })}
                />
              </label>
              <label>
                数据更新日期
                <input
                  type="date"
                  required
                  value={reportDraft.data_as_of || ""}
                  onChange={(e) => setReportDraft({ ...reportDraft, data_as_of: e.target.value })}
                />
              </label>
            </fieldset>
            <footer>
              <button type="button" disabled={busy} onClick={() => setReportDraft(null)}>
                取消
              </button>
              <button className="mp-primary" aria-busy={busy} disabled={busy}>
                {busy ? "正在保存…" : "保存信息"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
