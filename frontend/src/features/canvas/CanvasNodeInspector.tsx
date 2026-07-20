import { aspectRatioOptions, resolutionOptions } from "../studio/studioConstants";
import {
  upscaleNoiseOptions,
  upscaleScaleOptions,
  upscaleStyleOptions,
} from "../studio/studioUpscaleOptions";
import type { Provider } from "../../api";
import { CanvasDraftInput, CanvasDraftTextarea } from "./CanvasDraftField";
import CanvasModelSelect from "./CanvasModelSelect";
import type { UpstreamDeliverables } from "./canvasNodeContext";
import { NODE_KIND_LABEL, type CanvasGenerateNode, type GenerateNodeData } from "./canvasTypes";

type CanvasNodeInspectorProps = {
  node: CanvasGenerateNode | null;
  providers: Provider[];
  upstream: UpstreamDeliverables;
  disabled?: boolean;
  selectionCount?: number;
  onChange: (nodeId: string, patch: Partial<GenerateNodeData>) => void;
  onGenerate: (nodeId: string, data: GenerateNodeData) => void;
  onUploadImage: (nodeId: string, file: File) => Promise<void>;
  onSaveAnnotation: (nodeId: string) => Promise<void>;
  onGroup?: () => void;
  onUngroup?: () => void;
  onClose: () => void;
};

export default function CanvasNodeInspector({
  node,
  providers,
  upstream,
  disabled = false,
  selectionCount = 0,
  onChange,
  onGenerate,
  onSaveAnnotation,
  onGroup,
  onUngroup,
  onClose,
}: CanvasNodeInspectorProps) {
  if (!node) {
    return (
      <aside className="qmdh-canvas-inspector is-empty">
        <strong>节点配置</strong>
        {selectionCount > 1 ? (
          <>
            <p>已选中 {selectionCount} 个节点，可编组一起拖动。</p>
            <div className="qmdh-canvas-inspector-multi">
              <button type="button" disabled={disabled} onClick={onGroup}>
                编组
              </button>
              <button type="button" disabled={disabled} onClick={onUngroup}>
                解散
              </button>
            </div>
          </>
        ) : (
          <p>
            左键框选节点，中键平移画布。双击空白可加备注；右键添加生成 / 标注等节点。
          </p>
        )}
      </aside>
    );
  }

  const data = node.data;
  const busy = data.status === "submitting" || data.status === "pending" || data.status === "running";
  const resultPreview = data.assetUrls[0] || data.previewImagePath || data.referenceImages[0] || "";
  const isUpload = data.nodeKind === "upload";
  const isUpscale = data.nodeKind === "upscale";
  const isAnnotate = data.nodeKind === "annotate";
  const needsInput = data.nodeKind === "img2img" || isUpscale || isAnnotate;
  const hasUpstreamMedia = upstream.images.length > 0 || upstream.videos.length > 0;
  const hasLocalImage = data.referenceImages.length > 0 || data.assetUrls.length > 0;
  const baseImage = upstream.images[0] || data.referenceImages[0] || data.previewImagePath || "";
  const canSubmit = isUpload
    ? false
    : isAnnotate
      ? Boolean(baseImage) && data.annotationStrokes.length > 0
      : isUpscale
        ? hasUpstreamMedia || hasLocalImage
        : Boolean(data.prompt.trim()) && (!needsInput || hasUpstreamMedia || hasLocalImage);

  function patch(partial: Partial<GenerateNodeData>) {
    onChange(node!.id, partial);
  }

  return (
    <aside className="qmdh-canvas-inspector">
      <header className="qmdh-canvas-inspector-head">
        <div>
          <strong>节点配置</strong>
          <span>
            {NODE_KIND_LABEL[data.nodeKind]} · {data.label || node.id}
          </span>
        </div>
        <button type="button" className="ghost" onClick={onClose} aria-label="关闭配置">
          ×
        </button>
      </header>

      <div className="qmdh-canvas-inspector-scroll">
        <div className="qmdh-canvas-inspector-body">
          {isUpload ? null : isAnnotate ? null : (
            <label className="qmdh-canvas-field">
              <span>节点名称</span>
              <CanvasDraftInput
                value={data.label}
                disabled={disabled || busy}
                onCommit={(label) => patch({ label })}
              />
            </label>
          )}

          {isUpload ? (
            <p className="qmdh-canvas-node-ref-hint">在节点底部点击「更换图片」即可换图。</p>
          ) : null}

          {isAnnotate ? (
            <p className="qmdh-canvas-node-ref-hint">
              在节点画板上使用画笔 / 矩形 / 椭圆 / 箭头 / 文字标注，点「保存标注」后输出合成图给下游。
              {data.annotationStrokes.length > 0 ? ` 已有 ${data.annotationStrokes.length} 条标注。` : ""}
            </p>
          ) : null}

          {!isUpload && !isUpscale && !isAnnotate ? (
            <label className="qmdh-canvas-field qmdh-canvas-field-prompt">
              <span>提示词</span>
              <CanvasDraftTextarea
                rows={12}
                value={data.prompt}
                disabled={disabled || busy}
                placeholder="描述生成内容…"
                onCommit={(prompt) => patch({ prompt })}
              />
            </label>
          ) : null}

          {!isUpload && !isUpscale && !isAnnotate ? (
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
              ) : (
                <div className="qmdh-canvas-field">
                  <span>类型</span>
                  <div className="qmdh-canvas-kind-badge">{NODE_KIND_LABEL[data.nodeKind]}</div>
                </div>
              )}
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
            {isUpload
              ? "本节点输出图片给下游"
              : isAnnotate
                ? baseImage
                  ? "已连接底图，可在节点内标注"
                  : "请连接上游图片作为标注底图"
                : upstream.images.length > 0 || upstream.videos.length > 0
                  ? `上游交付：${upstream.images.length} 图${
                      upstream.videos.length > 0 ? ` / ${upstream.videos.length} 视频` : ""
                    }`
                  : needsInput
                    ? "请连接上游节点传入参考图"
                    : "可连接上游节点传入参考素材"}
          </p>

          {data.errorMessage ? <p className="qmdh-canvas-node-error">{data.errorMessage}</p> : null}

          {isUpload ? null : (
            <button
              type="button"
              className="qmdh-canvas-inspector-generate"
              disabled={disabled || busy || !canSubmit}
              onClick={() => {
                if (isAnnotate) void onSaveAnnotation(node.id);
                else onGenerate(node.id, data);
              }}
            >
              {busy
                ? isAnnotate
                  ? "保存中…"
                  : isUpscale
                    ? "放大中…"
                    : "生成中…"
                : data.status === "failed"
                  ? "重试"
                  : isAnnotate
                    ? "保存标注"
                    : isUpscale
                      ? "放大"
                      : "生成"}
            </button>
          )}
        </div>

        <section className="qmdh-canvas-inspector-result">
          <header>
            <strong>{isUpload || isAnnotate ? "图片预览" : "结果预览"}</strong>
            <span>
              {data.assetUrls.length > 0
                ? `${data.assetUrls.length} 个`
                : busy
                  ? isAnnotate
                    ? "保存中…"
                    : isUpscale
                      ? "放大中…"
                      : "生成中…"
                  : isUpload
                    ? "上传后显示"
                    : isAnnotate
                      ? "保存后显示"
                      : "生成后显示在这里"}
            </span>
          </header>
          <div className="qmdh-canvas-inspector-result-frame">
            {resultPreview ? (
              /\.(mp4|webm|mov)(\?|$)/i.test(resultPreview) ? (
                <video src={resultPreview} controls playsInline />
              ) : (
                <img src={resultPreview} alt="" />
              )
            ) : (
              <div className="qmdh-canvas-inspector-result-empty">暂无结果</div>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
