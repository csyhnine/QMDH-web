import { useState } from "react";

export default function ComfySizeControls({ ratio, onChange }: {ratio: string; onChange: (value: string) => void}) {
  const parsed = /^(\d+)x(\d+)$/.exec(ratio);
  const [width, setWidth] = useState(parsed?.[1] || "1024");
  const [height, setHeight] = useState(parsed?.[2] || "1024");
  const w = Number(width), h = Number(height);
  const valid = [w, h].every((n) => Number.isInteger(n) && n >= 256 && n <= 4096 && n % 8 === 0);
  return <div>
    <label>自定义宽度 <input aria-label="本机生成宽度" type="number" min={256} max={4096} step={8} value={width} onChange={(e) => setWidth(e.target.value)} /></label>
    <label>高度 <input aria-label="本机生成高度" type="number" min={256} max={4096} step={8} value={height} onChange={(e) => setHeight(e.target.value)} /></label>
    <button type="button" disabled={!valid} onClick={() => onChange(`${w}x${h}`)}>应用尺寸</button>
    <small>应用后优先使用此宽高；选择画面比例可恢复分辨率档位。尺寸越大，生成越慢。</small>
  </div>;
}
