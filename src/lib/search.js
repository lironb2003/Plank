// Fuzzy search over the gym catalog (English + Hebrew).
// Loads after data/gym-exercises.js: it precomputes a haystack per exercise.

// Normalization: lowercase, strip niqqud, fold Hebrew final letters, drop
// punctuation — so "לחיצת-חזה" matches "לחיצת חזה" and "bnch" matches "bench".
const HEB_FINALS = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
const normalizeSearch = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")
    .replace(/[ךםןףץ]/g, (c) => HEB_FINALS[c])
    .replace(/[^a-z0-9א-ת]+/g, " ")
    .trim();

// Precomputed haystack per exercise: English + Hebrew names, aliases, group.
GYM_EXERCISES.forEach((ex) => {
  ex.search = normalizeSearch(
    ex.name + " " + ex.he + " " + (ex.alt || "") + " " + ex.group + " " + (GYM_GROUP_HE[ex.group] || "")
  );
});

function editDistCapped(a, b, cap) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

const isSubseq = (q, t) => {
  let i = 0;
  for (let j = 0; j < t.length && i < q.length; j++) if (t[j] === q[i]) i++;
  return i === q.length;
};

// Score a query against a normalized haystack. 0 = no match. Every query
// token must match some word (exact / prefix / substring / ≤2 typos /
// subsequence); whole-phrase substring matches rank highest.
function fuzzyScore(query, hay) {
  const q = normalizeSearch(query);
  if (!q) return 0;
  const idx = hay.indexOf(q);
  if (idx !== -1) return 1000 - idx * 2 - hay.length * 0.1;
  const qc = q.replace(/ /g, "");
  if (qc.length >= 3) {
    const ci = hay.replace(/ /g, "").indexOf(qc);
    if (ci !== -1) return 800 - ci * 2;
  }
  const words = hay.split(" ");
  let total = 0;
  for (const tok of q.split(" ")) {
    let best = 0;
    for (const w of words) {
      let s = 0;
      if (w === tok) s = 100;
      else if (w.indexOf(tok) === 0) s = 80;
      else if (tok.length >= 3 && w.indexOf(tok) !== -1) s = 60;
      else if (tok.length >= 4) {
        const cap = tok.length >= 7 ? 2 : 1;
        const d = Math.min(
          editDistCapped(tok, w, cap),
          editDistCapped(tok, w.slice(0, Math.min(w.length, tok.length + 1)), cap)
        );
        if (d <= cap) s = 55 - d * 15;
        else if (tok.length >= 5 && isSubseq(tok, w)) s = 25;
      }
      if (s > best) best = s;
    }
    if (best === 0) return 0;
    total += best;
  }
  return total;
}
