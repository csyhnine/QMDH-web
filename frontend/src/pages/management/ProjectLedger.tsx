import { useMemo, useState } from "react";
import { cell, LEDGER_COLUMNS, type PlanningProject, type Staff } from "./planning";
const INITIAL_COLUMNS = [
  "sequence",
  "name",
  "coordinator",
  "phase",
  "deadline",
  "urgency",
  "design_fee",
  "paid",
  "next_week_work",
];
export default function ProjectLedger({
  projects,
  staff,
  onEdit,
}: {
  projects: PlanningProject[];
  staff: Staff[];
  onEdit: (p: PlanningProject) => void;
}) {
  const [columns, setColumns] = useState<string[]>(INITIAL_COLUMNS),
    [group, setGroup] = useState("none");
  const [sort, setSort] = useState({ key: "sequence", ascending: true });
  const visible = LEDGER_COLUMNS.filter(([key]) => columns.includes(key));
  const groups = useMemo(() => {
    const sorted = [...projects].sort((a, b) => {
      if (sort.key === "sequence") return (a.sequence - b.sequence) * (sort.ascending ? 1 : -1);
      const av = cell(a, sort.key, staff),
        bv = cell(b, sort.key, staff);
      if (!av || !bv) return av ? -1 : bv ? 1 : a.sequence - b.sequence;
      return av.localeCompare(bv, "zh-CN", { numeric: true }) * (sort.ascending ? 1 : -1) || a.sequence - b.sequence;
    });
    const result = new Map<string, PlanningProject[]>();
    sorted.forEach((p) => {
      const label = group === "none" ? "全部项目" : cell(p, group, staff) || "待填写";
      result.set(label, [...(result.get(label) || []), p]);
    });
    return [...result];
  }, [projects, staff, sort, group]);
  return (
    <div className="mp-ledger-panel">
      <div className="mp-ledger-tools">
        <span>
          <strong>{projects.length}</strong> 个项目
        </span>
        <div>
          <label>
            分组
            <select aria-label="台账分组" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="none">不分组</option>
              <option value="phase">项目阶段</option>
              <option value="coordinator">项目统筹</option>
              <option value="urgency">紧急程度</option>
            </select>
          </label>
          <details className="mp-column-picker">
            <summary>☷ 显示列 · {visible.length}</summary>
            <div>
              {LEDGER_COLUMNS.map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={columns.includes(key)}
                    disabled={key === "name"}
                    onChange={(e) =>
                      setColumns(e.target.checked ? [...columns, key] : columns.filter((c) => c !== key))
                    }
                  />
                  {label}
                </label>
              ))}
              <button onClick={() => setColumns(INITIAL_COLUMNS)}>恢复默认列</button>
            </div>
          </details>
        </div>
      </div>
      <div className="mp-table-wrap">
        <table className="mp-ledger">
          <thead>
            <tr>
              {visible.map(([key, label]) => (
                <th key={key} aria-sort={sort.key === key ? (sort.ascending ? "ascending" : "descending") : "none"}>
                  <button onClick={() => setSort({ key, ascending: sort.key === key ? !sort.ascending : true })}>
                    {label}
                    {sort.key === key ? (sort.ascending ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(([label, items]) => (
              <Group
                key={label}
                label={label}
                items={items}
                grouped={group !== "none"}
                visible={visible}
                staff={staff}
                onEdit={onEdit}
              />
            ))}
            {!projects.length ? (
              <tr>
                <td colSpan={visible.length}>
                  <div className="mp-empty">
                    <b>暂无符合条件的项目</b>
                    <p>调整筛选条件，或新建真实项目开始安排。</p>
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="mp-panel-note">
        点击项目名称查看详情与编辑 · 全部字段可在“显示列”中展开，CSV 导出始终包含全部字段。
      </p>
    </div>
  );
}
function Group({
  label,
  items,
  grouped,
  visible,
  staff,
  onEdit,
}: {
  label: string;
  items: PlanningProject[];
  grouped: boolean;
  visible: (typeof LEDGER_COLUMNS)[number][];
  staff: Staff[];
  onEdit: (p: PlanningProject) => void;
}) {
  return (
    <>
      {grouped ? (
        <tr className="mp-group-row">
          <td colSpan={visible.length}>
            {label}
            <span>{items.length} 项</span>
          </td>
        </tr>
      ) : null}
      {items.map((p) => (
        <tr key={p.id}>
          {visible.map(([key]) => (
            <td key={key} className={key === "name" ? "mp-project-name-cell" : ""}>
              {key === "name" ? (
                <button className="mp-project-name" onClick={() => onEdit(p)}>
                  <span className="mp-project-symbol" aria-hidden="true">
                    ▤
                  </span>
                  <strong>{p.name}</strong>
                </button>
              ) : key === "urgency" ? (
                <span className={p.urgency === "紧急" || p.urgency === "特急" ? "mp-badge danger" : "mp-badge muted"}>
                  {p.urgency}
                </span>
              ) : (
                cell(p, key, staff) || "—"
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
