import { type FormEvent, useState } from "react";

import { api, type ManagedUser, type UserCreatePayload } from "../../api";

type UserDraft = {
  name: string;
  password: string;
  displayName: string;
  role: string;
  monthlyQuota: string;
  isActive: boolean;
};

const defaultUserDraft: UserDraft = {
  name: "",
  password: "",
  displayName: "",
  role: "designer",
  monthlyQuota: "200",
  isActive: true,
};

function formatDate(value: string | null): string {
  if (!value) return "未登录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toUserPayload(draft: UserDraft): UserCreatePayload {
  return {
    name: draft.name.trim(),
    password: draft.password,
    display_name: draft.displayName.trim(),
    role: draft.role,
    monthly_quota: draft.monthlyQuota.trim() ? Number(draft.monthlyQuota) : null,
    is_active: draft.isActive,
  };
}

function toUserDraft(user: ManagedUser): UserDraft {
  return {
    name: user.name,
    password: "",
    displayName: user.display_name,
    role: user.role,
    monthlyQuota: user.monthly_quota === null ? "" : String(user.monthly_quota),
    isActive: user.is_active,
  };
}

export type UsersPageProps = {
  users: ManagedUser[];
  userCanManageUsers: boolean;
  error: string;
  onRefresh: () => void;
  onSetError: (error: string) => void;
};

export default function UsersPage({ users, userCanManageUsers, error, onRefresh, onSetError }: UsersPageProps) {
  const [userDraft, setUserDraft] = useState<UserDraft>(defaultUserDraft);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [savingUser, setSavingUser] = useState(false);

  const activeUsers = users.filter((user) => user.is_active);
  const disabledUsers = users.filter((user) => !user.is_active);
  const adminUsers = users.filter((user) => user.role === "admin");

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
      onSetError("请填写用户名和初始密码");
      return;
    }

    setSavingUser(true);
    try {
      if (editingUserId === null) {
        await api.createUser(payload);
      } else {
        await api.updateUser(editingUserId, {
          display_name: payload.display_name,
          role: payload.role,
          monthly_quota: payload.monthly_quota,
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

  return (
    <section className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1>账号管理</h1>
          <p>这里只维护管理员与设计师账号的角色、状态、密码和额度。</p>
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
              <i>♙</i>
            </article>
            <article className="admin-kpi-card admin-green">
              <span>活跃账号</span>
              <strong>{activeUsers.length}</strong>
              <small>可正常登录</small>
              <i>●</i>
            </article>
            <article className="admin-kpi-card admin-gray">
              <span>已禁用账号</span>
              <strong>{disabledUsers.length}</strong>
              <small>停用或不可登录</small>
              <i>○</i>
            </article>
            <article className="admin-kpi-card admin-purple">
              <span>管理员账号</span>
              <strong>{adminUsers.length}</strong>
              <small>admin</small>
              <i>◆</i>
            </article>
          </div>

          <div className="admin-split-layout">
            <section className="admin-table-panel">
              <div className="admin-toolbar">
                <select aria-label="账号状态筛选">
                  <option>全部状态</option>
                  <option>活跃</option>
                  <option>禁用</option>
                </select>
                <select aria-label="账号角色筛选">
                  <option>全部角色</option>
                  <option>designer</option>
                  <option>admin</option>
                </select>
                <input aria-label="搜索账号" placeholder="搜索账号、姓名或角色" />
                <button type="button" onClick={onRefresh}>
                  刷新
                </button>
              </div>
              <div className="admin-data-table admin-user-table">
                <div className="admin-table-row admin-table-head">
                  <span>账号</span>
                  <span>角色</span>
                  <span>额度</span>
                  <span>状态</span>
                  <span>最后登录</span>
                  <span>操作</span>
                </div>
                {users.map((user) => (
                  <div key={user.id} className="admin-table-row">
                    <span>
                      <strong>{user.display_name || user.name}</strong>
                      <small>@{user.name}</small>
                    </span>
                    <span>
                      <em className="admin-tag">{user.role}</em>
                    </span>
                    <span>{user.monthly_quota === null ? "不限额" : `${user.monthly_quota} / 月`}</span>
                    <span>
                      <em className={`status-pill ${user.is_active ? "status-completed" : "status-failed"}`}>
                        {user.is_active ? "活跃" : "禁用"}
                      </em>
                    </span>
                    <span>{formatDate(user.last_login_at)}</span>
                    <span className="admin-row-actions">
                      <button type="button" onClick={() => handleEditUser(user)}>
                        编辑
                      </button>
                      <button type="button" onClick={() => handleDeactivateUser(user.id)} disabled={!user.is_active}>
                        停用
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <aside className="admin-detail-panel">
              <form className="admin-side-form" onSubmit={handleSaveUser}>
                <div className="admin-detail-head">
                  <h2>{editingUserId === null ? "创建账号" : "编辑账号"}</h2>
                  <p>账号管理页不再暴露项目容器分配。这里只维护角色、密码、状态和额度。</p>
                </div>
                <label className="composer-menu-field">
                  <span>用户名</span>
                  <input
                    value={userDraft.name}
                    disabled={editingUserId !== null}
                    onChange={(event) => setUserDraft((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <label className="composer-menu-field">
                  <span>显示名</span>
                  <input
                    value={userDraft.displayName}
                    onChange={(event) => setUserDraft((current) => ({ ...current, displayName: event.target.value }))}
                  />
                </label>
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
