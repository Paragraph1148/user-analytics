"use client";

import { useState, useSyncExternalStore } from "react";
import {
  CONSENT_COOKIE,
  PRESET_ALL,
  PRESET_DENIED,
  PRESET_NECESSARY,
  makeState,
  parse,
  serialize,
  tierOf,
  type Purposes,
} from "@/lib/consent";

// GPC/DNT is a hard opt-out — it overrides any banner choice.
function browserOptOut(): boolean {
  const nav = navigator as Navigator & {
    msDoNotTrack?: string;
    globalPrivacyControl?: boolean;
  };
  const win = window as Window & { doNotTrack?: string };
  const dnt = nav.doNotTrack || win.doNotTrack || nav.msDoNotTrack;
  if (dnt === "1" || dnt === "yes") return true;
  return nav.globalPrivacyControl === true;
}

// One snapshot string ("<optOut>|<consent-json>") read via useSyncExternalStore so the
// banner reflects external changes (and our own writes) without setState-in-effect.
function subscribe(onChange: () => void) {
  window.addEventListener("cf:consent", onChange);
  return () => window.removeEventListener("cf:consent", onChange);
}
function getSnapshot(): string {
  let opt = "0";
  try {
    if (browserOptOut()) opt = "1";
  } catch {
    opt = "1";
  }
  const m = document.cookie.match(/(?:^|; )cf_consent=([^;]*)/);
  return opt + "|" + (m ? decodeURIComponent(m[1]) : "");
}

function writeConsent(p: Purposes) {
  const state = makeState(p);
  const raw = serialize(state);
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(raw)}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
  try {
    localStorage.setItem(CONSENT_COOKIE, raw);
  } catch {
    /* ignore */
  }
  // Tell the tracker (same document) to start/stop immediately.
  window.dispatchEvent(new CustomEvent("cf:consent", { detail: state }));
  // Record of consent (audit) — fire and forget.
  fetch("/api/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purposes: { a: p.a, l: p.l, d: p.d }, version: state.v }),
  }).catch(() => {});
}

export default function ConsentBanner() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => "0|");
  const [optStr, consentStr] = snapshot.split("|");
  const optedOut = optStr === "1";
  const consent = parse(consentStr);

  const [managing, setManaging] = useState(false);
  const [reopened, setReopened] = useState(false);
  // Draft toggles for the Manage panel (analytics is the always-on Necessary base).
  const [draft, setDraft] = useState<Purposes>(consent ?? PRESET_NECESSARY);

  // Collapsed: a choice exists (or GPC) and the user hasn't reopened the panel.
  const collapsed = (consent || optedOut) && !reopened;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => {
          setReopened(true);
          setManaging(true);
          setDraft(consent ?? PRESET_NECESSARY);
        }}
        className="fixed bottom-3 left-3 z-50 rounded-full border border-hairline bg-canvas px-3 py-1.5 text-xs font-medium text-body shadow-sm transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Privacy choices{optedOut ? " · DNT on" : consent ? ` · ${tierOf(consent)}` : ""}
      </button>
    );
  }

  function close() {
    setManaging(false);
    setReopened(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-hairline bg-canvas/95 backdrop-blur">
      <div className="mx-auto max-w-3xl px-6 py-5">
        <h2 className="text-sm font-semibold text-ink">Your privacy choices</h2>

        {optedOut ? (
          <p className="mt-2 text-sm text-body">
            Your browser sends a Do Not Track / Global Privacy Control signal, so nothing is
            collected — this overrides any choice here. No cookies for tracking are set.
            <button
              type="button"
              onClick={close}
              className="ml-2 rounded-sm text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Dismiss
            </button>
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-body text-pretty">
              We collect first-party, cookieless usage analytics to understand how this page
              is used. Choose what you allow. You can change or withdraw this anytime.
            </p>

            {managing && (
              <fieldset className="mt-4 space-y-3 rounded-lg border border-hairline bg-canvas-soft p-4">
                <legend className="px-1 text-xs font-medium text-mute">Purposes</legend>
                <PurposeRow
                  label="Analytics"
                  desc="Page views, clicks, scroll depth — the basics, plus coarse (country-level) location."
                  checked
                  disabled
                />
                <PurposeRow
                  label="Precise location"
                  desc="Your device's precise location (with the browser permission prompt)."
                  checked={draft.l}
                  onChange={(v) => setDraft((d) => ({ ...d, l: v }))}
                />
                <PurposeRow
                  label="Device details"
                  desc="Detailed device and browser characteristics."
                  checked={draft.d}
                  onChange={(v) => setDraft((d) => ({ ...d, d: v }))}
                />
              </fieldset>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {managing ? (
                <>
                  <Btn primary onClick={() => writeConsent({ a: true, l: draft.l, d: draft.d })}>
                    Save choices
                  </Btn>
                  <Btn onClick={() => setManaging(false)}>Back</Btn>
                </>
              ) : (
                <>
                  <Btn primary onClick={() => writeConsent(PRESET_ALL)}>
                    Allow all
                  </Btn>
                  <Btn onClick={() => writeConsent(PRESET_NECESSARY)}>Necessary only</Btn>
                  <Btn
                    onClick={() => {
                      setManaging(true);
                      setDraft(consent ?? PRESET_NECESSARY);
                    }}
                  >
                    Manage
                  </Btn>
                </>
              )}
              {consent && (
                <button
                  type="button"
                  onClick={() => writeConsent(PRESET_DENIED)}
                  className="ml-auto rounded-sm text-xs text-mute underline-offset-4 hover:text-signal-rage hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  Withdraw all
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PurposeRow({
  label,
  desc,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-0.5 size-4 accent-ink disabled:opacity-60"
      />
      <span>
        <span className="font-medium text-ink">{label}</span>
        {disabled && <span className="ml-2 text-xs text-mute">always on</span>}
        <span className="block text-body text-pretty">{desc}</span>
      </span>
    </label>
  );
}

function Btn({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink " +
        (primary
          ? "bg-ink text-canvas hover:bg-ink/90"
          : "border border-hairline bg-canvas text-ink hover:bg-canvas-soft")
      }
    >
      {children}
    </button>
  );
}
