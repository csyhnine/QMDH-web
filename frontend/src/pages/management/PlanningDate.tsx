import { useRef, useState } from "react";
import { addDays, today } from "./planning";

/** Shared calendar: visible month/year controls and one-click day selection. */
export default function PlanningDate({ value, onChange, label, disabled = false, required = false, min }: {
  value: string; onChange: (date: string) => void; label: string; disabled?: boolean; required?: boolean; min?: string;
}) {
  const popup = useRef<HTMLDetailsElement>(null);
  const [month, setMonth] = useState((value || today()).slice(0, 7));
  const first = `${month}-01`;
  const offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const [year, number] = month.split("-").map(Number);
  const choose = (date: string) => { onChange(date); if (popup.current) popup.current.open = false; };
  const move = (delta: number) => {
    const date = new Date(Date.UTC(year, number - 1 + delta, 1));
    setMonth(date.toISOString().slice(0, 7));
  };
  return <span className="mp-date-field">
    <input aria-label={label} type="date" min={min} value={value} required={required} disabled={disabled} onChange={e => onChange(e.target.value)} />
    <details ref={popup} onToggle={e => { if (e.currentTarget.open) setMonth((value || today()).slice(0, 7)); }}>
      <summary aria-label={`选择${label}`} aria-disabled={disabled} onClick={e => { if (disabled) e.preventDefault(); }}>▦</summary>
      <div className="mp-calendar" role="group" aria-label={`${label}日历`} onKeyDown={e => { if (e.key === "Escape" && popup.current) popup.current.open = false; }}>
        <header><button type="button" aria-label="上个月" onClick={() => move(-1)}>‹</button>
          <select aria-label="年份" value={year} onChange={e => setMonth(`${e.target.value}-${String(number).padStart(2, "0")}`)}>{Array.from({ length: 101 }, (_, i) => 2000 + i).map(y => <option key={y}>{y}</option>)}</select>
          <select aria-label="月份" value={number} onChange={e => setMonth(`${year}-${e.target.value.padStart(2, "0")}`)}>{Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}月</option>)}</select>
          <button type="button" aria-label="下个月" onClick={() => move(1)}>›</button></header>
        <div className="mp-calendar-grid">{["一", "二", "三", "四", "五", "六", "日"].map(d => <small key={d}>{d}</small>)}
          {Array.from({ length: 42 }, (_, i) => addDays(first, i - offset)).map(date => <button type="button" disabled={Boolean(min && date < min)} key={date} aria-label={date} aria-pressed={date === value} className={date.slice(0, 7) !== month ? "muted" : ""} onClick={() => choose(date)}>{Number(date.slice(-2))}</button>)}</div>
        <footer><button type="button" onClick={() => choose(today())}>今天</button>{!required && <button type="button" onClick={() => choose("")}>清空</button>}<button type="button" onClick={() => { if (popup.current) popup.current.open = false; }}>关闭</button></footer>
      </div>
    </details>
  </span>;
}
