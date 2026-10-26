import { useEffect, useState } from "react";
import { api } from "../../api";

export default function ComfyRuntimeNotice({ editing, referenceCount = 2, referenceCounts }: { editing: boolean; referenceCount?: number; referenceCounts?: number[] }) {
  const [message, setMessage] = useState("正在检查本机连接……");
  useEffect(() => {
    let alive = true;
    const check = () => { void api.comfyuiStatus().then((s) => { if (alive) setMessage(s.message); })
      .catch(() => { if (alive) setMessage("暂时无法检查本机状态，已提交任务会保留。"); }); };
    check(); const timer = setInterval(check, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  return <p className="composer-menu-note" role="status">{message} 多张输出逐张生成。{editing ? referenceCounts && referenceCounts.length > 1 ? `上传 ${referenceCounts.join(" 或 ")} 张图片，按数量自动选择编辑工作流；第 1 张为目标图，其余为参考图。` : referenceCounts?.length === 0 ? "编辑模板暂不可用。" : referenceCount === 1 ? "请上传一张要编辑的原图。" : "请依次放入目标图和参考图。" : ""}</p>;
}
