"use client";

import { useState } from "react";

// STUDY ONLY. This computes a browser fingerprint from passively-available attributes to
// demonstrate that a stable identifier can be derived WITHOUT any storage — which is
// exactly why clearing cookies doesn't defeat it. Nothing here is sent anywhere, and this
// is deliberately NOT used in the core pipeline (which uses a random first-party id).

type Signal = { label: string; value: string };

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// A canvas render varies subtly by GPU, drivers, and font rasterization — a classic
// high-entropy fingerprinting signal.
function canvasSignal(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "unavailable";
    ctx.textBaseline = "top";
    ctx.font = "16px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(10, 10, 100, 30);
    ctx.fillStyle = "#069";
    ctx.fillText("Fingerprint \u{1F510}", 12, 14);
    return canvas.toDataURL();
  } catch {
    return "blocked";
  }
}

function webglSignal(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (!gl) return "unavailable";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return "masked";
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch {
    return "blocked";
  }
}

function collectSignals(): Signal[] {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [
    { label: "User agent", value: navigator.userAgent },
    { label: "Languages", value: (navigator.languages || [navigator.language]).join(", ") },
    { label: "Time zone", value: tz },
    {
      label: "Screen",
      value: `${screen.width}×${screen.height} @${window.devicePixelRatio}x, ${screen.colorDepth}-bit`,
    },
    { label: "CPU cores", value: String(navigator.hardwareConcurrency ?? "n/a") },
    { label: "Device memory", value: nav.deviceMemory ? `${nav.deviceMemory} GB` : "n/a" },
    { label: "Touch points", value: String(navigator.maxTouchPoints ?? 0) },
    { label: "WebGL renderer", value: webglSignal() },
    { label: "Canvas render", value: `${canvasSignal().slice(0, 24)}…` },
  ];
}

export default function FingerprintDemo() {
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function compute() {
    setBusy(true);
    const collected = collectSignals();
    // Include the full canvas/webgl output (not the truncated display) in the hash.
    const material = JSON.stringify([
      ...collected.map((s) => s.value),
      canvasSignal(),
      webglSignal(),
    ]);
    const hash = await sha256Hex(material);
    setSignals(collected);
    setFingerprint(hash.slice(0, 32));
    setBusy(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={compute}
        disabled={busy}
        className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas transition-colors hover:bg-ink/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {busy ? "Computing…" : "Compute my fingerprint"}
      </button>

      <div aria-live="polite">
        {fingerprint && (
          <div className="mt-5">
            <p className="font-mono text-[11px] uppercase tracking-wide text-mute">
              Derived identifier (no storage involved)
            </p>
            <p
              translate="no"
              className="mt-1 break-all font-mono text-sm text-ink select-all"
            >
              {fingerprint}
            </p>
          </div>
        )}

        {signals && (
          <table className="mt-5 w-full border-collapse text-sm">
            <tbody>
              {signals.map((s) => (
                <tr key={s.label} className="border-b border-hairline last:border-0">
                  <th
                    scope="row"
                    className="w-40 py-2 pr-4 text-left align-top font-medium text-body"
                  >
                    {s.label}
                  </th>
                  <td className="break-all py-2 font-mono text-[13px] text-mute" translate="no">
                    {s.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
