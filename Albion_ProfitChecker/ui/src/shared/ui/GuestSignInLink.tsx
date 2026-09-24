import { exitGuest } from "../auth/guestMode";
import "./guestSignInLink.css";

/** Sends the visitor to the login page, preserving where they were so they return after login. */
function goToLogin() {
  const next = encodeURIComponent(window.location.pathname || "/dashboard");
  window.location.href = `/login?next=${next}`;
}

/** Same, but lands on the register tab for someone who has no account yet. */
function goToRegister() {
  const next = encodeURIComponent(window.location.pathname || "/dashboard");
  window.location.href = `/login?mode=register&next=${next}`;
}

/** Signed-out-style note shown in the account panel while in guest mode. Hyperlink, not a button. */
export function GuestSignInLink() {
  return (
    <span className="guest-signin-note">
      Guest mode ·{" "}
      <a
        href="/login"
        className="guest-signin-anchor"
        onClick={(e) => {
          e.preventDefault();
          goToLogin();
        }}
      >
        Sign in
      </a>{" "}
      or{" "}
      <a
        href="/login?mode=register"
        className="guest-signin-anchor"
        onClick={(e) => {
          e.preventDefault();
          goToRegister();
        }}
      >
        create an account
      </a>{" "}
      to save your settings
    </span>
  );
}

/** Leaves guest mode entirely and returns to the login screen. */
export function exitGuestToLogin() {
  exitGuest();
  window.location.href = "/login";
}
