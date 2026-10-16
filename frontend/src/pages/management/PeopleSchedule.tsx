import { ganttEntries, staffLoads, addDays, type PlanningProject, type Staff } from "./planning";
export default function PeopleSchedule({
  projects,
  staff,
  start,
  days,
  onEdit,
}: {
  projects: PlanningProject[];
  staff: Staff[];
  start: string;
  days: number;
  onEdit: (p: PlanningProject) => void;
}) {
  const entries = ganttEntries(projects, start, days);
  return (
    <>
      <div className="mp-schedule-legend">
        <span>
          <i className="free" />
          未排期
        </span>
        <span>
          <i className="planned" />
          已安排 ≤ 100%
        </span>
        <span>
          <i className="over" />
          超额 &gt; 100%
        </span>
        <small>按日历日计算 · 点击工作条编辑人员与安排</small>
      </div>
      <div className="mp-people-board">
        <div style={{ minWidth: 240 + days * 64 }}>
          <div className="mp-people-head">
            <div className="mp-people-label">人员 / 工作安排</div>
            <div className="mp-capacity-days">
              {Array.from({ length: days }, (_, i) => (
                <span key={i}>
                  {addDays(start, i).slice(5)}
                  <small>
                    {["日", "一", "二", "三", "四", "五", "六"][new Date(`${addDays(start, i)}T00:00:00Z`).getUTCDay()]}
                  </small>
                </span>
              ))}
            </div>
          </div>
          {staff.map((person) => {
            const values = staffLoads(entries, person.id, days),
              items = entries.filter((e) => e.stage.assignees.includes(person.id));
            return (
              <div className="mp-person-row" key={person.id}>
                <div className="mp-people-label">
                  <span className="mp-avatar">{person.name.slice(-2)}</span>
                  <div>
                    <strong>
                      {person.name}
                      {person.is_active ? "" : "（停用）"}
                    </strong>
                    <small>{person.position || "项目成员"}</small>
                    <span className={values.some((v) => v > 100) ? "mp-danger-text" : "mp-subtle"}>
                      {values.some((v) => v > 100)
                        ? `${values.filter((v) => v > 100).length} 天超额`
                        : `${items.length} 个阶段`}
                    </span>
                  </div>
                </div>
                <div className="mp-capacity-timeline" style={{ flex: 1, minWidth: days * 64 }}>
                  <div className="mp-capacity-days">
                    {values.map((v, i) => (
                      <span
                        key={i}
                        className={v > 100 ? "over" : v ? "planned" : "free"}
                        title={`${person.name} ${addDays(start, i)} 计划分配 ${v}%`}
                      >
                        {v ? `${v}%` : "—"}
                      </span>
                    ))}
                  </div>
                  {items.length ? (
                    items.map((e) => (
                      <div className="mp-capacity-track" key={`${e.project.id}-${e.stage.id}`}>
                        <button
                          style={{
                            left: `calc(${(e.left / days) * 100}% + 3px)`,
                            width: `calc(${(e.width / days) * 100}% - 6px)`,
                          }}
                          onClick={() => onEdit(e.project)}
                          title={`${e.project.name} · ${e.stage.name}\n${e.stage.start} — ${e.stage.end} · 分配 ${e.stage.allocation}%`}
                        >
                          {e.project.name} · {e.stage.name}
                          <small> {e.stage.allocation}%</small>
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="mp-schedule-empty">本时间范围未安排阶段</p>
                  )}
                </div>
              </div>
            );
          })}
          {!staff.length ? <div className="mp-empty">暂无人员，请先维护人员名册。</div> : null}
        </div>
      </div>
      <p className="mp-help">
        未指定人员的阶段：{entries.filter((e) => !e.stage.assignees.length).length}{" "}
        个。停用人员的既有安排仍保留。负荷只覆盖当前年度与筛选项目。
      </p>
    </>
  );
}
