import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const getUser = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getSession, getUser } }),
}));

import { AuthService } from "./authService";

function sessionWith(user: unknown) {
  return { data: { session: user ? { user } : null }, error: null };
}

beforeEach(() => {
  getSession.mockReset();
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: null }, error: null });
});

describe("AuthService Supabase request efficiency", () => {
  it("isAuthenticated reads the local session and never calls getUser (network)", async () => {
    getSession.mockResolvedValue(sessionWith({ email_confirmed_at: "2024-01-01", user_metadata: {} }));
    const svc = new AuthService({ supabaseUrl: "u", supabaseAnonKey: "k" });
    expect(await svc.isAuthenticated()).toBe(true);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("getUserProfile derives from the session without a getUser call", async () => {
    getSession.mockResolvedValue(
      sessionWith({ id: "abc", email: "a@b.c", email_confirmed_at: "x", user_metadata: { region: "eu", avatar: "http://x/y.png" } })
    );
    const svc = new AuthService({ supabaseUrl: "u", supabaseAnonKey: "k" });
    const profile = await svc.getUserProfile();
    expect(profile).toMatchObject({ id: "abc", email: "a@b.c", emailConfirmed: true, region: "eu" });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("coalesces concurrent session reads into a single underlying call", async () => {
    getSession.mockResolvedValue(sessionWith({ email_confirmed_at: "x", user_metadata: {} }));
    const svc = new AuthService({ supabaseUrl: "u", supabaseAnonKey: "k" });
    await Promise.all([svc.isAuthenticated(), svc.getUserProfile(), svc.getCurrentUser()]);
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("tries once more when the browser lock timed out, and leaves no unhandled rejection", async () => {
    const lockTimeout = Object.assign(new Error("Acquiring an exclusive Navigator LockManager lock timed out"), { isAcquireTimeout: true });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      getSession.mockRejectedValueOnce(lockTimeout).mockResolvedValueOnce(sessionWith(null));
      const svc = new AuthService({ supabaseUrl: "u", supabaseAnonKey: "k" });
      expect(await svc.getSession()).toBeNull();
      expect(getSession).toHaveBeenCalledTimes(2);

      getSession.mockRejectedValue(new Error("offline"));
      await expect(svc.getSession()).rejects.toThrow("offline");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
