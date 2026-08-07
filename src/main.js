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

  const signOut = async () => {
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
      onSignOut={signOut}
      authNotice={authNotice}
      onClearAuthNotice={() => setAuthNotice("")}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
