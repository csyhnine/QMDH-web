import { useState } from "react";
import { api, type Project, type Task } from "../../api";

/* ─── Helpers ─── */

function percentOf(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatCost(value: unknown, currency: unknown): string {
  const num = typeof value === "number" ? value : 0;
  const cur = typeof currency === "string" ? currency : "CNY";
  return `${cur === "CNY" ? "¥" : "$"}${num.toFixed(2)}`;
}

/* ─── Props ─── */

export type ProjectsPageProps = {
  projects: Project[];
  tasks: Task[];
  userCanUseOpsViews: boolean;
  onRefresh: () => void;
};

/* ─── Component ─── */

export default function ProjectsPage({ projects, tasks, userCanUseOpsViews, onRefresh }: ProjectsPageProps) {
  const [selectedProjectCode, setSelectedProjectCode] = useState("");

  const selectedProject = projects.find((p) => p.code === selectedProjectCode) ?? projects[0] ?? null;
  const selectedProjectTasks = selectedProject ? tasks.filter((t) => t.project_code === selectedProject.code) : [];
  const selectedProjectCost = selectedProjectTasks.reduce((total, t) => total + Number(t.cost || 0), 0);
  const selectedProjectFailures = selectedProjectTasks.filter((t) => t.status === "failed").length;
  const selectedProjectSuccesses = selectedProjectTasks.filter((t) => t.status === "completed").length;

  return (
    <section className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1>项目管理</h1>
          <p>管理和监控所有项目的使用情况与成本</p>
        </div>
        <div className="admin-head-actions">
          <button type="button" className="ghost-button">卡片视图</button>
          <button type="button" className="ghost-button">列表视图</button>
        </div>
      </header>

      {!userCanUseOpsViews ? (
        <div className="floating-error">当前账号没有查看项目管理的权限。</div>
      ) : (
        <div className="admin-split-layout admin-project-layout">
          <section className="admin-table-panel">
            <div className="admin-toolbar">
              <input aria-label="搜索项目" placeholder="搜索项目名称或 Key" />
              <select aria-label="项目状态"><option>全部状态</option><option>运行中</option><option>暂停</option></select>
              <select aria-label="成本区间"><option>成本区间</option><option>0-10</option><option>10-100</option></select>
              <button type="button" onClick={onRefresh}>刷新</button>
            </div>
            <div className="project-card-grid">
              {projects.map((project) => {
                const projectTasks = tasks.filter((t) => t.project_code === project.code);
                const projectCost = projectTasks.reduce((total, t) => total + Number(t.cost || 0), 0);
                const projectFailures = projectTasks.filter((t) => t.status === "failed").length;
                const failureRate = percentOf(projectFailures, projectTasks.length);
                const topProviders = Array.from(
                  projectTasks.reduce((counter, t) => counter.set(t.requested_provider, (counter.get(t.requested_provider) ?? 0) + 1), new Map<string, number>())
                ).sort((a, b) => b[1] - a[1]).slice(0, 2);
                return (
                  <article
                    key={project.code}
                    className={selectedProject?.code === project.code ? "project-card active" : "project-card"}
                    onClick={() => setSelectedProjectCode(project.code)}
                  >
                    <div className="feed-card-topline">
                      <strong>{project.code}</strong>
                      <span className="status-pill status-completed">运行中</span>
                    </div>
                    <p>{project.name}</p>
                    <div className="project-metrics">
                      <span><small>今日成本</small><b>{formatCost(projectCost, "CNY")}</b></span>
                      <span><small>调用次数</small><b>{projectTasks.length}</b></span>
                      <span><small>失败率</small><b>{formatPercent(failureRate)}</b></span>
                    </div>
                    <div className="project-provider-list">
                      {topProviders.length > 0 ? topProviders.map(([provider, count]) => (
                        <span key={provider}><em>{provider}</em><b style={{ width: `${percentOf(count, projectTasks.length)}%` }} /></span>
                      )) : <small>暂无调用数据</small>}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="admin-detail-panel">
            {selectedProject ? (
              <>
                <button type="button" className="admin-panel-close">×</button>
                <div className="admin-detail-head">
                  <h2>{selectedProject.code}</h2>
                  <p>{selectedProject.name}</p>
                </div>
                <div className="admin-detail-meta">
                  <span>阶段：{selectedProject.current_phase ?? "未设置"}</span>
                  <span>状态：{selectedProject.phase_status ?? "进行中"}</span>
                  <span>更新：{selectedProject.last_updated ?? "未记录"}</span>
                </div>
                <div className="detail-metric-grid">
                  <span><small>调用次数</small><strong>{selectedProjectTasks.length}</strong></span>
                  <span><small>实际成本</small><strong>{formatCost(selectedProjectCost, "CNY")}</strong></span>
                  <span><small>成功任务</small><strong>{selectedProjectSuccesses}</strong></span>
                  <span><small>失败任务</small><strong>{selectedProjectFailures}</strong></span>
                </div>
                <section className="admin-mini-panel">
                  <h3>项目说明</h3>
                  <p>{selectedProject.summary ?? "暂无项目说明。"}</p>
                </section>
                <section className="admin-mini-panel">
                  <h3>下一步</h3>
                  <p>{selectedProject.next_action ?? "暂无下一步记录。"}</p>
                </section>
                <section className="admin-mini-panel admin-project-actions">
                  <h3>项目操作</h3>
                  <div className="admin-project-action-row">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => {
                        const newName = prompt("输入新的项目名称：", selectedProject.name);
                        if (newName && newName.trim() && newName.trim() !== selectedProject.name) {
                          api.renameProject(selectedProject.code, newName.trim()).then(() => onRefresh());
                        }
                      }}
                    >✎ 重命名</button>
                    <button
                      type="button"
                      className="ghost-button danger-button"
                      onClick={async () => {
                        if (!confirm(`确定要删除项目「${selectedProject.name}」(${selectedProject.code})？\n\n此操作不可撤销，项目下的任务将迁移到默认项目。`)) return;
                        try {
                          await api.deleteProject(selectedProject.code);
                          setSelectedProjectCode("");
                          onRefresh();
                        } catch (err) {
                          alert(err instanceof Error ? err.message : "删除项目失败");
                        }
                      }}
                    >🗑 删除项目</button>
                  </div>
                </section>
              </>
            ) : (
              <div className="template-empty">暂无项目数据。</div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
