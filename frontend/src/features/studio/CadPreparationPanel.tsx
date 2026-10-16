import { useEffect, useState } from "react";
import { api, type CadExtractData, type CadExtractRecord, type CadPlanPoint, type CadPreparationInputs } from "../../api";
import "./cadPreparation.css";

type Floor = NonNullable<NonNullable<CadExtractData["spaces"]>["floors"]>[number];
export const CAD_ROOM_KINDS = [
  ["office", "办公"], ["reception", "接待"], ["meeting", "会议"], ["reading", "阅览"],
  ["activity", "活动"], ["cafe", "茶座"], ["toilet", "卫生间"], ["storage", "储藏"], ["empty", "保留空白"],
] as const;

export function CadPreparationPanel({ record, floor, busy, onUpdated, onPendingChange }: {
  record: CadExtractRecord; floor: Floor; busy: boolean; onUpdated: (record: CadExtractRecord) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const [calibration, setCalibration] = useState<CadPlanPoint[]>([]);
  const [meters, setMeters] = useState("");
  const [kinds, setKinds] = useState<Record<string, string>>({});
  const [routes, setRoutes] = useState<CadPreparationInputs["routes"]>([]);
  const [draft, setDraft] = useState<CadPlanPoint[]>([]);
  const [routeWidth, setRouteWidth] = useState("1.2");
  const [mode, setMode] = useState<"scale" | "route" | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => { onPendingChange(dirty || saving); }, [dirty, saving, onPendingChange]);
  useEffect(() => {
    setCalibration(floor.preparation?.calibration.points ?? []);
    setMeters(floor.preparation ? String(floor.preparation.calibration.meters) : "");
    setKinds(Object.fromEntries((floor.rooms ?? []).map(r => [r.room_id,
      floor.preparation?.confirmed_proposals?.[r.room_id] === (r.proposal || r.function) ? r.layout_kind ?? "" : ""] )));
    setRoutes(floor.preparation?.routes ?? []);
    setDraft([]); setMode(null); setDirty(false); setError("");
  }, [floor]);
  const rooms = (floor.rooms ?? []).filter(r => r.area_ratio >= 0.005 || r.function_source === "edited");
  const locked = busy || saving;
  const lengthPx = calibration.length === 2 ? Math.hypot(
    (calibration[0].x - calibration[1].x) * size.width,
    (calibration[0].y - calibration[1].y) * size.height,
  ) : 0;
  const mpp = lengthPx > 0 && Number(meters) > 0 ? Number(meters) / lengthPx : 0;
  const valid = lengthPx >= 10 && Number(meters) > 0 && Number(meters) <= 1000 && routes.length > 0
    && rooms.every(r => kinds[r.room_id]) && !mode;
  const xy = (points: CadPlanPoint[]) => points.map(p => `${p.x * size.width},${p.y * size.height}`).join(" ");
  async function save() {
    if (!valid || locked) return;
    setSaving(true); setError("");
    try {
      onUpdated(await api.saveCadPreparation(record.extract_id, {
        floor_index: floor.floor_index, calibration: { points: calibration, meters: Number(meters) },
        room_kinds: Object.fromEntries(Object.entries(kinds).filter(([, kind]) => kind)), routes,
      }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "没有保存布置条件"); }
    finally { setSaving(false); }
  }
  return <details className="cad-preparation" open={!floor.preparation?.current || undefined}>
    <summary>布置前确认 · {floor.preparation?.current ? "已保存，可调整" : "请先校准尺度、确认功能并标注通路"}</summary>
    <fieldset disabled={locked}>
      <div className="cad-preparation-grid">
        <div>
          <p>① 点选一段已知真实长度的两端，以米校准。每个平面单独保存。</p>
          <button type="button" onClick={() => { setMode("scale"); setCalibration([]); setDirty(true); }}>在图上选择两点</button>
          <label>两点实际长度（米）<input type="number" min="0.01" max="1000" step="any" value={meters}
            onChange={e => { setMeters(e.target.value); setDirty(true); }} /></label>
          <p>{calibration.length}/2 个校准点{mpp > 0 ? ` · 当前约 ${(mpp * size.width).toFixed(2)} × ${(mpp * size.height).toFixed(2)} 米（图像全幅）` : ""}</p>
          <p>② 明确每个分区用途，系统不再替“或”字做选择。</p>
          {rooms.map(room => <label key={room.room_id}>
            {room.marker} · {room.proposal || room.function}
            <select value={kinds[room.room_id] ?? ""} onChange={e => { setKinds({ ...kinds, [room.room_id]: e.target.value }); setDirty(true); }}>
              <option value="">请选择明确功能</option>
              {CAD_ROOM_KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>)}
          <p>③ 从入口向各区画通路中心线，可分多条标注。蓝色带内不摆家具。</p>
          <label>通路预留宽度（米）<input type="number" min="0.8" max="4" step="0.1" value={routeWidth}
            onChange={e => setRouteWidth(e.target.value)} /></label>
          <div className="cad-preparation-actions">
            <button type="button" disabled={!mpp || !!mode || routes.length >= 12} onClick={() => { setMode("route"); setDraft([]); }}>新增通路</button>
            <button type="button" disabled={mode !== "route" || draft.length < 2 || Number(routeWidth) < 0.8 || Number(routeWidth) > 4}
              onClick={() => { setRoutes([...routes, { points: draft, width_m: Number(routeWidth) }]); setDraft([]); setMode(null); setDirty(true); }}>完成这条通路</button>
            <button type="button" disabled={!mode} onClick={() => mode === "scale" ? setCalibration(calibration.slice(0, -1)) : setDraft(draft.slice(0, -1))}>撤销末点</button>
            <button type="button" disabled={!mode} onClick={() => { setMode(null); setDraft([]); }}>结束点选</button>
          </div>
          {routes.map((route, index) => <p key={index}>通路 {index + 1} · {route.width_m} 米 <button type="button" onClick={() => { setRoutes(routes.filter((_, i) => i !== index)); setDirty(true); }}>移除</button></p>)}
        </div>
        <div>
          <p aria-live="polite">{mode === "scale" ? "点击已知长度的两个端点" : mode === "route" ? "依次点击通路转折点，再点“完成这条通路”" : "选择左侧点选工具后，在图上标注"}</p>
          <div className="cad-preparation-plan">
            <img src={floor.line_path || floor.preview_path} alt={`${floor.label}尺度与通路标注底图`} draggable={false}
              onLoad={e => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} />
            <svg viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label="尺度与通路点选区"
              style={{ cursor: mode ? "crosshair" : "default" }} onPointerDown={e => {
                if (!mode || locked) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const point = { x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) };
                setDirty(true);
                if (mode === "scale") { const next = [...calibration, point].slice(0, 2); setCalibration(next); if (next.length === 2) setMode(null); }
                else if (draft.length < 30) setDraft([...draft, point]);
              }}>
              {routes.map((route, i) => <polyline key={i} points={xy(route.points)} fill="none" stroke="#168aff" opacity="0.3"
                strokeWidth={mpp > 0 ? route.width_m / mpp : 10} strokeLinecap="round" strokeLinejoin="round" />)}
              <polyline points={xy(calibration)} fill="none" stroke="#f05a24" strokeWidth="3" />
              <polyline points={xy(draft)} fill="none" stroke="#168aff" strokeWidth="3" />
              {[...calibration, ...draft].map((p, i) => <circle key={i} cx={p.x * size.width} cy={p.y * size.height} r="5" fill="#f05a24" />)}
            </svg>
          </div>
          <p>通路标注是家具禁放范围；墙体连通、门洞、楼梯电梯及疏散要求仍需人工核验。</p>
        </div>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" disabled={!valid || locked} onClick={() => void save()}>{saving ? "保存中" : "保存本层布置条件"}</button>
      <p aria-live="polite">{dirty ? "有未保存的调整，请先保存再布置。" : floor.preparation ? "条件已保存。点击“布置这一层”时才重新生成；已有方案保留。" : "完成三项后保存，再开始布置。"}</p>
    </fieldset>
  </details>;
}
