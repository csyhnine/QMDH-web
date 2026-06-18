import { useMemo, useState } from "react";

import { type ManagedUser, type ProviderProfileRecord, type Task } from "../../api";
import BigjpgIntegrationPanel, { bigjpgIntegrationStatus, isBigjpgProfile } from "./BigjpgIntegrationPanel";
import { integrationMenuItems, type IntegrationMenuKey } from "./settingsIntegrationConstants";

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
  onRefresh: () => Promise<void>;
};

type SettingsTab = "integrations" | "overview";

export default function SettingsPage({
  userCanUseOpsViews,
  userCanManageUsers,
  tasks,
  providerProfiles,
  users,
  onRefresh,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("integrations");
  const [activeIntegration, setActiveIntegration] = useState<IntegrationMenuKey>("bigjpg");

  const bigjpgProfile = useMemo(
    () => providerProfiles.find((profile) => isBigjpgProfile(profile)),
    [providerProfiles]
  );
  const bigjpgStatus = bigjpgIntegrationStatus(bigjpgProfile);
  const connectedIntegrations = integrationMenuItems.filter((item) => {
    if (item.key !== "bigjpg") return false;
    return bigjpgStatus.tone === "ready";
  }).length;

  return (
    <section className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1>设置中心</h1>
          <p>管理外部工具接入、查看系统运行摘要。集成配置保存后立即作用于 Studio 与任务执行。</p>
        </div>
        <button type="button" className="admin-primary-button" onClick={() => void onRefresh()}>
          刷新状态
        </button>
      </header>

      {!userCanUseOpsViews ? (
        <div className="floating-error">当前账号没有查看设置中心的权限。</div>
      ) : (
        <>
          <div className="settings-tabs">
            <button
              type="button"
              className={activeTab === "integrations" ? "active" : ""}
              onClick={() => setActiveTab("integrations")}
            >
              外部工具集成
            </button>
            <button
              type="button"
              className={activeTab === "overview" ? "active" : ""}
              onClick={() => setActiveTab("overview")}
            >
              运行概览
            </button>
          </div>

          {activeTab === "integrations" ? (
            <div className="settings-layout settings-layout-integrations">
              <aside className="settings-menu">
                {integrationMenuItems.map((item) => {
                  const status =
                    item.key === "bigjpg" ? bigjpgIntegrationStatus(bigjpgProfile) : { label: "待接入", tone: "idle" as const };
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={activeIntegration === item.key ? "active" : ""}
                      onClick={() => setActiveIntegration(item.key)}
                    >
                      <span className="settings-menu-item-label">{item.label}</span>
                      <small className={`settings-integration-badge is-${status.tone}`}>{status.label}</small>
                    </button>
                  );
                })}
              </aside>

              <section className="settings-main">
                {activeIntegration === "bigjpg" ? (
                  <BigjpgIntegrationPanel profile={bigjpgProfile} onRefresh={onRefresh} />
                ) : null}
              </section>

              <aside className="admin-detail-panel settings-resource-panel">
                <div className="admin-detail-head">
                  <h2>集成状态</h2>
                  <p>已接入的外部能力会出现在 Studio 对应模式中。</p>
                </div>
                <div className={`settings-integration-status-card is-${bigjpgStatus.tone}`}>
                  <strong>Bigjpg 高清放大</strong>
                  <span>{bigjpgStatus.label}</span>
                  <p>{bigjpgStatus.detail}</p>
                </div>
                <div className="resource-meter">
                  <span>已接入工具</span>
                  <b>
                    <i style={{ width: `${percentOf(connectedIntegrations, integrationMenuItems.length)}%` }} />
                  </b>
                  <em>
                    {connectedIntegrations} / {integrationMenuItems.length}
                  </em>
                </div>
                <div className="settings-quick-actions">
                  <button type="button" onClick={() => (window.location.href = "/studio/generate")}>
                    打开 Studio
                  </button>
                  <button type="button" onClick={() => (window.location.href = "/admin/models")}>
                    模型管理
                  </button>
                </div>
              </aside>
            </div>
          ) : (
            <div className="settings-layout settings-layout-overview">
              <section className="settings-main settings-main-wide">
                <article className="admin-table-panel settings-info-card">
                  <div className="admin-detail-head">
                    <h2>运行摘要</h2>
                    <p>基于当前后台数据的轻量概览。</p>
                  </div>
                  <div className="settings-field-grid">
                    <label className="composer-menu-field">
                      <span>任务记录</span>
                      <input value={String(tasks.length)} readOnly />
                    </label>
                    <label className="composer-menu-field">
                      <span>模型配置</span>
                      <input value={String(providerProfiles.length)} readOnly />
                    </label>
                    <label className="composer-menu-field">
                      <span>账号数量</span>
                      <input value={String(users.length)} readOnly />
                    </label>
                    <label className="composer-menu-field">
                      <span>外部集成</span>
                      <input value={`${connectedIntegrations} 项已接入`} readOnly />
                    </label>
                  </div>
                </article>

                <article className="admin-table-panel settings-switch-card">
                  <div className="admin-detail-head">
                    <h2>平台能力</h2>
                    <p>当前版本已具备的主要模块。</p>
                  </div>
                  <div className="settings-switch-grid">
                    {([
                      ["外部工具集成", "在设置中心维护 Bigjpg 等第三方 API。", true],
                      ["高清放大", "历史卡片「放大」按钮可提交 Bigjpg 超分任务。", bigjpgStatus.tone === "ready"],
                      ["模型配置", "管理员可在模型管理维护 Provider。", true],
                      ["账号管理", "管理员可维护账号、角色与额度。", userCanManageUsers],
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
            </div>
          )}
        </>
      )}
    </section>
  );
}
