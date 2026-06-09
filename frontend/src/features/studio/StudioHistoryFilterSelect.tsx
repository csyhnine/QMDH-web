import type { StudioHistoryFilterSelectProps } from "./studioHistoryPaneTypes";

export default function StudioHistoryFilterSelect({
  label,
  options,
  value,
  onChange,
}: StudioHistoryFilterSelectProps) {
  return (
    <label className="toolbar-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
