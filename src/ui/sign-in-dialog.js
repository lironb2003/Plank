// ---- Sign-in dialog: Google, or an email + password account ----
// Two providers, deliberately: Google's popup flow runs through
// <authDomain>/__/auth/handler, which rejects any origin not on the Firebase
// authorized-domains list — so it only works on the production and dev hosts,
// never on a per-branch preview deploy. Email/password is a plain REST call to
// identitytoolkit with no domain check, so it signs in anywhere the app is
// served from. Same account, same uid, same data on every branch.

// Firebase error codes are precise but user-hostile; map the ones a person can
// actually act on and fall back to the raw code so nothing is swallowed.
const AUTH_ERRORS = {
  "auth/invalid-email": "That email doesn't look right.",
  "auth/missing-email": "Enter your email above first, then tap this again.",
  "auth/missing-password": "Enter a password.",
  "auth/weak-password": "Use at least 6 characters.",
  "auth/email-already-in-use": "That email already has an account — sign in instead.",
  "auth/invalid-credential": "Email or password is wrong.",
  "auth/wrong-password": "Email or password is wrong.",
  "auth/user-not-found": "No account with that email — create one instead.",
  "auth/user-disabled": "That account is disabled.",
  "auth/too-many-requests": "Too many attempts. Wait a minute, then try again.",
  "auth/network-request-failed": "Network problem — check your connection.",
  // Both of these are console settings, not user mistakes: say which one.
  "auth/operation-not-allowed": "Email sign-in isn't enabled for this project yet.",
  "auth/unauthorized-domain": "Google sign-in isn't allowed on this URL — use email and password below.",
};
// `what` names the action for the unmapped-code fallback, so a reset failure
// doesn't report itself as a failed sign-in.
const authError = (e, what) => {
  const code = e && e.code ? e.code : "";
  const label = what || "Sign-in";
  return AUTH_ERRORS[code] || (code ? `${label} failed (${code}).` : `${label} failed.`);
};

// `initialError` carries a failure that happened while no dialog was open —
// a redirect sign-in reports its result on the next page load, not inline.
function SignInDialog({ onClose, onGoogle, onEmail, onReset, initialError }) {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(initialError || "");
  const [notice, setNotice] = useState(""); // reset-sent confirmation, not a failure
  const signup = mode === "signup";

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Both handlers resolve to an error message or "" — a success unmounts this
  // dialog via the auth state change, so there is no success path to render.
  // "" is not proof of a sign-in though: dismissing the Google popup reports
  // nothing, and the dialog stays up, so the form has to be handed back either
  // way or it locks. (Releasing it after a real success is a no-op — the
  // component is already gone.)
  const run = async (fn) => {
    setBusy(true);
    setErr("");
    setNotice("");
    const message = await fn();
    setBusy(false);
    if (message) setErr(message);
  };

  const submit = (e) => {
    e.preventDefault();
    if (busy || !email.trim() || !password) return;
    run(() => onEmail(email.trim(), password, mode));
  };

  // The reset mail goes to whatever is in the email field, so it needs one.
  // Success is deliberately worded as a maybe: with email-enumeration
  // protection on (Firebase's default), sending resolves the same way whether
  // or not the address has an account, and claiming otherwise would both lie
  // to the user and leak which addresses are registered.
  const forgot = async () => {
    const address = email.trim();
    if (!address) {
      setNotice("");
      setErr(AUTH_ERRORS["auth/missing-email"]);
      return;
    }
    setBusy(true);
    setErr("");
    setNotice("");
    const message = await onReset(address);
    setBusy(false);
    if (message) setErr(message);
    else setNotice(`If ${address} has an account, a reset link is on its way. Check spam too.`);
  };

  return (
    <div style={styles.confirmOverlay} onClick={onClose}>
      <div style={styles.authBox} onClick={(e) => e.stopPropagation()}>
        <div style={styles.confirmTitle}>{signup ? "Create an account" : "Sign in"}</div>
        <div style={styles.authSubtitle}>
          Syncs your presets and gym log across devices.
        </div>

        <button
          type="button"
          onClick={() => run(onGoogle)}
          disabled={busy}
          style={{ ...styles.authGoogleBtn, opacity: busy ? 0.6 : 1 }}
        >
          Continue with Google
        </button>

        <div style={styles.authDivider}>
          <span style={styles.authDividerLine} />
          <span style={styles.authDividerText}>or</span>
          <span style={styles.authDividerLine} />
        </div>

        <form onSubmit={submit}>
          <label style={styles.authLabel} htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="you@example.com"
            style={styles.authInput}
          />
          <label style={{ ...styles.authLabel, marginTop: 12 }} htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={signup ? "new-password" : "current-password"}
            placeholder={signup ? "At least 6 characters" : "••••••••"}
            style={styles.authInput}
          />
          {!signup && (
            <div style={styles.authForgotRow}>
              <button
                type="button"
                onClick={forgot}
                disabled={busy}
                style={{ ...styles.authForgot, opacity: busy ? 0.5 : 1 }}
              >
                Forgot password?
              </button>
            </div>
          )}

          {/* Both outcomes are announced: the reset confirmation has no other
              visible effect, so a screen reader would otherwise miss it. */}
          <div aria-live="polite">
            {notice && <div style={styles.authNotice}>{notice}</div>}
            {err && <div style={styles.authError}>{err}</div>}
          </div>

          <button
            type="submit"
            disabled={busy || !email.trim() || !password}
            style={{
              ...styles.authSubmit,
              opacity: busy || !email.trim() || !password ? 0.5 : 1,
            }}
          >
            {busy ? "…" : signup ? "Create account" : "Sign in"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(signup ? "signin" : "signup");
            setErr("");
            setNotice("");
          }}
          style={styles.authSwitch}
        >
          {signup ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
        <button type="button" onClick={onClose} style={styles.authCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
