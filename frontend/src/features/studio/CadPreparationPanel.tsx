import { useEffect, useRef, useState } from "react";
import { api, type CadExtractData, type CadExtractRecord, type CadPlanPoint, type CadPreparationInputs, type CadRouteSuggestions } from "../../api";
import "./cadPreparation.css";
import { mergeSuggestedRoutes } from "./cadCirculation";
import { preparationVersion, preparationDraftKey, readPreparationDraft, writePreparationDraft, discardPreparationDraft } from "./cadPreparationDrafts";

type Floor = NonNullable<NonNullable<CadExtractData["spaces"]>["floors"]>[number];
export const CAD_ROOM_KINDS = [
  ["office", "办公"], ["reception", "接待"], ["meeting", "会议"], ["reading", "阅览"],
  ["activity", "活动"], ["cafe", "茶座"], ["toilet", "卫生间"], ["storage", "储藏"], ["empty", "保留空白"],
] as const;

export function CadPreparationPanel({ record, floor, busy, onUpdated, onPendingChange, draftOwner }: {
  record: CadExtractRecord; floor: Floor; busy: boolean; onUpdated: (record: CadExtractRecord) => void;
  onPendingChange: (pending: boolean) => void; draftOwner?: string;
}) {
  const [calibration, setCalibration] = useState<CadPlanPoint[]>([]);
  const [meters, setMeters] = useState("");
  const [kinds, setKinds] = useState<Record<string, string>>({});
  const [routes, setRoutes] = useState<CadPreparationInputs["routes"]>([]);
  const [draft, setDraft] = useState<CadPlanPoint[]>([]);
  const [routeWidth, setRouteWidth] = useState("1.2");
  const [mode, setMode] = useState<"scale" | "route" | "entry" | null>(null);
  const [entry, setEntry] = useState<CadPlanPoint | null>(null);
  const [suggestion, setSuggestion] = useState<CadRouteSuggestions | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [notices, setNotices] = useState<string[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [dragPoint, setDragPoint] = useState<number | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const identity = JSON.stringify([draftOwner, record.extract_id, floor.floor_index]);
  const key = preparationDraftKey(draftOwner, record.extract_id, floor.floor_index);
  const version = preparationVersion(floor);
  const latest = useRef({ identity, version });
  latest.current = { identity, version };
  const base = useRef({ identity: "", version: "" });
  const hydrating = useRef(false);
  const pending = dirty || saving || suggesting || mode !== null;
  useEffect(() => { onPendingChange(pending); return () => onPendingChange(false); }, [pending, onPendingChange]);
  function resetFromFloor(value: Floor) {
    setCalibration(value.preparation?.calibration.points ?? []);
    setMeters(value.preparation ? String(value.preparation.calibration.meters) : "");
    setKinds(Object.fromEntries((value.rooms ?? []).map(r => [r.room_id,
      value.preparation?.confirmed_proposals?.[r.room_id] === (r.proposal || r.function) ? r.layout_kind ?? "" : ""])));
    setRoutes(value.preparation?.routes ?? []); setEntry(value.preparation?.entry ?? null);
    setNotices(value.preparation?.route_warnings ?? []); setSuggestion(null);
    setEditingIndex(null); setDragPoint(null); setDraft([]); setMode(null); setRouteWidth("1.2");
    setDirty(false); setConflict(false); setError("");
    base.current = { identity, version: preparationVersion(value) };
  }
  useEffect(() => {
    if (base.current.identity !== identity) {
      hydrating.current = true;
      const cached = readPreparationDraft(key);
      if (cached) {
        base.current = { identity, version: cached.baseVersion };
        setCalibration(cached.calibration); setMeters(cached.meters); setKinds(cached.kinds);
        setRoutes(cached.routes); setEntry(cached.entry); setNotices(cached.notices);
        setDraft(cached.draft); setMode(cached.mode); setRouteWidth(cached.routeWidth);
        setEditingIndex(cached.editingIndex); setDragPoint(null); setSuggestion(null);
        setDirty(true); setConflict(cached.baseVersion !== version); setError("");
      } else resetFromFloor(floor);
    } else if (base.current.version !== version) {
      if (pending) setConflict(true);
      else { hydrating.current = true; resetFromFloor(floor); }
    } else setConflict(false);
  }, [identity, version]);
  useEffect(() => {
    if (hydrating.current) { hydrating.current = false; return; }
    if (pending) writePreparationDraft(key, { baseVersion: base.current.version, calibration, meters, kinds,
      routes, draft, routeWidth, mode, entry, notices, editingIndex, dirty });
    else discardPreparationDraft(key);
  }, [key, pending, calibration, meters, kinds, routes, draft, routeWidth, mode, entry, notices, editingIndex, dirty, conflict]);
  useEffect(() => {
    if (!pending || typeof window === "undefined") return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
  const rooms = (floor.rooms ?? []).filter(r => r.area_ratio >= 0.005 || r.function_source === "edited");
  const locked = busy || saving || suggesting;
  const lengthPx = calibration.length === 2 ? Math.hypot(
    (calibration[0].x - calibration[1].x) * size.width,
    (calibration[0].y - calibration[1].y) * size.height,
  ) : 0;
  const mpp = lengthPx > 0 && Number(meters) > 0 ? Number(meters) / lengthPx : 0;
  const valid = lengthPx >= 10 && Number(meters) > 0 && Number(meters) <= 1000 && routes.length > 0
    && rooms.every(r => kinds[r.room_id]) && !mode;
  const canSuggest = lengthPx >= 10 && Number(meters) > 0 && Number(meters) <= 1000 && rooms.every(r => kinds[r.room_id])
    && Number(routeWidth) >= .8 && Number(routeWidth) <= 4 && !mode;
  const xy = (points: CadPlanPoint[]) => points.map(p => `${p.x * size.width},${p.y * size.height}`).join(" ");
  function markDirty() {
    setDirty(true); setSuggestion(null);
    setNotices(["通路或布置条件已由用户调整，需重新确认连通、门洞与净宽。"]);
  }
  async function suggest() {
    if (!canSuggest || locked || conflict) return;
    const origin = identity;
    const originVersion = version;
    setSuggesting(true); setError("");
    try {
      const result = await api.suggestCadRoutes(record.extract_id, {
        floor_index: floor.floor_index, calibration: { points: calibration, meters: Number(meters) },
        room_kinds: Object.fromEntries(Object.entries(kinds).filter(([, kind]) => kind)), width_m: Number(routeWidth), entry,
      });
      if (mounted.current && latest.current.identity === origin && latest.current.version === originVersion) setSuggestion(result);
    } catch (cause) { if (mounted.current && latest.current.identity === origin) setError(cause instanceof Error ? cause.message : "没有生成通路建议"); }
    finally { if (mounted.current && latest.current.identity === origin) setSuggesting(false); }
  }
  function adopt() {
    if (!suggestion?.routes.length) return;
    try { setRoutes(mergeSuggestedRoutes(routes, suggestion.routes)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "无法采用建议"); return; }
    setEntry(suggestion.entry);
    setNotices(suggestion.warnings); setSuggestion(null); setDirty(true);
  }
  function finishRoute() {
    const route = { points: draft, width_m: Number(routeWidth), origin: "manual" as const };
    setRoutes(editingIndex === null ? [...routes, route] : routes.map((r, i) => i === editingIndex ? route : r));
    setDraft([]); setMode(null); setEditingIndex(null); markDirty();
  }
  async function save() {
    if (!valid || locked || conflict) return;
    const origin = identity, sentVersion = version;
    setSaving(true); setError("");
    try {
      const result = await api.saveCadPreparation(record.extract_id, {
        floor_index: floor.floor_index, calibration: { points: calibration, meters: Number(meters) },
        room_kinds: Object.fromEntries(Object.entries(kinds).filter(([, kind]) => kind)), routes, entry, route_warnings: notices,
      });
      if (!mounted.current || latest.current.identity !== origin) return;
      const savedFloor = result.data?.spaces?.floors?.find(item => item.floor_index === floor.floor_index);
      if (!savedFloor) { setError("保存响应缺少本层条件，请核对记录；草稿仍保留。"); return; }
      if (latest.current.version !== sentVersion && latest.current.version !== preparationVersion(savedFloor)) {
        setConflict(true); setError("保存期间平面内容已变化，请核对最新记录；草稿仍保留。"); return;
      }
      resetFromFloor(savedFloor); discardPreparationDraft(key);
      onUpdated(result);
    } catch (cause) {
      if (mounted.current && latest.current.identity === origin) setError(cause instanceof Error ? cause.message : "没有保存布置条件");
    } finally { if (mounted.current && latest.current.identity === origin) setSaving(false); }
  }
  return <details className="cad-preparation" open={!floor.preparation?.current || undefined}>
    <summary>布置前确认 · {floor.preparation?.current ? "已保存，可调整" : "请先校准尺度、确认功能并标注通路"}</summary>
    <fieldset disabled={locked}>
      {floor.unit_info?.requires_calibration ? <p role="status">{floor.unit_info.note}</p> : null}
      <div className="cad-preparation-grid">
        <div>
          <p>① 点选一段已知真实长度的两端，以米校准。每个平面单独保存。</p>
          <button type="button" disabled={!!mode} onClick={() => { setMode("scale"); setCalibration([]); markDirty(); }}>在图上选择两点</button>
          <label>两点实际长度（米）<input type="number" min="0.01" max="1000" step="any" value={meters}
            onChange={e => { setMeters(e.target.value); markDirty(); }} /></label>
          <p>{calibration.length}/2 个校准点{mpp > 0 ? ` · 当前约 ${(mpp * size.width).toFixed(2)} × ${(mpp * size.height).toFixed(2)} 米（图像全幅）` : ""}</p>
          <p>② 明确每个分区用途，系统不再替“或”字做选择。</p>
          {rooms.map(room => <label key={room.room_id}>
            {room.marker} · {room.proposal || room.function}
            <select value={kinds[room.room_id] ?? ""} onChange={e => { setKinds({ ...kinds, [room.room_id]: e.target.value }); markDirty(); }}>
              <option value="">请选择明确功能</option>
              {CAD_ROOM_KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>)}
          <p>③ 先让系统生成通路建议，也可以手动画。采用建议后仍可修改折点和宽度，蓝色带内不摆家具。</p>
          <label>通路预留宽度（米）<input type="number" min="0.8" max="4" step="0.1" value={routeWidth}
            onChange={e => { setRouteWidth(e.target.value); markDirty(); }} /></label>
          <p>宽度和起点用于下一次生成；修改已采用的通路，请点对应的“修改通路”。</p>
          <div className="cad-preparation-actions">
            <button type="button" disabled={!canSuggest || conflict} onClick={() => void suggest()}>{suggesting ? "生成建议中" : "系统生成通路建议"}</button>
            <button type="button" disabled={!mpp || !!mode} onClick={() => setMode("entry")}>在图上指定起点</button>
            <button type="button" disabled={!entry || !!mode} onClick={() => { setEntry(null); markDirty(); }}>恢复系统建议起点</button>
          </div>
          {!canSuggest && !mode ? <p>先完成两点尺度校准及分区功能选择，即可生成建议，无需先手动画通路。</p> : null}
          {suggestion ? <div className="cad-route-suggestion" aria-live="polite">
            <p>{suggestion.status === "unavailable" ? "暂时无法生成可用通路" : suggestion.status === "partial" ? "已生成部分通路，仍有分区未连通" : "已生成候选通路，等待确认"} · 橙色虚线为建议预览</p>
            {suggestion.warnings.map((warning, i) => <p key={i}>{warning}</p>)}
            {suggestion.unreachable_room_ids.length ? <p>未连通：{suggestion.unreachable_room_ids.map(id => { const r = rooms.find(r => r.room_id === id); return r ? `${r.marker} ${r.proposal || r.function}` : id; }).join("、")}</p> : null}
            <button type="button" disabled={!suggestion.routes.length || !!mode} onClick={adopt}>采用建议，保留手画通路</button>
            <button type="button" onClick={() => setSuggestion(null)}>收起建议</button>
          </div> : null}
          <div className="cad-preparation-actions">
            <button type="button" disabled={!mpp || !!mode || routes.length >= 12} onClick={() => { setMode("route"); setDraft([]); setEditingIndex(null); }}>新增通路</button>
            <button type="button" disabled={mode !== "route" || draft.length < 2 || Number(routeWidth) < 0.8 || Number(routeWidth) > 4}
              onClick={finishRoute}>{editingIndex === null ? "完成这条通路" : "完成修改"}</button>
            <button type="button" disabled={!mode || mode === "entry"} onClick={() => mode === "scale" ? setCalibration(calibration.slice(0, -1)) : setDraft(draft.slice(0, -1))}>撤销末点</button>
            <button type="button" disabled={!mode} onClick={() => { setMode(null); setDraft([]); setEditingIndex(null); setDragPoint(null); }}>结束点选</button>
          </div>
          {routes.map((route, index) => <div className="cad-preparation-actions" key={index}>
            <p>通路 {index + 1} · {route.width_m} 米 · {route.origin === "system" ? "系统建议" : "用户手画/修改"}</p>
            <button type="button" disabled={!!mode} onClick={() => { setMode("route"); setDraft(route.points); setRouteWidth(String(route.width_m)); setEditingIndex(index); }}>修改通路 {index + 1}</button>
            <button type="button" disabled={!!mode} onClick={() => { setRoutes(routes.filter((_, i) => i !== index)); markDirty(); }}>移除通路 {index + 1}</button>
          </div>)}
          {notices.map((notice, i) => <p key={i}>{notice}</p>)}
        </div>
        <div>
          <p aria-live="polite">{mode === "scale" ? "点击已知长度的两个端点" : mode === "entry" ? "在入口内侧宽敞处点击，作为通路起点" : mode === "route" ? "点击增加折点，拖动红点修改位置；完成后保存这条通路" : "选择左侧点选工具后，在图上标注"}</p>
          <div className="cad-preparation-plan">
            <img src={floor.line_path || floor.preview_path} alt={`${floor.label}尺度与通路标注底图`} draggable={false}
              onLoad={e => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} />
            <svg viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label="尺度与通路点选区"
              style={{ cursor: mode ? "crosshair" : "default" }} onPointerDown={e => {
                if (!mode || locked) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const point = { x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) };
                if (mode === "scale") { const next = [...calibration, point].slice(0, 2); setCalibration(next); markDirty(); if (next.length === 2) setMode(null); }
                else if (mode === "entry") { setEntry(point); setMode(null); markDirty(); }
                else if (draft.length < 30) setDraft([...draft, point]);
              }} onPointerMove={e => {
                if (dragPoint === null || locked) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const point = { x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) };
                setDraft(draft.map((p, i) => i === dragPoint ? point : p));
              }} onPointerUp={() => setDragPoint(null)} onPointerCancel={() => setDragPoint(null)}>
              {routes.map((route, i) => i === editingIndex ? null : <polyline key={i} points={xy(route.points)} fill="none" stroke="#168aff" opacity="0.3"
                strokeWidth={mpp > 0 ? route.width_m / mpp : 10} strokeLinecap="round" strokeLinejoin="round" />)}
              {suggestion?.routes.map((route, i) => <polyline key={`suggestion-${i}`} points={xy(route.points)} fill="none" stroke="#dd7c14" opacity="0.6"
                strokeWidth={mpp > 0 ? route.width_m / mpp : 10} strokeDasharray="10 5" />)}
              {(entry || suggestion?.entry) ? <circle cx={(entry || suggestion!.entry)!.x * size.width} cy={(entry || suggestion!.entry)!.y * size.height} r="7" fill="#138442"><title>通路起点（请确认实际入口）</title></circle> : null}
              <polyline points={xy(calibration)} fill="none" stroke="#f05a24" strokeWidth="3" />
              {mode === "route" && mpp > 0 ? <polyline points={xy(draft)} fill="none" stroke="#168aff" opacity=".25" strokeWidth={Number(routeWidth) / mpp || 1} /> : null}
              <polyline points={xy(draft)} fill="none" stroke="#168aff" strokeWidth="3" />
              {calibration.map((p, i) => <circle key={`scale-${i}`} cx={p.x * size.width} cy={p.y * size.height} r="5" fill="#f05a24" />)}
              {draft.map((p, i) => <circle key={`draft-${i}`} cx={p.x * size.width} cy={p.y * size.height} r="7" fill="#f05a24" aria-label={`通路折点 ${i + 1}`}
                onPointerDown={e => { e.stopPropagation(); if (locked) return; setDragPoint(i); e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId); }} />)}
            </svg>
          </div>
          <p>通路标注是家具禁放范围；墙体连通、门洞、楼梯电梯及疏散要求仍需人工核验。</p>
        </div>
      </div>
      {conflict ? <div role="alert">
        <p>当前平面或已保存条件已变化，草稿仍保留。请核对尺度、分区用途和通路后再保存。</p>
        <button type="button" onClick={() => {
          base.current = { identity, version }; setConflict(false);
          setKinds(Object.fromEntries(Object.entries(kinds).filter(([id]) => (floor.rooms ?? []).some(room => room.room_id === id))));
          markDirty();
        }}>按当前分区重新核对，保留尺度与通路</button>
      </div> : null}
      {pending || conflict ? <button type="button" onClick={() => {
        discardPreparationDraft(key); resetFromFloor(floor);
      }}>放弃本层草稿，采用最新条件</button> : null}
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" disabled={!valid || locked || conflict} onClick={() => void save()}>{saving ? "保存中" : "保存本层布置条件"}</button>
      <p aria-live="polite">{dirty ? "有未保存的调整，请先保存再布置。" : floor.preparation ? "条件已保存。点击“布置这一层”时才重新生成；已有方案保留。" : "完成三项后保存，再开始布置。"}</p>
    </fieldset>
    {pending ? <p>切换后草稿保留在本标签页；刷新或关闭并确认离开将放弃草稿。</p> : null}
  </details>;
}
