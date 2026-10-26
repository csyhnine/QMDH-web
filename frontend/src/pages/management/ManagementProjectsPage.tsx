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
  type PlanningProject,
  type Report,
  type Staff,
  type Stage,
} from "./planning";
import ManagementOverview from "./ManagementOverview";
import ProjectLedger from "./ProjectLedger";
import ProjectPlan from "./ProjectPlan";
import PeoplePlanner from "./PeoplePlanner";
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
  const available = staff.filter((s) => (s.is_active || value.includes(s.id)) && s.name.includes(query));
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
  const [year, setYear] = useState(new Date().getFullYear());
  const [projects, setProjects] = useState<PlanningProject[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [view, setView] = useState<"overview" | "ledger" | "gantt" | "people" | "staff">("overview");
  const [archive, setArchive] = useState(false);
  const [trash, setTrash] = useState(false);
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState(0);
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>("all");
  const [planDirty, setPlanDirty] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const [start, setStart] = useState(today());
  const [days, setDays] = useState(30);
  const [peopleDays, setPeopleDays] = useState(7);
  const [draft, setDraft] = useState<PlanningProject | null>(null);
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
      setPlanDirty(false);
      action();
    }
  };
  const changeView = (next: typeof view) => {
    if (next !== view) safeChange(() => setView(next));
  };
  const editProject = (p: PlanningProject) => {
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
  const change = <K extends keyof PlanningProject>(key: K, value: PlanningProject[K]) =>
    setDraft((p) => (p ? { ...p, [key]: value } : p));
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
  async function saveProject(e: FormEvent) {
    e.preventDefault();
    if (!draft || busy) return;
    if (!draft.name.trim()) {
      setError("请填写项目名称，其他资料可以稍后补充。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await scopedRequest<PlanningProject>(
        draft.id ? `/projects/${draft.id}` : `/projects?year=${year}`,
        projectPayload(draft),
        draft.id ? "PUT" : "POST",
      );
      setCreatedProject(draft.id ? null : saved);
      setDraft(null);
      setNotice(draft.id ? "项目已保存" : "项目已创建。可以继续安排工作，其他资料随时补充。");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
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
      <header className="mp-header">
        <div>
          <p className="mp-eyebrow">{report?.unit || currentUser?.company_unit} · 管理工作台</p>
          <h1>项目管理</h1>
          <p>掌握项目进展，安排团队下一步工作。</p>
        </div>
        <div className="mp-header-actions">
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
            ["overview", "管理总览", "◫"],
            ["ledger", "项目台账", "▤"],
            ["gantt", "项目计划", "▥"],
            ["people", "人员排期", "♧"],
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
            <button disabled={loading || busy} aria-pressed={trash} onClick={() => safeChange(() => { setTrash(!trash); setArchive(false); })}>{trash ? "返回在管项目" : "回收站"}</button>
            <button disabled={loading || trash} onClick={download}>
              ↓ 导出台账
            </button>
            <button className="mp-primary" disabled={loading || planDirty} onClick={createProject}>
              ＋ 新建项目
            </button>
          </>
        ) : (
          <>
            <strong>人员名册 · {staff.length} 人</strong>
            <span className="mp-toolbar-spacer" />
            <button disabled={loading || busy} onClick={syncRoster}>从账号分组补齐员工</button>
            <button
              className="mp-primary"
              disabled={loading}
              onClick={() => setStaffDraft({ id: 0, name: "", position: "", is_active: true, version: 0 })}
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
        {!loading && view === "overview" && !projects.length && !archive && !trash && !error ? (
          <section className="mp-start-guide" aria-label="项目管理入门">
            <div>
              <span>从这里开始</span>
              <h2>先建项目，再安排工作</h2>
              <p>只填项目名称即可保存。人员、合同和费用都可以稍后补充。</p>
              <button className="mp-primary" onClick={createProject}>
                创建第一个项目
              </button>
            </div>
            <ol>
              <li>
                <strong>1. 建立项目</strong>
                <span>名称必填，其他资料选填</span>
              </li>
              <li>
                <strong>2. 安排工作</strong>
                <span>有计划时再填写阶段、日期和人员</span>
              </li>
              <li>
                <strong>3. 查看进展</strong>
                <span>在项目计划和人员排期中查看安排</span>
              </li>
            </ol>
          </section>
        ) : null}
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
        ) : view === "overview" && !projects.length && !archive && !error ? null : view === "overview" ? (
          <ManagementOverview
            projects={filtered}
            staff={staff}
            current={today()}
            onEdit={editProject}
            onPlan={() => changeView("gantt")}
            onPeople={() => {
              setStart(today());
              changeView("people");
            }}
          />
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
                  onClick={() => setStart(addDays(start, -(view === "people" ? peopleDays : days)))}
                >
                  ‹
                </button>
                <input
                  aria-label="排期开始日期"
                  type="date"
                  required
                  disabled={planDirty}
                  value={start}
                  onChange={(e) => {
                    if (e.target.value) setStart(e.target.value);
                  }}
                />
                <button
                  disabled={planDirty}
                  onClick={() => setStart(addDays(start, view === "people" ? peopleDays : days))}
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
                    value={peopleDays}
                    onChange={(e) => setPeopleDays(Number(e.target.value))}
                  >
                    <option value={7}>一周</option>
                    <option value={14}>两周</option>
                  </select>
                )}
              </div>
            </div>
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
              />
            ) : (
              <PeoplePlanner
                key={`${year}-${archive}-${search}-${person}-${statusFilter}-${refresh}`}
                projects={filtered}
                workloadProjects={projects}
                staff={staff}
                personFilter={person}
                start={start}
                days={peopleDays}
                archived={archive}
                onEdit={editProject}
                onPersist={persistSchedule}
                onDirty={setPlanDirty}
                onBusy={setPlanSaving}
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
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className="mp-avatar">{s.name.slice(-2)}</span> {s.name}
                      </td>
                      <td>{s.position || "—"}</td>
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
              名册用于安排工作，添加人员不会授予网站权限。可添加尚无账号的员工；同名人员请注明区分。
            </p>
          </div>
        )}
      </div>
      <div className="mp-report-meta">
        {year} 年度项目信息一览表 · 表格编制 {report?.compiler || "待填写"} · 数据更新 {report?.data_as_of || "待填写"}
      </div>
      {draft ? (
        <div className="mp-modal mp-drawer-backdrop">
          <form
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
                  <input
                    type="date"
                    value={draft.deadline || ""}
                    onChange={(e) => change("deadline", e.target.value || null)}
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
                      <input
                        required
                        type="date"
                        value={s.start}
                        onChange={(e) =>
                          editStage(i, { start: e.target.value, ...(s.milestone ? { end: e.target.value } : {}) })
                        }
                      />
                    </label>
                    <label>
                      <span>完成日期</span>
                      <input
                        required
                        type="date"
                        min={s.start}
                        disabled={s.milestone}
                        value={s.end}
                        onChange={(e) => editStage(i, { end: e.target.value })}
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
