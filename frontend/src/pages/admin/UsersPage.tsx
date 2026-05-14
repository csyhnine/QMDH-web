import { type FormEvent, useState } from "react";
import { api, type ManagedUser, type UserCreatePayload } from "../../api";

/* ─── Types ─── */

type UserDraft = {
  name: string;
  password: string;
  displayName: string;
  role: string;
  projectCodes: string;
  monthlyQuota: string;
  isActive: boolean;
};

const defaultUserDraft: UserDraft = {
  name: "",
  password: "",
  displayName: "",
  role: "designer",
  projectCodes: "QMDH-001",
  monthlyQuota: "200",
  isActive: true,
};

/* ─── Helpers ─── */

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function parseProjectCodes(value: string): string[] {
  return value
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
}

function toUserPayload(draft: UserDraft): UserCreatePayload {
  return {
    name: draft.name.trim(),
    password: draft.password,
    display_name: draft.displayName.trim(),
    role: draft.role,
    project_codes: parseProjectCodes(draft.projectCodes),
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
    projectCodes: user.project_codes.join(", "),
    monthlyQuota: user.monthly_quota === null ? "" : String(user.monthly_quota),
    isActive: user.is_active,
  };
}

/* ─── Props ─── */

export type UsersPageProps = {
  users: ManagedUser[];
  userCanManageUsers: boolean;
  error: string;
  onRefresh: () => void;
  onSetError: (error: string) => void;
};

/* ─── Component ─── */

export default function UsersPage({ users, userCanManageUsers, error, onRefresh, onSetError }: UsersPageProps) {
  const [userDraft, setUserDraft] = useState<UserDraft>(defaultUserDraft);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [savingUser, setSavingUser] = useState(false);

  const activeUsers = users.filter((u) => u.is_active);
  const disabledUsers = users.filter((u) => !u.is_active);
  const adminUsers = users.filter((u) => ["owner", "admin"].includes(u.role));

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
          project_codes: payload.project_codes,
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
      onSetError(err instanceof Error ? err.message : "保存用户失败");
    } finally {
      setSavingUser(false);
    }
  }

  async function handleDeactivateUser(userId: number) {
    try {
      await api.deleteUser(userId);
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "停用用户失败");
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1>账号管理</h1>
          <p>管理团队成员账号、角色权限及状态</p>
        </div>
        {userCanManageUsers ? (
          <button type="button" className="admin-primary-button" onClick={resetUserDraft}>+ 创建账号</button>
        ) : null}
      </header>

      {!userCanManageUsers ? (
        <div className="floating-error">当前账号没有用户管理权限。</div>
      ) : (
        <>
          <div className="admin-kpi-grid">
            <article className="admin-kpi-card admin-blue"><span>账号总数</span><strong>{users.length}</strong><small>全部后台账号</small><i>♙</i></article>
            <article className="admin-kpi-card admin-green"><span>活跃账号</span><strong>{activeUsers.length}</strong><small>可正常登录</small><i>●</i></article>
            <article className="admin-kpi-card admin-gray"><span>已禁用账号</span><strong>{disabledUsers.length}</strong><small>停用或不可登录</small><i>○</i></article>
            <article className="admin-kpi-card admin-purple"><span>管理员账号</span><strong>{adminUsers.length}</strong><small>owner / admin</small><i>◆</i></article>
          </div>

          <div className="admin-split-layout">
            <section className="admin-table-panel">
              <div className="admin-toolbar">
                <select aria-label="账号状态筛选"><option>全部状态</option><option>活跃</option><option>禁用</option></select>
                <select aria-label="账号角色筛选"><option>全部角色</option><option>designer</option><option>ops</option><option>admin</option><option>owner</option></select>
                <input aria-label="搜索账号" placeholder="搜索账号、姓名或角色" />
                <button type="button" onClick={onRefresh}>刷新</button>
              </div>
              <div className="admin-data-table admin-user-table">
                <div className="admin-table-row admin-table-head">
                  <span>账号</span><span>角色</span><span>项目权限</span><span>额度</span><span>状态</span><span>最后登录</span><span>操作</span>
                </div>
                {users.map((user) => (
                  <div key={user.id} className="admin-table-row">
                    <span><strong>{user.display_name || user.name}</strong><small>@{user.name}</small></span>
                    <span><em className="admin-tag">{user.role}</em></span>
                    <span>{user.project_codes.join(", ")}</span>
                    <span>{user.monthly_quota === null ? "不限额" : `${user.monthly_quota} / 月`}</span>
                    <span><em className={`status-pill ${user.is_active ? "status-completed" : "status-failed"}`}>{user.is_active ? "活跃" : "禁用"}</em></span>
                    <span>{user.last_login_at ? formatDate(user.last_login_at) : "未登录"}</span>
                    <span className="admin-row-actions">
                      <button type="button" onClick={() => handleEditUser(user)}>编辑</button>
                      <button type="button" onClick={() => handleDeactivateUser(user.id)} disabled={!user.is_active}>停用</button>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <aside className="admin-detail-panel">
              <form className="admin-side-form" onSubmit={handleSaveUser}>
                <div className="admin-detail-head">
                  <h2>{editingUserId === null ? "创建账号" : "编辑账号"}</h2>
                  <p>项目权限用英文逗号分隔，使用 * 可访问全部项目。</p>
                </div>
                <label className="composer-menu-field"><span>用户名</span><input value={userDraft.name} disabled={editingUserId !== null} onChange={(e) => setUserDraft((c) => ({ ...c, name: e.target.value }))} /></label>
                <label className="composer-menu-field"><span>显示名</span><input value={userDraft.displayName} onChange={(e) => setUserDraft((c) => ({ ...c, displayName: e.target.value }))} /></label>
                <label className="composer-menu-field"><span>角色</span><select value={userDraft.role} onChange={(e) => setUserDraft((c) => ({ ...c, role: e.target.value }))}><option value="designer">designer</option><option value="ops">ops</option><option value="admin">admin</option><option value="owner">owner</option></select></label>
                <label className="composer-menu-field"><span>{editingUserId === null ? "初始密码" : "重置密码"}</span><input type="password" value={userDraft.password} onChange={(e) => setUserDraft((c) => ({ ...c, password: e.target.value }))} /></label>
                <label className="composer-menu-field"><span>项目权限</span><input value={userDraft.projectCodes} onChange={(e) => setUserDraft((c) => ({ ...c, projectCodes: e.target.value }))} placeholder="QMDH-001 或 *" /></label>
                <label className="composer-menu-field"><span>月度额度</span><input type="number" min="0" step="0.01" value={userDraft.monthlyQuota} onChange={(e) => setUserDraft((c) => ({ ...c, monthlyQuota: e.target.value }))} placeholder="留空表示不限额" /></label>
                <label className="model-toggle"><input type="checkbox" checked={userDraft.isActive} onChange={(e) => setUserDraft((c) => ({ ...c, isActive: e.target.checked }))} /><span>启用账号</span></label>
                {error ? <div className="floating-error">{error}</div> : null}
                <div className="template-editor-actions">
                  <button type="submit" className="submit-button" disabled={savingUser}>{savingUser ? "保存中..." : "保存账号"}</button>
                  {editingUserId !== null ? <button type="button" className="ghost-button" onClick={resetUserDraft}>取消编辑</button> : null}
                </div>
              </form>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
