import { type ManagedUser, type ProviderProfileRecord, type Task } from "../../api";

function percentOf(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}

export type SettingsPageProps = {
  userCanManageUsers: boolean;
  userCanUseOpsViews: boolean;
  tasks: Task[];
  providerProfiles: ProviderProfileRecord[];
  users: ManagedUser[];
  onRefresh: () => void;
};

export default function SettingsPage({
  userCanUseOpsViews,
  userCanManageUsers,
  tasks,
  providerProfiles,
  users,
  onRefresh,
}: SettingsPageProps) {
  return (
    <section className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1>设置中心</h1>
          <p>查看当前系统配置、账号控制范围和运行状态摘要。</p>
        </div>
        <button type="button" className="admin-primary-button" onClick={onRefresh}>
          刷新状态
        </button>
      </header>

      {!userCanUseOpsViews ? (
        <div className="floating-error">当前账号没有查看设置中心的权限。</div>
      ) : (
        <>
          <div className="settings-tabs">
            <button type="button" className="active">
              系统设置
            </button>
            <button type="button">权限说明</button>
            <button type="button">数据概览</button>
            <button type="button">安全设置</button>
            <button type="button">集成配置</button>
          </div>
          <div className="settings-layout">
            <aside className="settings-menu">
              {["基本信息", "界面设置", "时区与日期", "计量单位", "语言设置", "系统维护"].map((item, index) => (
                <button key={item} type="button" className={index === 0 ? "active" : ""}>
                  {item}
                </button>
              ))}
            </aside>

            <section className="settings-main">
              <article className="admin-table-panel settings-info-card">
                <div className="admin-detail-head">
                  <h2>基本信息</h2>
                  <p>这里只展示当前系统事实，不在这个页面直接写入配置。</p>
                </div>
                <div className="settings-field-grid">
                  <label className="composer-menu-field">
                    <span>系统名称</span>
                    <input value="QMDH 设计师工作台" readOnly />
                  </label>
                  <label className="composer-menu-field">
                    <span>组织名称</span>
                    <input value="QMDH Studio" readOnly />
                  </label>
                  <label className="composer-menu-field composer-menu-field-full">
                    <span>产品定位</span>
                    <input value="单用户中心的 AI 生成工作台，管理员负责后台面板和账号范围控制。" readOnly />
                  </label>
                  <label className="composer-menu-field">
                    <span>时区</span>
                    <input value="UTC+08:00 Asia/Shanghai" readOnly />
                  </label>
                  <label className="composer-menu-field">
                    <span>版本</span>
                    <input value="MVP 1.0" readOnly />
                  </label>
                </div>
              </article>

              <article className="admin-table-panel settings-switch-card">
                <div className="admin-detail-head">
                  <h2>当前能力</h2>
                  <p>这些开关表示当前代码和接口已经具备的能力概览。</p>
                </div>
                <div className="settings-switch-grid">
                  {([
                    ["模型配置", "管理员可以维护 Provider 与模型配置。", true],
                    ["账号管理", "管理员可以维护账号、角色、状态和额度。", true],
                    ["个人历史隔离", "设计师只能看到自己的任务和资产历史。", true],
                    ["个人项目分组", "左侧个人项目只作为任务分组容器使用。", true],
                    ["项目成员协作", "已不再作为产品能力暴露。", false],
                    ["导出报告", "当前保留入口，尚未接入完整导出。", false],
                    ["维护模式", "当前未接入真实切换开关。", false],
                  ] as const).map(([title, desc, enabled]) => (
                    <div key={title} className="settings-switch-row">
                      <span>
                        <strong>{title}</strong>
                        <small>{desc}</small>
                      </span>
                      <em className={enabled ? "on" : ""}>{enabled ? "ON" : "OFF"}</em>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <aside className="admin-detail-panel settings-resource-panel">
              <div className="admin-detail-head">
                <h2>系统资源使用</h2>
                <p>基于当前运行态和业务数据做的轻量摘要。</p>
              </div>
              <div className="resource-meter">
                <span>任务记录</span>
                <b>
                  <i style={{ width: `${percentOf(tasks.length, 200)}%` }} />
                </b>
                <em>{tasks.length} / 200</em>
              </div>
              <div className="resource-meter">
                <span>模型配置</span>
                <b>
                  <i style={{ width: `${percentOf(providerProfiles.length, 20)}%` }} />
                </b>
                <em>{providerProfiles.length} / 20</em>
              </div>
              <div className="resource-meter">
                <span>账号数量</span>
                <b>
                  <i style={{ width: `${percentOf(users.length, 50)}%` }} />
                </b>
                <em>{users.length} / 50</em>
              </div>
              <div className="settings-quick-actions">
                <button type="button" onClick={() => (window.location.href = "/admin/models")}>
                  模型管理
                </button>
                {userCanManageUsers ? (
                  <button type="button" onClick={() => (window.location.href = "/admin/users")}>
                    账号管理
                  </button>
                ) : null}
                <button type="button" onClick={() => (window.location.href = "/admin/dashboard")}>
                  运营看板
                </button>
              </div>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
