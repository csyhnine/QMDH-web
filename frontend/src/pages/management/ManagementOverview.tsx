import { planningOverview, projectProgress, staffAffiliation, type PlanningProject, type Staff } from "./planning";
export default function ManagementOverview({
  projects,
  staff,
  current,
  onEdit,
  onPlan,
  onPeople,
}: {
  projects: PlanningProject[];
  staff: Staff[];
  current: string;
  onEdit: (p: PlanningProject) => void;
  onPlan: () => void;
  onPeople: () => void;
}) {
  const data = planningOverview(projects, staff, current);
  return (
    <div className="mp-overview">
      <div className="mp-section-heading">
        <div>
          <h2>本周工作概览</h2>
          <p>
            {data.week.start} — {data.week.end} · 所选年度、当前筛选范围内的在册项目
          </p>
        </div>
        <button onClick={onPlan}>查看项目计划 ↗</button>
      </div>
      <div className="mp-kpis">
        <article>
          <span>在册项目</span>
          <strong>
            {data.active.length}
            <small>项</small>
          </strong>
          <p>{data.unscheduled.length} 项尚未设置阶段排期</p>
        </article>
        <article>
          <span>本周待完成节点</span>
          <strong>
            {data.due.length}
            <small>项</small>
          </strong>
          <p>已完成阶段不计入待办</p>
        </article>
        <article className={data.overdue.length ? "mp-kpi-alert" : ""}>
          <span>延期阶段</span>
          <strong>
            {data.overdue.length}
            <small>项</small>
          </strong>
          <p>{data.overdue.length ? "需要确认进度或调整日期" : "暂无未完成的逾期阶段"}</p>
        </article>
        <article>
          <span>请款中 · 已开发票</span>
          <strong className="mp-money">
            {data.known ? data.invoiced : "—"}
            <small>万元</small>
          </strong>
          <p>
            {data.known} / {data.active.length} 项已填写金额，空白未计入
          </p>
        </article>
      </div>
      <div className="mp-overview-columns">
        <article className="mp-panel">
          <header>
            <h3>需要关注的节点</h3>
            <span className="mp-count">
              {data.overdue.length + data.due.filter((e) => e.stage.end >= current).length}
            </span>
          </header>
          {[...data.overdue, ...data.due.filter((e) => e.stage.end >= current)].slice(0, 8).map((e) => (
            <button className="mp-attention" key={`${e.project.id}-${e.stage.id}`} onClick={() => onEdit(e.project)}>
              <span className={e.stage.end < current ? "mp-dot danger" : "mp-dot"} />
              <span>
                <strong>{e.stage.name}</strong>
                <small>{e.project.name}</small>
              </span>
              <span className={e.stage.end < current ? "mp-badge danger" : "mp-badge"}>
                {e.stage.end < current ? "已延期" : "本周"} · {e.stage.end.slice(5)}
              </span>
            </button>
          ))}
          {!data.overdue.length && !data.due.some((e) => e.stage.end >= current) ? (
            <div className="mp-empty">
              <b>本周暂无待关注节点</b>
              <p>录入阶段计划后，这里会汇总临近和延期事项。</p>
            </div>
          ) : null}
        </article>
        <article className="mp-panel">
          <header>
            <h3>本周人员负荷</h3>
            <button className="mp-link" onClick={onPeople}>
              查看排期 →
            </button>
          </header>
          {data.loads
            .filter((x) => x.person.is_active || x.peak)
            .slice(0, 6)
            .map((x) => (
              <div className="mp-person-summary" key={x.person.id}>
                <span className="mp-avatar">{x.person.name.slice(-2)}</span>
                <div>
                  <strong>{x.person.name}</strong>
                  <small>{x.person.position || "项目成员"}</small>
                  <small className="mp-affiliation">{staffAffiliation(x.person)}</small>
                </div>
                <span className={x.daysOver ? "mp-badge danger" : x.peak ? "mp-badge" : "mp-badge muted"}>
                  {x.daysOver ? `${x.daysOver} 天超额` : x.peak ? `峰值 ${x.peak}%` : "待安排"}
                </span>
              </div>
            ))}
          {!data.loads.length ? <div className="mp-empty">添加人员后即可安排工作</div> : null}
          <p className="mp-panel-note">按日历日统计计划分配，未排期不等于实际空闲。</p>
        </article>
      </div>
      <article className="mp-panel">
        <header>
          <h3>项目进展</h3>
          <button className="mp-link" onClick={onPlan}>
            展开阶段计划 →
          </button>
        </header>
        <div className="mp-project-cards">
          {data.active.slice(0, 9).map((p) => (
            <button key={p.id} className="mp-project-card" onClick={() => onEdit(p)}>
              <div>
                <span className="mp-badge">{p.phase || "阶段待填"}</span>
                <span className={p.urgency === "紧急" || p.urgency === "特急" ? "mp-urgent" : ""}>{p.urgency}</span>
              </div>
              <h4>{p.name}</h4>
              <p>{p.deadline ? `完成节点 ${p.deadline}` : "完成节点待填写"}</p>
              <div className="mp-progress">
                <i style={{ width: `${projectProgress(p)}%` }} />
              </div>
              <small>
                {p.stages.length ? `${p.stages.length} 个阶段 · 平均进度 ${projectProgress(p)}%` : "尚未设置阶段排期"}
              </small>
            </button>
          ))}
        </div>
        {!data.active.length ? (
          <div className="mp-empty">
            <b>从第一个真实项目开始</b>
            <p>新建项目、明确负责人，再添加设计阶段与交付日期。</p>
          </div>
        ) : null}
      </article>
    </div>
  );
}
