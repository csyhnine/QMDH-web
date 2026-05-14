import { type ManagedUser, type ProviderProfileRecord, type Task, type Project } from "../../api";

/* ─── Helpers ─── */

function percentOf(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}

/* ─── Props ─── */

export type SettingsPageProps = {
  userCanManageUsers: boolean;
  userCanUseOpsViews: boolean;
  tasks: Task[];
  providerProfiles: ProviderProfileRecord[];
  users: ManagedUser[];
  projects: Project[];
  onRefresh: () => void;
};

/* ─── Component ─── */

export default function SettingsPage({
  userCanUseOpsViews,
  userCanManageUsers,
  tasks,
  providerProfiles,
  users,
  projects,
  onRefresh,
}: SettingsPageProps) {
  return (
    <section className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1>设置中心</h1>
          <p>系统配置、权限管理、通知与运行状态概览</p>
        </div>
        <button type="button" className="admin-primary-button" onClick={onRefresh}>刷新状态</button>
      </header>

      {!userCanUseOpsViews ? (
        <div className="floating-error">当前账号没有查看设置中心的权限。</div>
      ) : (
        <>
          <div className="settings-tabs">
            <button type="button" className="active">系统设置</button>
            <button type="button">权限管理</button>
            <button type="button">数据管理</button>
            <button type="button">安全设置</button>
            <button type="button">集成配置</button>
          </div>
          <div className="settings-layout">
            <aside className="settings-menu">
              {["基本信息", "界面设置", "时间与日期", "计量单位", "语言设置", "系统维护"].map((item, index) => (
                <button key={item} type="button" className={index === 0 ? "active" : ""}>{item}</button>
              ))}
            </aside>
            <section className="settings-main">
              <article className="admin-table-panel settings-info-card">
                <div className="admin-detail-head">
                  <h2>基本信息</h2>
                  <p>配置系统的基础信息。当前页面为轻量概览，不写入真实配置。</p>
                </div>
                <div className="settings-field-grid">
                  <label className="composer-menu-field"><span>系统名称</span><input value="QMDH 设计师运营平台" readOnly /></label>
                  <label className="composer-menu-field"><span>公司名称</span><input value="QMDH Studio" readOnly /></label>
                  <label className="composer-menu-field composer-menu-field-full"><span>系统描述</span><input value="面向设计团队的 AI 模型运营与设计师账号管理平台" readOnly /></label>
                  <label className="composer-menu-field"><span>时区设置</span><input value="(UTC+08:00) 北京、上海、香港特别行政区" readOnly /></label>
                  <label className="composer-menu-field"><span>系统版本</span><input value="MVP 1.0" readOnly /></label>
                </div>
              </article>
              <article className="admin-table-panel settings-switch-card">
                <div className="admin-detail-head">
                  <h2>系统功能开关</h2>
                  <p>仅展示当前项目已具备或待补强能力。</p>
                </div>
                <div className="settings-switch-grid">
                  {([
                    ["模型上传", "允许管理员维护模型配置", true],
                    ["账号管理", "启用数据库账号与角色权限", true],
                    ["导出报告", "当前仅保留入口，后续补报表", false],
                    ["API 访问", "旧 token 兼容路径仍保留", true],
                    ["操作日志", "待 task-010 接入审计", false],
                    ["维护模式", "暂未接入真实开关", false],
                  ] as const).map(([title, desc, enabled]) => (
                    <div key={title} className="settings-switch-row">
                      <span><strong>{title}</strong><small>{desc}</small></span>
                      <em className={enabled ? "on" : ""}>{enabled ? "ON" : "OFF"}</em>
                    </div>
                  ))}
                </div>
              </article>
            </section>
            <aside className="admin-detail-panel settings-resource-panel">
              <div className="admin-detail-head">
                <h2>系统资源使用</h2>
                <p>当前数据来自本地运行状态与现有业务统计。</p>
              </div>
              <div className="resource-meter"><span>任务记录</span><b><i style={{ width: `${percentOf(tasks.length, 200)}%` }} /></b><em>{tasks.length} / 200</em></div>
              <div className="resource-meter"><span>模型配置</span><b><i style={{ width: `${percentOf(providerProfiles.length, 20)}%` }} /></b><em>{providerProfiles.length} / 20</em></div>
              <div className="resource-meter"><span>账号数量</span><b><i style={{ width: `${percentOf(users.length, 50)}%` }} /></b><em>{users.length} / 50</em></div>
              <div className="resource-meter"><span>项目数量</span><b><i style={{ width: `${percentOf(projects.length, 20)}%` }} /></b><em>{projects.length} / 20</em></div>
              <div className="settings-quick-actions">
                <button type="button" onClick={() => (window.location.href = "/admin/models")}>运维配置</button>
                {userCanManageUsers ? <button type="button" onClick={() => (window.location.href = "/admin/users")}>账号管理</button> : null}
                <button type="button" onClick={() => (window.location.href = "/admin/dashboard")}>运营看板</button>
              </div>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
