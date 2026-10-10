import { useState } from "react";
import { api, type FeedbackCredential } from "../../api";

export default function FeedbackCredentials() {
  const [rows, setRows] = useState<FeedbackCredential[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [draft, setDraft] = useState({ owner: "", device: "", skill: "", version: "", days: "30" });
  async function load(append = false) {
    setBusy(true);
    try {
      const result = await api.feedbackCredentials(append ? rows[rows.length - 1]?.id : undefined);
      setRows((current) => append ? [...current, ...result] : result);
      setMore(result.length === 50); setLoaded(true); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "加载失败"); }
    finally { setBusy(false); }
  }
  async function create() {
    setBusy(true); setToken("");
    try {
      const result = await api.createFeedbackCredential({ owner_id: Number(draft.owner), device_name: draft.device, allowed_skills: [{ skill_name: draft.skill, skill_version: draft.version }], expires_in_days: Number(draft.days) });
      setToken(result.token); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "创建失败"); }
    finally { setBusy(false); }
  }
  async function revoke(id: number) {
    setBusy(true);
    try { await api.revokeFeedbackCredential(id); setToken(""); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "撤销失败"); }
    finally { setBusy(false); }
  }
  return <details><summary>反馈采集凭证（管理员）</summary>
    <p>每个用户和设备单独发放，只能提交指定版本的反馈。默认每分钟 30 次、每日 500 次。密钥不要写入 skill 或仓库。</p>
    <button disabled={busy} onClick={() => void load()}>加载或刷新凭证</button>
    {error && <p role="alert">{error}</p>}
    {loaded && <>
      {([['owner', '用户 ID'], ['device', '设备名称'], ['skill', 'Skill 名称'], ['version', '版本'], ['days', '有效天数（1–90）']] as const).map(([key, label]) => <label key={key} className="composer-menu-field">{label}<input value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></label>)}
      <button disabled={busy || !draft.owner || !draft.device.trim() || !draft.skill.trim() || !draft.version.trim()} onClick={() => void create()}>创建采集凭证</button>
      {token && <div><p>此密钥仅在创建时返回。安全保存后关闭显示。</p><code style={{ overflowWrap: "anywhere" }}>{token}</code><button onClick={() => setToken("")}>关闭密钥显示</button></div>}
      {rows.map((row) => <article key={row.id}><p>#{row.id} · 用户 {row.owner_id} · {row.device_name} · {row.allowed_skills.map((skill) => `${skill.skill_name} ${skill.skill_version}`).join("、")} · 到期 {row.expires_at} · {row.is_active ? "启用" : "已撤销"}</p><button disabled={busy || !row.is_active} onClick={() => void revoke(row.id)}>撤销</button></article>)}
      {more && <button disabled={busy} onClick={() => void load(true)}>加载更多凭证</button>}
    </>}
  </details>;
}
