// ---- Landing page: pick a section ----
function HomePage({ onOpenTimer, onOpenGym, user, syncState, onSignInGoogle, onSignInEmail, onSignOut }) {
  const [menuOpen, setMenuOpen] = useState(false); // account dropdown (top-right)
  const [signInOpen, setSignInOpen] = useState(false);
  useEffect(() => {
    setMenuOpen(false); // menu belongs to the previous auth state
    setSignInOpen(false); // a signed-in user has nothing to sign in to
  }, [user ? user.uid : null]);

  const accountLabel = user ? user.displayName || user.email : "";
  const renderAvatar = (photoStyle, fallbackStyle) =>
    user.photoURL ? (
      <img src={user.photoURL} alt="" referrerPolicy="no-referrer" style={photoStyle} />
    ) : (
      <span style={fallbackStyle}>{(accountLabel || "?").charAt(0).toUpperCase()}</span>
    );

  return (
    <div style={{ ...styles.screen, background: "#0F1520" }}>
      <div style={styles.setupWrap}>
        <div style={styles.pageHeader}>
          <span />
          {firebaseReady && (
            <div style={styles.accountMenuWrap}>
              {user ? (
                <React.Fragment>
                  <button
                    onClick={() => setMenuOpen((o) => !o)}
                    style={styles.accountChip}
                    aria-label="Account menu"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                  >
                    {renderAvatar(styles.accountPhoto, {
                      ...styles.avatarFallback,
                      ...styles.accountPhoto,
                    })}
                    <span style={{ ...styles.accountName, maxWidth: 140 }}>{accountLabel}</span>
                    <span style={styles.accountCaret}>{menuOpen ? "▴" : "▾"}</span>
                  </button>
                  {menuOpen && (
                    <React.Fragment>
                      <div style={styles.menuBackdrop} onClick={() => setMenuOpen(false)} />
                      <div style={styles.accountMenu} role="menu">
                        <div style={styles.accountMenuHeader}>
                          {renderAvatar(styles.accountPhoto, {
                            ...styles.avatarFallback,
                            ...styles.accountPhoto,
                          })}
                          <span style={styles.accountName}>{accountLabel}</span>
                        </div>
                        <div
                          style={{
                            ...styles.syncHint,
                            color:
                              syncState === "error" || syncState === "denied"
                                ? "#FCA5A5"
                                : "#5F7290",
                          }}
                        >
                          {syncState === "syncing"
                            ? "Syncing…"
                            : syncState === "denied"
                            ? "Sync blocked — publish the database rules"
                            : syncState === "error"
                            ? "Offline — saved on this device"
                            : "Synced"}
                        </div>
                        <button onClick={onSignOut} style={styles.signOutLink} role="menuitem">
                          Sign out
                        </button>
                      </div>
                    </React.Fragment>
                  )}
                </React.Fragment>
              ) : (
                <button
                  onClick={() => setSignInOpen(true)}
                  style={styles.accountBtn}
                  title="Sign in to sync your data"
                >
                  Sign in
                </button>
              )}
            </div>
          )}
        </div>
        <div style={styles.eyebrow}>WORKOUT</div>
        <h1 style={styles.setupTitle}>What are we training today?</h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>
          <div style={styles.homeNavCard} onClick={onOpenTimer}>
            <span style={styles.homeNavEmoji}>⏱️</span>
            <div style={{ flex: 1 }}>
              <div style={styles.presetCardName}>Workout Timer</div>
              <div style={styles.presetCardMeta}>Timed circuits — core, strength, cardio, mobility</div>
            </div>
            <span style={styles.presetArrow}>›</span>
          </div>
          <div style={styles.homeNavCard} onClick={onOpenGym}>
            <span style={styles.homeNavEmoji}>🏋️</span>
            <div style={{ flex: 1 }}>
              <div style={styles.presetCardName}>Gym Log</div>
              <div style={styles.presetCardMeta}>Track exercises, weights & sessions</div>
            </div>
            <span style={styles.presetArrow}>›</span>
          </div>
        </div>
        {firebaseReady && !user && (
          <div style={styles.signInHint}>
            Sign in to sync your presets and gym log across devices.
          </div>
        )}
      </div>
      {signInOpen && (
        <SignInDialog
          onClose={() => setSignInOpen(false)}
          onGoogle={onSignInGoogle}
          onEmail={onSignInEmail}
        />
      )}
    </div>
  );
}
