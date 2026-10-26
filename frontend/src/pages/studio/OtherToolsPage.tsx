import { lazy, Suspense } from "react";
import { NavLink } from "react-router-dom";
import { AppShell, LoadingFallback } from "../../components/shared";
import "./otherTools.css";
import StudioSectionTabs from "../../features/studio/StudioSectionTabs";
import { OTHER_SECTION_LINKS } from "../../features/studio/studioNavigation";

const CadExtractPage = lazy(() => import("./CadExtractPage"));
const GifCompressPage = lazy(() => import("./GifCompressPage"));

export default function OtherToolsPage({ tool }: { tool?: "cad" | "gif" }) {
  return <AppShell kind="studio" active="other">
    <div className="other-tools-layout">
      <StudioSectionTabs group="other" active={tool || "other"} />
      {tool ? <Suspense fallback={<LoadingFallback />}>{tool === "cad" ? <CadExtractPage /> : <GifCompressPage />}</Suspense>
        : <section className="other-entry-page"><h1>其他</h1><p>灵感、反馈、工具导航与实用工具，都在这里。</p><div className="other-entry-grid">{OTHER_SECTION_LINKS.map(link => <NavLink key={link.key} to={link.path}><strong>{link.label} →</strong><span>{link.description}</span></NavLink>)}</div></section>}
    </div>
  </AppShell>;
}
