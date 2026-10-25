import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, type CanvasGraphJson, type CanvasTemplateSummary } from "../../api";
import { nanoid } from "./canvasId";

type PublishMode = "create" | "update";
type PublishPhase = "editing" | "submitting" | "rejected" | "uncertain" | "succeeded" | "abandoned";
export type CanvasPublishSession = {
  id: string;
  source: Readonly<{ ownerId: number; projectId: number; viewKey: string; title: string; graph: CanvasGraphJson }>;
  phase: PublishPhase; mode: PublishMode; title: string; category: string; selectedId: number | null;
  templates: CanvasTemplateSummary[]; loadingList: boolean; listSequence: number; request: number;
  error: string; inspecting: boolean; inspectSequence: number; inspection: CanvasTemplateSummary[] | null;
  result?: { id: number; title: string; mode: PublishMode };
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export function createCanvasPublishSession(ownerId: number, projectId: number, viewKey: string, title: string, graph: CanvasGraphJson): CanvasPublishSession {
  return { id:nanoid(24),source:Object.freeze({ownerId,projectId,viewKey,title,graph:clone(graph)}),phase:"editing",mode:"create",title,category:"",selectedId:null,
    templates:[],loadingList:false,listSequence:0,request:0,error:"",inspecting:false,inspectSequence:0,inspection:null };
}
export type PublishCanvasTemplateDialogProps = {
  open: boolean; session: CanvasPublishSession;
  onClose: () => void; onAbandon: () => void;
  onCreated: (template: {id:number;title:string}) => void;
  onUpdated: (template: {id:number;title:string}) => void;
  onError: (message:string) => void;
};
export default function PublishCanvasTemplateDialog({open,session,onClose: closeCallback,onAbandon,onCreated,onUpdated,onError}: PublishCanvasTemplateDialogProps) {
  const [,render]=useState(0),currentRef=useRef<{session:CanvasPublishSession;open:boolean;mounted:boolean}>({session,open:false,mounted:false});
  useLayoutEffect(()=>{currentRef.current={session,open,mounted:true};return()=>{currentRef.current.mounted=false;};},[session,open]);
  const current=()=>currentRef.current.mounted && currentRef.current.open && currentRef.current.session===session && session.phase!=="abandoned";
  const refresh=()=>{if(current())render(n=>n+1);};
  const isLocked=()=>["submitting","uncertain","succeeded","abandoned"].includes(session.phase);
  const locked=session.phase==="submitting" || session.phase==="uncertain";
  const {mode,title,category,templates,selectedId,loadingList}=session;
  const submitting=session.phase==="submitting",selected=templates.find(row=>row.id===selectedId) ?? null;
  function report(message:string) { session.error=message;if(current())onError(message);refresh(); }
  function onClose() { if(current())closeCallback(); }
  function setTitle(value:string) { if(current() && !isLocked()){session.title=value;refresh();} }
  function setCategory(value:string) { if(current() && !isLocked()){session.category=value;refresh();} }
  function setSelectedId(value:number) {
    if(!current() || isLocked())return;
    session.selectedId=value;const row=session.templates.find(item=>item.id===value);
    if(row){session.title=row.title;session.category=row.category || "";}refresh();
  }
  function switchMode(next:PublishMode) {
    if(!current() || isLocked())return;
    session.mode=next;session.error="";session.loadingList=false;
    if(next==="create"){session.title=session.source.title;session.category="";session.selectedId=null;}refresh();
  }
  useEffect(()=>{
    if(!open || mode!=="update" || session.phase==="uncertain" || session.phase==="submitting" || (session.phase as PublishPhase)==="abandoned")return;
    const sequence=++session.listSequence;session.loadingList=true;refresh();
    void api.adminCanvasTemplates().then(rows=>{
      if(session.listSequence!==sequence || session.mode!=="update")return;
      session.templates=rows;
      if(!rows.some(row=>row.id===session.selectedId)){
        const first=rows[0];session.selectedId=first?.id ?? null;
        if(first){session.title=first.title;session.category=first.category || "";}
      }
    }).catch(error=>{if(session.listSequence===sequence && session.mode==="update")report(error instanceof Error ? error.message : "加载模板列表失败");})
      .finally(()=>{if(session.listSequence===sequence){session.loadingList=false;refresh();}});
    return()=>{if(session.listSequence===sequence)session.listSequence++;};
  },[session,open,mode]);
  async function handleSubmit() {
    if(!current() || !["editing","rejected"].includes(session.phase))return;
    const nextTitle=session.title.trim() || session.source.title;
    if(!nextTitle){report("请填写模板标题");return;}
    if(session.mode==="update" && (session.loadingList || !session.selectedId || !session.templates.some(row=>row.id===session.selectedId))){report("请先选择要覆盖的模板");return;}
    const request=++session.request,snapshot={mode:session.mode,title:nextTitle,category:session.category.trim(),selectedId:session.selectedId,graph:clone(session.source.graph)};
    session.phase="submitting";session.error="";refresh();
    try {
      const result=snapshot.mode==="create" ? await api.createAdminCanvasTemplate({title:snapshot.title,category:snapshot.category,description:"",is_featured:false,graph_json:snapshot.graph,preview_image_path:""})
        : await api.updateAdminCanvasTemplate(snapshot.selectedId!,{graph_json:snapshot.graph,title:snapshot.title,category:snapshot.category});
      if(!Number.isSafeInteger(result?.id) || result.id<=0 || (snapshot.mode==="update" && result.id!==snapshot.selectedId))throw new Error("模板受理身份不完整，发布结果尚未确认。");
      session.result={id:result.id,title:result.title || snapshot.title,mode:snapshot.mode};
      if(session.request!==request || (session.phase as PublishPhase)==="abandoned")return;
      session.phase="succeeded";
      if(current()){
        if(snapshot.mode==="create")onCreated(session.result);else onUpdated(session.result);
        if(current())onClose();
      }
    } catch(error) {
      if(session.request!==request || (session.phase as PublishPhase)==="abandoned")return;
      const status=error && typeof error==="object" && "status" in error ? error.status : undefined;
      const rejected=typeof status==="number" && [400,401,403,404,409,413,422,429].includes(status);
      session.phase=rejected ? "rejected" : "uncertain";
      report(rejected ? (error instanceof Error ? error.message : "发布被拒绝，请核对后修正。") : "发布结果尚未确认，不会自动重发。请只读核对模板库，或明确结束本地会话后再决定新意图。");
    } finally { refresh(); }
  }
  async function inspect() {
    if(!current() || session.phase!=="uncertain")return;
    const sequence=++session.inspectSequence;session.inspecting=true;refresh();
    try { const rows=await api.adminCanvasTemplates();if(session.inspectSequence===sequence)session.inspection=rows; }
    catch(error) {if(session.inspectSequence===sequence)report(error instanceof Error ? error.message : "核对模板库失败");}
    finally {if(session.inspectSequence===sequence){session.inspecting=false;refresh();}}
  }
  function abandon() {
    if(!current() || !window.confirm("结束这个本地发布会话？草稿将不再复用；已发请求不会被撤回，请到模板库核对原结果。"))return;
    session.phase="abandoned";onAbandon();
  }
  if(!open)return null;

  return (
    <div
      className="media-lightbox qmdh-publish-template-lightbox"
      onClick={() => {
        onClose();
      }}
    >
      <div
        className="media-lightbox-surface qmdh-publish-template-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qmdh-publish-template-title"
      >
        <header className="media-lightbox-head qmdh-publish-template-head">
          <h2 id="qmdh-publish-template-title" className="media-lightbox-title">
            发布为模板
          </h2>
          <button
            type="button"
            className="media-lightbox-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="media-lightbox-body qmdh-publish-template-body">
          <p className="qmdh-publish-template-hint">来源：{session.source.title} · 项目 #{session.source.projectId} · 打开时的图快照。关闭会保留本地会话，切换画布不会替换这份草稿。</p>
          {session.error ? <p role="status" className="qmdh-canvas-banner-error">{session.error}</p> : null}
          {session.phase === "uncertain" ? <div>
            <button type="button" disabled={session.inspecting} onClick={()=>void inspect()}>只读核对模板库</button>
            {session.inspection ? <p>以下仅为服务器快照，不能证明原发布未受理或已结束：{session.inspection.slice(0,10).map(row=>`#${row.id} ${row.title}`).join(" · ")}</p> : null}
          </div> : null}
          <div className="qmdh-canvas-library-tabs qmdh-publish-template-tabs">
            <button
              type="button"
              className={mode === "create" ? "is-active" : ""}
              disabled={locked}
              onClick={() => switchMode("create")}
            >
              新建
            </button>
            <button
              type="button"
              className={mode === "update" ? "is-active" : ""}
              disabled={locked}
              onClick={() => switchMode("update")}
            >
              更新已有
            </button>
          </div>

          {mode === "update" ? (
            <div className="qmdh-publish-template-picker">
              {loadingList ? (
                <p className="qmdh-publish-template-hint">加载模板列表…</p>
              ) : templates.length === 0 ? (
                <p className="qmdh-publish-template-hint">暂无已有模板，请改用「新建」。</p>
              ) : (
                <div className="qmdh-publish-template-list">
                  {templates.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={
                        selectedId === item.id
                          ? "qmdh-publish-template-item is-active"
                          : "qmdh-publish-template-item"
                      }
                      disabled={locked}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <strong>{item.title}</strong>
                      <span>{item.category?.trim() || "未分类"}</span>
                    </button>
                  ))}
                </div>
              )}
              {selected ? (
                <p className="qmdh-publish-template-warn">
                  将用这份来源快照完全覆盖「{selected.title}」的工作流。
                </p>
              ) : null}
            </div>
          ) : null}

          <label className="qmdh-publish-template-field">
            <span>标题</span>
            <input
              value={title}
              disabled={locked}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="模板标题"
            />
          </label>
          <label className="qmdh-publish-template-field">
            <span>分类</span>
            <input
              value={category}
              disabled={locked}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="可留空"
            />
          </label>
        </div>

        <footer className="media-lightbox-foot qmdh-publish-template-foot">
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭并保留会话
          </button>
          <button type="button" className="ghost-button" onClick={abandon}>结束本地会话</button>
          <button
            type="button"
            className="admin-primary-button"
            disabled={
              locked ||
              (mode === "update" && (loadingList || !selectedId || templates.length === 0))
            }
            onClick={() => void handleSubmit()}
          >
            {session.phase === "uncertain" ? "结果待核对" : submitting
              ? mode === "create"
                ? "发布中…"
                : "覆盖中…"
              : mode === "create"
                ? "发布"
                : "覆盖更新"}
          </button>
        </footer>
      </div>
    </div>
  );
}
