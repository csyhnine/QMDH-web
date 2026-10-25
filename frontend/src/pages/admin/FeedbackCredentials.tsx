import { useEffect, useState } from "react";
import { api, type FeedbackCredential, type FeedbackPublicGrant, type ManagedUser } from "../../api";

export default function FeedbackCredentials() {
  const [rows, setRows] = useState<FeedbackCredential[]>([]);
  const [grants, setGrants] = useState<FeedbackPublicGrant[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [more, setMore] = useState(false);
  const [moreGrants, setMoreGrants] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [draft, setDraft] = useState({ owner: "", device: "", skill: "", version: "", days: "30" });
  const [publication, setPublication] = useState({ skill_name: "" });
  const [registeredId, setRegisteredId] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  async function load() {
    setBusy(true);
    try {
      const [credentials, publications, accounts] = await Promise.all([
        api.feedbackCredentials(),
        api.feedbackPublicGrants(),
        api.users(),
      ]);
      setRows(credentials);
      setGrants(publications);
      setUsers(accounts.filter((user) => user.is_active));
      setMore(credentials.length === 50);
      setMoreGrants(publications.length === 50);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function nextPage(kind: "credentials" | "grants") {
    setBusy(true);
    try {
      if (kind === "credentials") {
        const next = await api.feedbackCredentials(rows[rows.length - 1]?.id);
        setRows((current) => [...current, ...next]);
        setMore(next.length === 50);
      } else {
        const next = await api.feedbackPublicGrants(grants[grants.length - 1]?.id);
        setGrants((current) => [...current, ...next]);
        setMoreGrants(next.length === 50);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    setBusy(true);
    setToken("");
    try {
      const result = await api.createFeedbackCredential({
        owner_id: Number(draft.owner),
        device_name: draft.device,
        allowed_skills: [{ skill_name: draft.skill, skill_version: draft.version }],
        expires_in_days: Number(draft.days),
      });
      setToken(result.token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: number) {
    setBusy(true);
    try {
      await api.revokeFeedbackCredential(id);
      setToken("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "撤销失败");
    } finally {
      setBusy(false);
    }
  }
  async function register() {
    setBusy(true);
    try {
      const result = await api.registerFeedbackSkill({ ...publication, is_active: true });
      setRegisteredId(result.skill_id);
      setPublication({ skill_name: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登记失败");
    } finally {
      setBusy(false);
    }
  }
  async function publish(grant: FeedbackPublicGrant, active = grant.is_active) {
    setBusy(true);
    try {
      await api.setFeedbackPublicGrant(grant.skill_id, {
        skill_name: active !== grant.is_active ? grant.skill_name : (names[grant.skill_id] ?? grant.skill_name),
        is_active: active,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "设置失败");
    } finally {
      setBusy(false);
    }
  }
  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setError("");
    } catch {
      setError("复制失败，请选中公开 ID 手动复制。");
    }
  }
  return (
    <section className="feedback-access-workspace">
      <div className="feedback-workspace-head">
        <div>
          <h2>接入设置</h2>
          <p>登记 Skill 的固定 ID，管理反馈采集凭证。</p>
        </div>
        <button disabled={busy} onClick={() => void load()}>
          刷新接入设置
        </button>
      </div>
      {error && (
        <p className="feedback-inline-error" role="alert">
          {error}
        </p>
      )}
      <section className="feedback-access-card">
        <span className="feedback-eyebrow">公开接入</span>
        <h3>外部 skill 自助申请临时凭证</h3>
        <p>每个 Skill 登记一次，改名和升级沿用原 ID。</p>
        <details className="feedback-disclosure">
          <summary>接入说明与使用规则</summary>
          <p>
            登记一次，获得固定的公开 skill_id。将 ID 交给开发者写入 skill，同名 skill 用不同 ID；改名或升级版本时保持 ID
            不变，无需重新登记。
          </p>
          <p>无需公司账号，skill 用 ID 为每次任务申请一小时、最多 10 次提交的凭证。停用 ID 会撤销其已有临时凭证。</p>
          <p>
            申请接口：<code>POST https://cityusbdisk.cn/api/v1/feedback/skills/sessions</code>
          </p>
          <p>
            申请填写 skill_id、实际 skill_name、skill_version、correlation_id、platform 和 device_name；返回的 token
            只用于本次任务的反馈提交。ID 可以随 skill 分发，凭证不要写入 skill 或仓库。
          </p>
          <p>
            匿名会话不证明用户身份；所有问题先核实，正常事件只统计。申请与提交均有共享限额，代理后的用户可能共用额度。
          </p>
        </details>
        <div className="feedback-register-row">
          <label className="composer-menu-field">
            登记 Skill 名称
            <input value={publication.skill_name} onChange={(e) => setPublication({ skill_name: e.target.value })} />
          </label>
          <button disabled={busy || !publication.skill_name.trim()} onClick={() => void register()}>
            登记 Skill 并生成固定 ID
          </button>
        </div>
        {registeredId && (
          <p>
            新登记的公开 ID：<code>{registeredId}</code>{" "}
            <button onClick={() => void copyId(registeredId)}>复制 ID</button>
          </p>
        )}
        <h4>已登记的 Skill</h4>
        {!grants.length && <p className="feedback-muted">尚未登记 Skill，或列表正在加载。</p>}
        {grants.map((grant) => (
          <article className="feedback-grant-card" key={grant.id}>
            <details>
              <summary>
                <strong>{grant.skill_name}</strong>
                <span className={`feedback-badge ${grant.is_active ? "is-accepted" : "is-rejected"}`}>
                  {grant.is_active ? "开放自助申请" : "已停用"}
                </span>
              </summary>
              <p>
                <code>{grant.skill_id}</code> <button onClick={() => void copyId(grant.skill_id)}>复制 ID</button>
              </p>
              <label>
                显示名称
                <input
                  value={names[grant.skill_id] ?? grant.skill_name}
                  onChange={(e) => setNames({ ...names, [grant.skill_id]: e.target.value })}
                />
              </label>
              <button
                disabled={busy || !(names[grant.skill_id] ?? grant.skill_name).trim()}
                onClick={() => void publish(grant)}
              >
                保存名称
              </button>
              <button disabled={busy} onClick={() => void publish(grant, !grant.is_active)}>
                {grant.is_active ? "停用并撤销临时凭证" : "重新开放"}
              </button>
            </details>
          </article>
        ))}
        {moreGrants && (
          <button disabled={busy} onClick={() => void nextPage("grants")}>
            加载更多登记 Skill
          </button>
        )}
      </section>
      <section className="feedback-access-card">
        <span className="feedback-eyebrow">公司账号</span>
        <h3>公司用户凭证</h3>
        <p>按用户、设备和 Skill 版本发放与撤销采集权限。</p>
        <details className="feedback-disclosure">
          <summary>创建公司用户凭证</summary>
          <div className="feedback-field-grid">
            <p>每个用户和设备单独发放，仅能提交指定版本的反馈。默认每分钟 30 次、每日 500 次。</p>
            <label className="composer-menu-field">
              公司用户
              <select value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })}>
                <option value="">选择用户</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.display_name || user.name}（{user.name}）
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ["device", "设备名称"],
                ["skill", "Skill 名称"],
                ["version", "版本"],
                ["days", "有效天数（1–90）"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="composer-menu-field">
                {label}
                <input value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
              </label>
            ))}
          </div>
          <button
            className="feedback-action-primary"
            disabled={busy || !draft.owner || !draft.device.trim() || !draft.skill.trim() || !draft.version.trim()}
            onClick={() => void create()}
          >
            创建公司用户凭证
          </button>
        </details>
        {token && (
          <div>
            <p>此密钥仅在创建时返回。安全保存后关闭显示。</p>
            <code style={{ overflowWrap: "anywhere" }}>{token}</code>
            <button onClick={() => setToken("")}>关闭密钥显示</button>
          </div>
        )}
        <details className="feedback-disclosure">
          <summary>查看与撤销已发凭证</summary>
          {rows.map((row) => (
            <article key={row.id}>
              <p>
                #{row.id} · {row.owner_id === null ? "外部临时会话（身份未核实）" : `公司用户 ${row.owner_id}`} ·{" "}
                {row.device_name} ·{" "}
                {row.allowed_skills.map((skill) => `${skill.skill_name} ${skill.skill_version}`).join("、")} · 到期{" "}
                {row.expires_at} · {row.is_active ? "启用" : "已撤销"}
              </p>
              <button disabled={busy || !row.is_active} onClick={() => void revoke(row.id)}>
                撤销
              </button>
            </article>
          ))}
          {more && (
            <button disabled={busy} onClick={() => void nextPage("credentials")}>
              加载更多凭证
            </button>
          )}
        </details>
      </section>
    </section>
  );
}
