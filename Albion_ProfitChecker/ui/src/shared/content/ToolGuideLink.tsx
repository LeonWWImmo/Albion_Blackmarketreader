import { Link } from "react-router-dom";
import type { AuthService } from "@shared/auth/authService";
import { TOOL_CONTENT, type ToolSlug } from "./toolContentData";
import { useGuideDismissal } from "./useGuideDismissal";
import "./toolGuideLink.css";

/**
 * Slim link bar at the foot of a tool page pointing at that tool's guide.
 *
 * Deliberately quiet: the tool is the page, the guide is the reading. Visitors can hide it
 * per tool with the checkbox; the choice is saved to their account (or this device when
 * signed out). The guides stay reachable from the account panel and the site footer.
 */
export function ToolGuideLink({ slug, authService }: { slug: ToolSlug; authService?: AuthService | null }) {
  const entry = TOOL_CONTENT[slug];
  const { dismissed, dismiss } = useGuideDismissal(slug, authService ?? null);

  if (!entry || dismissed) return null;

  const { guide } = entry;

  return (
    <div className="tool-guide-link-bar">
      <div className="tool-guide-link-wrap">
        <Link className="tool-guide-link" to={`/guides/${guide.slug}`}>
          <span className="tool-guide-link-tag">Guide</span>
          <span className="tool-guide-link-text">
            <strong>{guide.h1}</strong>
            <span className="tool-guide-link-sub">{guide.description}</span>
          </span>
          <svg className="tool-guide-link-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M5 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        <label className="tool-guide-dismiss">
          <input type="checkbox" checked={false} onChange={dismiss} />
          <span>Don&rsquo;t show again</span>
        </label>
      </div>
    </div>
  );
}
