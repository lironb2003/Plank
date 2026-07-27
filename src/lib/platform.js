// Mobile-browser workarounds: the inaudible keep-alive loop that stops timers
// from being frozen in a background tab, and the Notification capability check.
// A 1-second loop of ±1-LSB dither (~-90 dBFS: inaudible, but not digital
// silence). Keeping this playing marks the tab as producing audio, which is
// what stops mobile browsers from freezing our timers — and on iOS keeps the
// audio session alive so queued cues still fire once the screen is off.
let silentLoopUrl = null;
const getSilentLoopUrl = () => {
  if (silentLoopUrl) return silentLoopUrl;
  const sr = 8000;
  const n = sr;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const ascii = (o, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, i % 2 ? 1 : -1, true);
  silentLoopUrl = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  return silentLoopUrl;
};

const notifySupported = () => typeof Notification !== "undefined";
