// Small presentational pieces shared by more than one page.
//
// React's UMD globals are destructured once, here: every text/babel script
// shares one global lexical scope, so a second `const useState` anywhere else
// would be a redeclaration error.
const { useState, useEffect, useRef, useCallback } = React;

// ---- Loading skeletons ----
// Pulsing placeholders shown while stored data loads (the app can't know how
// long a Firestore read takes). The pulse keyframes live in the <head> style
// block since inline styles can't declare @keyframes.
function Skeleton({ w, h, r = 8, delay = 0, style }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: w,
        height: h,
        borderRadius: r,
        background: "#26324A",
        animation: "app-pulse 1.3s ease-in-out infinite",
        animationDelay: delay ? `${delay}s` : undefined,
        ...style,
      }}
    />
  );
}

// Placeholder matching the preset/history card layout.
function SkeletonCard({ delay = 0 }) {
  return (
    <div style={styles.skeletonCard} aria-hidden="true">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
        <Skeleton w="52%" h={15} delay={delay} />
        <Skeleton w="72%" h={11} delay={delay + 0.12} />
      </div>
    </div>
  );
}

// ---- Header home button (icon) ----
function HomeButton({ onClick }) {
  return (
    <button onClick={onClick} style={styles.homeBtn} aria-label="Home">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 11l9-8 9 8" />
        <path d="M5 9.8V21h14V9.8" />
      </svg>
    </button>
  );
}

// ---- Reusable stepper control ----
function Stepper({ label, value, unit, onChange, min, max, step }) {
  return (
    <div style={styles.stepperRow}>
      <span style={styles.stepperLabel}>{label}</span>
      <div style={styles.stepperCtrl}>
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          style={styles.stepBtn}
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <span style={styles.stepValue}>
          {value}
          {unit}
        </span>
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          style={styles.stepBtn}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
