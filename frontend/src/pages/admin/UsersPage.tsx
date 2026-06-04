import { type FormEvent, useEffect, useMemo, useState } from "react";

import { api, type ManagedUser, type UserCreatePayload, type UserGroupSummary } from "../../api";

type UserDraft = {
  name: string;
  password: string;
  displayName: string;
  groupName: string;
  role: string;
  monthlyQuota: string;
  billingPlan: string;
  billingStatus: string;
  quotaPolicy: string;
  quotaResetCycle: string;
  isActive: boolean;
};

const defaultUserDraft: UserDraft = {
  name: "",
  password: "",
  displayName: "",
  groupName: "",
  role: "designer",
  monthlyQuota: "200",
  billingPlan: "standard",
  billingStatus: "active",
  quotaPolicy: "soft_warn",
  quotaResetCycle: "monthly",
  isActive: true,
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const UNGROUPED_LABEL = "未分组";

function formatDate(value: string | null): string {
  if (!value) return "未登录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function groupLabel(groupName: string): string {
  return groupName.trim() || UNGROUPED_LABEL;
}

function formatCurrencyBreakdown(summary: UserGroupSummary): string {
  if (summary.cost_by_currency.length === 0) return "0.00 CNY";
  return summary.cost_by_currency
    .map((item) => `${item.total_cost.toFixed(2)} ${item.currency}`)
    .join(" / ");
}

function toUserPayload(draft: UserDraft): UserCreatePayload {
  return {
    name: draft.name.trim(),
    password: draft.password,
    display_name: draft.displayName.trim(),
    group_name: draft.groupName.trim(),
    role: draft.role,
    monthly_quota: draft.monthlyQuota.trim() ? Number(draft.monthlyQuota) : null,
    billing_plan: draft.billingPlan,
    billing_status: draft.billingStatus,
    quota_policy: draft.quotaPolicy,
    quota_reset_cycle: draft.quotaResetCycle,
    is_active: draft.isActive,
  };
}

function toUserDraft(user: ManagedUser): UserDraft {
  return {
    name: user.name,
    password: "",
    displayName: user.display_name,
    groupName: user.group_name,
    role: user.role,
    monthlyQuota: user.monthly_quota === null ? "" : String(user.monthly_quota),
    billingPlan: user.billing_plan,
    billingStatus: user.billing_status,
    quotaPolicy: user.quota_policy,
    quotaResetCycle: user.quota_reset_cycle,
    isActive: user.is_active,
  };
}

export type UsersPageProps = {
  users: ManagedUser[];
  groupSummaries: UserGroupSummary[];
  userCanManageUsers: boolean;
  error: string;
  onRefresh: () => void;
  onSetError: (error: string) => void;
};

export default function UsersPage({
  users,
  groupSummaries,
  userCanManageUsers,
  error,
  onRefresh,
  onSetError,
}: UsersPageProps) {
  const [userDraft, setUserDraft] = useState<UserDraft>(defaultUserDraft);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [roleFilter, setRoleFilter] = useState<"all" | "designer" | "admin">("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const enabledUsers = users.filter((user) => user.is_active);
  const disabledUsers = users.filter((user) => !user.is_active);
  const adminUsers = users.filter((user) => user.role === "admin");

  const availableGroups = useMemo(() => {
    const names = new Set<string>();
    users.forEach((user) => names.add(user.group_name.trim()));
    groupSummaries.forEach((group) => names.add(group.group_name.trim()));
    return Array.from(names).sort((left, right) => groupLabel(left).localeCompare(groupLabel(right), "zh-CN"));
  }, [groupSummaries, users]);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return users.filter((user) => {
      if (statusFilter === "enabled" && !user.is_active) return false;
      if (statusFilter === "disabled" && user.is_active) return false;
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      if (groupFilter !== "all" && user.group_name.trim() !== groupFilter) return false;
      if (!keyword) return true;
      const haystack = [user.name, user.display_name, user.role, user.group_name]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [groupFilter, roleFilter, search, statusFilter, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pagedUsers = filteredUsers.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  function resetUserDraft() {
    setEditingUserId(null);
    setUserDraft(defaultUserDraft);
  }

  function handleEditUser(user: ManagedUser) {
    setEditingUserId(user.id);
    setUserDraft(toUserDraft(user));
  }

  async function handleSaveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = toUserPayload(userDraft);
    if (!payload.name || (editingUserId === null && !payload.password)) {
      onSetError("请填写用户名和初始密码。");
      return;
    }

    setSavingUser(true);
    try {
      if (editingUserId === null) {
        await api.createUser(payload);
      } else {
        await api.updateUser(editingUserId, {
          display_name: payload.display_name,
          group_name: payload.group_name,
          role: payload.role,
          monthly_quota: payload.monthly_quota,
          billing_plan: payload.billing_plan,
          billing_status: payload.billing_status,
          quota_policy: payload.quota_policy,
          quota_reset_cycle: payload.quota_reset_cycle,
          is_active: payload.is_active,
        });
        if (payload.password) {
          await api.resetUserPassword(editingUserId, payload.password);
        }
      }
      resetUserDraft();
      onRefresh();
      onSetError("");
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "保存账号失败");
    } finally {
      setSavingUser(false);
    }
  }

  async function handleDeactivateUser(userId: number) {
    try {
      await api.deleteUser(userId);
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "停用账号失败");
    }
  }

  async function handleRestoreUser(userId: number) {
    try {
      await api.updateUser(userId, { is_active: true });
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "恢复账号失败");
    }
  }

  function resetListPage() {
    setPage(1);
  }

  return (
    <section className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1>账号管理</h1>
          <p>这里维护管理员与设计师账号的角色、分组、计费配置、额度策略和启用状态。</p>
        </div>
        {userCanManageUsers ? (
          <button type="button" className="admin-primary-button" onClick={resetUserDraft}>
            + 创建账号
          </button>
        ) : null}
      </header>

      {!userCanManageUsers ? (
        <div className="floating-error">当前账号没有用户管理权限。</div>
      ) : (
        <>
          <div className="admin-kpi-grid">
            <article className="admin-kpi-card admin-blue">
              <span>账号总数</span>
              <strong>{users.length}</strong>
              <small>全部后台账号</small>
              <i>●</i>
            </article>
            <article className="admin-kpi-card admin-green">
              <span>已启用账号</span>
              <strong>{enabledUsers.length}</strong>
              <small>允许登录</small>
              <i>●</i>
            </article>
            <article className="admin-kpi-card admin-gray">
              <span>已禁用账号</span>
              <strong>{disabledUsers.length}</strong>
              <small>当前不可登录</small>
              <i>●</i>
            </article>
            <article className="admin-kpi-card admin-purple">
              <span>分组数量</span>
              <strong>{groupSummaries.length}</strong>
              <small>含未分组账号</small>
              <i>●</i>
            </article>
          </div>

          <div className="admin-split-layout">
            <section className="admin-table-panel">
              <section className="admin-group-summary-panel">
                <div className="admin-section-head">
                  <div>
                    <h2>分组花费概览</h2>
                    <p>按账号分组汇总组内全部任务与对话花费。</p>
                  </div>
                  <span>{groupSummaries.length} 个分组</span>
                </div>
                <div className="admin-group-summary-grid">
                  {groupSummaries.map((group) => (
                    <article key={group.group_name || "__ungrouped__"} className="admin-group-summary-card">
                      <div className="admin-group-summary-top">
                        <strong>{groupLabel(group.group_name)}</strong>
                        <span>{group.user_count} 人</span>
                      </div>
                      <div className="admin-group-summary-metric">{formatCurrencyBreakdown(group)}</div>
                      <small>启用 {group.enabled_user_count} 人</small>
                    </article>
                  ))}
                </div>
              </section>

              <div className="admin-toolbar">
                <select
                  aria-label="账号状态筛选"
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value as "all" | "enabled" | "disabled");
                    resetListPage();
                  }}
                >
                  <option value="all">全部状态</option>
                  <option value="enabled">已启用</option>
                  <option value="disabled">禁用</option>
                </select>
                <select
                  aria-label="账号角色筛选"
                  value={roleFilter}
                  onChange={(event) => {
                    setRoleFilter(event.target.value as "all" | "designer" | "admin");
                    resetListPage();
                  }}
                >
                  <option value="all">全部角色</option>
                  <option value="designer">designer</option>
                  <option value="admin">admin</option>
                </select>
                <select
                  aria-label="账号分组筛选"
                  value={groupFilter}
                  onChange={(event) => {
                    setGroupFilter(event.target.value);
                    resetListPage();
                  }}
                >
                  <option value="all">全部分组</option>
                  {availableGroups.map((group) => (
                    <option key={group || "__ungrouped__"} value={group}>
                      {groupLabel(group)}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="搜索账号"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    resetListPage();
                  }}
                  placeholder="搜索账号、显示名或分组"
                />
                <button type="button" onClick={onRefresh}>
                  刷新
                </button>
              </div>

              <div className="admin-list-summary">
                <span>
                  共 {filteredUsers.length} 个账号，当前显示 {filteredUsers.length === 0 ? 0 : pageStart + 1}-
                  {Math.min(pageStart + pageSize, filteredUsers.length)}
                </span>
                <label className="admin-pagination-size">
                  <span>每页</span>
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="admin-data-table admin-user-table">
                <div className="admin-table-row admin-table-head">
                  <span>账号</span>
                  <span>分组</span>
                  <span>角色</span>
                  <span>套餐 / 计费</span>
                  <span>额度策略</span>
                  <span>状态</span>
                  <span>最后登录</span>
                  <span>操作</span>
                </div>
                {pagedUsers.map((user) => (
                  <div key={user.id} className="admin-table-row">
                    <span>
                      <strong>{user.display_name || user.name}</strong>
                      <small>@{user.name}</small>
                    </span>
                    <span>
                      <strong>{groupLabel(user.group_name)}</strong>
                      <small>{user.group_name ? "已分组" : "可在右侧编辑"}</small>
                    </span>
                    <span>
                      <em className="admin-tag">{user.role}</em>
                    </span>
                    <span>
                      <strong>{user.billing_plan}</strong>
                      <small>{user.billing_status}</small>
                    </span>
                    <span>
                      <strong>{user.quota_policy}</strong>
                      <small>{user.monthly_quota === null ? "不限额" : `${user.monthly_quota} / 月`}</small>
                    </span>
                    <span>
                      <em className={`status-pill ${user.is_active ? "status-completed" : "status-failed"}`}>
                        {user.is_active ? "启用" : "禁用"}
                      </em>
                    </span>
                    <span>{formatDate(user.last_login_at)}</span>
                    <span className="admin-row-actions">
                      <button type="button" onClick={() => handleEditUser(user)}>
                        编辑
                      </button>
                      {user.is_active ? (
                        <button type="button" onClick={() => handleDeactivateUser(user.id)}>
                          停用
                        </button>
                      ) : (
                        <button type="button" onClick={() => handleRestoreUser(user.id)}>
                          恢复
                        </button>
                      )}
                    </span>
                  </div>
                ))}
                {pagedUsers.length === 0 ? (
                  <div className="admin-table-empty">当前筛选条件下没有账号。</div>
                ) : null}
              </div>

              <div className="admin-pagination">
                <button type="button" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  上一页
                </button>
                <span>
                  第 {safePage} / {totalPages} 页
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  下一页
                </button>
              </div>
            </section>

            <aside className="admin-detail-panel">
              <form className="admin-side-form" onSubmit={handleSaveUser}>
                <div className="admin-detail-head">
                  <h2>{editingUserId === null ? "创建账号" : "编辑账号"}</h2>
                  <p>右侧专门维护账号角色、分组、密码、状态和额度配置。</p>
                </div>
                <label className="composer-menu-field">
                  <span>用户名</span>
                  <input
                    value={userDraft.name}
                    disabled={editingUserId !== null}
                    onChange={(event) => setUserDraft((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <div className="template-editor-row template-editor-row-2">
                  <label className="composer-menu-field">
                    <span>显示名</span>
                    <input
                      value={userDraft.displayName}
                      onChange={(event) => setUserDraft((current) => ({ ...current, displayName: event.target.value }))}
                    />
                  </label>
                  <label className="composer-menu-field">
                    <span>账号分组</span>
                    <input
                      value={userDraft.groupName}
                      onChange={(event) => setUserDraft((current) => ({ ...current, groupName: event.target.value }))}
                      placeholder="比如：华南一组 / 方案组"
                    />
                  </label>
                </div>
                <label className="composer-menu-field">
                  <span>角色</span>
                  <select
                    value={userDraft.role}
                    onChange={(event) => setUserDraft((current) => ({ ...current, role: event.target.value }))}
                  >
                    <option value="designer">designer</option>
                    <option value="admin">admin</option>
                  </select>
                </label>
                <label className="composer-menu-field">
                  <span>{editingUserId === null ? "初始密码" : "重置密码"}</span>
                  <input
                    type="password"
                    value={userDraft.password}
                    onChange={(event) => setUserDraft((current) => ({ ...current, password: event.target.value }))}
                  />
                </label>
                <label className="composer-menu-field">
                  <span>月度额度</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={userDraft.monthlyQuota}
                    onChange={(event) => setUserDraft((current) => ({ ...current, monthlyQuota: event.target.value }))}
                    placeholder="留空表示不限额"
                  />
                </label>
                <div className="template-editor-row template-editor-row-3">
                  <label className="composer-menu-field">
                    <span>商业套餐</span>
                    <select
                      value={userDraft.billingPlan}
                      onChange={(event) => setUserDraft((current) => ({ ...current, billingPlan: event.target.value }))}
                    >
                      <option value="internal">internal</option>
                      <option value="trial">trial</option>
                      <option value="standard">standard</option>
                      <option value="pro">pro</option>
                      <option value="enterprise">enterprise</option>
                    </select>
                  </label>
                  <label className="composer-menu-field">
                    <span>计费状态</span>
                    <select
                      value={userDraft.billingStatus}
                      onChange={(event) => setUserDraft((current) => ({ ...current, billingStatus: event.target.value }))}
                    >
                      <option value="active">active</option>
                      <option value="grace">grace</option>
                      <option value="suspended">suspended</option>
                    </select>
                  </label>
                  <label className="composer-menu-field">
                    <span>额度周期</span>
                    <select
                      value={userDraft.quotaResetCycle}
                      onChange={(event) =>
                        setUserDraft((current) => ({ ...current, quotaResetCycle: event.target.value }))
                      }
                    >
                      <option value="monthly">monthly</option>
                    </select>
                  </label>
                </div>
                <label className="composer-menu-field">
                  <span>额度策略</span>
                  <select
                    value={userDraft.quotaPolicy}
                    onChange={(event) => setUserDraft((current) => ({ ...current, quotaPolicy: event.target.value }))}
                  >
                    <option value="soft_warn">soft_warn</option>
                    <option value="hard_block">hard_block</option>
                    <option value="unlimited">unlimited</option>
                  </select>
                </label>
                <label className="model-toggle">
                  <input
                    type="checkbox"
                    checked={userDraft.isActive}
                    onChange={(event) => setUserDraft((current) => ({ ...current, isActive: event.target.checked }))}
                  />
                  <span>启用账号</span>
                </label>
                {error ? <div className="floating-error">{error}</div> : null}
                <div className="template-editor-actions">
                  <button type="submit" className="submit-button" disabled={savingUser}>
                    {savingUser ? "保存中..." : "保存账号"}
                  </button>
                  {editingUserId !== null ? (
                    <button type="button" className="ghost-button" onClick={resetUserDraft}>
                      取消编辑
                    </button>
                  ) : null}
                </div>
              </form>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
