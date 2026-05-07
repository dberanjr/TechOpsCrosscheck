import React from "react";

// Inject the keyframe once into <head> when this module first loads.
if (typeof document !== "undefined") {
  const STYLE_ID = "crosscheck-loading-keyframes";
  if (!document.getElementById(STYLE_ID)) {
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = `
@keyframes crosscheck-laser-wipe {
  0%   { transform: translateX(-180%) skewX(-18deg); opacity: 0; }
  6%   { opacity: 1; }
  94%  { opacity: 1; }
  100% { transform: translateX(380%) skewX(-18deg); opacity: 0; }
}`;
    document.head.appendChild(el);
  }
}

export const LoadingOverlay = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      borderRadius: "inherit",
      pointerEvents: "none",
      zIndex: 10,
    }}
  >
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: "45%",
        background:
          "linear-gradient(to right, transparent 0%, rgba(255,255,255,0.08) 15%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0.72) 50%, rgba(255,255,255,0.55) 55%, rgba(255,255,255,0.08) 85%, transparent 100%)",
        animation: "crosscheck-laser-wipe 1.4s ease-in-out infinite",
        willChange: "transform",
      }}
    />
  </div>
);
