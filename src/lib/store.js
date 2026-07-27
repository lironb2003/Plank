// Persistence: local (artifact storage / localStorage) with an optional
// Firestore layer per signed-in user, behind one `store` adapter.
// ==== FIREBASE CONFIG ======================================================
// Web-app config from the Firebase console (Project settings → Your apps →
// SDK setup and configuration → Config). This config is a public identifier,
// not a secret — data is protected by Firestore security rules.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBIvfz9QoQpD1iaY6OXAYygZ6_MmGlEPnE",
  authDomain: "abs-timer.firebaseapp.com",
  projectId: "abs-timer",
  storageBucket: "abs-timer.firebasestorage.app",
  messagingSenderId: "356912989096",
  appId: "1:356912989096:web:72cf074309c81b5b0a539d",
};
// ===========================================================================
const MERGE_FLAG_PREFIX = "abs-timer-merged-"; // + uid: local→cloud merge done on this device
const LOCAL_DIRTY_KEY = "abs-timer-local-dirty"; // signed-out writes force a re-merge

// True only when the SDK loaded (gstatic reachable) AND a real config was
// pasted AND initialization succeeded. False means every cloud code path is
// skipped and the app behaves exactly like the localStorage-only version.
const firebaseReady = (() => {
  try {
    if (typeof firebase === "undefined" || !firebase.initializeApp) return false;
    if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.indexOf("PASTE_") === 0) return false;
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    return true;
  } catch (e) {
    return false;
  }
})();

// ---- Persistence adapter ----
// Local layer: Claude's artifact storage when available (persists across
// sessions on claude.ai), else the browser's localStorage.
const localGet = async (key) => {
  if (typeof window !== "undefined" && window.storage) {
    try {
      const r = await window.storage.get(key);
      return r && r.value != null ? r.value : null;
    } catch (e) {
      return null; // key doesn't exist yet
    }
  }
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
};
const localSet = async (key, value) => {
  if (typeof window !== "undefined" && window.storage) {
    try {
      await window.storage.set(key, value);
      return true;
    } catch (e) {
      /* fall through to localStorage */
    }
  }
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
};

// Cloud layer: per-user Firestore docs users/{uid}/data/{key} → { value, updatedAt }.
const cloudUid = () => {
  try {
    const u = firebaseReady ? firebase.auth().currentUser : null;
    return u ? u.uid : null;
  } catch (e) {
    return null;
  }
};
const cloudDoc = (uid, key) =>
  firebase.firestore().collection("users").doc(uid).collection("data").doc(key);

// The store decides cloud vs local itself, so call sites stay unchanged.
// Writes go local-first (never lost, never block the UI), then push to
// Firestore fire-and-forget — an offline Firestore set() doesn't resolve
// until reconnect, so it must not be awaited on the save path.
const store = {
  notify: null, // set by the component: ("syncing"|"synced"|"error") => void
  async get(key) {
    const uid = cloudUid();
    if (uid) {
      try {
        const snap = await cloudDoc(uid, key).get();
        if (snap.exists && snap.data().value != null) {
          const v = snap.data().value;
          await localSet(key, v); // mirror down so sign-out keeps current data
          return v;
        }
      } catch (e) {
        /* cloud unreachable — fall through to local */
      }
    }
    return localGet(key);
  },
  async set(key, value) {
    const ok = await localSet(key, value);
    const uid = cloudUid();
    if (uid) {
      if (store.notify) store.notify("syncing");
      try {
        cloudDoc(uid, key)
          .set({ value: value, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
          .then(() => {
            if (store.notify) store.notify("synced");
          })
          .catch((e) => {
            // permission-denied = the DB refused us (security rules), not a
            // connectivity problem — surface it distinctly so it's actionable.
            if (store.notify)
              store.notify(e && e.code === "permission-denied" ? "denied" : "error");
          });
      } catch (e) {
        if (store.notify) store.notify(e && e.code === "permission-denied" ? "denied" : "error");
      }
    } else {
      try {
        window.localStorage.setItem(LOCAL_DIRTY_KEY, "1");
      } catch (e) {}
    }
    return ok;
  },
};

// One-time (per device+uid) local→cloud merge, then cloud is source of truth.
// Merge rule: union by preset id; cloud wins on collision; cloud order first,
// local-only presets appended. Signed-out writes set LOCAL_DIRTY_KEY, which
// forces a re-merge so presets created while signed out survive the next
// sign-in. (Signed-out *edits* to an already-synced preset id are superseded
// by the cloud copy on re-merge.)
async function loadPresetsForUser(uid) {
  const parse = (s) => {
    try {
      const a = JSON.parse(s);
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  };
  let cloudRaw = null;
  try {
    const snap = await cloudDoc(uid, STORAGE_KEY).get();
    if (snap.exists) cloudRaw = snap.data().value;
  } catch (e) {
    // Cloud unreachable: surface the local mirror instead, and don't set the
    // merge flag so the merge retries on a later sign-in.
    const err = new Error("cloud-unavailable");
    err.code = e && e.code;
    err.fallback = parse(await localGet(STORAGE_KEY));
    throw err;
  }
  const cloud = cloudRaw ? parse(cloudRaw) : [];
  let merged = cloud;
  let alreadyMerged = false;
  let localDirty = false;
  try {
    alreadyMerged = window.localStorage.getItem(MERGE_FLAG_PREFIX + uid) === "1";
    localDirty = window.localStorage.getItem(LOCAL_DIRTY_KEY) === "1";
  } catch (e) {}
  if (!alreadyMerged || localDirty) {
    const local = parse(await localGet(STORAGE_KEY));
    const cloudIds = {};
    cloud.forEach((p) => {
      if (p && p.id) cloudIds[p.id] = true;
    });
    const additions = local.filter((p) => p && p.id && !cloudIds[p.id]);
    merged = cloud.concat(additions);
    if (additions.length > 0) {
      // Must succeed before the flag is set, so failed migrations retry.
      try {
        await cloudDoc(uid, STORAGE_KEY).set({
          value: JSON.stringify(merged),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        try {
          await localSet(STORAGE_KEY, JSON.stringify(merged));
        } catch (e2) {}
        const err = new Error("merge-write-failed");
        err.code = e && e.code;
        err.fallback = merged;
        throw err;
      }
    }
    try {
      window.localStorage.setItem(MERGE_FLAG_PREFIX + uid, "1");
      window.localStorage.removeItem(LOCAL_DIRTY_KEY);
    } catch (e) {}
  }
  try {
    await localSet(STORAGE_KEY, JSON.stringify(merged));
  } catch (e) {}
  return merged;
}
