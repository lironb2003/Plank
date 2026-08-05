// ---- Root: home ⇄ timer / gym tracker ----
// Auth lives here (not in a page) so the account section can render on the
// landing page while the timer still reloads presets when the user changes.
function App() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!firebaseReady); // no firebase => nothing to wait for
  const [syncState, setSyncState] = useState("idle"); // idle | syncing | synced | error | denied
  const [authNotice, setAuthNotice] = useState(""); // a sign-in failure with no dialog to show it

  useEffect(() => {
    store.notify = (s) => setSyncState(s);
    if (!firebaseReady) {
      return () => {
        store.notify = null;
      };
    }
    let unsub = null;
    try {
      unsub = firebase.auth().onAuthStateChanged(
        (u) => {
          setUser(u);
          setAuthReady(true);
        },
        () => setAuthReady(true)
      );
      // A redirect sign-in navigates away and comes back to a fresh page with
      // no dialog open, so its failure is only ever reported here. Unread, an
      // unauthorized-domain redirect just lands on a signed-out page with no
      // explanation — the exact case email/password exists to solve.
      firebase
        .auth()
        .getRedirectResult()
        .catch((e) => setAuthNotice(authError(e)));
    } catch (e) {
      setAuthReady(true);
    }
    return () => {
      store.notify = null;
      if (unsub) unsub();
    };
  }, []);

  // Both sign-in paths resolve to "" on success (or when there is nothing to
  // report) and to a message the dialog shows on failure.
  const signInWithGoogle = async () => {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        await firebase.auth().signInWithPopup(provider);
      } catch (e) {
        // Popup blocked (common on mobile) → best-effort redirect fallback.
        // Note: redirect with the default *.firebaseapp.com authDomain is
        // degraded by third-party-cookie blocking in some browsers; popup is
        // the primary path. A user closing the popup is not an error.
        if (
          e &&
          (e.code === "auth/popup-blocked" ||
            e.code === "auth/operation-not-supported-in-this-environment")
        ) {
          await firebase.auth().signInWithRedirect(provider);
        } else if (e && e.code === "auth/popup-closed-by-user") {
          return "";
        } else {
          return authError(e);
        }
      }
    } catch (e) {
      return authError(e);
    }
    return "";
  };

  const signInWithEmail = async (email, password, mode) => {
    try {
      const auth = firebase.auth();
      if (mode === "signup") await auth.createUserWithEmailAndPassword(email, password);
      else await auth.signInWithEmailAndPassword(email, password);
    } catch (e) {
      return authError(e);
    }
    return "";
  };

  // No ActionCodeSettings on purpose. The default reset link lands on
  // Firebase's own <authDomain>/__/auth/action handler, which is not this
  // origin and so needs no authorized domain — meaning a reset works from a
  // branch preview like everything else here. Passing a continueUrl back to
  // the app would put that URL through the domain check and reintroduce the
  // exact failure email/password sign-in exists to sidestep.
  const sendPasswordReset = async (email) => {
    try {
      await firebase.auth().sendPasswordResetEmail(email);
    } catch (e) {
      // An unregistered address is reported as success. Firebase's email
      // enumeration protection normally hides it, but it is a project setting
      // that can be off — and the dialog's "if that email has an account"
      // wording is only honest if nothing else here confirms the answer.
      if (e && e.code === "auth/user-not-found") return "";
      return authError(e, "Password reset");
    }
    return "";
  };

  const signOut = async () => {
    // Sign-out drops any cloud write the server hasn't acknowledged yet, so
    // push out what's pending and wait for it first — otherwise work done in
    // the last moments before signing out (an in-progress gym session, say)
    // exists only on this device, and the next sign-in reads a stale cloud.
    try {
      setSyncState("syncing");
      await store.flush();
    } catch (e) {}
    try {
      await firebase.auth().signOut();
    } catch (e) {}
    setSyncState("idle"); // the local mirror already holds the latest data
  };

  if (page === "timer")
    return (
      <WorkoutTimer
        onHome={() => setPage("home")}
        user={user}
        authReady={authReady}
        onSyncState={setSyncState}
      />
    );
  if (page === "gym") return <GymTracker onHome={() => setPage("home")} />;
  return (
    <HomePage
      onOpenTimer={() => setPage("timer")}
      onOpenGym={() => setPage("gym")}
      user={user}
      syncState={syncState}
      onSignInGoogle={signInWithGoogle}
      onSignInEmail={signInWithEmail}
      onResetPassword={sendPasswordReset}
      onSignOut={signOut}
      authNotice={authNotice}
      onClearAuthNotice={() => setAuthNotice("")}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
