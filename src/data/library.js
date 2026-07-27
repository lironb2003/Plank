// Exercise catalog, built-in presets, and the workout-entry data model.
//
// Everything here is something you can hold or repeat for a stretch of time,
// since the timer counts seconds rather than reps. `group` is what the edit
// screen browses by; `alt` holds extra keywords the search should also match.
//
// A preset entry is either a plain library id or { id, duration } when the
// duration was customized away from the library default; withUids() wraps
// those into the editable workout state.
const GROUPS = ["Core", "Upper Body", "Lower Body", "Full Body", "Cardio", "Mobility"];

// Words people search that mean a whole category — "abs" should surface the
// core work even though no exercise is called that. Folded into each
// exercise's search haystack by lib/search.js.
const GROUP_ALIASES = {
  Core: "abs stomach midsection",
  "Upper Body": "arms chest back shoulders push pull",
  "Lower Body": "legs glutes quads",
  "Full Body": "conditioning",
  Cardio: "hiit conditioning endurance",
  Mobility: "stretch stretching yoga warm up cool down flexibility",
};

const LIBRARY = [
  // ---- Core ----
  { id: "plank", name: "Plank", duration: 60, group: "Core", cue: "Elbows under shoulders · squeeze glutes · hips level",
    desc: "Face down, prop yourself on your forearms and toes with elbows under your shoulders. Keep your body in one straight line from head to heels and hold — don't let your hips sag or pike up." },
  { id: "bicycle", name: "Bicycle Crunches", duration: 40, group: "Core", cue: "Slow & controlled · elbow to opposite knee",
    desc: "Lie on your back, hands behind your head, legs lifted. Pedal your legs while twisting your torso, bringing each elbow toward the opposite knee. Alternate sides slowly — no yanking on your neck." },
  { id: "legraise", name: "Leg Raises", duration: 40, group: "Core", cue: "Lower slowly · lower back pressed to floor",
    desc: "Lie flat with legs straight. Keeping them together, raise your legs until vertical, then lower them slowly. Stop before your lower back arches off the floor." },
  { id: "mtclimber", name: "Mountain Climbers", duration: 40, group: "Core", alt: "climber cardio",
    cue: "Fast pace · drive knees to chest",
    desc: "Start in a push-up position. Drive one knee toward your chest, then quickly switch legs — like running in place with your hands on the floor. Keep your hips low." },
  { id: "russian", name: "Russian Twists", duration: 40, group: "Core", cue: "Feet up if you can · rotate fully side to side",
    desc: "Sit with knees bent, lean your torso back slightly and lift your feet off the floor if you can. Clasp your hands and rotate your torso side to side, tapping the floor beside each hip." },
  { id: "hollow", name: "Hollow Hold", duration: 40, group: "Core", alt: "banana",
    cue: "Arms & legs extended · lower back glued to floor",
    desc: "Lie on your back and press your lower back into the floor. Lift your shoulders, extended arms, and straight legs a few inches off the ground, forming a shallow banana shape. Hold without letting your back arch." },
  { id: "vups", name: "V-Ups", duration: 40, group: "Core", cue: "Reach hands to toes · keep legs straight",
    desc: "Lie flat with arms extended overhead. In one motion, lift your straight legs and torso to fold into a V, reaching your hands toward your toes, then lower back down with control." },
  { id: "sideplankL", name: "Side Plank (Left)", duration: 30, group: "Core", cue: "Stack shoulders & hips · don't let hips drop",
    desc: "Lie on your left side and prop yourself on your left forearm, elbow under shoulder, feet stacked. Lift your hips so your body forms a straight line and hold." },
  { id: "sideplankR", name: "Side Plank (Right)", duration: 30, group: "Core", cue: "Stack shoulders & hips · don't let hips drop",
    desc: "Lie on your right side and prop yourself on your right forearm, elbow under shoulder, feet stacked. Lift your hips so your body forms a straight line and hold." },
  { id: "flutter", name: "Flutter Kicks", duration: 40, group: "Core", cue: "Small quick kicks · hands under hips for support",
    desc: "Lie on your back with legs extended and lifted slightly, hands under your hips. Kick your legs up and down in small, quick alternating motions without letting them touch the floor." },
  { id: "deadbug", name: "Dead Bug", duration: 40, group: "Core", cue: "Opposite arm & leg · slow · core braced",
    desc: "Lie on your back with arms pointing at the ceiling and knees bent 90°. Slowly lower one arm and the opposite leg toward the floor, return, then switch sides. Keep your lower back pressed down." },
  { id: "revcrunch", name: "Reverse Crunches", duration: 40, group: "Core", cue: "Lift hips off floor · control on the way down",
    desc: "Lie on your back with knees pulled toward your chest. Curl your hips up off the floor, bringing your knees toward your face, then lower slowly with control." },
  { id: "crunches", name: "Crunches", duration: 40, group: "Core", cue: "Chin off chest · lift with abs, not neck",
    desc: "Lie on your back with knees bent, feet flat, hands lightly behind your head. Lift your shoulder blades off the floor using your abs, then lower back down. Don't pull on your neck." },
  { id: "heeltaps", name: "Heel Taps", duration: 40, group: "Core", cue: "Shoulders slightly up · reach side to side",
    desc: "Lie on your back with knees bent, feet flat, arms at your sides. Lift your shoulders slightly and reach side to side, tapping each heel with your hand." },
  { id: "toetouch", name: "Toe Touches", duration: 40, group: "Core", cue: "Legs vertical · reach up toward toes",
    desc: "Lie on your back with legs raised straight up. Reach your hands toward your toes, lifting your shoulder blades off the floor, then lower back down with control." },
  { id: "birddog", name: "Bird Dog", duration: 40, group: "Core", cue: "Opposite arm & leg · pause at the top",
    desc: "On hands and knees, extend one arm forward and the opposite leg straight back until both are level with your spine. Pause, return, and switch sides — keep your hips square to the floor throughout." },

  // ---- Upper Body ----
  { id: "deadhang", name: "Dead Hang", duration: 30, group: "Upper Body", alt: "bar grip hang",
    cue: "Full grip · shoulders active · just breathe",
    desc: "Hang from a pull-up bar with an overhand grip, arms straight and feet clear of the floor. Don't go completely limp — pull your shoulder blades down a little so your shoulders stay engaged, and breathe steadily." },
  { id: "flexedhang", name: "Flexed-Arm Hang", duration: 20, group: "Upper Body", alt: "bar chin up hold",
    cue: "Chin above the bar · elbows tucked",
    desc: "Step or jump up so your chin clears a pull-up bar with an underhand grip, then hold there. Keep your chest up and elbows close to your sides, and lower under control when time is up." },
  { id: "pushup", name: "Push-Ups", duration: 40, group: "Upper Body", alt: "press up",
    cue: "Body in one line · chest toward the floor",
    desc: "From a plank on your hands, lower your chest toward the floor with your elbows tracking back at about 45°, then press back up. Keep your hips level — drop to your knees if your form starts to sag." },
  { id: "pushuphold", name: "Push-Up Hold", duration: 30, group: "Upper Body", alt: "isometric press",
    cue: "Halfway down · elbows in · hips level",
    desc: "Lower into a push-up until your elbows are at about 90° and stop there. Hold that halfway position with your body in one straight line, breathing rather than bracing everything at once." },
  { id: "pikepushup", name: "Pike Push-Ups", duration: 30, group: "Upper Body", alt: "shoulder press handstand",
    cue: "Hips high · lower the crown of your head",
    desc: "Start in a push-up position and walk your feet in so your hips point at the ceiling in an upside-down V. Bend your elbows to lower the top of your head toward the floor, then press back up — this loads the shoulders." },
  { id: "diamondpushup", name: "Diamond Push-Ups", duration: 30, group: "Upper Body", alt: "triceps close grip",
    cue: "Hands together · elbows brush your ribs",
    desc: "Set your hands close together under your chest so index fingers and thumbs form a diamond. Lower your chest to your hands with elbows staying close to your body, then press up — expect the triceps to do most of the work." },
  { id: "inclinepushup", name: "Incline Push-Ups", duration: 40, group: "Upper Body", alt: "bench easy press up",
    cue: "Hands on a bench or step · same straight line",
    desc: "Put your hands on a bench, step, or windowsill and walk your feet back until your body is straight. Lower your chest to the edge and press back up — the higher the surface, the easier it is." },
  { id: "chairdip", name: "Chair Dips", duration: 40, group: "Upper Body", alt: "triceps bench dip",
    cue: "Elbows straight back · shoulders down",
    desc: "Sit on the edge of a chair or bench, hands beside your hips, and slide your seat off the front. Bend your elbows straight back to lower yourself, then press back up without shrugging your shoulders to your ears." },
  { id: "shouldertap", name: "Plank Shoulder Taps", duration: 40, group: "Upper Body", alt: "plank tap",
    cue: "Wide feet · hips still · tap opposite shoulder",
    desc: "Hold a push-up-position plank with your feet a bit wider than usual. Tap one hand to the opposite shoulder, replace it, and switch — the goal is to stop your hips from rocking side to side." },
  { id: "supermanhold", name: "Superman Hold", duration: 30, group: "Upper Body", alt: "back extension",
    cue: "Arms & legs lifted · squeeze your back",
    desc: "Lie face down with arms extended overhead. Lift your arms, chest, and legs off the floor at once and hold, squeezing your upper back and glutes. Look at the floor to keep your neck neutral." },

  // ---- Lower Body ----
  { id: "wallsit", name: "Wall Sit", duration: 45, group: "Lower Body", alt: "chair hold quads",
    cue: "Thighs parallel · back flat on the wall",
    desc: "Stand with your back against a wall and slide down until your knees are bent 90° and your thighs are parallel to the floor. Keep your whole back on the wall and your weight in your heels, and hold." },
  { id: "squat", name: "Bodyweight Squats", duration: 45, group: "Lower Body", alt: "air squat",
    cue: "Chest up · knees out · sit back",
    desc: "Stand with feet about shoulder-width apart. Sit your hips back and down until your thighs are at least parallel to the floor, keeping your chest up and knees tracking over your toes, then stand back up." },
  { id: "squathold", name: "Squat Hold", duration: 30, group: "Lower Body", alt: "isometric air squat",
    cue: "Bottom of the squat · heels down",
    desc: "Drop into the bottom of a bodyweight squat and stay there. Keep your heels flat, chest up, and knees pushed out — breathe instead of holding your breath." },
  { id: "lunges", name: "Alternating Lunges", duration: 40, group: "Lower Body", alt: "walking lunge",
    cue: "Long step · back knee toward the floor",
    desc: "Step forward into a lunge and lower until both knees are bent about 90°, with your back knee just above the floor. Push back to standing and alternate legs, keeping your torso upright." },
  { id: "splitsquatL", name: "Split Squat (Left)", duration: 30, group: "Lower Body", alt: "static lunge",
    cue: "Left foot forward · torso tall · straight up and down",
    desc: "Stand in a split stance with your left foot forward and your right foot a stride behind. Lower straight down until your back knee nearly touches the floor, then press back up — the feet stay put for the whole set." },
  { id: "splitsquatR", name: "Split Squat (Right)", duration: 30, group: "Lower Body", alt: "static lunge",
    cue: "Right foot forward · torso tall · straight up and down",
    desc: "Stand in a split stance with your right foot forward and your left foot a stride behind. Lower straight down until your back knee nearly touches the floor, then press back up — the feet stay put for the whole set." },
  { id: "sidelunge", name: "Lateral Lunges", duration: 40, group: "Lower Body", alt: "side lunge adductor",
    cue: "Step wide · sit into one hip · other leg straight",
    desc: "Step out wide to one side and sit your hips back over that leg, keeping the other leg straight and both feet flat. Push back to the middle and alternate sides — you should feel a stretch through the straight leg's inner thigh." },
  { id: "glutebridge", name: "Glute Bridge", duration: 40, group: "Lower Body", alt: "hip raise thrust",
    cue: "Drive through heels · squeeze at the top",
    desc: "Lie on your back with knees bent and feet flat, close to your hips. Drive through your heels to lift your hips until your body is straight from knees to shoulders, squeeze your glutes, then lower with control." },
  { id: "glutebridgehold", name: "Glute Bridge Hold", duration: 30, group: "Lower Body", alt: "hip raise isometric",
    cue: "Hips high · ribs down · glutes tight",
    desc: "Take the top position of a glute bridge and stay there. Keep your ribs pulled down so the work stays in your glutes rather than your lower back." },
  { id: "calfraise", name: "Calf Raises", duration: 40, group: "Lower Body", alt: "heel raise",
    cue: "Up slow · full stretch at the bottom",
    desc: "Stand tall, rise onto the balls of your feet as high as you can, pause, then lower slowly until your heels are back down. Use a wall or chair for balance if you need it." },
  { id: "stepup", name: "Step-Ups", duration: 40, group: "Lower Body", alt: "box stair",
    cue: "Whole foot on the step · drive through the heel",
    desc: "Stand in front of a step, bench, or sturdy chair. Place one whole foot on it and drive through that heel to stand all the way up, then step down with control and alternate the leading leg." },
  { id: "singlelegL", name: "Single-Leg Balance (Left)", duration: 30, group: "Lower Body", alt: "stability balance",
    cue: "Stand on the left · soft knee · eyes on one spot",
    desc: "Stand on your left leg with a soft knee and lift the right foot off the floor. Fix your eyes on one spot and stay tall — close your eyes for a harder version." },
  { id: "singlelegR", name: "Single-Leg Balance (Right)", duration: 30, group: "Lower Body", alt: "stability balance",
    cue: "Stand on the right · soft knee · eyes on one spot",
    desc: "Stand on your right leg with a soft knee and lift the left foot off the floor. Fix your eyes on one spot and stay tall — close your eyes for a harder version." },

  // ---- Full Body ----
  { id: "bearhold", name: "Bear Hold", duration: 30, group: "Full Body", alt: "quadruped hover",
    cue: "Knees an inch off the floor · flat back",
    desc: "From hands and knees, tuck your toes and lift your knees just an inch off the floor. Keep your back flat and hips level, and hold — small distance, large effort." },
  { id: "bearcrawl", name: "Bear Crawl", duration: 40, group: "Full Body", alt: "crawl quadruped",
    cue: "Knees low · opposite hand & foot · hips quiet",
    desc: "Start in a bear hold and crawl forward and back by moving opposite hand and foot together. Keep your knees just off the floor and your hips from swaying side to side." },
  { id: "inchworm", name: "Inchworms", duration: 40, group: "Full Body", alt: "walkout",
    cue: "Walk hands out to a plank · walk feet in",
    desc: "From standing, hinge down and walk your hands out to a plank. Hold for a beat, then walk your feet toward your hands, keeping your legs as straight as your hamstrings allow, and stand up." },
  { id: "squatthrust", name: "Squat Thrusts", duration: 40, group: "Full Body", alt: "burpee no jump",
    cue: "Hands down · feet back and in · no jump",
    desc: "Squat down and place your hands on the floor, jump your feet back to a plank, then jump them back in and stand. It's a burpee without the push-up or the jump — steadier for a long interval." },
  { id: "farmerhold", name: "Farmer's Hold", duration: 45, group: "Full Body", alt: "grip carry dumbbell suitcase",
    cue: "Heavy in both hands · shoulders back · stand tall",
    desc: "Hold a heavy dumbbell, kettlebell, or loaded bag in each hand at your sides and just stand — tall, shoulders back, ribs down. It's a grip and posture hold; put the weights down before your form breaks." },

  // ---- Cardio ----
  { id: "jumpingjack", name: "Jumping Jacks", duration: 45, group: "Cardio", alt: "star jump",
    cue: "Full range · arms all the way overhead",
    desc: "Jump your feet out wide while sweeping your arms overhead, then jump back in with arms at your sides. Land softly through the balls of your feet and keep a steady rhythm." },
  { id: "highknees", name: "High Knees", duration: 40, group: "Cardio", alt: "running in place",
    cue: "Knees to hip height · stay on the balls of your feet",
    desc: "Run in place, driving each knee up to hip height while pumping your arms. Stay tall and light on your feet rather than reaching for speed with a collapsed posture." },
  { id: "buttkicks", name: "Butt Kicks", duration: 40, group: "Cardio", alt: "heel flicks running",
    cue: "Heels to glutes · quick turnover",
    desc: "Jog in place, flicking each heel up toward your glutes. Keep your torso upright and your knees pointing down, and aim for a quick, light cadence." },
  { id: "squatjump", name: "Squat Jumps", duration: 30, group: "Cardio", alt: "jump squat plyo",
    cue: "Land soft · sink straight into the next one",
    desc: "Drop into a squat and jump explosively, reaching full extension. Land softly on the balls of your feet, absorb through your hips and knees, and flow straight into the next rep." },
  { id: "skater", name: "Skater Jumps", duration: 40, group: "Cardio", alt: "lateral bound speed skater",
    cue: "Bound side to side · land on one leg",
    desc: "Bound laterally from one foot to the other, landing on a single leg and letting the trailing leg sweep behind you. Stay low and controlled — quiet landings mean you're absorbing properly." },
  { id: "burpee", name: "Burpees", duration: 40, group: "Cardio", alt: "full body conditioning",
    cue: "Chest to floor · jump at the top",
    desc: "Squat down, jump your feet back, lower your chest to the floor, then press up, jump your feet in and finish with a jump overhead. Pace it — burpees punish anyone who starts too fast." },
  { id: "jumprope", name: "Jump Rope", duration: 60, group: "Cardio", alt: "skipping rope",
    cue: "Small hops · wrists do the turning",
    desc: "Skip with a rope (or mime it) using small hops just clear of the floor. Turn the rope with your wrists rather than your arms and keep your elbows close to your sides." },
  { id: "shadowbox", name: "Shadow Boxing", duration: 60, group: "Cardio", alt: "boxing punches",
    cue: "Hands up · keep moving · breathe out on every punch",
    desc: "Move on your feet and throw combinations at the air — jabs, crosses, hooks — returning your hands to guard each time. Exhale sharply on each punch and keep your feet from going flat." },

  // ---- Mobility ----
  { id: "catcow", name: "Cat-Cow", duration: 40, group: "Mobility", alt: "spine flow warm up",
    cue: "Arch and round · follow your breath",
    desc: "On hands and knees, inhale as you drop your belly and lift your chest and tailbone, then exhale as you round your spine and tuck your chin. Move slowly, letting your breath set the pace." },
  { id: "childpose", name: "Child's Pose", duration: 45, group: "Mobility", alt: "balasana rest stretch",
    cue: "Hips to heels · arms long · breathe into your back",
    desc: "Kneel, sit your hips back toward your heels and walk your hands forward, letting your chest sink toward the floor. Rest your forehead down and take slow breaths into your upper back." },
  { id: "downdog", name: "Downward Dog", duration: 45, group: "Mobility", alt: "yoga hamstring calf",
    cue: "Hips high · heels reaching down · long spine",
    desc: "From a plank, push your hips up and back into an inverted V with straight arms. Press your chest toward your thighs and reach your heels toward the floor — bend your knees if your hamstrings are tight." },
  { id: "cobra", name: "Cobra Stretch", duration: 30, group: "Mobility", alt: "yoga back extension chest",
    cue: "Elbows soft · shoulders down · look forward",
    desc: "Lie face down with hands under your shoulders and press your chest up, keeping your hips on the floor. Keep your shoulders away from your ears and only go as high as feels comfortable in your lower back." },
  { id: "thoracicrot", name: "Thoracic Rotations", duration: 40, group: "Mobility", alt: "open book t spine twist",
    cue: "Open the chest · follow your hand with your eyes",
    desc: "Kneel with one hand behind your head and rotate that elbow up toward the ceiling, opening your chest, then bring it back down under your body. Alternate sides and let your eyes follow your elbow." },
  { id: "worldsgreatestL", name: "World's Greatest Stretch (Left)", duration: 30, group: "Mobility", alt: "lunge twist hip opener",
    cue: "Left foot forward · drop the hip · reach for the ceiling",
    desc: "Step your left foot outside your left hand in a deep lunge and let your back hip sink. Drop your left elbow toward your instep, then rotate and reach your left hand to the ceiling, alternating slowly." },
  { id: "worldsgreatestR", name: "World's Greatest Stretch (Right)", duration: 30, group: "Mobility", alt: "lunge twist hip opener",
    cue: "Right foot forward · drop the hip · reach for the ceiling",
    desc: "Step your right foot outside your right hand in a deep lunge and let your back hip sink. Drop your right elbow toward your instep, then rotate and reach your right hand to the ceiling, alternating slowly." },
  { id: "pigeonL", name: "Pigeon Pose (Left)", duration: 40, group: "Mobility", alt: "glute hip stretch yoga",
    cue: "Left shin forward · square the hips · sink slowly",
    desc: "From hands and knees, bring your left shin forward across your body and extend your right leg straight back. Keep your hips square and lower your chest over the front leg — you should feel it in the left glute." },
  { id: "pigeonR", name: "Pigeon Pose (Right)", duration: 40, group: "Mobility", alt: "glute hip stretch yoga",
    cue: "Right shin forward · square the hips · sink slowly",
    desc: "From hands and knees, bring your right shin forward across your body and extend your left leg straight back. Keep your hips square and lower your chest over the front leg — you should feel it in the right glute." },
  { id: "hipflexorL", name: "Hip Flexor Stretch (Left)", duration: 30, group: "Mobility", alt: "kneeling lunge couch psoas",
    cue: "Left knee down · tuck the tailbone · squeeze that glute",
    desc: "Kneel on your left knee with your right foot forward. Tuck your tailbone under and squeeze your left glute, then ease your hips forward — the stretch belongs at the front of the left hip, not in your lower back." },
  { id: "hipflexorR", name: "Hip Flexor Stretch (Right)", duration: 30, group: "Mobility", alt: "kneeling lunge couch psoas",
    cue: "Right knee down · tuck the tailbone · squeeze that glute",
    desc: "Kneel on your right knee with your left foot forward. Tuck your tailbone under and squeeze your right glute, then ease your hips forward — the stretch belongs at the front of the right hip, not in your lower back." },
  { id: "hamstringL", name: "Hamstring Stretch (Left)", duration: 30, group: "Mobility", alt: "forward fold leg",
    cue: "Left leg straight · hinge from the hips · flat back",
    desc: "Put your left heel on the floor in front of you with the leg straight and toes up, sitting your weight back into the right hip. Hinge forward from the hips with a flat back until you feel the left hamstring." },
  { id: "hamstringR", name: "Hamstring Stretch (Right)", duration: 30, group: "Mobility", alt: "forward fold leg",
    cue: "Right leg straight · hinge from the hips · flat back",
    desc: "Put your right heel on the floor in front of you with the leg straight and toes up, sitting your weight back into the left hip. Hinge forward from the hips with a flat back until you feel the right hamstring." },
  { id: "shoulderstretchL", name: "Shoulder Stretch (Left)", duration: 20, group: "Mobility", alt: "cross body arm",
    cue: "Left arm across the chest · pull with the other hand",
    desc: "Bring your left arm straight across your chest and hook your right forearm under it to draw it closer. Keep your left shoulder down rather than shrugged toward your ear." },
  { id: "shoulderstretchR", name: "Shoulder Stretch (Right)", duration: 20, group: "Mobility", alt: "cross body arm",
    cue: "Right arm across the chest · pull with the other hand",
    desc: "Bring your right arm straight across your chest and hook your left forearm under it to draw it closer. Keep your right shoulder down rather than shrugged toward your ear." },
  { id: "armcircles", name: "Arm Circles", duration: 30, group: "Mobility", alt: "warm up shoulders",
    cue: "Small to big · switch direction halfway",
    desc: "Hold your arms out to the sides and draw circles, starting small and growing them. Switch direction halfway through — a quick way to warm the shoulders before upper-body work." },
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
    name: "Classic",
    exercises: ["plank", "bicycle", "legraise", "mtclimber", "russian"],
    rest: 20,
    roundRest: 75,
    rounds: 3,
  },
  {
    id: "fullbody",
    name: "Full Body Blast",
    exercises: ["jumpingjack", "squat", "pushup", "mtclimber", "glutebridge", "plank"],
    rest: 20,
    roundRest: 90,
    rounds: 3,
  },
  {
    id: "legs",
    name: "Lower Body Burn",
    exercises: ["squat", "lunges", "wallsit", "glutebridge", "calfraise"],
    rest: 20,
    roundRest: 90,
    rounds: 3,
  },
  {
    id: "upperhang",
    name: "Upper Body & Grip",
    exercises: ["pushup", "deadhang", "pikepushup", "chairdip", "shouldertap", "supermanhold"],
    rest: 25,
    roundRest: 90,
    rounds: 3,
  },
  {
    id: "mobility",
    name: "Mobility Flow",
    exercises: [
      "catcow", "downdog", "worldsgreatestL", "worldsgreatestR",
      "pigeonL", "pigeonR", "hipflexorL", "hipflexorR", "childpose",
    ],
    rest: 5,
    roundRest: 0,
    rounds: 1,
  },
];

const GET_READY = 10;
// Storage keys keep their original "abs-timer" prefix: renaming them would
// orphan every preset already saved locally and in Firestore.
const STORAGE_KEY = "abs-timer-custom-presets";

let uidCounter = 1;
const withUids = (entries) =>
  entries.map((e) =>
    typeof e === "string"
      ? { uid: `u${uidCounter++}`, exId: e }
      : { uid: `u${uidCounter++}`, exId: e.id, duration: e.duration }
  );
