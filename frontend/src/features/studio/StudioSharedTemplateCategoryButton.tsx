import type { StudioSharedTemplateCategoryButtonProps } from "./studioSharedTemplateCategoryTypes";

export default function StudioSharedTemplateCategoryButton({
  expanded,
  label,
  selected,
  onClick,
}: StudioSharedTemplateCategoryButtonProps) {
  return (
    <button
      type="button"
      className={selected ? "template-nav-item is-active" : "template-nav-item"}
      onClick={onClick}
    >
      <span>{label}</span>
      <b>{expanded ? "\u2303" : "\u2304"}</b>
    </button>
  );
}
