import { Component, type ReactNode } from "react";
import { reportCaughtError } from "../errorReporter";

type Props = { children: ReactNode };
type State = { failed: boolean };

/**
 * Without this, a page that fails to render (most often: its code could not be downloaded, even
 * after the stale-build reload) leaves the visitor on an empty dark screen. This says what happened
 * and offers a way out; App gives it the path as key, so another page starts fresh.
 */
export class PageErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    reportCaughtError(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" style={{ minHeight: "100vh", display: "grid", placeContent: "center", gap: 16, padding: 24, textAlign: "center", color: "#eef2fa", background: "#05070d", fontFamily: "Inter, 'Segoe UI', sans-serif" }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>This page could not load</h1>
        <p style={{ margin: 0, color: "#9fabc6" }}>Usually a weak connection. Reloading fixes it.</p>
        <p style={{ margin: 0, display: "flex", gap: 12, justifyContent: "center" }}>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: "10px 18px", borderRadius: 10, border: 0, background: "#e9c27a", color: "#05070d", fontWeight: 700, cursor: "pointer" }}>
            Reload
          </button>
          <a href="/" style={{ padding: "10px 18px", color: "#e9c27a" }}>
            Home
          </a>
        </p>
      </main>
    );
  }
}
