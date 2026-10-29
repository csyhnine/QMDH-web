import { Link } from "react-router-dom";
import { isStudioCanvasEnabled } from "../../lib/featureFlags";
import { OTHER_SECTION_LINKS } from "./studioNavigation";
import "./studioSectionTabs.css";

export default function StudioSectionTabs({ group, active }: { group: "other" | "generate"; active: string }) {
  const links = group === "other" ? [{ key: "other", label: "其他首页", path: "/studio/other" }, ...OTHER_SECTION_LINKS]
    : [{ key: "generate", label: "生成工作台", path: "/studio/generate" }, ...(isStudioCanvasEnabled ? [{ key: "canvas", label: "无限画布", path: "/studio/canvas" }] : [])];
  return <nav className="studio-section-tabs" data-group={group} aria-label={group === "other" ? "其他功能" : "生成方式"}>
    {links.map(link => <Link key={link.key} to={link.path} aria-current={active === link.key ? "page" : undefined}>{link.label}</Link>)}
  </nav>;
}
