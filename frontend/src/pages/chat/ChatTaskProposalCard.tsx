import { useState } from "react";

import { api } from "../../api";
import type { ChatTaskProposal } from "../../lib/chat/qmdhSseParser";

export type ProposalDecision = {
  status: "pending" | "confirmed" | "cancelled" | "error";
  taskId?: number;
  errorMessage?: string;
};

type ChatTaskProposalCardProps = {
  proposal: ChatTaskProposal;
  conversationId: number | null;
  policyVersion?: string | null;
  decision?: ProposalDecision;
  onDecisionChange: (proposalId: string, decision: ProposalDecision) => void;
};

function workflowLabel(workflowKey: string) {
  if (workflowKey === "image-edit") {
    return "改图任务";
  }
  return "生图任务";
}

export default function ChatTaskProposalCard({
  proposal,
  conversationId,
  policyVersion,
  decision,
  onDecisionChange,
}: ChatTaskProposalCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const current = decision ?? { status: "pending" as const };

  async function handleConfirm() {
    if (conversationId == null || submitting || current.status !== "pending") {
      return;
    }
    setSubmitting(true);
    try {
      const task = await api.confirmChatAgentTask(conversationId, {
        proposal_id: proposal.proposal_id,
        workflow_key: proposal.workflow_key,
        title: proposal.title,
        project_code: proposal.project_code,
        requested_provider: proposal.requested_provider,
        provider_display_name: proposal.provider_display_name,
        classification: proposal.classification,
        payload: proposal.payload,
        summary: proposal.summary,
        policy_version: policyVersion ?? undefined,
      });
      onDecisionChange(proposal.proposal_id, { status: "confirmed", taskId: task.id });
    } catch (error) {
      onDecisionChange(proposal.proposal_id, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : "提交失败",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    if (current.status !== "pending") {
      return;
    }
    onDecisionChange(proposal.proposal_id, { status: "cancelled" });
  }

  const promptText =
    typeof proposal.payload.prompt === "string"
      ? proposal.payload.prompt
      : typeof proposal.payload.edit_prompt === "string"
        ? proposal.payload.edit_prompt
        : "";

  return (
    <div className={`chat-task-proposal ${current.status !== "pending" ? "is-settled" : ""}`}>
      <div className="chat-task-proposal-header">
        <span className="chat-task-proposal-badge">{workflowLabel(proposal.workflow_key)}</span>
        <strong>{proposal.title}</strong>
      </div>
      <p className="chat-task-proposal-summary">{proposal.summary}</p>
      {promptText ? <p className="chat-task-proposal-prompt">{promptText}</p> : null}
      <dl className="chat-task-proposal-meta">
        <div>
          <dt>模型</dt>
          <dd>{proposal.provider_display_name || proposal.requested_provider}</dd>
        </div>
        <div>
          <dt>项目</dt>
          <dd>{proposal.project_code}</dd>
        </div>
      </dl>
      {current.status === "confirmed" ? (
        <p className="chat-task-proposal-result is-success">
          已提交任务 #{current.taskId}，可在 Studio 历史记录查看进度。
        </p>
      ) : null}
      {current.status === "cancelled" ? (
        <p className="chat-task-proposal-result is-muted">已取消，未提交任务。</p>
      ) : null}
      {current.status === "error" ? (
        <p className="chat-task-proposal-result is-error">{current.errorMessage || "提交失败"}</p>
      ) : null}
      {current.status === "pending" ? (
        <div className="chat-task-proposal-actions">
          <button type="button" className="chat-task-proposal-confirm" disabled={submitting} onClick={() => void handleConfirm()}>
            {submitting ? "提交中…" : "确认提交"}
          </button>
          <button type="button" className="chat-task-proposal-cancel" disabled={submitting} onClick={handleCancel}>
            取消
          </button>
        </div>
      ) : null}
    </div>
  );
}
