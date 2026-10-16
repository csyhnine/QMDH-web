import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import PeopleSchedule from "./PeopleSchedule";
import { matchesStatus, type ProjectStatusFilter } from "./planning";
import "./management.css";

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
  const [year, setYear] = useState(new Date().getFullYear());
  const [projects, setProjects] = useState<PlanningProject[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [view, setView] = useState<"overview" | "ledger" | "gantt" | "people" | "staff">("overview");
  const [archive, setArchive] = useState(false);
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState(0);
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>("all");
  const [planDirty, setPlanDirty] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const [start, setStart] = useState(today());
  const [days, setDays] = useState(30);
  const [peopleDays, setPeopleDays] = useState(7);
  const [draft, setDraft] = useState<PlanningProject | null>(null);
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
    setReport(null);
    Promise.all([
      request<PlanningProject[]>(`/projects?year=${year}&archived=${archive}`),
      request<Staff[]>("/staff"),
      request<Report>(`/reports/${year}`),
    ])
      .then(([p, s, r]) => {
        if (!cancelled) {
          setProjects(p);
          setStaff(s);
          setReport(r);
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
  }, [year, archive, refresh]);
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
    if (!planDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const railGuard = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".global-rail button")) return;
      if (planSaving || !window.confirm("排期调整尚未保存，确定离开并放弃调整？")) {
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
  }, [planDirty, planSaving]);
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
  const editProject = (p: PlanningProject) => setDraft(structuredClone(p));
  async function persistSchedule(project: PlanningProject) {
    const saved = await request<PlanningProject>(`/projects/${project.id}`, projectPayload(project));
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
    if (!busy && window.confirm("关闭编辑？尚未保存的内容将丢失。")) setDraft(null);
  };
  async function saveProject(e: FormEvent) {
    e.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      await request(
        draft.id ? `/projects/${draft.id}` : `/projects?year=${year}`,
        projectPayload(draft),
        draft.id ? "PUT" : "POST",
      );
      setDraft(null);
      setNotice("项目已保存");
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
      await request(id ? `/staff/${id}` : "/staff", body, id ? "PUT" : "POST");
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
      await request(`/reports/${year}`, {
        compiler: reportDraft.compiler,
        data_as_of: reportDraft.data_as_of,
        version: reportDraft.version,
      });
      setReportDraft(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([ledgerCsv(filtered, staff)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report?.unit ?? "二分院"}-${year}年度项目台账.csv`;
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
          <button key={v} className={view === v ? "selected" : ""} onClick={() => changeView(v)}>
            <span aria-hidden="true">{icon}</span>
            {l}
          </button>
        ))}
      </nav>
      {error ? (
        <p className="mp-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mp-notice">
          {notice}
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
                onChange={(e) => safeChange(() => setArchive(e.target.checked))}
              />
              已归档
            </label>
            <span className="mp-toolbar-spacer" />
            <button disabled={loading} onClick={download}>
              ↓ 导出台账
            </button>
            <button
              className="mp-primary"
              disabled={loading || planDirty}
              onClick={() => {
                if (archive) setArchive(false);
                setDraft(newProject(Math.max(0, ...projects.map((p) => p.sequence)) + 1));
              }}
            >
              ＋ 新建项目
            </button>
          </>
        ) : (
          <>
            <strong>人员名册 · {staff.length} 人</strong>
            <span className="mp-toolbar-spacer" />
            <button
              className="mp-primary"
              disabled={loading}
              onClick={() => setStaffDraft({ id: 0, name: "", position: "", is_active: true, version: 0 })}
            >
              ＋ 添加人员
            </button>
          </>
        )}
        <button disabled={loading || busy} onClick={() => safeChange(reload)}>
          刷新
        </button>
      </div>
      {loading ? (
        <div className="mp-empty">正在加载项目工作台…</div>
      ) : view === "overview" ? (
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
            <PeopleSchedule
              projects={filtered}
              staff={staff.filter((s) => !person || s.id === person)}
              start={start}
              days={peopleDays}
              onEdit={editProject}
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
                : "填写基本信息，再添加人员与阶段计划"}
            </p>
            <nav className="mp-editor-nav">
              {[
                ["basic", "基本信息"],
                ["team", "人员分工"],
                ["finance", "合同费用"],
                ["schedule", "阶段排期"],
              ].map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  onClick={() =>
                    document.getElementById(`mp-editor-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                >
                  {label}
                </button>
              ))}
            </nav>
            <fieldset id="mp-editor-basic" disabled={busy}>
              <legend>基本信息</legend>
              <div className="mp-fields">
                {textField("name", "项目名称")}
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
                <label>
                  <span>完成时间节点</span>
                  <input
                    type="date"
                    value={draft.deadline || ""}
                    onChange={(e) => change("deadline", e.target.value || null)}
                  />
                </label>
                {textField("stage_work", "阶段工作", true)}
                {textField("notes", "备注", true)}
              </div>
            </fieldset>
            <fieldset id="mp-editor-team" disabled={busy}>
              <legend>项目组成员</legend>
              <p className="mp-help">点击选择，可搜索并勾选多人；人员在“人员名册”中维护。</p>
              <div className="mp-fields">
                {TEAM_ROLES.map(([k, l]) => (
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
            <fieldset id="mp-editor-schedule" disabled={busy}>
              <legend>阶段排期 · 甘特图</legend>
              <p className="mp-help">每个阶段可安排多人，分配比例应用到每人每天。进度由管理层更新。</p>
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
                    <div className="mp-field">
                      <span>安排人员</span>
                      <PeopleSelect
                        value={s.assignees}
                        staff={staff}
                        onChange={(ids) => editStage(i, { assignees: ids })}
                      />
                    </div>
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
              <label className="mp-inline">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={draft.archived}
                  onChange={(e) => change("archived", e.target.checked)}
                />
                归档项目（可从已归档列表恢复）
              </label>
              <button className="mp-primary" disabled={busy} type="submit">
                {busy ? "正在保存…" : "保存项目与排期"}
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
              <button className="mp-primary" disabled={busy}>
                保存人员
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
              <button className="mp-primary" disabled={busy}>
                保存信息
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
