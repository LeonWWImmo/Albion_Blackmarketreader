import { afterEach, describe, expect, it, vi } from "vitest";
import { guardForeignDomChanges, reload, reloadOnStaleBuild } from "./browserGuards";

afterEach(() => {
  vi.unstubAllGlobals();
  reload.pending = false;
});

describe("stale build reload", () => {
  function browser() {
    const store = new Map<string, string>();
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
  }
  const preloadError = () => {
    const event = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(event);
    return event;
  };

  it("reloads once onto the new build, and lets a second failure right after through", () => {
    browser();
    const doReload = vi.fn();
    reloadOnStaleBuild(doReload);
    expect(preloadError().defaultPrevented).toBe(true);
    expect(doReload).toHaveBeenCalledTimes(1);
    expect(reload.pending).toBe(true);
    expect(preloadError().defaultPrevented).toBe(false);
    expect(doReload).toHaveBeenCalledTimes(1);
  });
});

describe("foreign DOM changes", () => {
  it("skips removing or inserting next to a node someone else already moved", () => {
    class FakeNode {
      parentNode: FakeNode | null = null;
      removeChild(child: FakeNode) {
        if (child.parentNode !== this) throw new Error("NotFoundError");
        child.parentNode = null;
        return child;
      }
      insertBefore(node: FakeNode, ref: FakeNode | null) {
        if (ref && ref.parentNode !== this) throw new Error("NotFoundError");
        node.parentNode = this;
        return node;
      }
    }
    vi.stubGlobal("Node", FakeNode);
    guardForeignDomChanges();
    const parent = new FakeNode();
    const translated = new FakeNode(); // the text node a translator swapped out
    const mine = new FakeNode();
    mine.parentNode = parent;
    expect(parent.removeChild(translated)).toBe(translated);
    expect(parent.insertBefore(new FakeNode(), translated).parentNode).toBeNull();
    expect(parent.removeChild(mine).parentNode).toBeNull();
  });
});
