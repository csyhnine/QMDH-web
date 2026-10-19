import { useEffect, useState } from "react";
import { api } from "../../api";

export default function ComfyRuntimeNotice({ editing, referenceCount = 2 }: { editing: boolean; referenceCount?: number }) {
  const [message, setMessage] = useState("正在检查本机连接……");
  useEffect(() => {
    let alive = true;
    const check = () => { void api.comfyuiStatus().then((s) => { if (alive) setMessage(s.message); })
      .catch(() => { if (alive) setMessage("暂时无法检查本机状态，已提交任务会保留。"); }); };
    check(); const timer = setInterval(check, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  return <p className="composer-menu-note" role="status">{message} 多张逐张生成。{editing ? referenceCount === 1 ? "请上传一张要编辑的原图。" : "请依次放入目标图和参考图。" : ""}</p>;
}
