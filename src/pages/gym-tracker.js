// ---- Gym tracker page ----
// Log gym sessions: fuzzy-search the catalog (EN/HE), record weight × reps
// per set, and keep a timestamped session history. The in-progress session is
// persisted under GYM_ACTIVE_KEY so a reload doesn't lose it; set inputs are
// kept as raw strings while typing and parsed to numbers on finish.
const parseNum = (s) => {
  const n = parseFloat(String(s).replace(",", "."));
  return isFinite(n) && n >= 0 ? n : null;
};

const fmtSessionDate = (iso) => {
  try {
    const d = new Date(iso);
    const opts = { weekday: "short", month: "short", day: "numeric" };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    return (
      d.toLocaleDateString(undefined, opts) +
      " · " +
      d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    );
  } catch (e) {
    return iso;
  }
};

// A persisted active session is rendered directly, so one malformed entry used
// to take the whole page down with it (`en.sets.some` on an undefined `sets`)
// — and a blank page is a session you can never finish or discard. Anything
// unusable is dropped rather than trusted; anything missing is filled in.
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const sanitizeActive = (raw) => {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.entries)) return null;
  const entries = raw.entries
    .filter((en) => en && typeof en === "object" && typeof en.exId === "string")
    .map((en) => ({
      uid: typeof en.uid === "string" ? en.uid : uid(),
      exId: en.exId,
      sets: (Array.isArray(en.sets) ? en.sets : [])
        .filter((st) => st && typeof st === "object")
        .map((st) => ({
          uid: typeof st.uid === "string" ? st.uid : uid(),
          // inputs are controlled, so these must be strings or React switches
          // the field to uncontrolled and the value stops updating
          weight: st.weight == null ? "" : String(st.weight),
          reps: st.reps == null ? "" : String(st.reps),
        })),
    }));
  return {
    id: typeof raw.id === "string" ? raw.id : `s-${Date.now()}`,
    startedAt: typeof raw.startedAt === "string" ? raw.startedAt : new Date().toISOString(),
    entries,
  };
};

const fmtSet = (st) =>
  st.weight != null && st.reps != null
    ? `${st.weight}kg × ${st.reps}`
    : st.weight != null
    ? `${st.weight}kg`
    : `× ${st.reps}`;

function GymTracker({ onHome }) {
  const [loaded, setLoaded] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [weights, setWeights] = useState({}); // exId → { weight, reps, at }
  const [active, setActive] = useState(null); // in-progress session
  const [view, setView] = useState("home"); // home | session
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState(null); // browse-by-group when not searching
  const [openSessionId, setOpenSessionId] = useState(null); // expanded history card
  const [confirmAction, setConfirmAction] = useState(null); // { type: "deleteSession"|"discard", ... }
  const saveTimer = useRef(null);

  // Load everything through the store (cloud when signed in, else local).
  useEffect(() => {
    let cancelled = false;
    const parse = (raw, fallback) => {
      try {
        const v = JSON.parse(raw);
        return v == null ? fallback : v;
      } catch (e) {
        return fallback;
      }
    };
    (async () => {
      const [s, w, a] = await Promise.all([
        store.get(GYM_SESSIONS_KEY),
        store.get(GYM_WEIGHTS_KEY),
        store.get(GYM_ACTIVE_KEY),
      ]);
      if (cancelled) return;
      const sess = parse(s, []);
      setSessions(Array.isArray(sess) ? sess : []);
      const wm = parse(w, {});
      setWeights(wm && typeof wm === "object" && !Array.isArray(wm) ? wm : {});
      const act = sanitizeActive(parse(a, null));
      if (act) setActive(act);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounce active-session writes: every keystroke updates state, but the
  // store (and Firestore, when signed in) only sees one write per pause.
  // pendingRef holds a value scheduled but not yet written (undefined = none),
  // so it can be flushed if the page hides or the component unmounts mid-wait.
  const pendingRef = useRef(undefined);
  const persistActive = (a) => {
    setActive(a);
    pendingRef.current = a;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      pendingRef.current = undefined;
      store.set(GYM_ACTIVE_KEY, JSON.stringify(a));
    }, 600);
  };
  const persistActiveNow = (a) => {
    setActive(a);
    pendingRef.current = undefined;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    store.set(GYM_ACTIVE_KEY, JSON.stringify(a));
  };

  useEffect(() => {
    const flush = () => {
      if (pendingRef.current === undefined) return;
      const a = pendingRef.current;
      pendingRef.current = undefined;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      store.set(GYM_ACTIVE_KEY, JSON.stringify(a));
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const startSession = () => {
    persistActiveNow({ id: `s-${Date.now()}`, startedAt: new Date().toISOString(), entries: [] });
    setQuery("");
    setGroupFilter(null);
    setView("session");
  };

  const addExercise = (exId) => {
    const last = weights[exId];
    const entry = {
      uid: `g${uidCounter++}`,
      exId,
      sets: [
        {
          uid: `g${uidCounter++}`,
          weight: last && last.weight != null ? String(last.weight) : "",
          reps: last && last.reps != null ? String(last.reps) : "",
        },
      ],
    };
    persistActive({ ...active, entries: [...active.entries, entry] });
    setQuery("");
  };

  const removeEntry = (uid) =>
    persistActive({ ...active, entries: active.entries.filter((en) => en.uid !== uid) });

  const addSet = (entryUid) =>
    persistActive({
      ...active,
      entries: active.entries.map((en) => {
        if (en.uid !== entryUid) return en;
        const prev = en.sets[en.sets.length - 1];
        return {
          ...en,
          sets: [
            ...en.sets,
            { uid: `g${uidCounter++}`, weight: prev ? prev.weight : "", reps: prev ? prev.reps : "" },
          ],
        };
      }),
    });

  const removeSet = (entryUid, setUid) =>
    persistActive({
      ...active,
      entries: active.entries.map((en) =>
        en.uid === entryUid ? { ...en, sets: en.sets.filter((st) => st.uid !== setUid) } : en
      ),
    });

  const updateSet = (entryUid, setUid, field, value) =>
    persistActive({
      ...active,
      entries: active.entries.map((en) =>
        en.uid === entryUid
          ? {
              ...en,
              sets: en.sets.map((st) =>
                st.uid === setUid ? { ...st, [field]: value.replace(/[^0-9.,]/g, "") } : st
              ),
            }
          : en
      ),
    });

  const loggedSets = !active
    ? 0
    : (Array.isArray(active.entries) ? active.entries : []).reduce(
        (n, en) =>
          n +
          (Array.isArray(en && en.sets) ? en.sets : []).filter(
            (st) => st && (parseNum(st.weight) != null || parseNum(st.reps) != null)
          ).length,
        0
      );
  const hasLoggedSet = loggedSets > 0;

  // Finishing has to work whatever state the session is in. This used to bail
  // out silently when nothing had been logged, which left the button dead and
  // the session impossible to clear — and with no "start new" on the home
  // screen either, that was a dead end with no way out of it.
  const finishSession = () => {
    if (!active) return;
    const entries = (Array.isArray(active.entries) ? active.entries : [])
      .map((en) => ({
        exId: en.exId,
        sets: (Array.isArray(en && en.sets) ? en.sets : [])
          .map((st) => ({ weight: parseNum(st && st.weight), reps: parseNum(st && st.reps) }))
          .filter((st) => st.weight != null || st.reps != null),
      }))
      .filter((en) => en.sets.length > 0);
    if (entries.length === 0) {
      // nothing worth keeping — just close it out
      persistActiveNow(null);
      setView("home");
      return;
    }
    const session = {
      id: active.id,
      startedAt: active.startedAt,
      endedAt: new Date().toISOString(),
      entries,
    };
    const nextSessions = [session, ...sessions];
    // Record the last weight used per exercise (last set that has a weight).
    const nextWeights = { ...weights };
    entries.forEach((en) => {
      const withWeight = en.sets.filter((st) => st.weight != null);
      const last = withWeight[withWeight.length - 1];
      if (last) nextWeights[en.exId] = { weight: last.weight, reps: last.reps, at: session.endedAt };
    });
    setSessions(nextSessions);
    setWeights(nextWeights);
    store.set(GYM_SESSIONS_KEY, JSON.stringify(nextSessions));
    store.set(GYM_WEIGHTS_KEY, JSON.stringify(nextWeights));
    persistActiveNow(null);
    setOpenSessionId(session.id);
    setView("home");
  };

  const discardSession = () => {
    persistActiveNow(null);
    setView("home");
  };

  const deleteSession = (id) => {
    const next = sessions.filter((s) => s.id !== id);
    setSessions(next);
    store.set(GYM_SESSIONS_KEY, JSON.stringify(next));
  };

  const results = query.trim()
    ? GYM_EXERCISES.map((ex) => ({ ex, score: fuzzyScore(query, ex.search) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 25)
        .map((r) => r.ex)
    : groupFilter
    ? GYM_EXERCISES.filter((ex) => ex.group === groupFilter)
    : [];

  const lastHint = (exId) => {
    const w = weights[exId];
    if (!w || w.weight == null) return null;
    return w.reps != null ? `${w.weight}kg × ${w.reps}` : `${w.weight}kg`;
  };

  const CONFIRMS = {
    discard: {
      title: "Discard session?",
      text: hasLoggedSet
        ? `The ${loggedSets} set${loggedSets !== 1 ? "s" : ""} logged here won't be saved.`
        : "This gym session won't be saved.",
      action: "Discard",
      run: discardSession,
    },
    startNew: {
      title: "Start a new session?",
      text: hasLoggedSet
        ? `The session in progress has ${loggedSets} logged set${
            loggedSets !== 1 ? "s" : ""
          } that will be discarded. To keep it, resume it and tap Finish instead.`
        : "The session in progress is empty, so nothing will be lost.",
      action: "Start new",
      run: startSession,
    },
    deleteSession: {
      title: "Delete session?",
      text: `The session from ${confirmAction ? confirmAction.label : ""} will be removed. This can't be undone.`,
      action: "Delete",
      run: () => deleteSession(confirmAction.id),
    },
  };
  const confirmSpec = confirmAction && (CONFIRMS[confirmAction.type] || CONFIRMS.deleteSession);
  const confirmOverlay = confirmSpec && (
    <div style={styles.confirmOverlay} onClick={() => setConfirmAction(null)}>
      <div style={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
        <div style={styles.confirmTitle}>{confirmSpec.title}</div>
        <div style={styles.confirmText}>{confirmSpec.text}</div>
        <div style={styles.confirmActions}>
          <button style={styles.confirmCancel} onClick={() => setConfirmAction(null)}>
            Cancel
          </button>
          <button
            style={styles.confirmDeleteBtn}
            onClick={() => {
              confirmSpec.run();
              setConfirmAction(null);
            }}
          >
            {confirmSpec.action}
          </button>
        </div>
      </div>
    </div>
  );

  // ================= ACTIVE GYM SESSION =================
  if (view === "session" && active) {
    return (
      <div style={{ ...styles.screen, background: "#0F1520" }}>
        <div style={styles.setupWrap}>
          <div style={styles.pageHeader}>
            <button onClick={() => setView("home")} style={styles.backLink}>
              ‹ Gym log
            </button>
          </div>
          <h1 style={styles.setupTitle}>Session in progress</h1>
          <div style={styles.previewMeta}>Started {fmtSessionDate(active.startedAt)}</div>

          {active.entries.length > 0 && <div style={styles.sectionLabel}>EXERCISES</div>}
          {active.entries.map((en) => {
            const ex = gymById(en.exId);
            if (!ex) return null;
            const hint = lastHint(en.exId);
            return (
              <div key={en.uid} style={styles.gymEntryCard}>
                <div style={styles.gymEntryHead}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.gymEntryName}>{ex.name}</div>
                    <div style={styles.gymEntryHe} dir="auto">
                      {ex.he}
                      {hint && <span style={styles.gymLastHint}> · last: {hint}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => removeEntry(en.uid)}
                    style={styles.removeBtn}
                    aria-label={`Remove ${ex.name}`}
                  >
                    ×
                  </button>
                </div>
                {en.sets.map((st, i) => (
                  <div key={st.uid} style={styles.gymSetRow}>
                    <span style={styles.gymSetIndex}>{i + 1}</span>
                    <input
                      value={st.weight}
                      onChange={(e) => updateSet(en.uid, st.uid, "weight", e.target.value)}
                      placeholder="kg"
                      inputMode="decimal"
                      style={styles.gymSetInput}
                      aria-label={`${ex.name} set ${i + 1} weight`}
                    />
                    <span style={styles.gymSetSep}>kg ×</span>
                    <input
                      value={st.reps}
                      onChange={(e) => updateSet(en.uid, st.uid, "reps", e.target.value)}
                      placeholder="reps"
                      inputMode="numeric"
                      style={styles.gymSetInput}
                      aria-label={`${ex.name} set ${i + 1} reps`}
                    />
                    <span style={styles.gymSetSep}>reps</span>
                    <button
                      onClick={() => removeSet(en.uid, st.uid)}
                      style={{ ...styles.removeBtn, fontSize: 18 }}
                      aria-label={`Remove set ${i + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button onClick={() => addSet(en.uid)} style={styles.gymAddSetBtn}>
                  + Add set
                </button>
              </div>
            );
          })}

          <div style={styles.sectionLabel}>ADD EXERCISE</div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search… / חיפוש תרגיל…"
            dir="auto"
            style={styles.gymSearchInput}
          />
          {!query.trim() && (
            <div style={styles.gymGroupChips}>
              {GYM_GROUPS.map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupFilter(groupFilter === g ? null : g)}
                  style={{
                    ...styles.gymGroupChip,
                    borderColor: groupFilter === g ? "#5B8DEF" : "#3B4A63",
                    color: groupFilter === g ? "#5B8DEF" : "#8FA3BF",
                  }}
                >
                  {g} · {GYM_GROUP_HE[g]}
                </button>
              ))}
            </div>
          )}
          {query.trim() && results.length === 0 && (
            <div style={styles.gymEmptyText}>No exercises match "{query.trim()}".</div>
          )}
          {results.length > 0 && (
            <div style={{ ...styles.exList, marginTop: 10 }}>
              {results.map((ex) => {
                const hint = lastHint(ex.id);
                return (
                  <div key={ex.id} style={styles.gymResultRow} onClick={() => addExercise(ex.id)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={styles.gymResultName}>{ex.name}</div>
                      <div style={styles.gymEntryHe} dir="auto">
                        {ex.he} · {ex.group}
                      </div>
                    </div>
                    {hint && <span style={styles.gymLastBadge}>{hint}</span>}
                    <span style={{ ...styles.presetArrow, fontSize: 22 }}>+</span>
                  </div>
                );
              })}
            </div>
          )}

          <button onClick={finishSession} style={styles.startBtn}>
            FINISH SESSION
          </button>
          {!hasLoggedSet && (
            <div style={styles.gymFinishHint}>
              Nothing logged yet — finishing will just close this session.
            </div>
          )}
          <button onClick={() => setConfirmAction({ type: "discard" })} style={styles.editBtn}>
            Discard session
          </button>
        </div>
        {confirmOverlay}
      </div>
    );
  }

  // ================= GYM HOME: START + HISTORY =================
  return (
    <div style={{ ...styles.screen, background: "#0F1520" }}>
      <div style={styles.setupWrap}>
        <div style={styles.pageHeader}>
          <HomeButton onClick={onHome} />
        </div>
        <div style={styles.eyebrow}>GYM LOG</div>
        <h1 style={styles.setupTitle}>Track your lifts.</h1>

        {loaded ? (
          <React.Fragment>
            <button
              onClick={active ? () => setView("session") : startSession}
              style={{ ...styles.startBtn, marginTop: 24 }}
            >
              {active ? "RESUME SESSION" : "START GYM SESSION"}
            </button>
            {active && (
              <React.Fragment>
                <div style={styles.gymActiveHint}>
                  In progress — started {fmtSessionDate(active.startedAt)}
                  {hasLoggedSet ? ` · ${loggedSets} set${loggedSets !== 1 ? "s" : ""} logged` : " · nothing logged yet"}
                </div>
                {/* an in-progress session must never be the only thing on offer */}
                <button
                  onClick={() => setConfirmAction({ type: "startNew" })}
                  style={styles.editBtn}
                >
                  Start a new session instead
                </button>
              </React.Fragment>
            )}
          </React.Fragment>
        ) : (
          <Skeleton h={62} r={16} style={{ marginTop: 24 }} />
        )}

        <div style={styles.sectionLabel}>HISTORY</div>
        {loaded && sessions.length === 0 && (
          <div style={styles.gymEmptyText}>
            No sessions yet. Start one and it'll show up here with its date and weights.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!loaded && (
            <React.Fragment>
              <SkeletonCard />
              <SkeletonCard delay={0.15} />
              <SkeletonCard delay={0.3} />
            </React.Fragment>
          )}
          {sessions.map((s) => {
            const totalSets = s.entries.reduce((a, en) => a + en.sets.length, 0);
            const open = openSessionId === s.id;
            return (
              <div key={s.id} style={styles.gymHistoryCard}>
                <div
                  style={styles.gymHistoryHead}
                  onClick={() => setOpenSessionId(open ? null : s.id)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={styles.gymHistoryDate}>{fmtSessionDate(s.startedAt)}</div>
                    <div style={styles.presetCardMeta}>
                      {s.entries.length} exercise{s.entries.length !== 1 ? "s" : ""} · {totalSets}{" "}
                      set{totalSets !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmAction({
                        type: "deleteSession",
                        id: s.id,
                        label: fmtSessionDate(s.startedAt),
                      });
                    }}
                    style={styles.cardDelete}
                    aria-label="Delete session"
                  >
                    ×
                  </button>
                  <span style={styles.presetArrow}>{open ? "▾" : "›"}</span>
                </div>
                {open &&
                  s.entries.map((en, i) => {
                    const ex = gymById(en.exId);
                    return (
                      <div key={i} style={styles.gymHistoryEx}>
                        <div style={styles.gymHistoryExName}>
                          {ex ? ex.name : en.exId}
                          {ex && (
                            <span style={{ ...styles.gymEntryHe, marginLeft: 8 }} dir="auto">
                              {ex.he}
                            </span>
                          )}
                        </div>
                        <div style={styles.gymHistorySets}>
                          {en.sets.map((st) => fmtSet(st)).join("  ·  ")}
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
      {confirmOverlay}
    </div>
  );
}
