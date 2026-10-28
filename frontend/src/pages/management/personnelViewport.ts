import { addDays } from "./planning";

/** Keep personnel columns fixed; parallel lanes share the usable width. */
export function personnelLane(columnWidth: number, count: number, lane: number) {
  const lanes = Math.max(1, count),
    pitch = Math.min(22, (columnWidth - 12) / lanes),
    gap = Math.min(2, pitch * 0.18);
  return { left: (columnWidth - lanes * pitch) / 2 + lane * pitch, width: pitch - gap };
}

/** Zoom around the date under the pointer, keeping daily rows legible. */
export function zoomPersonnelWindow(start: string, days: number, rowHeight: number, height: number, offset: number, scroll: number, direction: number) {
  const available = Math.max(54, height - 37),
    maximum = Math.max(3, Math.floor(available / 18)),
    visible = Math.min(days, available / rowHeight),
    next = Math.max(3, Math.min(maximum, direction > 0 ? Math.max(Math.ceil(visible * 1.2), Math.floor(visible) + 1) : Math.min(Math.floor(visible / 1.2), Math.ceil(visible) - 1))),
    pointer = Math.max(0, Math.min(available - 1, offset - 36)),
    anchor = Math.max(0, Math.min(days - 1, Math.floor((scroll + pointer) / rowHeight))),
    target = Math.min(next - 1, Math.floor(pointer / (available / next)));
  return { start: addDays(start, anchor - target), days: next };
}
