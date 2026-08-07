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
const authError = (e) => {
  const code = e && e.code ? e.code : "";
  return AUTH_ERRORS[code] || (code ? `Sign-in failed (${code}).` : "Sign-in failed.");
};

// `initialError` carries a failure that happened while no dialog was open —
// a redirect sign-in reports its result on the next page load, not inline.
function SignInDialog({ onClose, onGoogle, onEmail, initialError }) {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(initialError || "");
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
    const message = await fn();
    setBusy(false);
    if (message) setErr(message);
  };

  const submit = (e) => {
    e.preventDefault();
    if (busy || !email.trim() || !password) return;
    run(() => onEmail(email.trim(), password, mode));
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

          {err && <div style={styles.authError}>{err}</div>}

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
