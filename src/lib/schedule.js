// Workout schedule: the flat segment list the timer plays back.
// The timer runs off a flat, precomputed list of segments plus one wall-clock
// origin, instead of decrementing a counter once per tick. Ticks are the thing
// browsers throttle (or stop entirely) in a background tab, so anything derived
// from counting them drifts; a position recomputed from Date.now() does not.
// Segments carry their own labels so the notification text never has to reach
// back into component state.
const buildSchedule = (exercises, restBetween, roundRest, totalRounds) => {
  const nameOf = (i) => (exercises[i] ? exercises[i].name : "");
  const segs = [
    { kind: "ready", dur: GET_READY, round: 1, exIndex: 0, label: "Get in position", next: nameOf(0) },
  ];
  for (let r = 1; r <= totalRounds; r++) {
    exercises.forEach((ex, i) => {
      const lastEx = i === exercises.length - 1;
      segs.push({
        kind: "work",
        dur: ex.duration,
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
  const starts = [];
  let acc = 0;
  segs.forEach((s) => {
    starts.push(acc);
    acc += s.dur;
  });
  return { segs, starts, total: acc, rounds: totalRounds };
};

// Index of the segment covering `elapsed` (schedule.segs.length once past the end).
const segmentAt = (schedule, elapsed) => {
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
