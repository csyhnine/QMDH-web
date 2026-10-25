import { type DragEvent, type FormEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api, type CadExtractRecord, type CadProgramRearrangeResult } from "../../api";
import { buildCadProgram } from "../../features/studio/cadProgram";
import { CadPreparationPanel, CAD_ROOM_KINDS } from "../../features/studio/CadPreparationPanel";
import { useAuth } from "../../context/AuthContext";
import { fileToDataUrl } from "../../features/studio/studioAssetUtils";
import { formatChinaMonthDayTime } from "../../lib/datetime";
import { formatUploadSize } from "../../utils/uploads";

/** Mirrors backend default `QMDH_CAD_MAX_UPLOAD_BYTES`. */
const CAD_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const TIANZHENG_NOTE =
  "天正、中望等第三方 CAD 图纸请先在原软件中「转 T3 / 炸开墙体」后再上传，否则自定义墙门窗对象可能无法解析为标准线要素。";

const ROLE_LABELS: Record<string, string> = {
  wall: "墙",
  door: "门",
  window: "窗",
  column: "柱",
  dimension: "标注",
  axis: "轴网",
  hatch: "填充",
  border: "图框",
  room_label: "房间名",
  other: "其他",
};

function hexToRgb(value: string) {
  const text = value.replace("#", "");
  if (text.length !== 6) return "255,99,71";
  return `${parseInt(text.slice(0, 2), 16)},${parseInt(text.slice(2, 4), 16)},${parseInt(text.slice(4, 6), 16)}`;
}

function roomAreaText(room: { area_m2?: number; area_ratio: number }) {
  if (typeof room.area_m2 === "number" && room.area_m2 > 0) return `${room.area_m2.toFixed(1)}㎡`;
  return `${Math.round(room.area_ratio * 100)}%`;
}

const SCORE_WEIGHTS: Record<string, number> = {
  groups: 40,
  coverage: 30,
  density: 28,
  planting: 14,
  toilet: 18,
  meeting_center: 12,
};

const HARD_LABELS: Record<string, string> = {
  overlap: "家具互相重叠",
  bounds: "家具越出房间",
  obstacle: "撞到柱、门扇或楼梯",
};

const SCORE_LABELS: Record<string, string> = {
  groups: "该有的组团不全",
  coverage: "家具挤在一侧",
  density: "家具密度不在区间里",
  planting: "缺少绿植配景",
  toilet: "卫生间布置不全",
  meeting_center: "会议桌不在空出的中间",
};

type FitPiece = {
  id: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  angle?: number;
  group?: string;
};

function FurnitureGlyph({ item, planWidth, planHeight }: { item: FitPiece; planWidth: number; planHeight: number }) {
  const boxW = item.w * planWidth;
  const boxH = item.h * planHeight;
  const transform = `translate(${item.x * planWidth} ${item.y * planHeight}) rotate(${item.angle || 0})`;
  if (item.kind === "seat" || item.kind === "chair") {
    const radius = Math.min(boxW, boxH) * 0.36;
    return (
      <g key={item.id} transform={transform}>
        {item.kind === "chair" ? <path className="furn-line" d={`M ${-radius} ${-radius * 0.2} A ${radius} ${radius} 0 0 1 ${radius} ${-radius * 0.2}`} /> : null}
        <circle className="furn-seat" r={radius} cy={item.kind === "chair" ? radius * 0.15 : 0} />
      </g>
    );
  }
  if (item.kind === "desk") {
    return (
      <g key={item.id} transform={transform}>
        <rect className="furn-top" x={-boxW / 2} y={-boxH / 2} width={boxW} height={boxH * 0.58} rx={1.4} />
        <circle className="furn-seat" cx={0} cy={boxH * 0.28} r={Math.min(boxW, boxH) * 0.2} />
      </g>
    );
  }
  if (item.kind === "wc") {
    return (
      <g key={item.id} transform={transform}>
        <rect className="furn-top" x={-boxW * 0.34} y={-boxH / 2} width={boxW * 0.68} height={boxH * 0.28} rx={1} />
        <ellipse className="furn-seat" cx={0} cy={boxH * 0.08} rx={boxW * 0.36} ry={boxH * 0.3} />
      </g>
    );
  }
  if (item.kind === "urinal") {
    return (
      <g key={item.id} transform={transform}>
        <rect className="furn-top" x={-boxW / 2} y={-boxH / 2} width={boxW} height={boxH * 0.22} />
        <ellipse className="furn-seat" cx={0} cy={boxH * 0.08} rx={boxW * 0.4} ry={boxH * 0.4} />
      </g>
    );
  }
  if (item.kind === "sink") {
    return (
      <g key={item.id} transform={transform}>
        <rect className="furn-top" x={-boxW / 2} y={-boxH / 2} width={boxW} height={boxH} rx={1.2} />
        <ellipse className="furn-line" cx={0} cy={0} rx={boxW * 0.28} ry={boxH * 0.28} />
      </g>
    );
  }
  if (item.kind === "shelf") {
    return (
      <g key={item.id} transform={transform}>
        <rect className="furn-top" x={-boxW / 2} y={-boxH / 2} width={boxW} height={boxH} />
        <line className="furn-line" x1={-boxW / 2} y1={0} x2={boxW / 2} y2={0} />
        <line className="furn-line" x1={-boxW / 6} y1={-boxH / 2} x2={-boxW / 6} y2={boxH / 2} />
        <line className="furn-line" x1={boxW / 6} y1={-boxH / 2} x2={boxW / 6} y2={boxH / 2} />
      </g>
    );
  }
  if (item.kind === "bench") {
    return (
      <g key={item.id} transform={transform}>
        <rect className="furn-seat" x={-boxW / 2} y={-boxH / 2} width={boxW} height={boxH} rx={boxH / 2} />
      </g>
    );
  }
  if (item.kind === "sofa") {
    return (
      <g key={item.id} transform={transform}>
        <rect className="furn-top" x={-boxW / 2} y={-boxH / 2} width={boxW} height={boxH * 0.34} rx={1.5} />
        <rect className="furn-seat" x={-boxW / 2} y={-boxH * 0.16} width={boxW} height={boxH * 0.66} rx={2} />
        <line className="furn-line" x1={-boxW / 6} y1={-boxH * 0.1} x2={-boxW / 6} y2={boxH / 2} />
        <line className="furn-line" x1={boxW / 6} y1={-boxH * 0.1} x2={boxW / 6} y2={boxH / 2} />
      </g>
    );
  }
  if (item.kind === "cabinet" || item.kind === "rack") {
    return (
      <g key={item.id} transform={transform}>
        <rect className="furn-top" x={-boxW / 2} y={-boxH / 2} width={boxW} height={boxH} />
        <line className="furn-line" x1={0} y1={-boxH / 2} x2={0} y2={boxH / 2} />
        {item.kind === "rack" ? <line className="furn-line" x1={-boxW / 2} y1={0} x2={boxW / 2} y2={0} /> : null}
      </g>
    );
  }
  if (item.kind === "plant" || item.kind === "tree") {
    const leaf = Math.min(boxW, boxH) * (item.kind === "tree" ? 0.72 : 0.55);
    return (
      <g key={item.id} transform={transform}>
        <rect className="furn-pot" x={-leaf * 0.28} y={leaf * 0.35} width={leaf * 0.56} height={leaf * 0.5} />
        <rect className="furn-pot" x={-leaf * 0.08} y={leaf * 0.05} width={leaf * 0.16} height={leaf * 0.4} />
        <circle className="furn-plant" cx={0} cy={-leaf * 0.35} r={leaf * 0.48} />
        <circle className="furn-plant" cx={-leaf * 0.42} cy={-leaf * 0.05} r={leaf * 0.32} />
        <circle className="furn-plant" cx={leaf * 0.42} cy={-leaf * 0.05} r={leaf * 0.32} />
      </g>
    );
  }
  if (item.kind === "planter") {
    return (
      <g key={item.id} transform={transform}>
        <rect className="furn-pot" x={-boxW / 2} y={-boxH * 0.1} width={boxW} height={boxH * 0.55} />
        <circle className="furn-plant" cx={-boxW * 0.28} cy={-boxH * 0.22} r={Math.min(boxW, boxH) * 0.28} />
        <circle className="furn-plant" cx={0} cy={-boxH * 0.32} r={Math.min(boxW, boxH) * 0.32} />
        <circle className="furn-plant" cx={boxW * 0.28} cy={-boxH * 0.22} r={Math.min(boxW, boxH) * 0.28} />
      </g>
    );
  }
  return (
    <g key={item.id} transform={transform}>
      <rect className="furn-top" x={-boxW / 2} y={-boxH / 2} width={boxW} height={boxH} rx={item.kind === "counter" ? 1 : 2} />
      {item.kind === "counter" ? <line className="furn-line" x1={-boxW / 2} y1={boxH * 0.18} x2={boxW / 2} y2={boxH * 0.18} /> : null}
    </g>
  );
}

const STATUS_LABELS: Record<string, string> = {
  ok: "已解析",
  needs_conversion: "需转 DXF",
  failed: "解析失败",
};

const ERROR_LABELS: Record<string, string> = {
  dwg_converter_not_configured: "服务端未配置 DWG 转换器，请在原软件中另存为 DXF 后重试。",
  dwg_converter_timeout: "DWG 转换超时，请稍后重试或改传 DXF。",
  dwg_converter_failed: "DWG 转换失败，请检查文件或改传 DXF。",
  dwg_converter_exec_failed: "DWG 转换器无法启动，请改传 DXF。",
  dwg_converter_no_dxf_output: "转换器未产出 DXF，请改传 DXF。",
  dwg_conversion_failed: "DWG 转换失败，请改传 DXF。",
  invalid_dxf: "无法解析该 DXF，请确认文件完整，且自定义对象已炸开。",
};

function cadExtension(fileName: string): "dxf" | "dwg" | null {
  const matched = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  const extension = matched?.[1]?.toLowerCase();
  if (extension === "dxf" || extension === "dwg") return extension;
  return null;
}

function toCadDataUrl(raw: string, fileName: string): string {
  const trimmed = raw.trim();
  if (/^data:[^;]+;base64,/.test(trimmed)) return trimmed;
  const payload = trimmed.includes(",") ? trimmed.slice(trimmed.indexOf(",") + 1) : trimmed;
  const mime = cadExtension(fileName) === "dwg" ? "application/acad" : "application/dxf";
  return `data:${mime};base64,${payload}`;
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function errorLabel(code: string | null): string {
  if (!code) return "";
  return ERROR_LABELS[code] ?? code;
}

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

function formatExtents(record: CadExtractRecord): string {
  const extents = record.data.meta?.model_extents;
  if (!extents) return "—";
  const values = [extents.min_x, extents.min_y, extents.max_x, extents.max_y];
  if (values.some((value) => typeof value !== "number")) return "—";
  return values.map((value) => Number(value).toFixed(0)).join(", ");
}

function cadRoomEditWasRejected(error: unknown): boolean {
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  return typeof status === "number" && [400, 404, 409, 413, 422].includes(status);
}

function CadExtractResult({
  record,
  copied,
  onCopy,
  onDownload,
  onUpdated,
  draftOwner,
  onPreparationPending,
  onEditBusy,
}: {
  record: CadExtractRecord;
  copied: boolean;
  onCopy: (extractId: string) => void;
  onDownload: (record: CadExtractRecord) => void;
  onUpdated: (record: CadExtractRecord) => void;
  draftOwner?: string; onPreparationPending?: (pending: boolean) => void;
  onEditBusy?: (busy: boolean) => void;
}) {
  const floors = record.data.spaces?.floors ?? [];
  const [floorIndex, setFloorIndex] = useState(0);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [proposalDraft, setProposalDraft] = useState("");
  const [paintMode, setPaintMode] = useState<"add" | "erase" | "create" | null>(null);
  const [saving, setSaving] = useState(false);
  const [fitting, setFitting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  useEffect(() => { onPreparationPending?.(preparing); return () => onPreparationPending?.(false); }, [preparing, onPreparationPending]);
  const [layoutScheme, setLayoutScheme] = useState<string | null>(null);
  const [editError, setEditError] = useState("");
  const planRef = useRef<HTMLImageElement | null>(null);
  const [polygon, setPolygon] = useState<Array<{ x: number; y: number }>>([]);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const polygonRef = useRef(polygon);
  const paintModeRef = useRef(paintMode);
  polygonRef.current = polygon;
  paintModeRef.current = paintMode;
  const floor = floors[Math.min(floorIndex, Math.max(floors.length - 1, 0))] ?? null;
  const rooms = useMemo(
    () => [...(floor?.rooms ?? [])].sort((left, right) => right.area_ratio - left.area_ratio),
    [floor],
  );
  const listedRooms = rooms.filter((room) => room.area_ratio >= 0.005 || room.function_source === "edited");
  const hiddenRoomCount = rooms.length - listedRooms.length;
  const activeRoom = listedRooms.find((room) => room.room_id === roomId) ?? listedRooms[0] ?? null;
  type EditSnapshot = {
    token: number; extractId: string; floorIndex: number; roomId: string;
    action: "rename" | "remove" | "paint" | "create" | "undo"; stamp: string;
    mode: typeof paintMode; name: string; points: Array<{ x: number; y: number }>;
  };
  const mounted = useRef(true);
  const sequence = useRef(0);
  const activeEdit = useRef<EditSnapshot | null>(null);
  const [uncertainEdit, setUncertainEdit] = useState<EditSnapshot | null>(null);
  const uncertainRef = useRef(uncertainEdit);
  uncertainRef.current = uncertainEdit;
  const [checkingEdit, setCheckingEdit] = useState(false);
  const checkingRef = useRef(false);
  const [checkedEdit, setCheckedEdit] = useState(false);
  const latestContext = useRef({ extractId: record.extract_id, floorIndex: floor?.floor_index });
  latestContext.current = { extractId: record.extract_id, floorIndex: floor?.floor_index };
  const draftStamp = useRef("");
  draftStamp.current = JSON.stringify([record.extract_id, floor?.floor_index, paintMode, proposalDraft, polygon]);
  const editBlocked = saving || uncertainEdit !== null || checkingEdit;
  const editBlockedRef = useRef(editBlocked);
  editBlockedRef.current = editBlocked;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    activeEdit.current = null; uncertainRef.current = null; checkingRef.current = false;
    setUncertainEdit(null); setCheckingEdit(false); setCheckedEdit(false); setSaving(false); setEditError("");
    setPolygon([]); setCursor(null); setPaintMode(null);
  }, [record.extract_id]);
  useEffect(() => { onEditBusy?.(editBlocked); return () => onEditBusy?.(false); }, [editBlocked, onEditBusy]);
  useEffect(() => {
    if ((!editBlocked && polygon.length === 0) || typeof window === "undefined") return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editBlocked, polygon.length]);
  const liveEdit = useRef({ extractId: record.extract_id, floor, activeRoom, name: proposalDraft });
  liveEdit.current = { extractId: record.extract_id, floor, activeRoom, name: proposalDraft };
  const floorFitout = (record.data.spaces?.fitout?.floors ?? []).find((item) => item.floor_index === floor?.floor_index) ?? null;
  const layoutVariants = floorFitout?.variants ?? [];
  const activeLayout = layoutVariants.find((item) => item.id === (layoutScheme ?? floorFitout?.scheme)) ?? null;
  const layoutFurniture = activeLayout?.furniture ?? floorFitout?.furniture ?? [];
  const layoutScore = activeLayout?.score ?? floorFitout?.score;
  const layoutNote = activeLayout?.note ?? floorFitout?.note;
  useEffect(() => {
    setLayoutScheme(null);
  }, [record.extract_id, floor?.floor_index]);
  const drawRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (paintMode !== null || editBlockedRef.current) return;
    setProposalDraft(activeRoom?.proposal || activeRoom?.function || "");
  }, [activeRoom?.room_id, activeRoom?.proposal, activeRoom?.function, paintMode]);
  useEffect(() => {
    if (editBlockedRef.current) return;
    setPaintMode(null);
    setPolygon([]);
    setCursor(null);
  }, [activeRoom?.room_id, floorIndex]);
  const extraWarnings = record.warnings.filter((item) => item.trim() && item !== TIANZHENG_NOTE);
  const layers = record.data.layers ?? [];
  const texts = record.data.texts;
  const hasDetail =
    layers.length > 0 ||
    (texts?.room_labels?.length ?? 0) > 0 ||
    (texts?.dimensions?.length ?? 0) > 0 ||
    (texts?.misc?.length ?? 0) > 0 ||
    Boolean(record.data.semantics?.suggested_prompt_en) ||
    Boolean(record.data.meta?.model_extents) ||
    (record.data.spaces?.principles?.length ?? 0) > 0;

  function ownsEdit(snapshot: EditSnapshot): boolean {
    return mounted.current && latestContext.current.extractId === snapshot.extractId && activeEdit.current?.token === snapshot.token;
  }
  function clearSubmittedSketch(snapshot: EditSnapshot) {
    if (latestContext.current.extractId !== snapshot.extractId || latestContext.current.floorIndex !== snapshot.floorIndex || draftStamp.current !== snapshot.stamp) return;
    setPolygon([]); setCursor(null); setPaintMode(null);
  }
  async function saveEdit(action: "rename" | "remove" | "paint" | "create" | "undo", strokes?: Array<{ x: number; y: number; erase: boolean }>) {
    const context = liveEdit.current;
    const currentFloor = context.floor, currentRoom = context.activeRoom;
    if (editBlockedRef.current || activeEdit.current || !currentFloor || ((action === "rename" || action === "remove" || action === "paint") && !currentRoom)) return;
    const snapshot: EditSnapshot = { token: ++sequence.current, extractId: context.extractId, floorIndex: currentFloor.floor_index,
      roomId: action === "undo" || action === "create" ? "" : currentRoom?.room_id || "", action,
      stamp: draftStamp.current, mode: paintModeRef.current, name: context.name, points: polygonRef.current.map(point => ({ ...point })) };
    activeEdit.current = snapshot; editBlockedRef.current = true;
    setSaving(true); setEditError("");
    const knownRooms = new Set((currentFloor.rooms ?? []).map(room => room.room_id));
    try {
      const updated = await api.editCadRoom(snapshot.extractId, {
        floor_index: snapshot.floorIndex,
        room_id: snapshot.roomId,
        action: snapshot.action,
        proposal: action === "create" ? snapshot.name.trim() || "新分区" : action === "rename" ? snapshot.name.trim() : undefined,
        strokes: strokes?.map(point => ({ ...point })),
      });
      if (!ownsEdit(snapshot)) return;
      const nextFloor = updated.data?.spaces?.floors?.find(item => item.floor_index === snapshot.floorIndex);
      if (updated.extract_id !== snapshot.extractId || !nextFloor) throw new Error("返回记录不属于本次编辑或缺少楼层，请核对是否写入。");
      onUpdated(updated);
      if ((action === "create" || action === "paint") && draftStamp.current === snapshot.stamp && latestContext.current.floorIndex === snapshot.floorIndex) {
        clearSubmittedSketch(snapshot);
        if (action === "create") {
          const created = nextFloor.rooms?.find(room => !knownRooms.has(room.room_id));
          if (created) setRoomId(created.room_id);
        }
      }
    } catch (error) {
      if (!ownsEdit(snapshot)) return;
      const message = error instanceof Error ? error.message : "没有保存这次修改";
      if (cadRoomEditWasRejected(error)) setEditError(message);
      else {
        uncertainRef.current = snapshot; setUncertainEdit(snapshot); setCheckedEdit(false);
        setEditError(`本次是否写入尚未确认，草稿仍保留，不能直接重发。${message}`);
      }
    } finally {
      if (ownsEdit(snapshot)) { activeEdit.current = null; setSaving(false); }
    }
  }
  async function checkUncertainEdit() {
    const snapshot = uncertainRef.current;
    if (!snapshot || checkingRef.current) return;
    checkingRef.current = true; setCheckingEdit(true); setCheckedEdit(false); setEditError("");
    try {
      const updated = await api.getCadExtract(snapshot.extractId);
      if (!mounted.current || latestContext.current.extractId !== snapshot.extractId || uncertainRef.current !== snapshot) return;
      if (updated.extract_id !== snapshot.extractId || !updated.data?.spaces?.floors?.some(item => item.floor_index === snapshot.floorIndex)) throw new Error("核对返回的图纸或楼层不匹配");
      onUpdated(updated); setCheckedEdit(true);
      setEditError("最新记录已刷新。请查看分区和名称，人工核对本次是否写入；不会自动重发。一次读取未变化也不能证明原请求未写入。");
    } catch (error) {
      if (mounted.current && latestContext.current.extractId === snapshot.extractId && uncertainRef.current === snapshot) setEditError(`未完成核对，仍不能重发。${error instanceof Error ? error.message : "请稍后再次核对"}`);
    } finally {
      if (mounted.current && latestContext.current.extractId === snapshot.extractId && uncertainRef.current === snapshot) {
        checkingRef.current = false; setCheckingEdit(false);
      }
    }
  }
  function finishUncertainEdit(acknowledged: boolean) {
    const snapshot = uncertainRef.current;
    if (!snapshot || checkingRef.current || (acknowledged && !checkedEdit)) return;
    clearSubmittedSketch(snapshot);
    if (latestContext.current.floorIndex === snapshot.floorIndex && draftStamp.current === snapshot.stamp) setProposalDraft(liveEdit.current.activeRoom?.proposal || liveEdit.current.activeRoom?.function || "");
    uncertainRef.current = null; setUncertainEdit(null); setCheckedEdit(false); setEditError("");
  }

  function pointOnPlan(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = drawRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  function closesPolygon(point: { x: number; y: number }) {
    const first = polygonRef.current[0];
    const canvas = drawRef.current;
    if (!first || polygonRef.current.length < 3 || !canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const dx = (point.x - first.x) * rect.width;
    const dy = (point.y - first.y) * rect.height;
    return Math.hypot(dx, dy) <= 16;
  }

  function commitPolygon() {
    if (editBlockedRef.current || activeEdit.current) return;
    const mode = paintModeRef.current;
    const points = polygonRef.current;
    if (!mode || points.length < 3) return;
    const strokes = points.map(point => ({ ...point, erase: mode === "erase" }));
    void saveEdit(mode === "create" ? "create" : "paint", strokes);
  }

  function drawPolygon() {
    const canvas = drawRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.clearRect(0, 0, width, height);
    if (!paintMode || polygon.length === 0) return;
    const swatch = paintMode === "erase" ? "255,255,255" : paintMode === "create" ? "255,235,59" : hexToRgb(activeRoom?.swatch || "#ff6347");
    const toX = (value: number) => value * width;
    const toY = (value: number) => value * height;
    const preview = cursor ? [...polygon, cursor] : polygon;
    if (preview.length >= 3) {
      context.beginPath();
      preview.forEach((point, index) => {
        const x = toX(point.x);
        const y = toY(point.y);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.fillStyle = `rgba(${swatch},0.35)`;
      context.fill();
    }
    context.beginPath();
    polygon.forEach((point, index) => {
      const x = toX(point.x);
      const y = toY(point.y);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    if (cursor) context.lineTo(toX(cursor.x), toY(cursor.y));
    context.strokeStyle = `rgba(${swatch},0.95)`;
    context.lineWidth = 1.5;
    context.stroke();
    polygon.forEach((point, index) => {
      context.beginPath();
      context.arc(toX(point.x), toY(point.y), index === 0 ? 6 : 3.5, 0, Math.PI * 2);
      context.fillStyle = index === 0 ? "#fff" : `rgba(${swatch},0.95)`;
      context.strokeStyle = "#111";
      context.lineWidth = 1;
      context.fill();
      context.stroke();
    });
  }

  useEffect(() => {
    drawPolygon();
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (editBlockedRef.current) return;
      if (polygonRef.current.length > 0) {
        event.preventDefault();
        setPolygon((current) => current.slice(0, -1));
        return;
      }
      if ((floor?.undo_count ?? 0) > 0) {
        event.preventDefault();
        void saveEdit("undo");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [floor?.undo_count, floor?.floor_index, activeRoom?.room_id]);

  useEffect(() => {
    if (!paintMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (editBlockedRef.current) return;
      if (event.key === "Escape") {
        setPaintMode(null);
        setPolygon([]);
        setCursor(null);
      } else if (event.key === "Enter" && polygonRef.current.length >= 3) {
        event.preventDefault();
        commitPolygon();
      } else if (event.key === "Backspace") {
        event.preventDefault();
        setPolygon((current) => current.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paintMode]);

  return (
    <article className="feedback-panel cad-result">
      <div className="cad-result-head">
        <div>
          <span className={`cad-status cad-status-${record.status}`}>{statusLabel(record.status)}</span>
          <h2>{record.file_name}</h2>
          <p>
            {record.extract_id}
            {record.created_at ? ` · ${formatChinaMonthDayTime(record.created_at)}` : ""}
            {record.status === "ok" && record.data.meta?.entity_total != null
              ? ` · ${record.data.meta.entity_total} 个图元`
              : ""}
            {record.status === "ok" && record.data.meta?.units ? ` · ${record.data.meta.units}` : ""}
          </p>
        </div>
        <div className="template-editor-actions">
          <button type="button" className="ghost-button" onClick={() => onCopy(record.extract_id)}>
            {copied ? "已复制" : "复制 ID"}
          </button>
          <button type="button" className="ghost-button" onClick={() => onDownload(record)}>
            下载 JSON
          </button>
        </div>
      </div>

      {uncertainEdit ? <div role="alert">
        <p>第{uncertainEdit.floorIndex}层的“{({ rename: "保存功能", remove: "移除分区", paint: "调整范围", create: "新建分区", undo: "撤销" })[uncertainEdit.action]}”是否写入尚未确认。顶点和名称仍保留；核对前后都不会自动重发。</p>
        <p>提交名称：{uncertainEdit.name || "无"}；提交顶点：{uncertainEdit.points.length}个。</p>
        <button type="button" disabled={checkingEdit} onClick={() => void checkUncertainEdit()}>{checkingEdit ? "核对中" : "核对最新记录"}</button>
        {checkedEdit ? <button type="button" disabled={checkingEdit} onClick={() => finishUncertainEdit(true)}>我已核对写入，结束本次草稿</button> : null}
        <button type="button" disabled={checkingEdit} onClick={() => finishUncertainEdit(false)}>放弃本次重发并清除草稿</button>
        <p>放弃只清除本地草稿；原请求仍可能写入，不代表撤回或确认成功。</p>
        {editError ? <p>{editError}</p> : null}
      </div> : null}
      {record.error_message ? <div className="floating-error">{errorLabel(record.error_message)}</div> : null}
      {extraWarnings.length > 0 ? (
        <ul className="cad-warning-list">
          {extraWarnings.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}

      {record.status === "ok" ? (
        <>
          {record.data.semantics?.space_summary_zh ? (
            <p className="cad-summary">{record.data.semantics.space_summary_zh}</p>
          ) : null}
          {record.data.spaces?.relations_zh ? <p className="cad-summary">{record.data.spaces.relations_zh}</p> : null}

          {floors.length > 0 ? (
            <>
              {floors.length > 1 ? (
                <div className="cad-floor-tabs" role="tablist" aria-label="平面">
                  {floors.map((item, index) => (
                    <button
                      key={item.label}
                      type="button"
                      role="tab"
                      disabled={editBlocked}
                      aria-selected={index === floorIndex}
                      className={index === floorIndex ? "is-active" : undefined}
                      onClick={() => {
                        if (editBlockedRef.current) return;
                        if (index !== floorIndex && preparing && !window.confirm("本层草稿将保留在本标签页。保留草稿并切换平面？")) return;
                        setFloorIndex(index);
                        setRoomId(null);
                      }}
                    >
                      {item.label}
                      <span>{(item.rooms ?? []).filter((room) => room.area_ratio >= 0.005).length}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <h3 className="cad-floor-title">{floor?.label}</h3>
              )}

              {floor ? <CadPreparationPanel key={`${record.extract_id}:${floor.floor_index}`} record={record} floor={floor}
                busy={fitting || editBlocked} onUpdated={onUpdated} onPendingChange={setPreparing} draftOwner={draftOwner} /> : null}
              {floorFitout && (!floor?.preparation?.current || floorFitout.preparation_signature !== floor.preparation.signature) ? (
                <p role="status">当前显示的是此前保存的方案，尚未应用本层最新布置条件。确认并保存条件后，点击“布置这一层”重新生成。</p>
              ) : null}
              {layoutVariants.length > 1 ? (
                <div className="cad-scheme-tabs" role="tablist" aria-label="布置方案">
                  {layoutVariants.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={item.id === (activeLayout?.id ?? floorFitout?.scheme)}
                      className={item.id === (activeLayout?.id ?? floorFitout?.scheme) ? "is-active" : undefined}
                      onClick={() => setLayoutScheme(item.id)}
                    >
                      {item.label}
                      {typeof item.score?.loss === "number" ? <span>{item.score.loss}</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
              {layoutScore?.terms ? (
                <div className="cad-score" aria-label="损失函数">
                  <p>
                    排布参考分 {layoutScore.loss}，越低越符合当前规则；不代表流线和使用质量已通过验收。
                    {layoutScore.passed === false ? " 重叠、越界或撞柱超过 2%，这套另加 100，表示没有通过。" : ""}
                  </p>
                  <ul>
                    {Object.keys(HARD_LABELS).map((name) => {
                      const degree = layoutScore.terms?.[name] ?? 0;
                      const label = layoutScore.labels?.[name] || HARD_LABELS[name];
                      return (
                        <li key={name} className={name === layoutScore.worst ? "is-worst" : undefined}>
                          <span>{label}</span>
                          <strong>{degree > 0.02 ? "未通过" : "通过"}</strong>
                        </li>
                      );
                    })}
                    {Object.keys(SCORE_WEIGHTS).map((name) => {
                      const degree = layoutScore.terms?.[name] ?? 0;
                      const points = Math.round(SCORE_WEIGHTS[name] * degree * 100) / 100;
                      const label = layoutScore.labels?.[name] || SCORE_LABELS[name] || name;
                      return (
                        <li key={name} className={name === layoutScore.worst ? "is-worst" : undefined}>
                          <span>{label}</span>
                          <strong>{points.toFixed(2)}</strong>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              <div className="cad-compare">
                <section className="cad-compare-pane" aria-label="分区">
                  <h3>{floor?.label} · 分区</h3>
                {floor?.preview_path ? (
                  <div className={paintMode ? "cad-plan is-painting" : "cad-plan"}>
                    <img ref={planRef} src={floor.preview_path} alt={`${floor.label}分区`} draggable={false} />
                    {floor.line_path ? (
                      <img className="cad-plan-lines" src={floor.line_path} alt="" draggable={false} />
                    ) : null}
                    <canvas
                      ref={drawRef}
                      className="cad-plan-draw"
                      onPointerDown={(event) => {
                        if (!paintMode || editBlockedRef.current) return;
                        event.preventDefault();
                        const point = pointOnPlan(event);
                        if (!point) return;
                        if (closesPolygon(point)) {
                          commitPolygon();
                          return;
                        }
                        setPolygon((current) => [...current, point]);
                      }}
                      onPointerMove={(event) => {
                        if (!paintMode || editBlockedRef.current) return;
                        setCursor(pointOnPlan(event));
                      }}
                    />
                    {listedRooms.map((room) =>
                      typeof room.marker_x === "number" && typeof room.marker_y === "number" ? (
                        <button
                          key={room.room_id}
                          type="button"
                          className={room.room_id === activeRoom?.room_id ? "cad-plan-marker is-active" : "cad-plan-marker"}
                          style={{ left: `${room.marker_x * 100}%`, top: `${room.marker_y * 100}%`, background: room.swatch || "#111" }}
                          disabled={editBlocked} onClick={() => { if (!editBlockedRef.current) setRoomId(room.room_id); }}
                        >
                          {room.marker}
                        </button>
                      ) : null,
                    )}
                  </div>
                ) : (
                  <p className="cad-empty-inline">这一层没有分区预览。</p>
                )}
                </section>
                <aside className="cad-zone-key" aria-label="分区编号">
                  <h3>功能</h3>
                  {listedRooms.length === 0 ? (
                    <p className="cad-empty-inline">这一层没有识别到房间。</p>
                  ) : (
                    <div className="cad-room-list" role="listbox" aria-label="房间">
                      {listedRooms.map((room) => (
                        <button
                          key={room.room_id}
                          type="button"
                          role="option"
                          aria-selected={room.room_id === activeRoom?.room_id}
                          className={room.room_id === activeRoom?.room_id ? "is-active" : undefined}
                          disabled={editBlocked} onClick={() => { if (!editBlockedRef.current) setRoomId(room.room_id); }}
                        >
                          <strong>
                            <i className="cad-room-swatch" style={{ background: room.swatch || "#111" }} />
                            {room.marker ? `${room.marker} ` : ""}
                            {room.proposal || room.function || room.zoning?.role || "待分区"}
                          </strong>
                          <span>
                            {room.layout_kind ? `已确认${CAD_ROOM_KINDS.find(([id]) => id === room.layout_kind)?.[1] || room.layout_kind} · ` : ""}
                            {[room.zoning?.activity, room.zoning?.hygiene].filter((item) => item && item !== "中性").join(" ")}{" "}
                            {roomAreaText(room)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {hiddenRoomCount > 0 ? <p className="cad-empty-inline">另有 {hiddenRoomCount} 个过小区域未列出。</p> : null}
                </aside>
                <section className="cad-compare-pane" aria-label="布置">
                  <div className="cad-compare-head">
                    <h3>{floor?.label} · 布置</h3>
                    <div className="cad-program-actions">
                      <button
                        type="button"
                        disabled={fitting || editBlocked || preparing || !floor?.preparation?.current}
                        onClick={() => {
                          if (!floor) return;
                          setFitting(true);
                          setEditError("");
                          void api
                            .layoutCadFitout(record.extract_id, floor.floor_index)
                            .then(onUpdated)
                            .catch((cause: unknown) => setEditError(cause instanceof Error ? cause.message : "没有完成布置"))
                            .finally(() => setFitting(false));
                        }}
                      >
                        {fitting ? "布置中" : "布置这一层"}
                      </button>
                      {floorFitout ? (
                        <button
                          type="button"
                          disabled={fitting || editBlocked || preparing || !floor}
                          onClick={() => {
                            if (!floor) return;
                            setFitting(true);
                            setEditError("");
                            void api
                              .layoutCadFitout(record.extract_id, floor.floor_index, true)
                              .then(onUpdated)
                              .catch((cause: unknown) => setEditError(cause instanceof Error ? cause.message : "没有清除布置"))
                              .finally(() => setFitting(false));
                          }}
                        >
                          清除这一层
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {editError ? <p role="alert">{editError}</p> : null}
                  {!floor?.preparation ? <p>先完成上方“布置前确认”，再生成本层方案。</p> : null}
                  {floor?.line_path || floorFitout ? (
                    <div className="cad-layout-plan">
                      {floor?.line_path ? <img src={floor.line_path} alt={`${floor.label}布置`} draggable={false} /> : null}
                      {floorFitout ? (
                        <svg
                          className="cad-fitout"
                          viewBox={`0 0 ${floorFitout.width || 1} ${floorFitout.height || 1}`}
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          {(floorFitout.reserved_routes ?? []).map((route, i) => <polyline key={`route-${i}`}
                            points={route.points.map(p => `${p.x * (floorFitout.width || 1)},${p.y * (floorFitout.height || 1)}`).join(" ")}
                            fill="none" stroke="#168aff" opacity="0.22" strokeLinecap="round" strokeLinejoin="round"
                            strokeWidth={route.width_m / (floorFitout.meters_per_pixel || 0.05)} />)}
                          {(floorFitout.partitions ?? []).map((item) => (
                            <line
                              key={item.id}
                              className={
                                item.label === "厕位门" || item.label === "卫生间门" || item.label === "入口门"
                                  ? "is-door"
                                  : item.label === "男女分隔" || item.label === "厕位隔板" || item.label === "入口隔墙"
                                    ? "is-wall"
                                    : undefined
                              }
                              x1={item.x1 * (floorFitout.width || 1)}
                              y1={item.y1 * (floorFitout.height || 1)}
                              x2={item.x2 * (floorFitout.width || 1)}
                              y2={item.y2 * (floorFitout.height || 1)}
                            />
                          ))}
                          {layoutFurniture.map((item) => (
                            <FurnitureGlyph key={item.id} item={item} planWidth={floorFitout.width || 1} planHeight={floorFitout.height || 1} />
                          ))}
                        </svg>
                      ) : null}
                    </div>
                  ) : (
                    <p className="cad-empty-inline">这一层还没有墙线图。</p>
                  )}
                  {layoutNote ? <p className="cad-empty-inline">{layoutNote}</p> : null}
                  {floorFitout?.route_note ? <p className="cad-empty-inline">{floorFitout.route_note}</p> : null}
                  {floorFitout ? (
                    <p className="cad-empty-inline">
                      分隔墙 {(floorFitout.partitions ?? []).length} 段，家具 {layoutFurniture.length} 件。
                      {layoutFurniture.some((item) => item.group)
                        ? ` 按组团摆：${Array.from(new Set(layoutFurniture.map((item) => item.group).filter((group): group is string => Boolean(group)))).join("、")}。`
                        : ""}
                      {(floorFitout.partitions ?? []).some((item) => item.label === "男女分隔")
                        ? " 和旁边房间相接的开口加了隔墙，入口的门是关上的，外面看不到厕位。男女卫之间一道隔墙接到两边；每个厕位是独立隔间，前面的门也是关上的。女卫是厕位和洗手池，男卫再加小便池。"
                        : ""}
                      {layoutScore ? ` 布置得分 ${layoutScore.loss}，越低越好。${layoutScore.worst_label ? `主要扣在${layoutScore.worst_label}。` : ""}` : ""}
                    </p>
                  ) : (
                    <p className="cad-empty-inline">还没有布置。点「布置这一层」，生成这一层的分隔墙和家具。</p>
                  )}
                </section>
              </div>
              <div className="cad-room-pane">
                  {floor?.scheme_zh ? <p className="cad-summary">{floor.scheme_zh}</p> : null}
                  {floor?.scale_note || record.data.spaces?.unit_note ? <p className="cad-empty-inline">{floor?.scale_note || record.data.spaces?.unit_note}</p> : null}
                  {activeRoom?.layout_hint ? (
                    <p className="cad-room-hint">
                      <small>
                        {activeRoom.proposal || activeRoom.function || activeRoom.zoning?.role || "待分区"}
                        {activeRoom.zoning?.activity && activeRoom.zoning.activity !== "中性" ? ` · ${activeRoom.zoning.activity}` : ""}
                        {activeRoom.zoning?.hygiene && activeRoom.zoning.hygiene !== "中性" ? ` · ${activeRoom.zoning.hygiene}` : ""}
                        {` · ${roomAreaText(activeRoom)}`}
                      </small>
                      {activeRoom.layout_hint}
                    </p>
                  ) : null}
                  <div className="cad-room-edit">
                    <div>
                      <button type="button" disabled={editBlocked || !(floor?.undo_count)} onClick={() => void saveEdit("undo")}>
                        撤销上一步
                      </button>
                    </div>
                  </div>
                  {activeRoom ? (
                    <div className="cad-room-edit">
                      <label>
                        功能
                        <input value={proposalDraft} disabled={editBlocked} onChange={(event) => { if (!editBlockedRef.current) setProposalDraft(event.target.value); }} maxLength={40} />
                      </label>
                      <div>
                        <button type="button" disabled={editBlocked || !proposalDraft.trim()} onClick={() => void saveEdit("rename")}>
                          保存功能
                        </button>
                        <button
                          type="button"
                          className={paintMode === "add" ? "is-active" : undefined}
                          disabled={editBlocked}
                          onClick={() => setPaintMode((mode) => (mode === "add" ? null : "add"))}
                        >
                          扩大范围
                        </button>
                        <button
                          type="button"
                          className={paintMode === "erase" ? "is-active" : undefined}
                          disabled={editBlocked}
                          onClick={() => setPaintMode((mode) => (mode === "erase" ? null : "erase"))}
                        >
                          缩小范围
                        </button>
                        <button
                          type="button"
                          className={paintMode === "create" ? "is-active" : undefined}
                          disabled={editBlocked}
                          onClick={() => {
                            if (paintMode === "create") {
                              setPaintMode(null);
                              return;
                            }
                            setProposalDraft("新分区");
                            setPaintMode("create");
                          }}
                        >
                          新建分区
                        </button>
                        {paintMode ? (
                          <>
                            <button type="button" disabled={editBlocked || polygon.length < 3} onClick={commitPolygon}>
                              完成选区
                            </button>
                            <button type="button" disabled={editBlocked || polygon.length === 0} onClick={() => setPolygon((current) => current.slice(0, -1))}>
                              撤销顶点
                            </button>
                            <button
                              type="button"
                              disabled={editBlocked}
                              onClick={() => {
                                setPaintMode(null);
                                setPolygon([]);
                                setCursor(null);
                              }}
                            >
                              取消
                            </button>
                          </>
                        ) : null}
                        <button type="button" disabled={editBlocked} onClick={() => void saveEdit("remove")}>
                          移除
                        </button>
                      </div>
                      {paintMode === "create" ? (
                        <p>依次点击顶点。可以圈在空白处，也可以从已有分区里切出一块。闭合后成为新分区，名称用上面的功能框。墙线保持在上层。</p>
                      ) : paintMode ? (
                        <p>依次点击顶点圈出范围，点回白色起点、按回车或点「完成选区」闭合。墙线保持在上层。</p>
                      ) : null}
                      {editError ? <p>{editError}</p> : null}
                    </div>
                  ) : null}
              </div>
              <CadProgramPanel
                record={record}
                activeFloorIndex={floor.floor_index}
                onUpdated={onUpdated}
                onFocus={(nextFloor, nextRoom) => {
                  const index = floors.findIndex((item) => item.floor_index === nextFloor);
                  if (index >= 0) setFloorIndex(index);
                  setRoomId(nextRoom);
                }}
              />
            </>
          ) : (
            <p className="cad-empty-inline">还没有拆出可分区的平面。</p>
          )}

          {hasDetail ? (
            <details className="cad-detail">
              <summary>图层与文字</summary>
              <div className="cad-detail-body">
                {(record.data.spaces?.principles ?? []).map((item) => (
                  <p key={item} className="cad-summary">
                    {item}
                  </p>
                ))}
                {record.data.meta?.model_extents ? (
                  <p className="cad-summary">
                    <small>包围盒</small>
                    {formatExtents(record)}
                  </p>
                ) : null}
                {record.data.semantics?.suggested_prompt_en ? (
                  <p className="cad-summary">
                    <small>建议英文提示词</small>
                    {record.data.semantics.suggested_prompt_en}
                  </p>
                ) : null}
                <ChipList title="房间名" items={texts?.room_labels ?? []} />
                <ChipList title="尺寸" items={texts?.dimensions ?? []} />
                <ChipList title="其他文字" items={texts?.misc ?? []} />
                {layers.length > 0 ? (
                  <div className="cad-layer-scroll">
                    <table className="cad-layer-table">
                      <thead>
                        <tr>
                          <th>图层</th>
                          <th>分类</th>
                          <th>图元</th>
                        </tr>
                      </thead>
                      <tbody>
                        {layers.map((layer) => (
                          <tr key={layer.name}>
                            <td>{layer.name}</td>
                            <td>{roleLabel(layer.role)}</td>
                            <td>{layer.entity_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

function CadProgramPanel({
  record,
  activeFloorIndex,
  onUpdated,
  onFocus,
}: {
  record: CadExtractRecord;
  activeFloorIndex: number;
  onUpdated: (record: CadExtractRecord) => void;
  onFocus: (floorIndex: number, roomId: string) => void;
}) {
  const floors = record.data.spaces?.floors ?? [];
  const program = useMemo(() => buildCadProgram(floors), [floors]);
  const savedNotes = record.data.spaces?.program_review?.notes ?? {};
  const savedKey = notesVersion(savedNotes);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [rearranging, setRearranging] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposal, setProposal] = useState<CadProgramRearrangeResult | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [notesConflict, setNotesConflict] = useState(false);
  const loadedFor = useRef<{ id: string; key: string } | null>(null);
  const draftRef = useRef(drafts);
  draftRef.current = drafts;
  const revision = useRef(0);
  const requestSequence = useRef(0);
  const activeRequest = useRef<number | null>(null);
  const mounted = useRef(true);
  const latest = useRef({ id: record.extract_id, key: savedKey });
  latest.current = { id: record.extract_id, key: savedKey };
  const expectedAck = useRef<{ id: string; key: string } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const previous = loadedFor.current;
    if (previous?.id === record.extract_id && previous.key === savedKey) return;
    const sameRecord = previous?.id === record.extract_id;
    const localDirty = sameRecord && notesVersion(draftRef.current) !== previous.key;
    const ownAck = expectedAck.current?.id === record.extract_id && expectedAck.current.key === savedKey;
    if (!sameRecord) {
      activeRequest.current = null; expectedAck.current = null; revision.current = 0;
      setSaving(false); setRearranging(false); setApplying(false); setError("");
    }
    if (!localDirty) {
      setDrafts({ ...savedNotes }); setNotesConflict(false);
      if (!ownAck) setStatus("");
    } else if (!ownAck) {
      setNotesConflict(true); setStatus("图上的意见已变化，本地输入仍保留。请先选择采用哪一版。");
    }
    loadedFor.current = { id: record.extract_id, key: savedKey };
    if (ownAck) expectedAck.current = null;
    setProposal(null);
  }, [record.extract_id, savedKey]);
  function changeNote(key: string, value: string) {
    revision.current += 1;
    setDrafts(current => ({ ...current, [key]: value }));
    setStatus("");
  }
  function beginRequest(): number | null {
    if (activeRequest.current !== null) return null;
    const token = ++requestSequence.current;
    activeRequest.current = token;
    return token;
  }
  function accepts(token: number, id: string): boolean {
    return mounted.current && activeRequest.current === token && latest.current.id === id;
  }

  const floorItems = program.items.filter((item) => item.floorIndex === activeFloorIndex);
  const floorLabel = floors.find((item) => item.floor_index === activeFloorIndex)?.label ?? `平面 ${activeFloorIndex}`;
  const floorProposalItems = (proposal?.items ?? []).filter((item) => item.floor_index === activeFloorIndex);
  const otherProposalCount = (proposal?.items.length ?? 0) - floorProposalItems.length;
  if (program.items.length === 0) return null;

  const dirty = notesVersion(drafts) !== savedKey;

  async function saveNotes() {
    if (!dirty || notesConflict) return;
    const token = beginRequest();
    if (token === null) return;
    const origin = record.extract_id, sentKey = savedKey, sentRevision = revision.current;
    const submitted = normalizeNotes(drafts);
    expectedAck.current = { id: origin, key: notesVersion(submitted) };
    setSaving(true); setError(""); setStatus("");
    try {
      const updated = await api.saveCadProgramReview(origin, { notes: submitted });
      if (!accepts(token, origin)) return;
      const notes = updated.data?.spaces?.program_review?.notes;
      if (updated.extract_id !== origin || !notes || typeof notes !== "object") throw new Error("保存响应不属于当前图纸或缺少意见，请核对记录；本地输入仍保留。");
      const returnedKey = notesVersion(notes);
      if (latest.current.key !== sentKey && latest.current.key !== returnedKey) {
        setNotesConflict(true); setError("保存期间图上的意见又有变化，请核对最新记录；本地输入仍保留。"); return;
      }
      expectedAck.current = latest.current.key === returnedKey ? null : { id: origin, key: returnedKey };
      const unchanged = revision.current === sentRevision;
      if (unchanged && notesVersion(submitted) === returnedKey) setDrafts({ ...notes });
      setNotesConflict(false);
      onUpdated(updated);
      setStatus(notesVersion(draftRef.current) === returnedKey ? "审查意见已留在这张图上。房间边界没有改。" : "返回版本的意见已保存；本地还有未保存的输入。");
    } catch (cause) {
      if (accepts(token, origin)) { expectedAck.current = null; setError(cause instanceof Error ? cause.message : "没有保存审查意见"); }
    } finally {
      if (accepts(token, origin)) { activeRequest.current = null; setSaving(false); }
    }
  }

  async function rearrange() {
    if (dirty || notesConflict) return;
    const token = beginRequest();
    if (token === null) return;
    const origin = record.extract_id, sourceKey = savedKey;
    setRearranging(true);
    setError("");
    setStatus("");
    setProposal(null);
    try {
      const result = await api.rearrangeCadProgram(origin);
      if (!accepts(token, origin)) return;
      if (latest.current.key !== sourceKey) { setError("图上的意见已变化，请按最新意见重新生成建议。"); return; }
      setProposal(result);
      setStatus(result.items.length === 0 ? "这些意见没有要改的名称或动静。" : "看一下方案，确认后才写入。");
    } catch (cause) {
      if (accepts(token, origin)) setError(cause instanceof Error ? cause.message : "没有完成这次重排");
    } finally {
      if (accepts(token, origin)) { activeRequest.current = null; setRearranging(false); }
    }
  }

  async function applyProposal() {
    const items = writableItems({ items: floorProposalItems, model_name: proposal?.model_name ?? "" });
    if (items.length === 0 || notesConflict) return;
    const token = beginRequest();
    if (token === null) return;
    const origin = record.extract_id, sourceKey = savedKey;
    setApplying(true);
    setError("");
    setStatus("");
    try {
      const updated = await api.applyCadProgram(origin, {
        items: items.map((item) => ({
          floor_index: item.floor_index,
          room_id: item.room_id,
          proposal: item.proposal,
          activity: item.activity,
          reason: item.reason,
        })),
      });
      if (!accepts(token, origin)) return;
      if (updated.extract_id !== origin || (latest.current.key !== sourceKey && latest.current.key !== notesVersion(updated.data.spaces?.program_review?.notes ?? {}))) {
        setNotesConflict(true); setError("图上的意见已变化，请核对记录；本地输入仍保留。"); return;
      }
      onUpdated(updated);
      setProposal((current) => {
        if (!current) return null;
        const rest = current.items.filter((item) => item.floor_index !== activeFloorIndex);
        return rest.length > 0 ? { ...current, items: rest } : null;
      });
      setStatus("这一层的名称和动静已写入。房间边界没有改。");
    } catch (cause) {
      if (accepts(token, origin)) setError(cause instanceof Error ? cause.message : "没有写入这次修改");
    } finally {
      if (accepts(token, origin)) { activeRequest.current = null; setApplying(false); }
    }
  }

  return (
    <section className="cad-program" aria-label={`${floorLabel}功能安排`}>
      <div className="cad-program-head">
        <h3>{floorLabel} · 功能安排</h3>
        <p>
          只显示当前平面。换上面的平面，看另一层。审查意见保存后，可以让对话模型按意见重排名称和动静，确认后才写入。改边界仍用上面的多边形选区。家具在上面的布置里。
        </p>
      </div>
      {floorItems.length === 0 ? (
        <p className="cad-empty-inline">这一层还没有可安排的房间。</p>
      ) : (
        <div className="cad-program-list">
          {floorItems.map((item) => (
            <article key={item.roomId} className={`cad-program-card is-${item.tone}`}>
              <header>
                <button type="button" onClick={() => onFocus(item.floorIndex, item.roomId)}>
                  {item.marker ? `${item.marker} ` : ""}
                  {item.name}
                </button>
                <span>{item.areaM2 > 0 ? `${item.areaM2.toFixed(1)}㎡` : "面积待核"}</span>
                <em>{item.verdict}</em>
              </header>
              <strong>{item.arrangement}</strong>
              <p>{item.contents}</p>
              <label>
                修改意见
                <textarea
                  value={drafts[item.roomId] ?? ""}
                  maxLength={500}
                  rows={2}
                  placeholder="例如：这间不要做开放办公，改成调解室"
                  onChange={(event) => changeNote(item.roomId, event.target.value)}
                />
              </label>
            </article>
          ))}
        </div>
      )}
      {gapsForFloor(program.gaps, activeFloorIndex).length > 0 ? (
        <ul className="cad-program-gaps">
          {gapsForFloor(program.gaps, activeFloorIndex).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      <label className="cad-program-general">
        整图意见
        <textarea
          value={drafts.general ?? ""}
          maxLength={500}
          rows={2}
          placeholder="例如：先把一层卫生间隔出来，二层先不摆家具"
          onChange={(event) => changeNote("general", event.target.value)}
        />
      </label>
      {proposal ? (
        <div className="cad-program-diff">
          <p>方案来自 {proposal.model_name || "对话模型"}。确认后才改这一层的名称和动静，墙和范围不动。</p>
          {floorProposalItems.length === 0 ? <p>这一层的意见没有要改的名称或动静。</p> : null}
          {floorProposalItems.map((item) => (
            <article key={item.room_id}>
              <strong>
                {item.marker ? `${item.marker} ` : ""}
                {item.current_name}
              </strong>
              <span>
                {item.current_name} · {item.current_activity} → {item.proposal} · {item.activity}
              </span>
              <p>{item.reason}</p>
              {item.split_hint ? <p>边界建议：{item.split_hint}。要用上面的多边形选区自己圈，这里不会自动改墙。</p> : null}
            </article>
          ))}
          {otherProposalCount > 0 ? <p>另一层还有 {otherProposalCount} 条建议。换上面的平面后再看、再确认。</p> : null}
        </div>
      ) : null}
      {notesConflict ? <div role="alert">
        <p>图上的意见与本地输入不同。本地内容仍在，确认后再保存。</p>
        <button type="button" disabled={saving || rearranging || applying} onClick={() => {
          setDrafts({ ...savedNotes }); revision.current += 1; setNotesConflict(false); setStatus("");
        }}>采用图上意见，放弃本地修改</button>
        <button type="button" disabled={saving || rearranging || applying} onClick={() => {
          setNotesConflict(false); setStatus("本地意见仍未保存。再次保存将替换图上的意见。");
        }}>保留本地意见，确认替换后再保存</button>
      </div> : null}
      <div className="cad-program-actions">
        <button type="button" disabled={saving || rearranging || applying || notesConflict || !dirty} onClick={() => void saveNotes()}>
          {saving ? "保存中" : "保存审查意见"}
        </button>
        <button
          type="button"
          disabled={saving || rearranging || applying || notesConflict || dirty || !hasProgramNotes(savedNotes)}
          onClick={() => void rearrange()}
        >
          {rearranging ? "正在重排" : "按意见重排"}
        </button>
        {writableItems({ items: floorProposalItems, model_name: proposal?.model_name ?? "" }).length > 0 ? (
          <button type="button" disabled={saving || applying || rearranging || notesConflict} onClick={() => void applyProposal()}>
            {applying ? "写入中" : "确认写入"}
          </button>
        ) : null}
        {proposal ? (
          <button type="button" disabled={saving || applying || rearranging || notesConflict} onClick={() => setProposal(null)}>
            放弃
          </button>
        ) : null}
        {dirty ? <span>先保存审查意见，再按意见重排。</span> : null}
        {status ? <span>{status}</span> : null}
        {error ? <span className="is-error">{error}</span> : null}
      </div>
    </section>
  );
}

function notesVersion(notes: Record<string, string>): string {
  return JSON.stringify(Object.entries(normalizeNotes(notes)).sort(([left], [right]) => left.localeCompare(right)));
}

function gapsForFloor(gaps: string[], floorIndex: number): string[] {
  return gaps.filter((gap) => {
    if (gap.startsWith("二层")) return floorIndex > 1;
    if (gap.startsWith("一层")) return floorIndex === 1;
    return true;
  });
}

function hasProgramNotes(notes: Record<string, string>): boolean {
  return Object.values(notes).some((value) => value.trim());
}

function writableItems(proposal: CadProgramRearrangeResult | null) {
  return (proposal?.items ?? []).filter((item) => item.proposal !== item.current_name || item.activity !== item.current_activity);
}

function normalizeNotes(notes: Record<string, string>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(notes)) {
    const text = value.trim();
    if (text) cleaned[key] = text;
  }
  return cleaned;
}

function ChipList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  const visible = items.slice(0, 40);
  return (
    <div className="cad-chip-block">
      <strong>
        {title}
        <span>{items.length}</span>
      </strong>
      <div className="cad-chip-row">
        {visible.map((item) => (
          <em key={item}>{item}</em>
        ))}
        {items.length > visible.length ? <em>+{items.length - visible.length}</em> : null}
      </div>
    </div>
  );
}

export default function CadExtractPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isGuest, currentUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [records, setRecords] = useState<CadExtractRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [preparationPending, setPreparationPending] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const editBusyRef = useRef(editBusy);
  editBusyRef.current = editBusy;
  const pendingRef = useRef(false);
  const selectedRef = useRef(selectedId);
  pendingRef.current = preparationPending || editBusy; selectedRef.current = selectedId;

  const selected = useMemo(
    () => records.find((item) => item.extract_id === selectedId) ?? null,
    [records, selectedId],
  );

  useEffect(() => {
    if (isGuest) return;
    let cancelled = false;
    api
      .listCadExtracts()
      .then((items) => {
        if (cancelled) return;
        setRecords(current => pendingRef.current && !items.some(item => item.extract_id === selectedRef.current)
          ? [...current.filter(item => item.extract_id === selectedRef.current), ...items] : items);
        const requested = searchParams.get("extract");
        setSelectedId((current) => {
          if (pendingRef.current) return current;
          if (requested && items.some((item) => item.extract_id === requested)) return requested;
          return current ?? items[0]?.extract_id ?? null;
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "无法加载图纸记录");
      });
    return () => {
      cancelled = true;
    };
  }, [isGuest, searchParams]);

  function rejectFile(message: string) {
    setFile(null);
    setError(message);
  }

  function acceptFile(next: File | null) {
    if (!next) return;
    if (isGuest) {
      rejectFile("登录后才能上传图纸。");
      return;
    }
    if (!cadExtension(next.name)) {
      rejectFile("只支持 .dxf 和 .dwg 文件。");
      return;
    }
    if (next.size > CAD_MAX_UPLOAD_BYTES) {
      rejectFile(`图纸不能超过 ${formatUploadSize(CAD_MAX_UPLOAD_BYTES)}。`);
      return;
    }
    if (next.size <= 0) {
      rejectFile("文件是空的。");
      return;
    }
    setError("");
    setFile(next);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragOver(false);
    acceptFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isGuest) {
      navigate("/login");
      return;
    }
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      let rawDataUrl: string;
      try {
        rawDataUrl = await fileToDataUrl(file);
      } catch {
        throw new Error("无法读取图纸文件");
      }
      const dataUrl = toCadDataUrl(rawDataUrl, file.name);
      const created = await api.createCadExtract({ file_name: file.name, data_url: dataUrl });
      setRecords((current) => [created, ...current.filter((item) => item.extract_id !== created.extract_id)]);
      if (!pendingRef.current) setSelectedId(created.extract_id);
      else setError(editBusyRef.current ? "解析已完成，当前房间编辑仍需等待或核对，暂不切换图纸。" : "解析已完成，当前准备条件草稿仍保留。可从最近解析切换图纸。");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "图纸解析失败");
    } finally {
      setBusy(false);
    }
  }

  async function copyExtractId(extractId: string) {
    try {
      await navigator.clipboard.writeText(extractId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("无法复制 extract_id，请手动选择。");
    }
  }

  function downloadJson(record: CadExtractRecord) {
    const blob = new Blob([JSON.stringify(record.data, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${record.extract_id}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  }

  return (
    <section className="feedback-page cad-extract-page">
      <header className="feedback-page-copy">
        <h1>图纸解析</h1>
        <p>上传 DXF 或 DWG，得到可复用的 extract_id、图层分类和文字摘要。这一步只抽取信息，不生成线稿或效果图。</p>
      </header>

      <p className="cad-extract-note">{TIANZHENG_NOTE}</p>

      <div className="cad-workspace">
        <div className="cad-tools">
        <form className="feedback-panel" onSubmit={(event) => void handleSubmit(event)}>
          <div className="feedback-panel-head">
            <h2>上传图纸</h2>
            <p>DWG 需要服务端转换器。未配置时请在 CAD 里另存为 DXF 再上传。单文件不超过 {formatUploadSize(CAD_MAX_UPLOAD_BYTES)}。</p>
          </div>

          <button
            type="button"
            className={dragOver ? "cad-dropzone is-dragover" : "cad-dropzone"}
            disabled={isGuest || busy}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              if (!isGuest) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <strong>{file ? file.name : "选择或拖入 .dxf / .dwg"}</strong>
            <span>{file ? formatUploadSize(file.size) : "解析完成后会保留 extract_id，供后续线稿和生图使用。"}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".dxf,.dwg,application/dxf,application/acad"
            hidden
            onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
          />

          {error ? <div className="floating-error">{error}</div> : null}

          <div className="template-editor-actions">
            <button type="submit" className="submit-button" disabled={isGuest || busy || !file}>
              {isGuest ? "登录后解析" : busy ? "解析中..." : "开始解析"}
            </button>
            {isGuest ? (
              <button type="button" className="ghost-button" onClick={() => navigate("/login")}>
                登录
              </button>
            ) : null}
          </div>

        </form>

        <aside className="feedback-panel">
          <div className="feedback-panel-head">
            <h2>最近解析</h2>
            <p>{isGuest ? "登录后可以查看自己的解析记录。" : "只显示当前账号最近 3 条。更早的在资产库。"}</p>
          </div>
          {isGuest ? (
            <p className="cad-empty-inline">访客不能上传或读取图纸。</p>
          ) : records.length === 0 ? (
            <p className="cad-empty-inline">还没有解析记录。</p>
          ) : (
            <div className="cad-history-list">
              {records.slice(0, 3).map((item) => (
                <button
                  key={item.extract_id}
                  type="button"
                  className={item.extract_id === selectedId ? "cad-history-item is-active" : "cad-history-item"}
                  disabled={editBusy}
                  onClick={() => {
                    if (editBusyRef.current) { setError("请先等待房间编辑完成，或核对受理未知的操作。"); return; }
                    if (item.extract_id !== selectedId && preparationPending && !window.confirm("当前草稿将保留在本标签页。保留草稿并切换图纸？")) return;
                    setSelectedId(item.extract_id);
                    setCopied(false);
                  }}
                >
                  <strong>{item.file_name}</strong>
                  <span>
                    {statusLabel(item.status)} · {item.extract_id}
                  </span>
                  <small>{item.created_at ? formatChinaMonthDayTime(item.created_at) : ""}</small>
                </button>
              ))}
            </div>
          )}
        </aside>
        </div>

        {selected ? (
          <CadExtractResult
            key={`${currentUser?.id ?? "guest"}:${selected.extract_id}`}
            draftOwner={currentUser ? String(currentUser.id) : undefined}
            onPreparationPending={setPreparationPending}
            onEditBusy={setEditBusy}
            record={selected}
            copied={copied}
            onCopy={(extractId) => void copyExtractId(extractId)}
            onDownload={downloadJson}
            onUpdated={(updated) => {
              setRecords((current) => current.map((item) => (item.extract_id === updated.extract_id ? updated : item)));
            }}
          />
        ) : null}
      </div>
    </section>
  );
}
