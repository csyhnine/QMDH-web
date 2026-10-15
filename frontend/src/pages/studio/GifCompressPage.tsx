import { type FormEvent, useEffect, useRef, useState } from "react";
import { api, type GifToolResult } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { fileToDataUrl } from "../../features/studio/studioAssetUtils";
import { downloadMediaUrl } from "../../features/studio/studioMediaDownload";
import { MAX_REFERENCE_UPLOAD_BYTES } from "../../utils/uploads";

export function formatGifSize(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  if (bytes >= 1000) return `${(bytes / 1000).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function gifResultMessage(result: GifToolResult) {
  if (!result.compression.target_met) return "未达到目标体积，已保留本次最小有效结果。可放宽目标，或允许更多尺寸与帧率调整后重试。";
  return result.compression.compressed ? "已达到目标体积。" : "原文件已满足目标，无需压缩。";
}

export default function GifCompressPage() {
  const { isGuest } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [target, setTarget] = useState(500);
  const [maxEdge, setMaxEdge] = useState(0);
  const [maxFps, setMaxFps] = useState(0);
  const [maxColors, setMaxColors] = useState(128);
  const [allowResize, setAllowResize] = useState(true);
  const [allowFrameReduction, setAllowFrameReduction] = useState(true);
  const [result, setResult] = useState<GifToolResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => { setResult(null); }, [target, maxEdge, maxFps, maxColors, allowResize, allowFrameReduction]);

  function chooseFile(next: File | undefined) {
    if (!next || busy) return;
    if (!next.name.toLowerCase().endsWith(".gif") && next.type !== "image/gif") {
      setError("请选择 GIF 文件。"); return;
    }
    if (!next.size || next.size > MAX_REFERENCE_UPLOAD_BYTES) {
      setError("GIF 文件不能为空，且不能超过 20 MB。"); return;
    }
    setFile(next); setResult(null); setError("");
  }

  async function compress(event: FormEvent) {
    event.preventDefault();
    if (!file || busy || isGuest) return;
    const id = ++request.current;
    setBusy(true); setError(""); setResult(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      if (id !== request.current) return;
      const next = await api.compressGif({ file_name: file.name, data_url: dataUrl, target_kb: target,
        max_edge: maxEdge, max_fps: maxFps, max_colors: maxColors,
        allow_resize: allowResize, allow_frame_reduction: allowFrameReduction });
      if (id === request.current) setResult(next);
    } catch (err) {
      if (id === request.current) setError(err instanceof Error ? err.message : "压缩失败，请重试。");
    } finally { if (id === request.current) setBusy(false); }
  }

  async function download() {
    if (!result || downloading) return;
    setDownloading(true);
    try { await downloadMediaUrl(result.storage_path, result.file_name.replace(/\.gif$/i, "") + "-compressed.gif"); }
    finally { setDownloading(false); }
  }

  return <section className="gif-tool-page">
    <header className="gif-tool-heading">
      <h1>GIF 压缩</h1>
      <p>上传动图，设置目标大小，预览并下载压缩结果。保留原文件与完整动画时长。</p>
    </header>
    <div className="gif-tool-columns">
      <form className="feedback-panel gif-tool-form" onSubmit={compress}>
        <h2>上传 GIF</h2>
        <input ref={input} type="file" accept=".gif,image/gif" hidden disabled={busy || isGuest}
          onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
        <button type="button" className="gif-dropzone" disabled={busy || isGuest} onClick={() => input.current?.click()}
          onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!isGuest) chooseFile(event.dataTransfer.files[0]); }}>
          <strong>{file ? file.name : "点击选择或拖入 GIF"}</strong>
          <span>{file ? `${formatGifSize(file.size)} · 点击更换` : "单个文件不超过 20 MB"}</span>
        </button>
        <fieldset disabled={busy || isGuest} className="gif-settings">
          <label className="gif-field"><span>目标大小（KB）</span>
            <input type="number" min={10} max={20000} step={1} required value={target} onChange={e => setTarget(Number(e.target.value))} />
            <small>默认 500 KB。1 KB = 1000 字节，尽量在质量下限内达标。</small>
          </label>
          <details className="gif-advanced"><summary>压缩选项</summary>
            <div className="gif-options-grid">
              <label className="gif-field"><span>初始最长边（像素）</span><input type="number" min={0} max={8192} step={1} required value={maxEdge} onChange={e => setMaxEdge(Number(e.target.value))} /><small>0 表示从原尺寸开始，不放大图片。</small></label>
              <label className="gif-field"><span>初始帧率上限（fps）</span><input type="number" min={0} max={50} step={0.5} required value={maxFps} onChange={e => setMaxFps(Number(e.target.value))} /><small>0 表示从原帧率开始。</small></label>
              <label className="gif-field"><span>初始颜色数</span><input type="number" min={4} max={256} step={1} required value={maxColors} onChange={e => setMaxColors(Number(e.target.value))} /><small>颜色越多，画面通常更细腻、体积更大。</small></label>
            </div>
            <label className="gif-checkbox"><input type="checkbox" checked={allowResize} onChange={e => setAllowResize(e.target.checked)} />为达到目标，允许逐步缩小尺寸</label>
            <label className="gif-checkbox"><input type="checkbox" checked={allowFrameReduction} onChange={e => setAllowFrameReduction(e.target.checked)} />为达到目标，允许逐步降低帧率</label>
            <small>关闭对应选项后，会保留初始尺寸或帧率设置；仍可能无法达到目标大小。</small>
          </details>
        </fieldset>
        {isGuest ? <p className="gif-notice">登录后即可上传并压缩 GIF。</p> : null}
        {error ? <p className="gif-error" role="alert">{error}</p> : null}
        <button className="admin-primary-button" type="submit" disabled={!file || busy || isGuest}>{busy ? "正在压缩…" : "开始压缩"}</button>
        <p className="gif-footnote">处理通常需要几秒钟；复杂动图可能在达到质量或处理时间下限时保留未达标结果。</p>
      </form>
      <section className="feedback-panel gif-result-panel" aria-label="压缩结果" aria-live="polite" aria-busy={busy}>
        <h2>压缩结果</h2>
        {result ? <>
          <p className={result.compression.target_met ? "gif-notice is-success" : "gif-notice is-warning"}>{gifResultMessage(result)}</p>
          <div className="gif-stats">
            <div><span>原始大小</span><strong>{formatGifSize(result.compression.original_bytes)}</strong></div>
            <div><span>结果大小</span><strong>{formatGifSize(result.compression.output_bytes)}</strong></div>
            <div><span>目标大小</span><strong>{(result.compression.target_bytes ?? 0) / 1000} KB</strong></div>
            <div><span>体积减少</span><strong>{Math.max(0, (1 - result.compression.output_bytes / result.compression.original_bytes) * 100).toFixed(1)}%</strong></div>
          </div>
          <div className="gif-preview-pair">
            <figure><figcaption>原始 GIF</figcaption><div className="gif-preview"><img src={preview} alt="原始 GIF 动画" /></div></figure>
            <figure><figcaption>处理结果</figcaption><div className="gif-preview"><img src={result.storage_path} alt="处理后的 GIF 动画" /></div></figure>
          </div>
          <div className="gif-download-actions"><button type="button" className="admin-primary-button" disabled={downloading} onClick={() => void download()}>{downloading ? "准备下载…" : "下载 GIF"}</button>
            <button type="button" className="ghost-button" onClick={() => void downloadMediaUrl(result.original_storage_path, result.file_name)}>下载原文件</button></div>
        </> : <div className="gif-result-empty">{busy ? "正在尝试压缩方案，请稍候…" : "选择 GIF 并开始压缩后，在这里查看体积对比和动画预览。"}</div>}
      </section>
    </div>
  </section>;
}
