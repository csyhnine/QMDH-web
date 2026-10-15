import { lazy, Suspense } from "react";
import { NavLink } from "react-router-dom";
import { AppShell, LoadingFallback } from "../../components/shared";
import "./otherTools.css";

const CadExtractPage = lazy(() => import("./CadExtractPage"));
const GifCompressPage = lazy(() => import("./GifCompressPage"));

export default function OtherToolsPage({ tool }: { tool: "cad" | "gif" }) {
  return <AppShell kind="studio" active="other">
    <div className="other-tools-layout">
      <nav className="other-tools-tabs" aria-label="其他功能">
        <NavLink to="/studio/cad" className={({ isActive }) => isActive ? "is-active" : ""}>图纸解析</NavLink>
        <NavLink to="/studio/gif" className={({ isActive }) => isActive ? "is-active" : ""}>GIF 压缩</NavLink>
      </nav>
      <Suspense fallback={<LoadingFallback />}>{tool === "cad" ? <CadExtractPage /> : <GifCompressPage />}</Suspense>
    </div>
  </AppShell>;
}
