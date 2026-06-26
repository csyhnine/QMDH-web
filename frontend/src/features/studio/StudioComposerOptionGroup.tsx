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
            className={[
              "composer-chip-button",
              activeId === option.id ? "is-active" : "",
              option.disabled ? "is-disabled" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={option.disabled}
            aria-disabled={option.disabled || undefined}
            onClick={() => {
              if (!option.disabled) onSelect(option.id);
            }}
          >
            <span>{option.label}</span>
            {option.hint ? <small className="composer-chip-hint">{option.hint}</small> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
