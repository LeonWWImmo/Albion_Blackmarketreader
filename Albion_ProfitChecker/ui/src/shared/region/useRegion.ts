import { useCallback, useEffect, useState } from "react";
import type { Region } from "../types";
import { RegionService } from "./regionService";

/** The server region all tools share (kept in sync across tabs), and a setter for it. */
export function useRegion(): [Region, (next: Region) => void] {
  const [service] = useState(() => new RegionService("eu"));
  const [region, setRegion] = useState<Region>(service.getRegion());
  useEffect(() => {
    const off = service.subscribe((next) => setRegion(next));
    return () => {
      off();
      service.destroy();
    };
  }, [service]);
  return [region, useCallback((next: Region) => service.setRegion(next), [service])];
}
