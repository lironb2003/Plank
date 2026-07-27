// ---- Root: home ⇄ timer / gym tracker ----
// Auth lives here (not in a page) so the account section can render on the
// landing page while the timer still reloads presets when the user changes.
function App() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!firebaseReady); // no firebase => nothing to wait for
  const [syncState, setSyncState] = useState("idle"); // idle | syncing | synced | error | denied

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
    } catch (e) {
      setAuthReady(true);
    }
    return () => {
      store.notify = null;
      if (unsub) unsub();
    };
  }, []);

  const signIn = async () => {
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
        } else if (!e || e.code !== "auth/popup-closed-by-user") {
          setSyncState("error");
        }
      }
    } catch (e) {
      setSyncState("error");
    }
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
      onSignIn={signIn}
      onSignOut={signOut}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
