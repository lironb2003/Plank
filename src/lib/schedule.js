// Workout schedule: the flat segment list the timer plays back.
// The timer runs off a flat, precomputed list of segments plus one wall-clock
// origin, instead of decrementing a counter once per tick. Ticks are the thing
// browsers throttle (or stop entirely) in a background tab, so anything derived
// from counting them drifts; a position recomputed from Date.now() does not.
// Segments carry their own labels so the notification text never has to reach
// back into component state.
//
// A reps workout breaks the "every duration is known up front" assumption: a
// set ends when the user taps, not at a time the schedule can predict. Rather
// than bolt a second engine on beside this one, a rep set is a segment with
// `open: true` and `dur: 0` — a hole in the layout that swallows all elapsed
// time until closeOpenSegment() stamps its real length in and the layout is
// recomputed. Everything downstream of the open segment has a provisional
// start, which is why segmentAt() never looks past it.
const buildSchedule = (exercises, restBetween, roundRest, totalRounds, mode) => {
  const reps = mode === "reps";
  const nameOf = (i) => (exercises[i] ? exercises[i].name : "");
  const segs = [
    { kind: "ready", dur: GET_READY, round: 1, exIndex: 0, label: "Get in position", next: nameOf(0) },
  ];
  for (let r = 1; r <= totalRounds; r++) {
    exercises.forEach((ex, i) => {
      const lastEx = i === exercises.length - 1;
      segs.push({
        kind: "work",
        // a rep set has no length until it's been performed
        dur: reps ? 0 : ex.duration,
        open: reps,
        reps: reps ? ex.reps : null,
        round: r,
        exIndex: i,
        label: ex.name,
        next: lastEx ? nameOf(0) : nameOf(i + 1),
      });
      // rest/roundRest of 0s would be a segment nobody can see — drop it
      if (!lastEx) {
        if (restBetween > 0)
          segs.push({
            kind: "rest",
            dur: restBetween,
            round: r,
            exIndex: i,
            label: "Rest",
            next: nameOf(i + 1),
          });
      } else if (r < totalRounds && roundRest > 0) {
        segs.push({
          kind: "roundRest",
          dur: roundRest,
          round: r,
          exIndex: i,
          label: "Round break",
          next: nameOf(0),
        });
      }
    });
  }
  return relayout({ segs, rounds: totalRounds, mode: reps ? "reps" : "time" });
};

// Recompute `starts`, `total` and `openIndex` from the segments' current
// durations. Called once at build time and again every time an open segment is
// closed or reopened, since either shifts everything after it.
const relayout = (schedule) => {
  const starts = [];
  let acc = 0;
  let openIndex = -1;
  schedule.segs.forEach((s, i) => {
    starts.push(acc);
    acc += s.dur;
    if (s.open && openIndex < 0) openIndex = i;
  });
  schedule.starts = starts;
  schedule.total = acc;
  schedule.openIndex = openIndex;
  return schedule;
};

// End the open rep set at `elapsed`, giving it the length it actually took and
// moving every later segment into place behind it.
const closeOpenSegment = (schedule, elapsed) => {
  const i = schedule.openIndex;
  if (i < 0) return schedule;
  schedule.segs[i].dur = Math.max(0, elapsed - schedule.starts[i]);
  schedule.segs[i].open = false;
  return relayout(schedule);
};

// Reopen every rep set from `index` on, so stepping back into a finished set
// puts it back to "waiting for the tap" rather than replaying its old length.
// Segments before `index` keep their starts, which is what makes it safe to
// read the seek target off the schedule after this runs.
const reopenFrom = (schedule, index) => {
  if (schedule.mode !== "reps") return schedule;
  for (let j = index; j < schedule.segs.length; j++) {
    const s = schedule.segs[j];
    if (s.kind === "work") {
      s.dur = 0;
      s.open = true;
    }
  }
  return relayout(schedule);
};

// Index of the segment covering `elapsed` (schedule.segs.length once past the
// end). An open segment is a floor: time past its start belongs to it however
// long it runs, and the provisional starts behind it are never consulted.
const segmentAt = (schedule, elapsed) => {
  const open = schedule.openIndex == null ? -1 : schedule.openIndex;
  if (open >= 0 && elapsed >= schedule.starts[open]) return open;
  if (elapsed >= schedule.total) return schedule.segs.length;
  let lo = 0;
  let hi = schedule.segs.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (schedule.starts[mid] <= elapsed) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
};
