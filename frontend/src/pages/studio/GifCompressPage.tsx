import { type FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { formatChinaMonthDayTime } from "../../lib/datetime";
import { api, type GifToolResult, type GifMediaInfo } from "../../api";
import GifMediaDetails from "./GifMediaDetails";
import { useAuth } from "../../context/AuthContext";
import { fileToDataUrl } from "../../features/studio/studioAssetUtils";
import { downloadMediaUrl } from "../../features/studio/studioMediaDownload";
import { createGifZip, gifParametersFromRecord, restoreGifOriginal, runGifBatch, validateGifBatch, type GifJob } from "./gifToolBatch";

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
  const { isGuest, currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const recordId = Number(searchParams.get("record_id"));
  const [files, setFiles] = useState<File[]>([]);
  const [jobs, setJobs] = useState<GifJob[]>([]);
  const [selected, setSelected] = useState(0);
  const [preview, setPreview] = useState("");
  const [target, setTarget] = useState(500);
  const [maxEdge, setMaxEdge] = useState(344);
  const [maxFps, setMaxFps] = useState(12.5);
  const [maxColors, setMaxColors] = useState(96);
  const [allowResize, setAllowResize] = useState(true);
  const [allowFrameReduction, setAllowFrameReduction] = useState(true);
  const file = files[selected];
  const [historyResult, setHistoryResult] = useState<GifToolResult | null>(null);
  const result = historyResult ?? jobs[selected]?.result;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [history, setHistory] = useState<GifToolResult[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [copiedFrom, setCopiedFrom] = useState("");
  const form = useRef<HTMLFormElement | null>(null);
  const [sourceInfo, setSourceInfo] = useState<GifMediaInfo | null>(null);
  const [infoMessage, setInfoMessage] = useState("");
  const input = useRef<HTMLInputElement | null>(null);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => { setJobs(files.map(() => ({ status: "waiting" }))); }, [files, target, maxEdge, maxFps, maxColors, allowResize, allowFrameReduction]);

  useEffect(() => {
    let cancelled = false;
    setHistory([]); setHistoryResult(null); setHistoryError("");
    if (!isGuest) api.gifHistory().then(items => { if (!cancelled) setHistory(items); })
      .catch(err => { if (!cancelled) setHistoryError(err instanceof Error ? err.message : "历史加载失败，请刷新重试。"); });
    return () => { cancelled = true; };
  }, [isGuest, currentUser?.id]);
  useEffect(() => {
    let cancelled = false;
    if (!isGuest && Number.isSafeInteger(recordId) && recordId > 0) {
      api.gifHistoryRecord(recordId).then(item => { if (!cancelled) setHistoryResult(item); })
        .catch(err => { if (!cancelled) setHistoryError(err instanceof Error ? err.message : "无法读取压缩记录。"); });
    }
    return () => { cancelled = true; };
  }, [recordId, isGuest, currentUser?.id]);

  useEffect(() => {
    let cancelled = false;
    setSourceInfo(null); setInfoMessage(file ? "正在读取原始 GIF 参数…" : "");
    if (file && !isGuest) fileToDataUrl(file).then(data_url => {
      if (cancelled) return null;
      return api.inspectGif({ file_name: file.name, data_url });
    }).then(info => { if (!cancelled && info) { setSourceInfo(info); setInfoMessage(""); } })
      .catch(err => { if (!cancelled) setInfoMessage(err instanceof Error ? err.message : "原始参数读取失败，请重新选择文件。"); });
    return () => { cancelled = true; };
  }, [file, isGuest]);
  const detailId = result?.record_id;
  useEffect(() => {
    let cancelled = false;
    if (detailId && result && (!result.source_info || !result.output_info)) {
      api.gifHistoryRecord(detailId).then(item => { if (!cancelled) setHistoryResult(item); })
        .catch(err => { if (!cancelled) setHistoryError(err instanceof Error ? err.message : "历史参数读取失败。"); });
    }
    return () => { cancelled = true; };
  }, [detailId]);

  function chooseFiles(next: File[]) {
    if (!next.length || busy || downloading || restoring) return;
    const message = validateGifBatch(next);
    if (message) { setError(message); return; }
    setCopiedFrom(""); setHistoryResult(null); setFiles(next); setSelected(0); setJobs(next.map(() => ({ status: "waiting" }))); setError("");
  }

  async function copyToCompressor(record: GifToolResult) {
    if (busy || downloading || restoring || isGuest) return;
    const id = ++request.current;
    setRestoring(true); setError("");
    try {
      const original = await restoreGifOriginal(record);
      if (id !== request.current) return;
      const params = gifParametersFromRecord(record);
      setTarget(params.target_kb); setMaxEdge(params.max_edge); setMaxFps(params.max_fps);
      setMaxColors(params.max_colors); setAllowResize(params.allow_resize); setAllowFrameReduction(params.allow_frame_reduction);
      setFiles([original]); setSelected(0); setJobs([{ status: "waiting" }]); setHistoryResult(null);
      setCopiedFrom(record.file_name);
      const query = new URLSearchParams(searchParams); query.delete("record_id");
      setSearchParams(query, { replace: true });
      form.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) { if (id === request.current) setError(err instanceof Error ? err.message : "复制失败，请重试。"); }
    finally { if (id === request.current) setRestoring(false); }
  }

  async function compress(event: FormEvent) {
    event.preventDefault();
    if (!files.length || busy || isGuest || downloading || restoring) return;
    const id = ++request.current;
    setHistoryResult(null); setBusy(true); setError(""); setJobs(files.map(() => ({ status: "waiting" })));
    try {
      await runGifBatch(files, async file => {
        const dataUrl = await fileToDataUrl(file);
        if (id !== request.current) throw new Error("已离开页面");
        return api.compressGif({ file_name: file.name, data_url: dataUrl, target_kb: target,
          max_edge: maxEdge, max_fps: maxFps, max_colors: maxColors,
          allow_resize: allowResize, allow_frame_reduction: allowFrameReduction });
      }, (index, job) => {
        setJobs(previous => previous.map((old, i) => i === index ? job : old));
        if (job.result) {
          const saved = job.result;
          setHistory(previous => [saved, ...previous.filter(item => item.record_id !== saved.record_id)].slice(0, 20));
        }
      }, () => id === request.current);
    } finally { if (id === request.current) setBusy(false); }
  }

  async function downloadBatch() {
    if (downloading || busy || restoring) return;
    setDownloading(true); setError("");
    const id = request.current;
    try {
      const results = jobs.flatMap(job => job.result ? [job.result] : []);
      if (!results.length) return;
      const bytes = await createGifZip(results);
      if (id !== request.current) return;
      const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: "application/zip" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "gif-compressed.zip";
      anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { if (id === request.current) setError(err instanceof Error ? err.message : "打包下载失败，请重试。"); }
    finally { if (id === request.current) setDownloading(false); }
  }

  async function download() {
    if (!result || downloading || restoring) return;
    setDownloading(true);
    try { await downloadMediaUrl(result.storage_path, result.file_name.replace(/\.gif$/i, "") + "-compressed.gif"); }
    finally { setDownloading(false); }
  }

  return <section className="gif-tool-page">
    <header className="gif-tool-heading">
      <h1>GIF 压缩</h1>
      <p>批量上传动图，默认以 500 KB 为目标。按比例缩放，保留动画时长和原循环方式。</p>
    </header>
    <div className="gif-tool-columns">
      <form ref={form} className="feedback-panel gif-tool-form" onSubmit={compress}>
        <h2>上传 GIF</h2>
        {copiedFrom ? <p className="gif-notice">已将「{copiedFrom}」的原始 GIF 和参数复制到压缩区。可调整后开始压缩，原记录保留。</p> : null}
        <input ref={input} type="file" accept=".gif,image/gif" multiple hidden disabled={busy || downloading || restoring || isGuest}
          onChange={event => { chooseFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        <button type="button" className="gif-dropzone" disabled={busy || downloading || restoring || isGuest} onClick={() => input.current?.click()}
          onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!isGuest) chooseFiles(Array.from(event.dataTransfer.files)); }}>
          <strong>{files.length ? `已选择 ${files.length} 个 GIF` : "点击选择或拖入多个 GIF"}</strong>
          <span>{files.length ? `${formatGifSize(files.reduce((sum, f) => sum + f.size, 0))} · 点击重新选择` : "最多 20 个，每个不超过 20 MB，总计不超过 100 MB"}</span>
        </button>
        {file ? <><p className="gif-footnote">{file.name}</p>{sourceInfo ? <GifMediaDetails info={sourceInfo} title="原始 GIF 参数" /> : <p className="gif-footnote" role="status">{infoMessage}</p>}</> : null}
        <fieldset disabled={busy || downloading || restoring || isGuest} className="gif-settings">
          <label className="gif-field"><span>目标大小（KB）</span>
            <input type="number" min={10} max={20000} step={1} required value={target} onChange={e => setTarget(Number(e.target.value))} />
            <small>默认 500 KB。1 KB = 1000 字节，尽量在质量下限内达标。</small>
          </label>
          <details className="gif-advanced"><summary>压缩选项</summary>
            <div className="gif-options-grid">
              <label className="gif-field"><span>初始最长边（像素）</span><input type="number" min={0} max={8192} step={1} required value={maxEdge} onChange={e => setMaxEdge(Number(e.target.value))} /><small>默认 344：720×720 将缩至 344×344；非方图等比缩放。Lanczos 保留细节，0 为原尺寸，不放大。</small></label>
              <label className="gif-field"><span>初始帧率上限（fps）</span><input type="number" min={0} max={50} step={0.5} required value={maxFps} onChange={e => setMaxFps(Number(e.target.value))} /><small>默认 12.5：25fps 动画约减半帧数，保持时长。0 为原帧率，不增加源帧率。</small></label>
              <label className="gif-field"><span>初始颜色数</span><input type="number" min={4} max={256} step={1} required value={maxColors} onChange={e => setMaxColors(Number(e.target.value))} /><small>默认最多 96 色，配合 Bayer 抖动改善颜色过渡。</small></label>
            </div>
            <label className="gif-checkbox"><input type="checkbox" checked={allowResize} onChange={e => setAllowResize(e.target.checked)} />为达到目标，允许逐步缩小尺寸</label>
            <label className="gif-checkbox"><input type="checkbox" checked={allowFrameReduction} onChange={e => setAllowFrameReduction(e.target.checked)} />为达到目标，允许逐步降低帧率</label>
            <small>关闭对应选项后，会保留初始尺寸或帧率设置；仍可能无法达到目标大小。</small>
          </details>
        </fieldset>
        {isGuest ? <p className="gif-notice">登录后即可上传并压缩 GIF。</p> : null}
        {error ? <p className="gif-error" role="alert">{error}</p> : null}
        <button className="admin-primary-button" type="submit" disabled={!files.length || busy || downloading || restoring || isGuest}>{busy ? `正在压缩 ${jobs.filter(job => job.status === "done" || job.status === "error").length}/${files.length}…` : files.length > 1 ? "开始批量压缩" : "开始压缩"}</button>
        <p className="gif-footnote">逐个压缩，单个失败不会中断整批；超出目标时继续降低颜色、帧率或尺寸，达到质量或处理时间下限后会显示未达标。</p>
      </form>
      <section className="feedback-panel gif-result-panel" aria-label="压缩结果" aria-live="polite" aria-busy={busy}>
        <h2>压缩结果</h2>
        {files.length > 0 ? <>
          <div className="gif-batch-summary">
            <span>{jobs.filter(job => job.status === "done").length} / {files.length} 已完成 · {jobs.filter(job => job.status === "error").length} 失败</span>
            <button type="button" className="ghost-button" disabled={busy || downloading || restoring || !jobs.some(job => job.result)} onClick={() => void downloadBatch()}>{downloading ? "准备下载…" : "打包下载结果"}</button>
          </div>
          <ul className="gif-batch-list">{files.map((entry, index) => {
            const job = jobs[index];
            const status = job?.status === "processing" ? "正在压缩" : job?.status === "error" ? "失败" : job?.result ? `${formatGifSize(job.result.compression.output_bytes)} · ${job.result.compression.target_met ? "已达标" : "未达标"}` : "等待压缩";
            return <li key={index}><button type="button" className={selected === index ? "is-selected" : ""} aria-pressed={selected === index} onClick={() => { setHistoryResult(null); setSelected(index); }}><strong>{entry.name}</strong><span>{status}</span></button></li>;
          })}</ul>
          {jobs[selected]?.error ? <p role="alert" className="gif-error">{jobs[selected].error}</p> : null}
        </> : null}
        {result ? <>
          <p className="gif-footnote">{result.file_name} · 已保存到资产库{result.created_at ? ` · ${formatChinaMonthDayTime(result.created_at)}` : ""}</p>
          <p className={result.compression.target_met ? "gif-notice is-success" : "gif-notice is-warning"}>{gifResultMessage(result)}</p>
          <div className="gif-stats">
            <div><span>原始大小</span><strong>{formatGifSize(result.compression.original_bytes)}</strong></div>
            <div><span>结果大小</span><strong>{formatGifSize(result.compression.output_bytes)}</strong></div>
            <div><span>目标大小</span><strong>{(result.compression.target_bytes ?? 0) / 1000} KB</strong></div>
            <div><span>体积减少</span><strong>{Math.max(0, (1 - result.compression.output_bytes / result.compression.original_bytes) * 100).toFixed(1)}%</strong></div>
          </div>
          <div className="gif-preview-pair">
            <GifMediaDetails info={result.source_info} title="原始 GIF 参数" />
            <GifMediaDetails info={result.output_info} title="结果 GIF 参数" />
          </div>
          <p className="gif-footnote">这里显示文件实际参数；平均帧率按单轮动画计算，用色可能低于设置的颜色上限。</p>
          <div className="gif-preview-pair">
            <figure><figcaption>原始 GIF</figcaption><div className="gif-preview"><img src={historyResult ? result.original_storage_path : preview} alt="原始 GIF 动画" /></div></figure>
            <figure><figcaption>处理结果</figcaption><div className="gif-preview"><img src={result.storage_path} alt="处理后的 GIF 动画" /></div></figure>
          </div>
          <div className="gif-download-actions"><button type="button" className="ghost-button" disabled={busy || downloading || restoring || isGuest} onClick={() => void copyToCompressor(result)}>{restoring ? "正在载入原件…" : "复制到压缩区"}</button><button type="button" className="admin-primary-button" disabled={downloading} onClick={() => void download()}>{downloading ? "准备下载…" : "下载 GIF"}</button>
            <button type="button" className="ghost-button" onClick={() => void downloadMediaUrl(result.original_storage_path, result.file_name)}>下载原文件</button></div>
        </> : <div className="gif-result-empty">{jobs[selected]?.status === "processing" ? "正在尝试压缩方案，请稍候…" : "选择文件查看结果；开始压缩后，在这里查看体积对比和动画预览。"}</div>}
      </section>
    </div>
    <section className="feedback-panel gif-history-panel" aria-label="压缩历史">
      <div className="gif-batch-summary"><h2>压缩历史</h2><Link to="/studio/library">前往资产库</Link></div>
      <p className="gif-footnote">最近 20 条，按当前账号保存；刷新或重新登录后仍可查看。点击记录查看原件与压缩结果。</p>
      {historyError ? <p className="gif-error" role="alert">{historyError}</p> : null}
      <ul className="gif-batch-list">{history.map(item => <li key={item.record_id}>
        <button type="button" className={historyResult?.record_id === item.record_id ? "is-selected" : ""} onClick={() => setHistoryResult(item)}>
          <strong>{item.file_name}<small>{formatChinaMonthDayTime(item.created_at)}</small></strong>
          <span>{formatGifSize(item.compression.output_bytes)} · {item.compression.target_met ? "已达标" : "未达标"}</span>
        </button>
      </li>)}</ul>
      {!history.length && !historyError ? <p className="gif-footnote">暂无已保存记录。新压缩结果会自动保存。</p> : null}
    </section>
  </section>;
}
