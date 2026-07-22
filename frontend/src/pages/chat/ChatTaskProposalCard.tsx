import { useEffect, useState } from "react";

import { api, type Task } from "../../api";
import type { ChatTaskProposal } from "../../lib/chat/qmdhSseParser";

export type ProposalDecision = {
  status: "pending" | "confirmed" | "cancelled" | "error" | "submitted" | "running" | "completed" | "failed";
  taskId?: number;
  errorMessage?: string;
  resultUrls?: string[];
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
  if (workflowKey === "video-generate") {
    return "视频任务";
  }
  return "生图任务";
}

function collectResultUrls(result: Record<string, unknown> | null | undefined): string[] {
  if (!result) return [];
  const urls: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== "string") return;
    const path = value.trim();
    if (path && !urls.includes(path)) urls.push(path);
  };
  for (const key of ["asset_storage_paths", "storage_paths"] as const) {
    const raw = result[key];
    if (Array.isArray(raw)) raw.forEach(push);
  }
  push(result.asset_storage_path);
  push(result.storage_path);
  return urls;
}

function failureMessage(task: Task): string {
  if (typeof task.result?.error === "string") return task.result.error;
  if (typeof task.result?.message === "string") return task.result.message;
  if (typeof task.result?.error_summary === "string") return task.result.error_summary;
  return "生成失败，请重试";
}

async function resolveCompletedUrls(task: Task, wantedType: "image" | "video"): Promise<string[]> {
  const fromResult = collectResultUrls(task.result);
  if (fromResult.length > 0) return fromResult;
  try {
    const assets = await api.assets();
    return assets
      .filter(
        (asset) =>
          asset.source_task_id === task.id &&
          (asset.asset_type === wantedType || asset.asset_type === "image"),
      )
      .map((asset) => asset.storage_path)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function parseTaskIdFromSummary(summary: string): number | null {
  const match = summary.match(/#(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function deriveInitialDecision(proposal: ChatTaskProposal): ProposalDecision {
  const taskId =
    typeof proposal.task_id === "number"
      ? proposal.task_id
      : parseTaskIdFromSummary(proposal.summary || "");
  const statusRaw = (proposal.status || "").trim();
  const taskStatusRaw = (proposal.task_status || "").trim();

  if (statusRaw === "pending_confirmation" && taskId == null) {
    return { status: "pending" };
  }

  if (taskStatusRaw === "completed" || statusRaw === "completed") {
    return {
      status: "completed",
      taskId: taskId ?? undefined,
      resultUrls: Array.isArray(proposal.result_urls) ? proposal.result_urls.map(String) : [],
    };
  }
  if (taskStatusRaw === "failed" || statusRaw === "failed") {
    return { status: "failed", taskId: taskId ?? undefined };
  }
  if (taskId != null || statusRaw === "submitted" || statusRaw === "running" || statusRaw === "queued") {
    return {
      status: taskStatusRaw === "running" || statusRaw === "running" ? "running" : "submitted",
      taskId: taskId ?? undefined,
      resultUrls: Array.isArray(proposal.result_urls) ? proposal.result_urls.map(String) : [],
    };
  }
  return { status: "pending" };
}

export default function ChatTaskProposalCard({
  proposal,
  conversationId,
  policyVersion,
  decision,
  onDecisionChange,
}: ChatTaskProposalCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const current = decision ?? deriveInitialDecision(proposal);

  useEffect(() => {
    const taskId =
      typeof proposal.task_id === "number"
        ? proposal.task_id
        : decision?.taskId ?? parseTaskIdFromSummary(proposal.summary || "");
    if (taskId == null) {
      return;
    }
    const terminal = decision?.status === "completed" || decision?.status === "failed" || decision?.status === "cancelled";
    if (terminal && (decision?.resultUrls?.length || decision?.status === "failed" || decision?.status === "cancelled")) {
      return;
    }

    // Ensure parent state knows this is already submitted (hides confirm buttons).
    if (!decision && (proposal.status === "submitted" || proposal.status === "running" || taskId != null)) {
      onDecisionChange(proposal.proposal_id, {
        status: "submitted",
        taskId,
        resultUrls: Array.isArray(proposal.result_urls) ? proposal.result_urls.map(String) : [],
      });
    }

    let cancelled = false;
    const wantedType = proposal.workflow_key === "video-generate" ? "video" : "image";

    void (async () => {
      for (let attempt = 0; attempt < 90; attempt += 1) {
        if (cancelled) return;
        if (attempt > 0) await sleep(2000);
        try {
          const latest = await api.getTask(taskId);
          if (cancelled) return;
          if (latest.status === "failed") {
            onDecisionChange(proposal.proposal_id, {
              status: "failed",
              taskId,
              errorMessage: failureMessage(latest),
            });
            return;
          }
          if (latest.status === "completed") {
            const urls = await resolveCompletedUrls(latest, wantedType);
            onDecisionChange(proposal.proposal_id, {
              status: "completed",
              taskId,
              resultUrls: urls,
            });
            return;
          }
          const nextStatus = latest.status === "pending" ? "submitted" : "running";
          if (decision?.status !== nextStatus || decision?.taskId !== taskId) {
            onDecisionChange(proposal.proposal_id, {
              status: nextStatus,
              taskId,
            });
          }
        } catch {
          // keep polling
        }
      }
      if (!cancelled) {
        onDecisionChange(proposal.proposal_id, {
          status: "failed",
          taskId,
          errorMessage: "等待结果超时，请到 Studio 查看任务状态",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll once per task id
  }, [proposal.proposal_id, proposal.task_id, proposal.workflow_key, proposal.summary, decision?.taskId]);

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
      onDecisionChange(proposal.proposal_id, { status: "submitted", taskId: task.id });
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
        : typeof proposal.payload.motion_prompt === "string"
          ? proposal.payload.motion_prompt
          : "";

  const resultUrls = current.resultUrls ?? [];
  const busy =
    current.status === "submitted" || current.status === "running" || current.status === "confirmed";

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
        {current.taskId != null ? (
          <div>
            <dt>任务</dt>
            <dd>#{current.taskId}</dd>
          </div>
        ) : null}
      </dl>

      {busy ? (
        <p className="chat-task-proposal-result is-muted">
          {current.status === "running" ? "正在生成…" : "已入队，等待生成…"}
        </p>
      ) : null}

      {current.status === "completed" && resultUrls.length > 0 ? (
        <div className="chat-task-proposal-results">
          {resultUrls.map((url) =>
            /\.(mp4|webm|mov)(\?|$)/i.test(url) ? (
              <video key={url} src={url} controls playsInline className="chat-task-proposal-media" />
            ) : (
              <button
                key={url}
                type="button"
                className="chat-task-proposal-media-btn"
                onClick={() => setLightboxUrl(url)}
              >
                <img src={url} alt="" className="chat-task-proposal-media" />
              </button>
            ),
          )}
        </div>
      ) : null}

      {current.status === "completed" && resultUrls.length === 0 ? (
        <p className="chat-task-proposal-result is-muted">
          任务 #{current.taskId} 已完成，但未返回可预览资源。请到 Studio 查看。
        </p>
      ) : null}

      {current.status === "cancelled" ? (
        <p className="chat-task-proposal-result is-muted">已取消，未提交任务。</p>
      ) : null}
      {current.status === "error" || current.status === "failed" ? (
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

      {lightboxUrl ? (
        <div className="media-lightbox" role="dialog" aria-modal="true" aria-label="生成图预览" onClick={() => setLightboxUrl(null)}>
          <div className="media-lightbox-surface" onClick={(event) => event.stopPropagation()}>
            <header className="media-lightbox-head">
              <span className="media-lightbox-title">{proposal.title}</span>
              <button type="button" className="media-lightbox-close" aria-label="关闭" onClick={() => setLightboxUrl(null)}>
                ×
              </button>
            </header>
            <div className="media-lightbox-body">
              <img src={lightboxUrl} alt="" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
