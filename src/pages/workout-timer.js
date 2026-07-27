// The workout timer page: setup flow, the clock-driven timer engine, cue
// scheduling, and background/notification handling.

// ---- Phase colors ----
const THEME = {
  ready: { bg: "#1B2432", accent: "#8FA3BF", label: "GET READY" },
  work: { bg: "#1D4ED8", accent: "#BFDBFE", label: "WORK" },
  rest: { bg: "#047857", accent: "#A7F3D0", label: "REST" },
  roundRest: { bg: "#92400E", accent: "#FDE68A", label: "ROUND BREAK" },
  done: { bg: "#111827", accent: "#FDE68A", label: "DONE" },
};

const ROW_H = 56; // fixed row height for drag math

function WorkoutTimer({ onHome, user, authReady, onSyncState }) {
  // ---- Setup flow: home (pick preset) → preview → edit ----
  const [setupView, setSetupView] = useState("home");
  const [workout, setWorkout] = useState(() => withUids(BUILTIN_PRESETS[0].exercises));
  const [restBetween, setRestBetween] = useState(BUILTIN_PRESETS[0].rest);
  const [roundRest, setRoundRest] = useState(BUILTIN_PRESETS[0].roundRest);
  const [totalRounds, setTotalRounds] = useState(BUILTIN_PRESETS[0].rounds);
  const [selectedId, setSelectedId] = useState("classic");
  const [selectedName, setSelectedName] = useState(BUILTIN_PRESETS[0].name);
  const [edited, setEdited] = useState(false);
  const [customPresets, setCustomPresets] = useState([]);
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [infoUid, setInfoUid] = useState(null); // preview: expanded description row
  const [libInfoId, setLibInfoId] = useState(null); // edit: library exercise info
  const [libQuery, setLibQuery] = useState(""); // edit: library search box
  const [libGroup, setLibGroup] = useState(GROUPS[0]); // edit: browse-by-category

  const [confirmDelete, setConfirmDelete] = useState(null); // { id, name } awaiting confirmation

  // ---- Drag state (commit on drop) ----
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const dragRef = useRef({ index: null, startY: 0, offset: 0, moved: false });

  // ---- Timer state ----
  // phase/round/exIndex/timeLeft are display projections of the clock below;
  // the clock, not React state, is the source of truth for where we are.
  const [phase, setPhase] = useState("idle");
  const [round, setRound] = useState(1);
  const [exIndex, setExIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GET_READY);
  const [phaseTotal, setPhaseTotal] = useState(GET_READY);
  const [running, setRunning] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [notifyOn, setNotifyOn] = useState(true);
  const [notifyPerm, setNotifyPerm] = useState(() =>
    notifySupported() ? Notification.permission : "unsupported"
  );

  const wakeLockRef = useRef(null);
  const scheduleRef = useRef({ segs: [], starts: [], total: 0 });
  // { base: elapsed seconds at `at`, at: epoch ms | null when paused }
  const clockRef = useRef({ base: 0, at: null });
  const runningRef = useRef(false);
  const cuesRef = useRef([]); // queued audio nodes, cancellable
  const cueUntilRef = useRef(0); // elapsed seconds already queued
  const syncRef = useRef(() => {});
  const lastSegRef = useRef(-1); // last segment we announced
  const keepAliveRef = useRef({ osc: null, el: null });
  const swRegRef = useRef(null);
  const notifRef = useRef(null);
  const notifyOnRef = useRef(true);

  const exercises = workout
    .map((w) => {
      const ex = byId(w.exId);
      if (!ex) return null;
      return {
        ...ex,
        uid: w.uid,
        duration: w.duration != null ? w.duration : ex.duration,
      };
    })
    .filter(Boolean);

  const isCustomSelected = customPresets.some((p) => p.id === selectedId);

  // Library picker: searching looks across every category, otherwise the
  // selected category chip decides what's listed. Same shape as the gym log's
  // catalog picker, minus the Hebrew.
  const libResults = libQuery.trim()
    ? LIBRARY.map((ex) => ({ ex, score: fuzzyScore(libQuery, ex.search) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 25)
        .map((r) => r.ex)
    : LIBRARY.filter((ex) => ex.group === libGroup);

  // ---- Load saved presets (re-runs when the signed-in user changes) ----
  // Auth itself lives in App; this page only consumes user/authReady and
  // reports sync progress up via onSyncState.
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    setPresetsLoaded(false); // re-runs on sign-in/out: show skeletons while refetching
    (async () => {
      try {
        if (user) onSyncState("syncing");
        let presets;
        if (user) {
          presets = await loadPresetsForUser(user.uid); // includes one-time merge
        } else {
          const value = await store.get(STORAGE_KEY);
          presets = value ? JSON.parse(value) : [];
        }
        if (!cancelled) {
          setCustomPresets(presets);
          setPresetsLoaded(true);
          setConfirmDelete(null); // pending confirmation may target a preset gone after reload
          if (user) onSyncState("synced");
        }
      } catch (e) {
        if (!cancelled) {
          if (e && e.fallback) {
            setCustomPresets(e.fallback);
            setConfirmDelete(null);
          }
          setPresetsLoaded(true);
          if (user) onSyncState(e && e.code === "permission-denied" ? "denied" : "error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, user ? user.uid : null]);

  const persistPresets = async (presets) => {
    await store.set(STORAGE_KEY, JSON.stringify(presets));
  };

  // ---- Preset / builder actions ----
  const choosePreset = (p) => {
    setWorkout(withUids(p.exercises));
    setRestBetween(p.rest);
    setRoundRest(p.roundRest);
    setTotalRounds(p.rounds);
    setSelectedId(p.id);
    setSelectedName(p.name);
    setEdited(false);
    setSetupView("preview");
  };

  // Build a preset from nothing: an empty workout dropped straight into the
  // editor with the library already open, since there is nothing to look at
  // until something is added. It stays unsaved until it's given a name.
  const startNewPreset = () => {
    setWorkout([]);
    setRestBetween(20);
    setRoundRest(60);
    setTotalRounds(3);
    setSelectedId(null);
    setSelectedName("New workout");
    setPresetName("");
    setSaveMsg("");
    setEdited(true);
    setLibInfoId(null);
    setLibQuery("");
    setShowLibrary(true);
    setSetupView("edit");
  };

  const removeExercise = (uid) => {
    setWorkout((w) => w.filter((item) => item.uid !== uid));
    setEdited(true);
  };

  const addExercise = (id) => {
    setWorkout((w) => [...w, { uid: `u${uidCounter++}`, exId: id }]);
    setEdited(true);
  };

  const changeDuration = (uid, delta) => {
    setWorkout((w) =>
      w.map((item) => {
        if (item.uid !== uid) return item;
        const base = item.duration != null ? item.duration : byId(item.exId).duration;
        return { ...item, duration: Math.max(10, Math.min(180, base + delta)) };
      })
    );
    setEdited(true);
  };

  const currentConfig = () => ({
    exercises: workout.map((w) => {
      const base = byId(w.exId);
      return w.duration == null || (base && w.duration === base.duration)
        ? w.exId
        : { id: w.exId, duration: w.duration };
    }),
    rest: restBetween,
    roundRest,
    rounds: totalRounds,
  });

  const updateExistingPreset = async () => {
    const next = customPresets.map((p) =>
      p.id === selectedId ? { ...p, ...currentConfig() } : p
    );
    setCustomPresets(next);
    await persistPresets(next);
    setEdited(false);
    setSaveMsg(`Updated "${selectedName}"`);
    setTimeout(() => setSaveMsg(""), 2500);
  };

  const saveAsNewPreset = async () => {
    const name = presetName.trim();
    if (!name || workout.length === 0) return;
    const preset = {
      id: `custom-${Date.now()}`,
      name,
      ...currentConfig(),
      custom: true,
    };
    const next = [...customPresets, preset];
    setCustomPresets(next);
    await persistPresets(next);
    setSelectedId(preset.id);
    setSelectedName(name);
    setEdited(false);
    setPresetName("");
    setSaveMsg(`Saved "${name}"`);
    setTimeout(() => setSaveMsg(""), 2500);
  };

  const deletePreset = async (id) => {
    const next = customPresets.filter((p) => p.id !== id);
    setCustomPresets(next);
    await persistPresets(next);
  };

  // ---- Drag to reorder: visual shift while dragging, commit once on drop ----
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dragTarget =
    dragIndex === null
      ? null
      : clamp(dragIndex + Math.round(dragOffset / ROW_H), 0, workout.length - 1);

  const onDragMove = useCallback((e) => {
    const d = dragRef.current;
    if (d.index === null) return;
    e.preventDefault();
    d.offset = e.clientY - d.startY;
    if (Math.abs(d.offset) > 4) d.moved = true;
    setDragOffset(d.offset);
  }, []);

  const onDragEnd = useCallback(() => {
    const d = dragRef.current;
    if (d.index !== null) {
      setWorkout((w) => {
        const from = d.index;
        const to = clamp(from + Math.round(d.offset / ROW_H), 0, w.length - 1);
        if (from === to) return w;
        const next = [...w];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        return next;
      });
      if (d.moved) setEdited(true);
    }
    dragRef.current = { index: null, startY: 0, offset: 0, moved: false };
    setDragIndex(null);
    setDragOffset(0);
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragEnd);
  }, [onDragMove]);

  const onDragStart = (e, i) => {
    e.preventDefault();
    dragRef.current = { index: i, startY: e.clientY, offset: 0, moved: false };
    setDragIndex(i);
    setDragOffset(0);
    window.addEventListener("pointermove", onDragMove, { passive: false });
    window.addEventListener("pointerup", onDragEnd);
    window.addEventListener("pointercancel", onDragEnd);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onDragMove);
      window.removeEventListener("pointerup", onDragEnd);
      window.removeEventListener("pointercancel", onDragEnd);
    };
  }, [onDragMove, onDragEnd]);

  // Compute the visual shift of a non-dragged row while a drag is active
  const rowShift = (i) => {
    if (dragIndex === null || dragTarget === null || i === dragIndex) return 0;
    if (dragIndex < dragTarget && i > dragIndex && i <= dragTarget) return -ROW_H;
    if (dragIndex > dragTarget && i >= dragTarget && i < dragIndex) return ROW_H;
    return 0;
  };

  // ---- Audio cue scheduling ----
  const cancelCues = useCallback(() => {
    cuesRef.current.forEach((n) => {
      try {
        n.stop(0);
      } catch (e) {
        /* already finished */
      }
    });
    cuesRef.current = [];
  }, []);

  // Queue every cue falling in (cueUntil, elapsed + CUE_HORIZON]. Driven from
  // the tick so the window rolls forward; queueing well ahead of the playhead
  // is what keeps the beeps on time when the tab's timers get throttled.
  const scheduleCues = useCallback(
    (elapsed) => {
      if (!soundOn) return;
      const ctx = audioCtx();
      if (!ctx) return;
      const { segs, starts } = scheduleRef.current;
      const from = Math.max(cueUntilRef.current, elapsed);
      const to = elapsed + CUE_HORIZON;
      if (to <= from) return;
      const origin = ctx.currentTime - elapsed; // audio-clock time of elapsed 0
      const emit = (at, name) => {
        if (at <= from || at > to) return;
        cuesRef.current = cuesRef.current.concat(playCue(ctx, name, origin + at));
      };
      for (let i = 0; i < segs.length; i++) {
        const end = starts[i] + segs[i].dur;
        if (end < from || end - 3 > to) continue;
        // 3 · 2 · 1 landing exactly on the second, then the boundary cue
        for (let k = 3; k >= 1; k--) {
          if (end - k >= starts[i]) emit(end - k, "count");
        }
        const next = segs[i + 1];
        emit(end, !next ? "done" : next.kind === "work" ? "go" : "rest");
      }
      cueUntilRef.current = to;
      if (cuesRef.current.length > 400) cuesRef.current = cuesRef.current.slice(-200);
    },
    [soundOn]
  );

  // ---- Background keep-alive ----
  // While the timer runs, keep an inaudible loop playing. A tab that is
  // producing audio is exempt from the aggressive timer throttling mobile
  // browsers apply to background tabs, and on iOS it keeps the audio session
  // (and therefore our queued cues) alive once the screen goes off.
  const startKeepAlive = useCallback(() => {
    const ka = keepAliveRef.current;
    try {
      const ctx = audioCtx();
      if (ctx && !ka.osc) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.value = 30; // below anything a phone speaker reproduces
        g.gain.value = 0.0015;
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start();
        ka.osc = osc;
      }
    } catch (e) {
      /* audio unavailable */
    }
    try {
      if (!ka.el) {
        const el = new Audio(getSilentLoopUrl());
        el.loop = true;
        el.volume = 0.03;
        el.setAttribute("playsinline", "");
        ka.el = el;
      }
      const p = ka.el.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* autoplay blocked */
    }
  }, []);

  const stopKeepAlive = useCallback(() => {
    const ka = keepAliveRef.current;
    try {
      if (ka.osc) {
        ka.osc.stop(0);
        ka.osc.disconnect();
      }
    } catch (e) {
      /* already stopped */
    }
    ka.osc = null;
    try {
      if (ka.el) ka.el.pause();
    } catch (e) {
      /* nothing playing */
    }
  }, []);

  // ---- Background notifications ----
  // Android Chrome refuses `new Notification()` and only delivers through a
  // service worker registration. sw.js is optional: without it (file://, or an
  // artifact export) we fall back to the constructor and everything else works.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("sw.js")
      .then((reg) => {
        swRegRef.current = reg;
      })
      .catch(() => {});
  }, []);

  const requestNotifyPermission = useCallback(() => {
    if (!notifySupported()) return;
    if (Notification.permission !== "default") {
      setNotifyPerm(Notification.permission);
      return;
    }
    try {
      const p = Notification.requestPermission();
      if (p && p.then) p.then(setNotifyPerm).catch(() => {});
    } catch (e) {
      /* permission API unavailable */
    }
  }, []);

  const notify = useCallback((title, body) => {
    if (!notifyOnRef.current) return;
    if (!notifySupported() || Notification.permission !== "granted") return;
    if (!document.hidden) return; // on screen already — the beep is enough
    const opts = { body, tag: "plank-timer", renotify: true };
    const direct = () => {
      try {
        if (notifRef.current) notifRef.current.close();
        notifRef.current = new Notification(title, opts);
      } catch (e) {
        /* not permitted from this context */
      }
    };
    // Try the registration first (the only path Android Chrome accepts) and
    // fall back to the constructor if it rejects, so neither path failing can
    // take the other down — or surface as an unhandled rejection.
    const reg = swRegRef.current;
    if (reg && reg.showNotification) {
      try {
        const p = reg.showNotification(title, opts);
        if (p && p.catch) p.catch(direct);
        return;
      } catch (e) {
        /* fall through to the constructor */
      }
    }
    direct();
  }, []);

  // ---- Clock ----
  const nowElapsed = useCallback(() => {
    const c = clockRef.current;
    return c.at == null ? c.base : c.base + (Date.now() - c.at) / 1000;
  }, []);

  // Project the clock onto the display state. Safe to call at any moment — from
  // the tick, on resume, right after a seek — because it reads the elapsed time
  // rather than stepping a state machine forward one phase at a time. That is
  // what lets it come back from a backgrounded tab correct in one go, however
  // many phases went by while nothing was running.
  const syncFromClock = useCallback(() => {
    const sched = scheduleRef.current;
    if (!sched.segs.length) return;
    const el = nowElapsed();
    const i = segmentAt(sched, el);
    if (i >= sched.segs.length) {
      clockRef.current = { base: sched.total, at: null };
      setRunning(false);
      setPhase("done");
      setTimeLeft(0);
      stopKeepAlive();
      if (lastSegRef.current !== i) {
        lastSegRef.current = i;
        notify("Workout complete 💪", "Nice work.");
      }
      return;
    }
    const seg = sched.segs[i];
    setPhase(seg.kind);
    setRound(seg.round);
    setExIndex(seg.exIndex);
    setPhaseTotal(seg.dur);
    setTimeLeft(Math.max(0, Math.ceil(sched.starts[i] + seg.dur - el)));
    if (i !== lastSegRef.current) {
      lastSegRef.current = i;
      notify(
        `${seg.label} · ${seg.dur}s`,
        seg.kind === "work"
          ? `Round ${seg.round}/${sched.rounds}`
          : seg.next
          ? `Up next: ${seg.next}`
          : ""
      );
    }
    scheduleCues(el);
  }, [nowElapsed, notify, scheduleCues, stopKeepAlive]);

  // Handlers reach the latest projection through a ref so they don't have to
  // take syncFromClock as a dependency.
  useEffect(() => {
    syncRef.current = syncFromClock;
  }, [syncFromClock]);

  useEffect(() => {
    notifyOnRef.current = notifyOn;
  }, [notifyOn]);

  // ---- Keep screen awake while running (best-effort) ----
  const requestWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current || !("wakeLock" in navigator)) return;
      const lock = await navigator.wakeLock.request("screen");
      wakeLockRef.current = lock;
      // the lock is dropped whenever the page is hidden; note that so the
      // visibility handler can take a fresh one on the way back
      lock.addEventListener("release", () => {
        if (wakeLockRef.current === lock) wakeLockRef.current = null;
      });
    } catch (e) {
      /* not supported / denied */
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (lock) lock.release().catch(() => {});
  }, []);

  useEffect(() => {
    if (running) {
      requestWakeLock();
      startKeepAlive();
    } else {
      releaseWakeLock();
      stopKeepAlive();
    }
  }, [running, requestWakeLock, releaseWakeLock, startKeepAlive, stopKeepAlive]);

  // ---- Tick ----
  useEffect(() => {
    if (!running) return;
    syncFromClock();
    const id = setInterval(syncFromClock, 200);
    return () => clearInterval(id);
  }, [running, syncFromClock]);

  // ---- Coming back to the foreground ----
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // A suspended context stalls the audio clock, so anything queued against
      // it has shifted by however long we were away. Drop it and re-queue from
      // the wall clock, which never stopped.
      cancelCues();
      cueUntilRef.current = nowElapsed();
      if (clockRef.current.at != null) {
        startKeepAlive();
        requestWakeLock();
      }
      syncRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [cancelCues, nowElapsed, startKeepAlive, requestWakeLock]);

  // Muting has to cancel what is already queued, unmuting has to re-queue.
  useEffect(() => {
    cancelCues();
    cueUntilRef.current = nowElapsed();
    syncRef.current();
  }, [soundOn, cancelCues, nowElapsed]);

  useEffect(
    () => () => {
      cancelCues();
      stopKeepAlive();
      releaseWakeLock();
    },
    [cancelCues, stopKeepAlive, releaseWakeLock]
  );

  // ---- Controls ----
  const seekTo = useCallback(
    (elapsed) => {
      const sched = scheduleRef.current;
      const e = Math.max(0, Math.min(elapsed, sched.total));
      cancelCues();
      cueUntilRef.current = e;
      clockRef.current = { base: e, at: clockRef.current.at == null ? null : Date.now() };
      syncRef.current();
    },
    [cancelCues]
  );

  const start = () => {
    if (exercises.length === 0) return;
    scheduleRef.current = buildSchedule(exercises, restBetween, roundRest, totalRounds);
    cancelCues();
    cueUntilRef.current = 0;
    lastSegRef.current = 0; // don't announce "get in position" — they just tapped it
    clockRef.current = { base: 0, at: Date.now() };
    // both of these need the user gesture we are inside of
    audioCtx();
    startKeepAlive();
    if (notifyOn) requestNotifyPermission();
    setPhase("ready");
    setRound(1);
    setExIndex(0);
    setTimeLeft(GET_READY);
    setPhaseTotal(GET_READY);
    setRunning(true);
  };

  const togglePause = () => {
    const c = clockRef.current;
    if (c.at == null) {
      clockRef.current = { base: c.base, at: Date.now() };
      setRunning(true);
    } else {
      const base = nowElapsed();
      cancelCues();
      cueUntilRef.current = base;
      clockRef.current = { base, at: null };
      setRunning(false);
    }
  };

  const skip = () => {
    const sched = scheduleRef.current;
    const i = segmentAt(sched, nowElapsed());
    seekTo(i >= sched.segs.length ? sched.total : sched.starts[i] + sched.segs[i].dur);
  };

  const reset = () => {
    cancelCues();
    stopKeepAlive();
    scheduleRef.current = { segs: [], starts: [], total: 0, rounds: 1 };
    clockRef.current = { base: 0, at: null };
    cueUntilRef.current = 0;
    lastSegRef.current = -1;
    setRunning(false);
    setPhase("idle");
    setRound(1);
    setExIndex(0);
    setTimeLeft(GET_READY);
    setPhaseTotal(GET_READY);
  };

  // "Back" means the previous exercise: from a rest, the one you just finished;
  // from an exercise, the one before it. Restarts the current segment when
  // there is nothing earlier to go to.
  const goBack = () => {
    const sched = scheduleRef.current;
    if (!sched.segs.length) return;
    const i = Math.min(segmentAt(sched, nowElapsed()), sched.segs.length - 1);
    let target = sched.starts[i];
    for (let j = i - 1; j >= 0; j--) {
      if (sched.segs[j].kind === "work") {
        target = sched.starts[j];
        break;
      }
    }
    seekTo(target);
  };

  const toggleNotify = () => {
    if (notifyOn) {
      setNotifyOn(false);
      return;
    }
    setNotifyOn(true);
    requestNotifyPermission();
  };

  // ---- Derived display values ----
  const theme = THEME[phase] || THEME.ready;
  const currentEx = exercises[exIndex];
  const nextEx =
    phase === "ready"
      ? exercises[0]
      : phase === "rest"
      ? exercises[exIndex + 1]
      : phase === "roundRest"
      ? exercises[0]
      : phase === "work" && exIndex < exercises.length - 1
      ? exercises[exIndex + 1]
      : null;

  const progress = 1 - timeLeft / Math.max(1, phaseTotal);
  // wanted *and* allowed — a browser-level block wins over the in-app toggle
  const notifyAlertsOn = notifyOn && notifyPerm !== "denied";

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const totalWorkoutSecs =
    GET_READY +
    totalRounds * exercises.reduce((a, e) => a + e.duration, 0) +
    totalRounds * Math.max(0, exercises.length - 1) * restBetween +
    (totalRounds - 1) * roundRest;
  const totalMins = Math.max(1, Math.round(totalWorkoutSecs / 60));

  const allPresets = [...BUILTIN_PRESETS, ...customPresets];

  // ================= HOME: PICK A PRESET =================
  if (phase === "idle" && setupView === "home") {
    return (
      <div style={{ ...styles.screen, background: "#0F1520" }}>
        <div style={styles.setupWrap}>
          <div style={styles.pageHeader}>
            <HomeButton onClick={onHome} />
          </div>

          <div style={styles.eyebrow}>WORKOUT TIMER</div>
          <h1 style={styles.setupTitle}>Pick your workout.</h1>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>
            {(presetsLoaded ? allPresets : BUILTIN_PRESETS).map((p) => {
              const exs = p.exercises.map(resolveEntry).filter(Boolean);
              const mins = Math.max(
                1,
                Math.round(
                  (GET_READY +
                    p.rounds * exs.reduce((a, e) => a + e.duration, 0) +
                    p.rounds * Math.max(0, exs.length - 1) * p.rest +
                    (p.rounds - 1) * p.roundRest) /
                    60
                )
              );
              return (
                <div key={p.id} style={styles.presetCard} onClick={() => choosePreset(p)}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.presetCardName}>
                      {p.name}
                      {p.custom && <span style={styles.customBadge}>YOURS</span>}
                    </div>
                    <div style={styles.presetCardMeta}>
                      {exs.length} exercise{exs.length !== 1 ? "s" : ""} · {p.rounds} round
                      {p.rounds !== 1 ? "s" : ""} · ~{mins} min
                    </div>
                  </div>
                  {p.custom && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete({ id: p.id, name: p.name });
                      }}
                      style={styles.cardDelete}
                      aria-label={`Delete preset ${p.name}`}
                    >
                      ×
                    </button>
                  )}
                  <span style={styles.presetArrow}>›</span>
                </div>
              );
            })}
            {!presetsLoaded && (
              <React.Fragment>
                <SkeletonCard />
                <SkeletonCard delay={0.2} />
              </React.Fragment>
            )}
          </div>

          <button onClick={startNewPreset} style={{ ...styles.addToggle, marginTop: 12 }}>
            + New preset
          </button>

        </div>

        {confirmDelete && (
          <div style={styles.confirmOverlay} onClick={() => setConfirmDelete(null)}>
            <div style={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
              <div style={styles.confirmTitle}>Delete preset?</div>
              <div style={styles.confirmText}>
                "{confirmDelete.name}" will be removed. This can't be undone.
              </div>
              <div style={styles.confirmActions}>
                <button style={styles.confirmCancel} onClick={() => setConfirmDelete(null)}>
                  Cancel
                </button>
                <button
                  style={styles.confirmDeleteBtn}
                  onClick={() => {
                    deletePreset(confirmDelete.id);
                    setConfirmDelete(null);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ================= PREVIEW: PRESET DETAILS + START =================
  if (phase === "idle" && setupView === "preview") {
    return (
      <div style={{ ...styles.screen, background: "#0F1520" }}>
        <div style={styles.setupWrap}>
          <div style={styles.pageHeader}>
            <button onClick={() => setSetupView("home")} style={styles.backLink}>
              ‹ All workouts
            </button>
          </div>
          <h1 style={styles.setupTitle}>
            {selectedName}
            {edited && <span style={styles.editedTag}> · edited</span>}
          </h1>
          <div style={styles.previewMeta}>
            {exercises.length} exercise{exercises.length !== 1 ? "s" : ""} · {totalRounds} round
            {totalRounds !== 1 ? "s" : ""} · ~{totalMins} min
          </div>
          <div style={styles.previewHint}>Tap an exercise to see how it's done</div>

          <div style={{ ...styles.exList, marginTop: 24 }}>
            {exercises.map((ex, i) => (
              <React.Fragment key={ex.uid}>
                <div
                  style={{ ...styles.previewRow, cursor: "pointer" }}
                  onClick={() => setInfoUid(infoUid === ex.uid ? null : ex.uid)}
                >
                  <span style={styles.previewIndex}>{i + 1}</span>
                  <span style={styles.exName}>
                    {ex.name}
                    <span style={styles.infoIcon}>{infoUid === ex.uid ? "▾" : "ⓘ"}</span>
                  </span>
                  <span style={styles.exDur}>{ex.duration}s</span>
                </div>
                {infoUid === ex.uid && <div style={styles.descBox}>{ex.desc}</div>}
              </React.Fragment>
            ))}
          </div>

          <div style={styles.previewTiming}>
            <div style={styles.timingItem}>
              <span style={styles.timingValue}>{restBetween}s</span>
              <span style={styles.timingLabel}>rest between exercises</span>
            </div>
            <div style={styles.timingItem}>
              <span style={styles.timingValue}>{roundRest}s</span>
              <span style={styles.timingLabel}>rest between rounds</span>
            </div>
            <div style={styles.timingItem}>
              <span style={styles.timingValue}>{totalRounds}</span>
              <span style={styles.timingLabel}>rounds</span>
            </div>
          </div>

          {notifyPerm !== "unsupported" && (
            <button
              onClick={toggleNotify}
              disabled={notifyPerm === "denied"}
              aria-pressed={notifyAlertsOn}
              style={{
                ...styles.notifyRow,
                opacity: notifyPerm === "denied" ? 0.6 : 1,
                cursor: notifyPerm === "denied" ? "default" : "pointer",
              }}
            >
              <span style={styles.notifyIcon}>{notifyAlertsOn ? "🔔" : "🔕"}</span>
              <span style={{ flex: 1 }}>
                <span style={styles.notifyLabel}>Alert me when the app isn't on screen</span>
                <span style={styles.notifyHint}>
                  {notifyPerm === "denied"
                    ? "Blocked — allow notifications for this site in your browser settings"
                    : !notifyOn
                    ? "Off. The timer still runs and beeps in the background."
                    : notifyPerm === "granted"
                    ? "A notification at every exercise and rest, so you can pocket your phone."
                    : "You'll be asked for permission when the workout starts."}
                </span>
              </span>
              <span
                style={{
                  ...styles.switchTrack,
                  background: notifyAlertsOn ? "#1D4ED8" : "#2A3448",
                }}
              >
                <span
                  style={{
                    ...styles.switchKnob,
                    transform: `translateX(${notifyAlertsOn ? 18 : 0}px)`,
                  }}
                />
              </span>
            </button>
          )}

          <button
            onClick={start}
            disabled={exercises.length === 0}
            style={{ ...styles.startBtn, opacity: exercises.length === 0 ? 0.4 : 1 }}
          >
            START WORKOUT
          </button>
          <button
            onClick={() => {
              setLibInfoId(null);
              setSetupView("edit");
            }}
            style={styles.editBtn}
          >
            Edit workout
          </button>
        </div>
      </div>
    );
  }

  // ================= EDIT MODE: BUILDER WITH DRAG REORDER =================
  if (phase === "idle" && setupView === "edit") {
    return (
      <div style={{ ...styles.screen, background: "#0F1520" }}>
        <div style={styles.setupWrap}>
          <div style={styles.pageHeader}>
            <button onClick={() => setSetupView("preview")} style={styles.backLink}>
              ‹ Done editing
            </button>
          </div>
          <h1 style={styles.setupTitle}>Edit workout</h1>
          <div style={styles.previewMeta}>
            Hold ⠿ and drag to reorder · − / + to adjust time · tap × to remove
          </div>

          <div style={styles.sectionLabel}>EXERCISES</div>
          <div style={styles.exList}>
            {exercises.length === 0 && (
              <div style={{ padding: "16px 0", color: "#8FA3BF", fontSize: 15 }}>
                No exercises yet — add some below.
              </div>
            )}
            {exercises.map((ex, i) => {
              const isDragging = dragIndex === i;
              const shift = rowShift(i);
              return (
                <div
                  key={ex.uid}
                  style={{
                    ...styles.exRow,
                    height: ROW_H,
                    boxSizing: "border-box",
                    transform: isDragging
                      ? `translateY(${dragOffset}px) scale(1.02)`
                      : `translateY(${shift}px)`,
                    transition: isDragging ? "none" : "transform 0.18s ease",
                    background: isDragging ? "#1E2C48" : "transparent",
                    boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.55)" : "none",
                    borderRadius: isDragging ? 12 : 0,
                    borderBottom: isDragging ? "1px solid transparent" : "1px solid #26324A",
                    position: "relative",
                    zIndex: isDragging ? 10 : 1,
                  }}
                >
                  <div
                    onPointerDown={(e) => onDragStart(e, i)}
                    style={styles.dragHandle}
                    aria-label={`Drag to reorder ${ex.name}`}
                  >
                    ⠿
                  </div>
                  <span style={styles.exName}>{ex.name}</span>
                  <button
                    onClick={() => changeDuration(ex.uid, -5)}
                    style={styles.durBtn}
                    aria-label={`Decrease ${ex.name} time`}
                  >
                    −
                  </button>
                  <span style={{ ...styles.exDur, minWidth: 36, textAlign: "center" }}>
                    {ex.duration}s
                  </span>
                  <button
                    onClick={() => changeDuration(ex.uid, 5)}
                    style={styles.durBtn}
                    aria-label={`Increase ${ex.name} time`}
                  >
                    +
                  </button>
                  <button
                    onClick={() => removeExercise(ex.uid)}
                    style={styles.removeBtn}
                    aria-label={`Remove ${ex.name}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => {
              setShowLibrary((s) => !s);
              setLibInfoId(null);
            }}
            style={styles.addToggle}
          >
            {showLibrary ? "− Hide exercise library" : "+ Add exercises"}
          </button>
          {showLibrary && (
            <div style={{ marginTop: 12 }}>
              <input
                value={libQuery}
                onChange={(e) => setLibQuery(e.target.value)}
                placeholder="Search exercises…"
                style={styles.searchInput}
              />
              {!libQuery.trim() && (
                <div style={styles.groupChips}>
                  {GROUPS.map((g) => (
                    <button
                      key={g}
                      onClick={() => setLibGroup(g)}
                      aria-pressed={libGroup === g}
                      style={{
                        ...styles.groupChip,
                        borderColor: libGroup === g ? "#5B8DEF" : "#3B4A63",
                        color: libGroup === g ? "#5B8DEF" : "#8FA3BF",
                      }}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}
              {libQuery.trim() && libResults.length === 0 && (
                <div style={styles.emptyText}>No exercises match "{libQuery.trim()}".</div>
              )}
              <div style={{ ...styles.exList, marginTop: 10 }}>
                {libResults.map((ex) => (
                  <React.Fragment key={ex.id}>
                    <div style={styles.resultRow} onClick={() => addExercise(ex.id)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={styles.resultName}>{ex.name}</div>
                        <div style={styles.resultMeta}>
                          {ex.group} · {ex.cue}
                        </div>
                      </div>
                      <span style={styles.resultDur}>{ex.duration}s</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setLibInfoId(libInfoId === ex.id ? null : ex.id);
                        }}
                        style={{
                          ...styles.libInfo,
                          color: libInfoId === ex.id ? "#5B8DEF" : "#8FA3BF",
                        }}
                        aria-label={`About ${ex.name}`}
                        aria-expanded={libInfoId === ex.id}
                        aria-controls={`lib-desc-${ex.id}`}
                      >
                        {libInfoId === ex.id ? "▾" : "ⓘ"}
                      </button>
                      <span style={{ ...styles.presetArrow, fontSize: 22 }}>+</span>
                    </div>
                    {libInfoId === ex.id && (
                      <div id={`lib-desc-${ex.id}`} style={styles.libDescBox}>
                        {ex.desc}
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          <div style={styles.sectionLabel}>TIMING</div>
          <Stepper
            label="Rest between exercises"
            value={restBetween}
            unit="s"
            onChange={(v) => {
              setRestBetween(v);
              setEdited(true);
            }}
            min={5}
            max={60}
            step={5}
          />
          <Stepper
            label="Rest between rounds"
            value={roundRest}
            unit="s"
            onChange={(v) => {
              setRoundRest(v);
              setEdited(true);
            }}
            min={30}
            max={180}
            step={15}
          />
          <Stepper
            label="Rounds"
            value={totalRounds}
            unit=""
            onChange={(v) => {
              setTotalRounds(v);
              setEdited(true);
            }}
            min={1}
            max={5}
            step={1}
          />

          <div style={styles.sectionLabel}>SAVE</div>
          {isCustomSelected && (
            <button
              onClick={updateExistingPreset}
              disabled={!edited || exercises.length === 0}
              style={{
                ...styles.updateBtn,
                opacity: !edited || exercises.length === 0 ? 0.4 : 1,
              }}
            >
              Update "{selectedName}"
            </button>
          )}
          <div style={{ ...styles.saveRow, marginTop: isCustomSelected ? 10 : 0 }}>
            <input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Save as new preset…"
              style={styles.saveInput}
            />
            <button
              onClick={saveAsNewPreset}
              disabled={!presetName.trim() || exercises.length === 0}
              style={{
                ...styles.saveBtn,
                opacity: !presetName.trim() || exercises.length === 0 ? 0.4 : 1,
              }}
            >
              Save
            </button>
          </div>
          {saveMsg && <div style={styles.saveMsg}>{saveMsg}</div>}

          <button
            onClick={() => setSetupView("preview")}
            disabled={exercises.length === 0}
            style={{ ...styles.startBtn, opacity: exercises.length === 0 ? 0.4 : 1 }}
          >
            DONE · ~{totalMins} MIN
          </button>
        </div>
      </div>
    );
  }

  // ================= DONE SCREEN =================
  if (phase === "done") {
    return (
      <div style={{ ...styles.screen, background: THEME.done.bg }}>
        <div style={styles.doneWrap}>
          <div style={{ fontSize: 72 }}>💪</div>
          <h1 style={styles.doneTitle}>Workout complete</h1>
          <p style={styles.doneSub}>
            {selectedName} · {totalRounds} rounds · {totalRounds * exercises.length} sets · ~
            {totalMins} min
          </p>
          <button
            onClick={() => {
              reset();
              setSetupView("preview");
            }}
            style={{ ...styles.startBtn, marginTop: 32 }}
          >
            GO AGAIN
          </button>
          <button
            onClick={() => {
              reset();
              setSetupView("home");
            }}
            style={styles.editBtn}
          >
            All workouts
          </button>
        </div>
      </div>
    );
  }

  // ================= ACTIVE TIMER SCREEN =================
  return (
    <div style={{ ...styles.screen, background: theme.bg, transition: "background 0.4s ease" }}>
      <div style={styles.topBar}>
        <span style={{ ...styles.phaseTag, color: theme.accent }}>{theme.label}</span>
        <span style={{ ...styles.roundTag, color: theme.accent }}>
          ROUND {round}/{totalRounds}
        </span>
        <button
          onClick={() => setSoundOn((s) => !s)}
          style={{ ...styles.iconBtn, color: theme.accent }}
          aria-label={soundOn ? "Mute sounds" : "Unmute sounds"}
        >
          {soundOn ? "🔊" : "🔇"}
        </button>
      </div>

      <div style={styles.centerBlock}>
        <div style={styles.exerciseName}>
          {phase === "work" ? currentEx.name : phase === "ready" ? "Get in position" : "Breathe"}
        </div>
        {phase === "work" && (
          <div style={{ ...styles.cue, color: theme.accent }}>{currentEx.cue}</div>
        )}

        <div style={styles.bigTime}>{fmt(timeLeft)}</div>

        <div style={styles.progressTrack}>
          <div
            style={{
              ...styles.progressFill,
              width: `${progress * 100}%`,
              background: theme.accent,
            }}
          />
        </div>

        <div style={styles.dots}>
          {exercises.map((ex, i) => (
            <div
              key={ex.uid}
              style={{
                ...styles.dot,
                background:
                  i < exIndex || (i === exIndex && phase !== "ready")
                    ? theme.accent
                    : "rgba(255,255,255,0.25)",
              }}
            />
          ))}
        </div>

        {nextEx && (
          <div style={{ ...styles.upNext, color: theme.accent }}>
            UP NEXT — {nextEx.name} · {nextEx.duration}s
          </div>
        )}
      </div>

      <div style={styles.controls}>
        <button onClick={running ? goBack : reset} style={styles.ctrlBtnSecondary}>
          {running ? "Back" : "Reset"}
        </button>
        <button onClick={togglePause} style={styles.ctrlBtnPrimary}>
          {running ? "Pause" : "Resume"}
        </button>
        <button onClick={skip} style={styles.ctrlBtnSecondary}>
          Skip
        </button>
      </div>
    </div>
  );
}
