import type { ComposerMenuKey, StudioFormState } from "./studioTypes";

type StudioComposerCountMenuProps = {
  activeComposerMenu: ComposerMenuKey;
  studioForm: StudioFormState;
  onImageCountSelect: (count: number) => void;
  onToggleComposerMenu: (menu: Exclude<ComposerMenuKey, null>) => void;
};

export default function StudioComposerCountMenu({
  activeComposerMenu,
  studioForm,
  onImageCountSelect,
  onToggleComposerMenu,
}: StudioComposerCountMenuProps) {
  return (
    <div className="composer-menu">
      <button
        type="button"
        className={activeComposerMenu === "count" ? "composer-menu-trigger is-open" : "composer-menu-trigger"}
        onClick={() => onToggleComposerMenu("count")}
      >
        {studioForm.imageCount} 张
      </button>
      {activeComposerMenu === "count" ? (
        <div className="composer-menu-panel composer-menu-panel-list">
          {[1, 2, 3, 4].map((count) => (
            <button
              key={count}
              type="button"
              className={studioForm.imageCount === count ? "composer-choice-item is-active" : "composer-choice-item"}
              onClick={() => onImageCountSelect(count)}
            >
              <strong>{count} 张</strong>
              <span>{count === 1 ? "默认张数" : `一次生成 ${count} 张`}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
