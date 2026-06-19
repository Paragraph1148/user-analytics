"use client";

import { useSyncExternalStore } from "react";

// Mirrors the tracker's privacy guard so the panel reflects what the tracker actually does.
function privacyOptOut(): string | null {
  const nav = navigator as Navigator & {
    msDoNotTrack?: string;
    globalPrivacyControl?: boolean;
  };
  const win = window as Window & { doNotTrack?: string };
  const dnt = nav.doNotTrack || win.doNotTrack || nav.msDoNotTrack;
  if (dnt === "1" || dnt === "yes") return "Do Not Track is on";
  if (nav.globalPrivacyControl === true) return "Global Privacy Control is on";
  return null;
}

function readSessionId(): string | null {
  try {
    const raw = localStorage.getItem("cf_sid");
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && typeof obj.id === "string") return obj.id;
    }
  } catch {
    /* ignore */
  }
  const m = document.cookie.match(/(?:^|; )cf_sid=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// Browser-only state read through an external store rather than effect setState. The
// snapshot is a plain string so React's Object.is check stays stable between polls.
function subscribe(onChange: () => void): () => void {
  const t = setInterval(onChange, 1000);
  return () => clearInterval(t);
}

function getSnapshot(): string {
  const reason = privacyOptOut();
  if (reason) return `disabled:${reason}`;
  const id = readSessionId();
  return id ? `active:${id}` : "loading";
}

export default function TrackerStatus() {
  // Server render has no navigator/localStorage, so it always starts at "loading".
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => "loading");
  const [state, detail] = splitSnapshot(snapshot);

  return (
    <div className="rounded-lg border border-hairline bg-canvas-soft p-4">
      <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-mute">
        <span
          aria-hidden
          className={
            "inline-block size-2 rounded-full " +
            (state === "active"
              ? "bg-signal-cool"
              : state === "disabled"
                ? "bg-signal-dead"
                : "bg-hairline-strong")
          }
        />
        Tracker status
      </div>

      {state === "loading" && <p className="mt-2 text-sm text-mute">Initializing…</p>}

      {state === "disabled" && (
        <p className="mt-2 text-sm text-body">
          Collection is off — {detail}. The tracker respects your privacy signal and sends
          nothing.
        </p>
      )}

      {state === "active" && (
        <div className="mt-2 space-y-1">
          <p className="text-sm text-body">
            Collecting. Clicks below post to <code className="font-mono">/api/collect</code>.
          </p>
          <p className="text-xs text-mute">
            Session id:{" "}
            <span className="font-mono text-ink select-all" translate="no">{detail}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function splitSnapshot(snapshot: string): [state: string, detail: string] {
  const i = snapshot.indexOf(":");
  return i === -1 ? [snapshot, ""] : [snapshot.slice(0, i), snapshot.slice(i + 1)];
}
