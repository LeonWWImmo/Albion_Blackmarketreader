import type { Region } from "../types";

type RegionSubscriber = (region: Region) => void;

const REGION_KEY = "region";
const CHANNEL_NAME = "rk-region-sync";

export class RegionService {
  private readonly subscribers = new Set<RegionSubscriber>();
  private readonly channel: BroadcastChannel | null;
  private region: Region;

  constructor(defaultRegion: Region = "eu") {
    this.region = this.readRegion(defaultRegion);
    this.channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;

    window.addEventListener("storage", this.onStorage);
    this.channel?.addEventListener("message", this.onChannelMessage as EventListener);
  }

  destroy() {
    window.removeEventListener("storage", this.onStorage);
    this.channel?.removeEventListener("message", this.onChannelMessage as EventListener);
    this.channel?.close();
    this.subscribers.clear();
  }

  getRegion(): Region {
    return this.region;
  }

  setRegion(next: Region, options?: { broadcast?: boolean }): void {
    const normalized: Region = next === "us" ? "us" : "eu";
    if (normalized === this.region) return;

    this.region = normalized;
    localStorage.setItem(REGION_KEY, normalized);
    this.notify();

    if (options?.broadcast !== false) {
      // The channel is closed once destroy() ran; in development React's StrictMode runs the
      // pages' cleanup once and keeps the same service, so a later switch would throw here.
      try {
        this.channel?.postMessage({ type: "region", value: normalized });
      } catch {
        // other tabs simply are not told; they still pick it up from localStorage
      }
    }
  }

  subscribe(fn: RegionSubscriber): () => void {
    this.subscribers.add(fn);
    fn(this.region);
    return () => this.subscribers.delete(fn);
  }

  private readRegion(defaultRegion: Region): Region {
    const stored = (localStorage.getItem(REGION_KEY) || "").toLowerCase();
    return stored === "us" || stored === "eu" ? stored : defaultRegion;
  }

  private notify() {
    this.subscribers.forEach((fn) => fn(this.region));
  }

  private onStorage = (event: StorageEvent) => {
    if (event.key !== REGION_KEY) return;
    const next = (event.newValue || "").toLowerCase();
    if (next !== "eu" && next !== "us") return;
    if (next === this.region) return;
    this.region = next;
    this.notify();
  };

  private onChannelMessage = (event: MessageEvent) => {
    const next = (event.data?.value || "").toLowerCase();
    if (event.data?.type !== "region") return;
    if (next !== "eu" && next !== "us") return;
    if (next === this.region) return;
    this.region = next;
    localStorage.setItem(REGION_KEY, next);
    this.notify();
  };
}

