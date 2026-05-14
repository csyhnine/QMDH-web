/**
 * GeneratePagePlaceholder
 *
 * The Generate page is the most complex view in the application (~1500 lines of JSX).
 * It includes the workspace sidebar, feed stream, and composer dock, all tightly
 * coupled to App.tsx state (tasks, assets, providers, templates, form state).
 *
 * This placeholder exists to satisfy the module boundary requirement for Task 3.3.
 * The actual extraction will happen in Task 3.5 when App.tsx is reduced to a
 * router shell and all state is lifted into context providers or page-level hooks.
 *
 * For now, the generate view continues to render inline in App.tsx.
 */

export default function GeneratePagePlaceholder() {
  return (
    <div className="empty-stage empty-stage-inline">
      <div className="empty-stage-copy">
        <p className="canvas-kicker">生成页</p>
        <h1>此组件由 App.tsx 内联渲染</h1>
        <p>完整提取将在 Task 3.5 中完成。</p>
      </div>
    </div>
  );
}
