import { useEffect, useState } from "react";
import { api } from "../../api";

export default function ComfyOperations() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.comfyuiStatus>> | null>(null);
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => { void api.comfyuiStatus().then(setStatus).catch(() => setFeedback("暂时无法检查本机状态。")); };
  useEffect(() => { refresh(); const timer = setInterval(refresh, 15000); return () => clearInterval(timer); }, []);
  const act = async (id: number, action: "resume" | "close") => {
    setBusy(true);
    try { await api.recoverComfyuiTask(id, action, note); setFeedback(`任务 ${id} 已处理。`); refresh(); }
    catch (error) { setFeedback(String(error)); } finally { setBusy(false); }
  };
  return <section className="admin-panel">
    <h3>本机 ComfyUI 运行状态</h3>
    <p role="status">{status?.message || "正在检查……"} 等待 {status?.queued ?? 0} 项，执行 {status?.running ?? 0} 项。</p>
    {status?.reviews?.length ? <>
      <p>系统每隔约 30 秒尝试恢复原任务。关闭操作仅适用于已核对无法恢复的任务；上游队列非空或已有成功结果时会拒绝关闭。</p>
      <input aria-label="任务恢复核对说明" value={note} onChange={(e) => setNote(e.target.value)} placeholder="填写至少十字的核对说明" />
      {status.reviews.map(({task_id}) => <p key={task_id}>任务 {task_id}：
        <button disabled={busy || note.trim().length < 10} onClick={() => void act(task_id, "resume")}>立即核对原任务</button>
        <button disabled={busy || note.trim().length < 10} onClick={() => void act(task_id, "close")}>核对后关闭未完成任务</button>
      </p>)}
    </> : null}
    {feedback ? <p role="status">{feedback}</p> : null}
  </section>;
}
