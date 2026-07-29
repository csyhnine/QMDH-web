import { useState } from "react";

import MediaCompareSlider from "./MediaCompareSlider";

export type MediaComparePanelProps = {
  leftSrc: string;
  rightSrcs: string[];
  leftLabel?: string;
  rightLabel?: string;
  className?: string;
};

/**
 * Compare slider with optional original-image picker when multiple sources exist.
 */
export default function MediaComparePanel({
  leftSrc,
  rightSrcs,
  leftLabel = "生成图",
  rightLabel = "原图",
  className = "",
}: MediaComparePanelProps) {
  const originals = rightSrcs.map((src) => src.trim()).filter(Boolean);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectionKey = `${leftSrc}::${originals.join("|")}`;
  const [boundKey, setBoundKey] = useState(selectionKey);
  if (boundKey !== selectionKey) {
    setBoundKey(selectionKey);
    setSelectedIndex(0);
  }

  if (originals.length === 0) return null;

  const safeIndex = Math.min(selectedIndex, originals.length - 1);
  const rightSrc = originals[safeIndex]!;
  const multi = originals.length > 1;
  const activeRightLabel = multi ? `${rightLabel} ${safeIndex + 1}/${originals.length}` : rightLabel;

  return (
    <div className={`media-compare-panel${className ? ` ${className}` : ""}`}>
      <MediaCompareSlider
        leftSrc={leftSrc}
        rightSrc={rightSrc}
        leftLabel={leftLabel}
        rightLabel={activeRightLabel}
      />
      {multi ? (
        <div className="media-compare-originals" role="group" aria-label="选择对比原图">
          <div className="media-compare-originals-head">
            <span className="media-compare-originals-label">选择对比原图</span>
            <span className="media-compare-originals-meta">
              {safeIndex + 1} / {originals.length}
            </span>
          </div>
          <div className="media-compare-originals-list">
            {originals.map((src, index) => {
              const active = index === safeIndex;
              return (
                <button
                  key={`${src}:${index}`}
                  type="button"
                  className={`media-compare-original-btn${active ? " is-active" : ""}`}
                  aria-pressed={active}
                  aria-label={`原图 ${index + 1}`}
                  title={`原图 ${index + 1}`}
                  onClick={() => setSelectedIndex(index)}
                >
                  <span className="media-compare-original-thumb">
                    <img src={src} alt="" draggable={false} />
                  </span>
                  <span className="media-compare-original-caption">原图 {index + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
