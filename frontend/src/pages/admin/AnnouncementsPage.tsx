import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
  api,
  type SiteAnnouncementCreatePayload,
  type SiteAnnouncementRecord,
} from "../../api";

type AnnouncementDraft = {
  title: string;
  body: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
  priority: number;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toDatetimeLocalValue(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("时间格式无效");
  }
  return date.toISOString();
}

function defaultWindow(): Pick<AnnouncementDraft, "starts_at" | "ends_at"> {
  const start = new Date();
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    starts_at: toDatetimeLocalValue(start),
    ends_at: toDatetimeLocalValue(end),
  };
}

const defaultDraft = (): AnnouncementDraft => ({
  title: "",
  body: "",
  is_active: true,
  priority: 0,
  ...defaultWindow(),
});

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusLabel(row: SiteAnnouncementRecord, now = Date.now()): string {
  if (!row.is_active) return "已停用";
  const start = new Date(row.starts_at).getTime();
  const end = new Date(row.ends_at).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "时间无效";
  if (now < start) return "未开始";
  if (now > end) return "已结束";
  return "展示中";
}

export type AnnouncementsPageProps = {
  announcements: SiteAnnouncementRecord[];
  error: string;
  onRefresh: () => void;
  onSetError: (error: string) => void;
};

export default function AnnouncementsPage({
  announcements,
  error,
  onRefresh,
  onSetError,
}: AnnouncementsPageProps) {
  const [selectedId, setSelectedId] = useState<number | null>(announcements[0]?.id ?? null);
  const [draft, setDraft] = useState<AnnouncementDraft>(defaultDraft);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selected = announcements.find((item) => item.id === selectedId) ?? null;
  const activeCount = useMemo(
    () => announcements.filter((item) => statusLabel(item) === "展示中").length,
    [announcements]
  );

  useEffect(() => {
    if (!selected) {
      if (selectedId === null || announcements.length === 0) {
        setDraft(defaultDraft());
      }
      return;
    }
    setDraft({
      title: selected.title,
      body: selected.body,
      is_active: selected.is_active,
      starts_at: toDatetimeLocalValue(selected.starts_at),
      ends_at: toDatetimeLocalValue(selected.ends_at),
      priority: selected.priority,
    });
  }, [announcements.length, selected, selectedId]);

  function handleCreateNew() {
    setSelectedId(null);
    setDraft(defaultDraft());
    onSetError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.body.trim()) {
      onSetError("请填写公告标题和正文。");
      return;
    }
    if (!draft.starts_at || !draft.ends_at) {
      onSetError("请设置开始与结束时间。");
      return;
    }

    setSaving(true);
    try {
      const startsAt = fromDatetimeLocalValue(draft.starts_at);
      const endsAt = fromDatetimeLocalValue(draft.ends_at);
      if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
        onSetError("结束时间必须晚于开始时间。");
        return;
      }

      const payload: SiteAnnouncementCreatePayload = {
        title: draft.title.trim(),
        body: draft.body.trim(),
        is_active: draft.is_active,
        starts_at: startsAt,
        ends_at: endsAt,
        priority: Number(draft.priority) || 0,
      };

      const next = selected
        ? await api.updateAdminAnnouncement(selected.id, payload)
        : await api.createAdminAnnouncement(payload);
      setSelectedId(next.id);
      onSetError("");
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "保存公告失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selected) {
      onSetError("请先选择要删除的公告。");
      return;
    }
    if (!confirm(`确认删除公告「${selected.title}」吗？`)) return;

    setDeleting(true);
    try {
      await api.deleteAdminAnnouncement(selected.id);
      setSelectedId(null);
      setDraft(defaultDraft());
      onSetError("");
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "删除公告失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1>公告管理</h1>
          <p>设置生成页中央弹窗公告的标题、正文与展示时间窗。仅登录用户可见。</p>
        </div>
        <div className="template-editor-actions">
          <button type="button" className="ghost-button" onClick={handleCreateNew}>
            新建公告
          </button>
          <button type="button" className="admin-primary-button" onClick={onRefresh}>
            刷新列表
          </button>
        </div>
      </header>

      <div className="admin-kpi-grid">
        <article className="admin-kpi-card admin-blue">
          <div>
            <span>公告总数</span>
            <strong>{announcements.length}</strong>
            <small>未删除的全部公告</small>
          </div>
          <i>AN</i>
        </article>
        <article className="admin-kpi-card admin-green">
          <div>
            <span>当前展示中</span>
            <strong>{activeCount}</strong>
            <small>生成页会弹优先级最高的一条</small>
          </div>
          <i>ON</i>
        </article>
      </div>

      <div className="admin-split-layout">
        <section className="admin-table-panel">
          <div className="agent-ops-section-head">
            <div>
              <h2>公告列表</h2>
              <p>左侧选择公告，右侧编辑内容与时间窗。</p>
            </div>
          </div>
          {announcements.length > 0 ? (
            <div className="template-list admin-template-list">
              {announcements.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={selected?.id === item.id ? "template-card is-active" : "template-card"}
                  onClick={() => setSelectedId(item.id)}
                >
                  <strong>{item.title}</strong>
                  <span>{item.body.slice(0, 80) || "（无正文）"}</span>
                  <small className="admin-template-meta">
                    {statusLabel(item)} · 优先级 {item.priority} · {item.is_active ? "启用" : "停用"}
                  </small>
                  <small className="admin-template-meta">
                    {formatDate(item.starts_at)} — {formatDate(item.ends_at)}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <div className="template-empty">还没有公告。新建一条并设置时间窗后，生成页会在有效期内弹出。</div>
          )}
        </section>

        <aside className="admin-detail-panel">
          <form className="admin-side-form" onSubmit={(event) => void handleSubmit(event)}>
            <div className="admin-detail-head">
              <h2>{selected ? "编辑公告" : "新建公告"}</h2>
              <p>{selected ? `最近更新 ${formatDate(selected.updated_at)}` : "保存后，登录用户进入生成页时会按时间窗展示。"}</p>
            </div>

            <div className="template-editor">
              <label className="composer-menu-field">
                <span>标题</span>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="例如：系统维护通知"
                />
              </label>

              <label className="composer-menu-field">
                <span>正文</span>
                <textarea
                  className="feedback-textarea"
                  value={draft.body}
                  onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                  placeholder="公告详细内容"
                />
              </label>

              <div className="template-editor-row">
                <label className="composer-menu-field">
                  <span>开始时间</span>
                  <input
                    type="datetime-local"
                    value={draft.starts_at}
                    onChange={(event) => setDraft((current) => ({ ...current, starts_at: event.target.value }))}
                  />
                </label>
                <label className="composer-menu-field">
                  <span>结束时间</span>
                  <input
                    type="datetime-local"
                    value={draft.ends_at}
                    onChange={(event) => setDraft((current) => ({ ...current, ends_at: event.target.value }))}
                  />
                </label>
              </div>

              <div className="template-editor-row">
                <label className="composer-menu-field">
                  <span>优先级</span>
                  <input
                    type="number"
                    value={draft.priority}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, priority: Number(event.target.value) || 0 }))
                    }
                  />
                </label>
                <label className="composer-menu-field">
                  <span>启用</span>
                  <label className="model-toggle">
                    <input
                      type="checkbox"
                      checked={draft.is_active}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, is_active: event.target.checked }))
                      }
                    />
                    <span>在时间窗内展示</span>
                  </label>
                </label>
              </div>
            </div>

            {error ? <div className="floating-error">{error}</div> : null}

            <div className="template-editor-actions">
              <button type="submit" className="submit-button" disabled={saving}>
                {saving ? "保存中..." : selected ? "保存修改" : "创建公告"}
              </button>
              {selected ? (
                <button type="button" className="ghost-button" disabled={deleting} onClick={() => void handleDelete()}>
                  {deleting ? "删除中..." : "删除公告"}
                </button>
              ) : null}
            </div>
          </form>
        </aside>
      </div>
    </section>
  );
}
