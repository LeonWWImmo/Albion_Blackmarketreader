import type { Region } from "@shared/types";
import { GuildApiError } from "../api";

/** An error as the page shows it; `down` is set when Albion's killboard of that server is down. */
export type ShownError = { text: string; down: Region | null };

export const shownError = (err: unknown, fallback: string): ShownError =>
  err instanceof GuildApiError ? { text: err.message, down: err.down } : { text: fallback, down: null };

const SERVER = { eu: "Europe", us: "America" } as const;

/** The error text; when one server's killboard is down, a button to the other server. */
export function ErrorNote({ error, setRegion }: { error: ShownError; setRegion?: (next: Region) => void }) {
  const other: Region = error.down === "eu" ? "us" : "eu";
  return (
    <div className="gd-error" role="alert">
      <p>{error.text}</p>
      {error.down && setRegion ? (
        <button type="button" className="gd-btn gd-error-switch" onClick={() => setRegion(other)}>
          Switch to {SERVER[other]}
        </button>
      ) : null}
    </div>
  );
}
