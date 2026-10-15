import type { GifMediaInfo } from "../../api";

export default function GifMediaDetails({ info, title }: { info?: GifMediaInfo | null; title: string }) {
  return <section className="gif-media-details" aria-label={title}>
    <strong>{title}</strong>
    {info ? <dl>
      <div><dt>尺寸</dt><dd>{info.width} × {info.height} px</dd></div>
      <div><dt>平均帧率</dt><dd>{info.frames > 1 ? `${info.average_fps} fps${info.variable_fps ? "（可变）" : ""}` : "静态"}</dd></div>
      <div><dt>每帧最多用色</dt><dd>{info.colors === null ? "超过 256 色" : `${info.colors} 色`}</dd></div>
      <div><dt>帧数</dt><dd>{info.frames} 帧</dd></div>
      <div><dt>单轮时长</dt><dd>{(info.duration_ms / 1000).toFixed(2)} 秒</dd></div>
      <div><dt>循环方式</dt><dd>{info.loop === null ? "不循环" : info.loop === 0 ? "无限循环" : `重复 ${info.loop} 次`}</dd></div>
      <div><dt>透明背景</dt><dd>{info.transparent ? "有" : "无"}</dd></div>
    </dl> : <p>暂无参数，文件可能无法读取或已超出读取预算。</p>}
  </section>;
}
