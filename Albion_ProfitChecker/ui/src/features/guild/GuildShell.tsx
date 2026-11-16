import { useEffect, type CSSProperties, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { assetUrl } from "@shared/assets/assets";
import { useToolAccount } from "@shared/account/useToolAccount";
import { TOOL_CONTENT, type ToolSlug } from "@shared/content/toolContentData";
import { useRegion } from "@shared/region/useRegion";
import type { Region } from "@shared/types";
import { MobileNavBurger, ToolNav } from "../../shared";
import { GuildWelcome } from "./ui/GuildWelcome";
import "../bm-crafter/ui/bmCrafter.css";
import "./guild.css";

/** The page frame of every Guild page: header, tool tabs, account and region. */
export function GuildShell({ children }: { children: (region: Region, setRegion: (next: Region) => void) => ReactNode }) {
  const { pathname } = useLocation();
  const [region, setRegion] = useRegion();
  // the guide of the open tab (/guild/<region>/<guild>/<tab>), else the guild tools' guide
  const tab = pathname.split("/")[4] ?? "";
  const guide = (`guild-${tab}` in TOOL_CONTENT ? `guild-${tab}` : "guild") as ToolSlug;
  const { meta, layers, faction } = useToolAccount(pathname, guide, region, setRegion);
  // the account's faction colour; without one the tools' own accent (guild.css)
  const accent = faction ? ({ "--gd-accent": faction.accent, "--gd-accent-rgb": faction.accentRgb } as CSSProperties) : undefined;

  useEffect(() => {
    document.body.classList.add("guild-body");
    document.body.classList.remove("landing-body", "dashboard-body", "bm-crafter");
    return () => document.body.classList.remove("guild-body");
  }, []);

  return (
    <div className="gd-root" style={accent}>
      <header className="bm-header">
        <MobileNavBurger accent="var(--gd-accent)" />
        <div className="bm-header-row">
          <div className="bm-brand">
            <div className="bm-brand-home">
              <div className="bm-logo" aria-hidden="true">
                <img src={assetUrl("picture/testo ohne background.png")} alt="" />
              </div>
              <h1>RomulusKings Crafting Tools</h1>
            </div>
            <ToolNav />
          </div>
          {meta}
        </div>
      </header>
      {children(region, setRegion)}
      <GuildWelcome />
      {layers}
    </div>
  );
}
