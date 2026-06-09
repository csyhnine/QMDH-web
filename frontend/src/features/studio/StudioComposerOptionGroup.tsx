import type { StudioComposerOptionGroupProps } from "./studioComposerDisplayMenuTypes";

export default function StudioComposerOptionGroup({
  activeId,
  gridClassName = "composer-chip-grid",
  options,
  title,
  onSelect,
}: StudioComposerOptionGroupProps) {
  return (
    <div className="composer-menu-group">
      <span className="composer-menu-title">{title}</span>
      <div className={gridClassName}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={activeId === option.id ? "composer-chip-button is-active" : "composer-chip-button"}
            onClick={() => onSelect(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
