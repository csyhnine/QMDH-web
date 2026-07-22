import type { ChatAgentPolicy } from "./chatAgentConstants";
import { iconForToolKey } from "./chatAgentConstants";

type ChatAgentCapabilitiesDrawerProps = {
  open: boolean;
  policy: ChatAgentPolicy | null;
  onClose: () => void;
};

const LAYER_LABELS: Record<string, string> = {
  global: "全局发布",
  group: "用户组",
  user: "个人",
};

export default function ChatAgentCapabilitiesDrawer({ open, policy, onClose }: ChatAgentCapabilitiesDrawerProps) {
  if (!open || !policy) {
    return null;
  }

  return (
    <div className="chat-agent-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="chat-agent-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-agent-drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="chat-agent-drawer-head">
          <div>
          <h2 id="chat-agent-drawer-title">我的助手能力</h2>
          <p>以下能力由管理员在后台统一配置；设计师无需也无法自行安装 skill 或 tool。</p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
        </header>

        <section className="chat-agent-drawer-section">
          <h3>Web Chat 策略版本</h3>
          <div className="chat-agent-panel-badges">
            <span className="chat-agent-badge">{policy.environment === "prod" ? "生产" : "测试"}</span>
            <span className="chat-agent-badge is-muted">release: {policy.policy_version}</span>
            {policy.release_display_name ? (
              <span className="chat-agent-badge">{policy.release_display_name}</span>
            ) : (
              <span className="chat-agent-badge is-muted">代码默认能力包</span>
            )}
          </div>
          <p className="chat-agent-drawer-highlight">
            以下是网页 Chat 助手当前可用的工具（由管理员在「助手能力 → Web Chat 策略」配置）。本机 OpenClaw Skill 与此无关。
          </p>
          {policy.personalization_summary ? (
            <p className="chat-agent-drawer-highlight">{policy.personalization_summary}</p>
          ) : null}
          {policy.user_group_name ? <p className="chat-agent-scope-note">所属用户组：{policy.user_group_name}</p> : null}
        </section>

        {(policy.assigned_agents?.length ?? 0) > 0 ? (
          <section className="chat-agent-drawer-section">
            <h3>我的 Agent 团队（{policy.assigned_agents?.length ?? 0}）</h3>
            <div className="chat-agent-capability-grid">
              {(policy.assigned_agents ?? []).map((agent) => (
                <article key={agent.key} className="chat-agent-capability-card">
                  <span className="chat-tool-call-icon">{agent.is_primary ? "◎" : "○"}</span>
                  <div>
                    <strong>{agent.display_name}</strong>
                    <p>
                      {agent.role}
                      {agent.is_primary ? " · 主协调 Agent" : ""}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="chat-agent-drawer-section">
          <h3>配置来源</h3>
          <div className="chat-agent-layer-list">
            {policy.policy_layers.map((layer) => (
              <article key={`${layer.layer}-${layer.detail ?? layer.label}`} className="chat-agent-layer-card">
                <strong>{layer.layer === "global" ? "管理员统一配置" : LAYER_LABELS[layer.layer] || layer.label}</strong>
                {layer.detail ? <span>{layer.detail}</span> : null}
                {layer.prompt_overlay ? <pre>{layer.prompt_overlay}</pre> : null}
                {layer.disabled_tool_keys.length > 0 ? (
                  <small>禁用：{layer.disabled_tool_keys.join("、")}</small>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="chat-agent-drawer-section">
          <h3>可用工具（{policy.enabled_tools.length}）</h3>
          <div className="chat-agent-capability-grid">
            {policy.enabled_tools.map((tool) => (
              <article key={tool.key} className="chat-agent-capability-card">
                <span className="chat-tool-call-icon">{iconForToolKey(tool.key)}</span>
                <div>
                  <strong>{tool.label}</strong>
                  <p>{tool.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {policy.disabled_tools.length > 0 ? (
          <section className="chat-agent-drawer-section">
            <h3>已禁用工具（{policy.disabled_tools.length}）</h3>
            <div className="chat-agent-capability-grid is-disabled">
              {policy.disabled_tools.map((tool) => (
                <article key={tool.key} className="chat-agent-capability-card is-disabled">
                  <span className="chat-tool-call-icon">{iconForToolKey(tool.key)}</span>
                  <div>
                    <strong>{tool.label}</strong>
                    <p>{tool.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="chat-agent-drawer-section">
          <h3>数据范围</h3>
          <p className="chat-agent-scope-note">{policy.data_scope_note}</p>
        </section>
      </aside>
    </div>
  );
}
