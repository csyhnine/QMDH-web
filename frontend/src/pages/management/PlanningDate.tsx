import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { addDays, today } from "./planning";

/** One calendar style everywhere, including scrollable quick panels and dialogs. */
export default function PlanningDate({ value, onChange, label, disabled = false, required = false, min, max, caption }: {
  value: string; onChange: (date: string) => void; label: string; disabled?: boolean; required?: boolean; min?: string; max?: string; caption?: string;
}) {
  const id = useId(), popup = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false), [month, setMonth] = useState((value || today()).slice(0, 7));
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const first = `${month}-01`;
  const offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const [year, number] = month.split("-").map(Number);
  const allowed = (date: string) => !((min && date < min) || (max && date > max));
  const close = () => { popup.current?.hidePopover(); setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  const choose = (date: string) => { if (date && !allowed(date)) return; onChange(date); close(); };
  const move = (delta: number) => {
    const date = new Date(Date.UTC(year, number - 1 + delta, 1));
    setMonth(date.toISOString().slice(0, 7));
  };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect(), box = popup.current?.getBoundingClientRect();
      if (!anchor || !box) return;
      const below = anchor.bottom + 8, above = anchor.top - box.height - 8;
      setPosition({ left: Math.max(12, Math.min(anchor.right - box.width, window.innerWidth - box.width - 12)),
        top: Math.max(12, Math.min(below + box.height <= window.innerHeight - 12 ? below : above, window.innerHeight - box.height - 12)) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const observer = new ResizeObserver(place);
    if (popup.current) observer.observe(popup.current);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); observer.disconnect(); };
  }, [open]);
  useEffect(() => { if (disabled) popup.current?.hidePopover(); }, [disabled]);
  useEffect(() => {
    if (open) popup.current?.querySelector<HTMLElement>('[aria-pressed="true"]:not(:disabled), select')?.focus({ preventScroll: true });
  }, [open]);
  return <span className="mp-date-field" onKeyDown={e => {
    if (e.key === "Escape" && popup.current?.matches(":popover-open")) { e.preventDefault(); e.stopPropagation(); close(); }
  }}>
    {caption && <small className="mp-date-caption">{caption}</small>}
    <input aria-label={label} type="date" min={min} max={max} value={value} required={required} disabled={disabled} onChange={e => onChange(e.target.value)} />
    <button className="mp-date-trigger" ref={trigger} type="button" aria-label={`选择${label}`} aria-controls={id} aria-haspopup="dialog" aria-expanded={open} disabled={disabled}
      onClick={() => {
        if (popup.current?.matches(":popover-open")) close();
        else { setMonth((value || today()).slice(0, 7)); popup.current?.showPopover(); setOpen(true); }
      }}>▦</button>
      <div id={id} ref={popup} popover="auto" style={position} className="mp-calendar" role="dialog" aria-label={`${label}日历`}
        onToggle={() => setOpen(Boolean(popup.current?.matches(":popover-open")))}
        onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }}>
        <header><button type="button" aria-label="上个月" onClick={() => move(-1)}>‹</button>
          <select aria-label="年份" value={year} onChange={e => setMonth(`${e.target.value}-${String(number).padStart(2, "0")}`)}>{Array.from({ length: 101 }, (_, i) => 2000 + i).map(y => <option key={y}>{y}</option>)}</select>
          <select aria-label="月份" value={number} onChange={e => setMonth(`${year}-${e.target.value.padStart(2, "0")}`)}>{Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}月</option>)}</select>
          <button type="button" aria-label="下个月" onClick={() => move(1)}>›</button></header>
        <div className="mp-calendar-grid">{["一", "二", "三", "四", "五", "六", "日"].map(d => <small key={d}>{d}</small>)}
          {Array.from({ length: 42 }, (_, i) => addDays(first, i - offset)).map(date => <button type="button" disabled={!allowed(date)} key={date} aria-label={date} aria-pressed={date === value} className={date.slice(0, 7) !== month ? "muted" : ""} onClick={() => choose(date)}>{Number(date.slice(-2))}</button>)}</div>
        <footer><button type="button" disabled={!allowed(today())} onClick={() => choose(today())}>今天</button>{!required && <button type="button" onClick={() => choose("")}>清空</button>}<button type="button" onClick={close}>关闭</button></footer>
      </div>
  </span>;
}
