import { useEffect, useState } from "react";

import { api, type SiteAnnouncementRecord } from "../../api";

const DISMISS_KEY_PREFIX = "qmdh-announcement-dismissed:";

function dismissKey(id: number): string {
  return `${DISMISS_KEY_PREFIX}${id}`;
}

function isDismissed(id: number): boolean {
  try {
    return window.localStorage.getItem(dismissKey(id)) === "1";
  } catch {
    return false;
  }
}

function markDismissed(id: number) {
  try {
    window.localStorage.setItem(dismissKey(id), "1");
  } catch {
    // ignore quota / private mode
  }
}

export default function SiteAnnouncementModal() {
  const [announcement, setAnnouncement] = useState<SiteAnnouncementRecord | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .activeAnnouncement()
      .then((row) => {
        if (cancelled || !row || isDismissed(row.id)) return;
        setAnnouncement(row);
        setOpen(true);
      })
      .catch(() => {
        // Announcement is non-blocking for generate page.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!open || !announcement) return null;

  function handleDismiss() {
    if (announcement) markDismissed(announcement.id);
    setOpen(false);
  }

  return (
    <div className="media-lightbox qmdh-site-announcement-lightbox" onClick={handleDismiss}>
      <div
        className="media-lightbox-surface qmdh-site-announcement-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qmdh-site-announcement-title"
      >
        <header className="media-lightbox-head">
          <h2 id="qmdh-site-announcement-title" className="media-lightbox-title">
            {announcement.title}
          </h2>
          <button
            type="button"
            className="media-lightbox-close"
            aria-label="关闭"
            onClick={handleDismiss}
          >
            ×
          </button>
        </header>
        <div className="media-lightbox-body qmdh-site-announcement-body">
          <p className="qmdh-site-announcement-text">{announcement.body}</p>
        </div>
        <footer className="media-lightbox-foot">
          <button type="button" className="admin-primary-button" onClick={handleDismiss}>
            知道了
          </button>
        </footer>
      </div>
    </div>
  );
}
