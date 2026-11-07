import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { assetUrl } from "@shared/assets/assets";
import { useToolAccount } from "@shared/account/useToolAccount";
import { useRegion } from "@shared/region/useRegion";
import type { Region } from "@shared/types";
import { MobileNavBurger, ToolNav } from "../../../shared";
import "../../bm-crafter/ui/bmCrafter.css";
import "../priceChecker.css";

/** The page frame every Price Checker page shares: header, tool tabs, account and region. */
export function PriceCheckerShell({ children }: { children: (region: Region, setRegion: (next: Region) => void) => ReactNode }) {
  const { pathname } = useLocation();
  const [region, setRegion] = useRegion();
  const { meta, layers } = useToolAccount(pathname, null, region, setRegion);

  useEffect(() => {
    document.body.classList.add("price-checker-body");
    document.body.classList.remove("landing-body", "dashboard-body", "bm-crafter");
    return () => document.body.classList.remove("price-checker-body");
  }, []);

  return (
    <div className="pc-root">
      <header className="bm-header">
        <MobileNavBurger accent="#2dd4bf" />
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
      {layers}
    </div>
  );
}
