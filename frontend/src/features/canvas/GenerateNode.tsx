import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { useEffect, useMemo, useRef } from "react";

import { aspectRatioOptions, resolutionOptions } from "../studio/studioConstants";
import {
  upscaleNoiseOptions,
  upscaleScaleOptions,
  upscaleStyleOptions,
} from "../studio/studioUpscaleOptions";
import AnnotateBoard from "./AnnotateBoard";
import { CanvasDraftInput, CanvasDraftTextarea } from "./CanvasDraftField";
import CanvasModelSelect from "./CanvasModelSelect";
import { useCanvasNodeActions } from "./canvasNodeContext";
import { NODE_KIND_LABEL, type GenerateNodeData } from "./canvasTypes";

type GenerateNodeProps = NodeProps<Node<GenerateNodeData, "generate">>;

const statusLabel: Record<GenerateNodeData["status"], string> = {
  idle: "待生成",
  submitting: "提交中",
  pending: "排队中",
  running: "生成中",
  completed: "已完成",
  failed: "失败",
};

export default function GenerateNode({ id, data, selected }: GenerateNodeProps) {
  const {
    providers,
    disabled,
    patchNode,
    generateNode,
    uploadNodeImage,
    saveAnnotation,
    getUpstreamDeliverables,
  } = useCanvasNodeActions();
  const updateNodeInternals = useUpdateNodeInternals();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upstream = useMemo(() => getUpstreamDeliverables(id), [getUpstreamDeliverables, id]);
  const isUpload = data.nodeKind === "upload";
  const isUpscale = data.nodeKind === "upscale";
  const isAnnotate = data.nodeKind === "annotate";
  const baseImage =
    upstream.images[0] || data.referenceImages[0] || data.previewImagePath || data.assetUrls[0] || "";
  const preview = isAnnotate
    ? data.assetUrls[0] || baseImage
    : data.assetUrls[0] || data.previewImagePath || data.referenceImages[0] || "";
  const busy = data.status === "submitting" || data.status === "pending" || data.status === "running";
  const needsInput = data.nodeKind === "img2img" || isUpscale || isAnnotate;
  const hasUpstreamMedia = upstream.images.length > 0 || upstream.videos.length > 0;
  const hasLocalImage = data.referenceImages.length > 0 || data.assetUrls.length > 0 || Boolean(baseImage);
  const canSubmit = isUpload
    ? false
    : isAnnotate
      ? Boolean(baseImage) && data.annotationStrokes.length > 0
      : isUpscale
        ? hasUpstreamMedia || hasLocalImage
        : Boolean(data.prompt.trim()) && (!needsInput || hasUpstreamMedia || hasLocalImage);

  useEffect(() => {
    updateNodeInternals(id);
  }, [
    id,
    selected,
    updateNodeInternals,
    data.status,
    upstream.images.length,
    upstream.videos.length,
    isAnnotate,
  ]);

  function patch(partial: Partial<GenerateNodeData>) {
    patchNode(id, partial);
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    await uploadNodeImage(id, file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div
      className={`qmdh-canvas-node${selected ? " is-selected is-expanded" : ""}${busy ? " is-busy" : ""}${
        isUpload ? " is-upload" : ""
      }${isAnnotate ? " is-annotate" : ""}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        className="nodrag nopan"
        onChange={(event) => void onPickFile(event.target.files?.[0])}
      />
      {!isUpload ? <Handle type="target" position={Position.Left} /> : null}
      <header className="qmdh-canvas-node-head">
        <strong>{data.label || NODE_KIND_LABEL[data.nodeKind]}</strong>
        <span className={`qmdh-canvas-node-status status-${data.status}`}>
          {isUpload && data.status === "idle"
            ? "待上传"
            : isAnnotate && data.status === "idle"
              ? "待标注"
              : statusLabel[data.status]}
        </span>
      </header>

      <div className="qmdh-canvas-node-body">
        {isUpload ? (
          preview ? (
            <img src={preview} alt="" className="qmdh-canvas-node-preview is-fill" />
          ) : (
            <div className="qmdh-canvas-node-preview is-empty is-fill">点击下方按钮上传图片</div>
          )
        ) : isAnnotate ? (
          selected && baseImage ? (
            <AnnotateBoard
              baseUrl={baseImage}
              strokes={data.annotationStrokes}
              tool={data.annotationTool}
              color={data.annotationColor}
              width={data.annotationWidth}
              disabled={disabled || busy}
              onChangeStrokes={(annotationStrokes) => patch({ annotationStrokes })}
              onToolChange={(annotationTool) => patch({ annotationTool })}
              onColorChange={(annotationColor) => patch({ annotationColor })}
              onWidthChange={(annotationWidth) => patch({ annotationWidth })}
            />
          ) : preview ? (
            <img src={preview} alt="" className="qmdh-canvas-node-preview is-fill" />
          ) : (
            <div className="qmdh-canvas-node-preview is-empty is-fill">连接上游图片后选中本节点开始标注</div>
          )
        ) : !selected ? (
          <>
            {preview ? (
              data.nodeKind === "video" && /\.(mp4|webm|mov)(\?|$)/i.test(preview) ? (
                <video src={preview} className="qmdh-canvas-node-preview" muted playsInline />
              ) : (
                <img src={preview} alt="" className="qmdh-canvas-node-preview" />
              )
            ) : (
              <div className="qmdh-canvas-node-preview is-empty">
                {isUpscale
                  ? "连接上游图片后放大"
                  : data.nodeKind === "img2img"
                    ? "连接上游节点传入参考图"
                    : data.nodeKind === "video"
                      ? "填写提示词后生成视频"
                      : "填写提示词后生成"}
              </div>
            )}
            <p className="qmdh-canvas-node-prompt">{data.prompt || (isUpscale ? "高清放大" : "（无提示词）")}</p>
            <div className="qmdh-canvas-node-meta">
              <span>{NODE_KIND_LABEL[data.nodeKind]}</span>
              {isUpscale ? (
                <span>
                  {upscaleScaleOptions.find((item) => item.id === data.upscaleScale)?.label || data.upscaleScale}
                </span>
              ) : (
                <>
                  <span>{data.aspectRatio}</span>
                  {data.nodeKind !== "video" ? <span>{data.resolution.toUpperCase()}</span> : null}
                </>
              )}
            </div>
            {upstream.images.length > 0 || upstream.videos.length > 0 ? (
              <p className="qmdh-canvas-node-ref-hint">
                上游交付：{upstream.images.length} 图
                {upstream.videos.length > 0 ? ` / ${upstream.videos.length} 视频` : ""}
              </p>
            ) : null}
          </>
        ) : (
          <div className="qmdh-canvas-node-config nodrag nopan" onWheel={(event) => event.stopPropagation()}>
            {preview ? <img src={preview} alt="" className="qmdh-canvas-node-preview is-compact" /> : null}

            <div className="qmdh-canvas-kind-badge">{NODE_KIND_LABEL[data.nodeKind]}</div>

            <label className="qmdh-canvas-field">
              <span>节点名</span>
              <CanvasDraftInput
                value={data.label}
                disabled={disabled || busy}
                onCommit={(label) => patch({ label })}
              />
            </label>

            {!isUpscale ? (
              <label className="qmdh-canvas-field">
                <span>提示词</span>
                <CanvasDraftTextarea
                  rows={4}
                  value={data.prompt}
                  disabled={disabled || busy}
                  placeholder={
                    data.nodeKind === "img2img"
                      ? "描述如何修改上游参考图…"
                      : data.nodeKind === "video"
                        ? "描述要生成的视频…"
                        : "描述想要生成的画面…"
                  }
                  onCommit={(prompt) => patch({ prompt })}
                />
              </label>
            ) : null}

            {!isUpscale ? (
              <div className="qmdh-canvas-field-row">
                <label className="qmdh-canvas-field">
                  <span>比例</span>
                  <select
                    value={data.aspectRatio}
                    disabled={disabled || busy}
                    onChange={(event) => patch({ aspectRatio: event.target.value })}
                  >
                    {aspectRatioOptions.map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </select>
                </label>
                {data.nodeKind !== "video" ? (
                  <label className="qmdh-canvas-field">
                    <span>分辨率</span>
                    <select
                      value={data.resolution}
                      disabled={disabled || busy}
                      onChange={(event) => patch({ resolution: event.target.value })}
                    >
                      {resolutionOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}

            {isUpscale ? (
              <>
                <div className="qmdh-canvas-field-row">
                  <label className="qmdh-canvas-field">
                    <span>倍率</span>
                    <select
                      value={data.upscaleScale}
                      disabled={disabled || busy}
                      onChange={(event) =>
                        patch({ upscaleScale: event.target.value as GenerateNodeData["upscaleScale"] })
                      }
                    >
                      {upscaleScaleOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="qmdh-canvas-field">
                    <span>类型</span>
                    <select
                      value={data.upscaleStyle}
                      disabled={disabled || busy}
                      onChange={(event) =>
                        patch({ upscaleStyle: event.target.value as GenerateNodeData["upscaleStyle"] })
                      }
                    >
                      {upscaleStyleOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="qmdh-canvas-field">
                  <span>降噪</span>
                  <select
                    value={data.upscaleNoise}
                    disabled={disabled || busy}
                    onChange={(event) =>
                      patch({ upscaleNoise: event.target.value as GenerateNodeData["upscaleNoise"] })
                    }
                  >
                    {upscaleNoiseOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}

            <CanvasModelSelect
              value={data.requestedProvider}
              providers={providers}
              data={data}
              disabled={disabled || busy}
              onPatch={patch}
            />

            <p className="qmdh-canvas-node-ref-hint">
              {upstream.images.length > 0 || upstream.videos.length > 0
                ? `上游交付：${upstream.images.length} 图${
                    upstream.videos.length > 0 ? ` / ${upstream.videos.length} 视频` : ""
                  }（连线自动传入）`
                : needsInput
                  ? "请连接上游节点传入参考图"
                  : "可连接上游节点传入参考素材"}
            </p>
          </div>
        )}

        {data.errorMessage ? <p className="qmdh-canvas-node-error">{data.errorMessage}</p> : null}
      </div>

      <footer className="qmdh-canvas-node-foot nodrag nopan">
        {isUpload ? (
          <button type="button" disabled={disabled || busy} onClick={() => fileInputRef.current?.click()}>
            {busy ? "上传中…" : preview ? "更换图片" : "上传图片"}
          </button>
        ) : isAnnotate ? (
          <button
            type="button"
            disabled={disabled || busy || !canSubmit}
            onClick={() => void saveAnnotation(id)}
          >
            {busy ? "保存中…" : data.status === "failed" ? "重试保存" : "保存标注"}
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled || busy || !canSubmit}
            onClick={() => generateNode(id, data)}
          >
            {busy
              ? isUpscale
                ? "放大中…"
                : "生成中…"
              : data.status === "failed"
                ? "重试"
                : isUpscale
                  ? "放大"
                  : "生成"}
          </button>
        )}
      </footer>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
