// Exercise catalog, built-in presets, and the workout-entry data model.
//
// A preset entry is either a plain library id or { id, duration } when the
// duration was customized away from the library default; withUids() wraps
// those into the editable workout state.
const LIBRARY = [
  { id: "plank", name: "Plank", duration: 60, cue: "Elbows under shoulders · squeeze glutes · hips level",
    desc: "Face down, prop yourself on your forearms and toes with elbows under your shoulders. Keep your body in one straight line from head to heels and hold — don't let your hips sag or pike up." },
  { id: "bicycle", name: "Bicycle Crunches", duration: 40, cue: "Slow & controlled · elbow to opposite knee",
    desc: "Lie on your back, hands behind your head, legs lifted. Pedal your legs while twisting your torso, bringing each elbow toward the opposite knee. Alternate sides slowly — no yanking on your neck." },
  { id: "legraise", name: "Leg Raises", duration: 40, cue: "Lower slowly · lower back pressed to floor",
    desc: "Lie flat with legs straight. Keeping them together, raise your legs until vertical, then lower them slowly. Stop before your lower back arches off the floor." },
  { id: "mtclimber", name: "Mountain Climbers", duration: 40, cue: "Fast pace · drive knees to chest",
    desc: "Start in a push-up position. Drive one knee toward your chest, then quickly switch legs — like running in place with your hands on the floor. Keep your hips low." },
  { id: "russian", name: "Russian Twists", duration: 40, cue: "Feet up if you can · rotate fully side to side",
    desc: "Sit with knees bent, lean your torso back slightly and lift your feet off the floor if you can. Clasp your hands and rotate your torso side to side, tapping the floor beside each hip." },
  { id: "hollow", name: "Hollow Hold", duration: 40, cue: "Arms & legs extended · lower back glued to floor",
    desc: "Lie on your back and press your lower back into the floor. Lift your shoulders, extended arms, and straight legs a few inches off the ground, forming a shallow banana shape. Hold without letting your back arch." },
  { id: "vups", name: "V-Ups", duration: 40, cue: "Reach hands to toes · keep legs straight",
    desc: "Lie flat with arms extended overhead. In one motion, lift your straight legs and torso to fold into a V, reaching your hands toward your toes, then lower back down with control." },
  { id: "sideplankL", name: "Side Plank (Left)", duration: 30, cue: "Stack shoulders & hips · don't let hips drop",
    desc: "Lie on your left side and prop yourself on your left forearm, elbow under shoulder, feet stacked. Lift your hips so your body forms a straight line and hold." },
  { id: "sideplankR", name: "Side Plank (Right)", duration: 30, cue: "Stack shoulders & hips · don't let hips drop",
    desc: "Lie on your right side and prop yourself on your right forearm, elbow under shoulder, feet stacked. Lift your hips so your body forms a straight line and hold." },
  { id: "flutter", name: "Flutter Kicks", duration: 40, cue: "Small quick kicks · hands under hips for support",
    desc: "Lie on your back with legs extended and lifted slightly, hands under your hips. Kick your legs up and down in small, quick alternating motions without letting them touch the floor." },
  { id: "deadbug", name: "Dead Bug", duration: 40, cue: "Opposite arm & leg · slow · core braced",
    desc: "Lie on your back with arms pointing at the ceiling and knees bent 90°. Slowly lower one arm and the opposite leg toward the floor, return, then switch sides. Keep your lower back pressed down." },
  { id: "revcrunch", name: "Reverse Crunches", duration: 40, cue: "Lift hips off floor · control on the way down",
    desc: "Lie on your back with knees pulled toward your chest. Curl your hips up off the floor, bringing your knees toward your face, then lower slowly with control." },
  { id: "crunches", name: "Crunches", duration: 40, cue: "Chin off chest · lift with abs, not neck",
    desc: "Lie on your back with knees bent, feet flat, hands lightly behind your head. Lift your shoulder blades off the floor using your abs, then lower back down. Don't pull on your neck." },
  { id: "heeltaps", name: "Heel Taps", duration: 40, cue: "Shoulders slightly up · reach side to side",
    desc: "Lie on your back with knees bent, feet flat, arms at your sides. Lift your shoulders slightly and reach side to side, tapping each heel with your hand." },
  { id: "toetouch", name: "Toe Touches", duration: 40, cue: "Legs vertical · reach up toward toes",
    desc: "Lie on your back with legs raised straight up. Reach your hands toward your toes, lifting your shoulder blades off the floor, then lower back down with control." },
];
const byId = (id) => LIBRARY.find((e) => e.id === id);

// Preset exercise entries are either a plain id string or { id, duration }
// when the duration was customized away from the library default.
const resolveEntry = (entry) => {
  const ex = byId(typeof entry === "string" ? entry : entry.id);
  if (!ex) return null;
  return typeof entry === "string" || entry.duration == null
    ? ex
    : { ...ex, duration: entry.duration };
};

// ---- Built-in presets ----
const BUILTIN_PRESETS = [
  {
    id: "classic",
    name: "Classic Circuit",
    exercises: ["plank", "bicycle", "legraise", "mtclimber", "russian"],
    rest: 20,
    roundRest: 75,
    rounds: 3,
  },
  {
    id: "burner",
    name: "Core Burner",
    exercises: ["hollow", "vups", "sideplankL", "sideplankR", "flutter", "plank"],
    rest: 15,
    roundRest: 90,
    rounds: 3,
  },
];

const GET_READY = 10;
const STORAGE_KEY = "abs-timer-custom-presets";

let uidCounter = 1;
const withUids = (entries) =>
  entries.map((e) =>
    typeof e === "string"
      ? { uid: `u${uidCounter++}`, exId: e }
      : { uid: `u${uidCounter++}`, exId: e.id, duration: e.duration }
  );
